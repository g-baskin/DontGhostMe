import { createHash } from "node:crypto";
import { domainToASCII } from "node:url";
import { Worker } from "node:worker_threads";
import type { Address, Header } from "postal-mime";
import { HistoricalImportError, type ImportErrorCode } from "@/domain/imports";
import { IMPORT_LIMITS, type ImportLimits } from "@/ingestion/import-limits";
import { MIME_WORKER_SOURCE } from "@/ingestion/mime-worker";
import { sanitizeDisplayName, stripControlCharacters, truncateUtf8 } from "@/ingestion/safe-text";

export interface NormalizedAddress {
  name: string;
  address: string;
}

export interface ParsedAttachmentMetadata {
  ordinal: number;
  filenameDisplay: string | null;
  mediaType: string;
  disposition: string | null;
  decodedSizeBytes: number;
  contentSha256: string;
  oversized: boolean;
}

export interface ParsedNormalizedMessage {
  sentAt: string | null;
  subject: string;
  sender: NormalizedAddress[];
  recipients: NormalizedAddress[];
  replyTo: NormalizedAddress[];
  normalizedMessageId: string | null;
  references: string[];
  safeText: string;
  textTruncated: boolean;
  warningCodes: string[];
  canonicalSha256: string;
  attachments: ParsedAttachmentMetadata[];
}

interface WorkerEmail {
  headers: Header[];
  from?: Address;
  replyTo: Address[];
  to: Address[];
  cc: Address[];
  bcc: Address[];
  subject: string;
  messageId: string | null;
  inReplyTo: string | null;
  references: string | null;
  date: string | null;
  safeText: string;
  textTruncated: boolean;
  attachments: Array<{
    ordinal: number;
    filename: string | null;
    mediaType: string;
    disposition: string | null;
    decodedSizeBytes: number;
    contentSha256: string;
    oversized: boolean;
  }>;
}

type WorkerResponse = { ok: true; email: WorkerEmail } | { ok: false; code: ImportErrorCode };

function validateHeaders(raw: Uint8Array, limits: Readonly<ImportLimits>) {
  const scanLength = Math.min(raw.byteLength, limits.headerBytes + 4);
  const head = Buffer.from(raw.buffer, raw.byteOffset, scanLength).toString("latin1");
  const boundary = head.search(/\r?\n\r?\n/);
  if (boundary < 0 || boundary > limits.headerBytes)
    throw new HistoricalImportError("header_limit", true);
  const lines = head.slice(0, boundary).split(/\r?\n/);
  if (lines.length > limits.headerCount) throw new HistoricalImportError("header_limit", true);
  if (lines.some((line) => Buffer.byteLength(line, "latin1") > limits.headerLineBytes))
    throw new HistoricalImportError("header_line_too_long", true);
}

function normalizeMessageId(value: string | null | undefined) {
  const cleaned = value?.normalize("NFC").trim().replace(/^<|>$/g, "");
  if (!cleaned) return null;
  const at = cleaned.lastIndexOf("@");
  if (at < 1) return cleaned;
  const domain = domainToASCII(cleaned.slice(at + 1).toLowerCase());
  return domain ? `${cleaned.slice(0, at)}@${domain}` : cleaned;
}

function flattenAddresses(addresses: Address | Address[] | undefined): NormalizedAddress[] {
  const values = addresses ? (Array.isArray(addresses) ? addresses : [addresses]) : [];
  const mailboxes = values.flatMap((entry) => (entry.group ? entry.group : [entry]));
  return mailboxes.flatMap((entry) => {
    if (!entry.address) return [];
    const at = entry.address.lastIndexOf("@");
    if (at < 1) return [];
    const domain = domainToASCII(entry.address.slice(at + 1).toLowerCase());
    if (!domain) return [];
    return [
      {
        name: truncateUtf8(entry.name.normalize("NFC").trim(), 512).value,
        address: `${entry.address.slice(0, at).normalize("NFC")}@${domain}`,
      },
    ];
  });
}

function normalizeReferences(...values: Array<string | null>) {
  const identifiers = values.flatMap((value) => value?.match(/<[^>]+>|[^\s]+/g) ?? []);
  return [
    ...new Set(identifiers.map(normalizeMessageId).filter((value): value is string => !!value)),
  ];
}

function isWorkerResponse(value: unknown): value is WorkerResponse {
  if (!value || typeof value !== "object" || !("ok" in value)) return false;
  const candidate = value as { ok: unknown; code?: unknown; email?: unknown };
  return (
    (candidate.ok === false && typeof candidate.code === "string") ||
    (candidate.ok === true && !!candidate.email && typeof candidate.email === "object")
  );
}

async function runWorker(raw: Uint8Array, limits: Readonly<ImportLimits>): Promise<WorkerEmail> {
  const worker = new Worker(MIME_WORKER_SOURCE, {
    eval: true,
    resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16, stackSizeMb: 2 },
  });
  return await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (operation: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      operation();
    };
    const timer = setTimeout(
      () => finish(() => reject(new HistoricalImportError("message_timeout", true))),
      limits.messageMilliseconds,
    );
    worker.once("error", () =>
      finish(() => reject(new HistoricalImportError("mime_parse_failed", true))),
    );
    worker.once("message", (value: unknown) => {
      if (!isWorkerResponse(value)) {
        finish(() => reject(new HistoricalImportError("mime_parse_failed", true)));
        return;
      }
      if (!value.ok) {
        finish(() => reject(new HistoricalImportError(value.code, true)));
        return;
      }
      finish(() => resolve(value.email));
    });
    const transferable =
      raw.buffer instanceof ArrayBuffer ? raw.buffer : Uint8Array.from(raw).buffer;
    worker.postMessage(
      {
        buffer: transferable,
        byteOffset: transferable === raw.buffer ? raw.byteOffset : 0,
        byteLength: raw.byteLength,
        limits,
      },
      [transferable],
    );
  });
}

export async function parseMimeBounded(
  raw: Uint8Array,
  limits: Readonly<ImportLimits> = IMPORT_LIMITS,
): Promise<ParsedNormalizedMessage> {
  if (raw.byteLength > limits.messageBytes)
    throw new HistoricalImportError("message_too_large", true);
  validateHeaders(raw, limits);
  const email = await runWorker(raw, limits);
  const warningCodes: string[] = [];
  const parsedDate = email.date ? new Date(email.date) : null;
  const sentAt =
    parsedDate && !Number.isNaN(parsedDate.valueOf()) ? parsedDate.toISOString() : null;
  if (email.date && !sentAt) warningCodes.push("invalid_date");
  if (email.attachments.some((attachment) => attachment.oversized))
    warningCodes.push("attachment_too_large");

  const subject = truncateUtf8(
    stripControlCharacters(email.subject.normalize("NFC"), " ").trim(),
    4096,
  ).value;
  const sender = flattenAddresses(email.from);
  const recipients = flattenAddresses([...email.to, ...email.cc, ...email.bcc]);
  const replyTo = flattenAddresses(email.replyTo);
  const normalizedMessageId = normalizeMessageId(email.messageId);
  const references = normalizeReferences(email.inReplyTo, email.references);
  const excerpt = truncateUtf8(email.safeText, limits.storedExcerptBytes);
  const textTruncated = email.textTruncated || excerpt.truncated;
  if (textTruncated) warningCodes.push("text_truncated");
  const attachments = email.attachments.map((attachment) => ({
    ordinal: attachment.ordinal,
    filenameDisplay: attachment.filename ? sanitizeDisplayName(attachment.filename) : null,
    mediaType: truncateUtf8(attachment.mediaType.toLowerCase(), 255).value,
    disposition: attachment.disposition,
    decodedSizeBytes: attachment.decodedSizeBytes,
    contentSha256: attachment.contentSha256,
    oversized: attachment.oversized,
  }));
  const canonical = JSON.stringify({
    sentAt,
    subject,
    sender,
    recipients,
    replyTo,
    normalizedMessageId,
    references,
    safeText: excerpt.value,
    attachments: attachments.map(({ contentSha256, decodedSizeBytes, mediaType }) => ({
      contentSha256,
      decodedSizeBytes,
      mediaType,
    })),
  });
  return {
    sentAt,
    subject,
    sender,
    recipients,
    replyTo,
    normalizedMessageId,
    references,
    safeText: excerpt.value,
    textTruncated,
    warningCodes,
    canonicalSha256: createHash("sha256").update(canonical).digest("hex"),
    attachments,
  };
}
