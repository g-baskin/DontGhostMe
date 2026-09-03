export const MIME_WORKER_SOURCE = String.raw`
const { createHash } = require("node:crypto");
const { parentPort } = require("node:worker_threads");

function truncateUtf8(value, maximumBytes) {
  const encoded = Buffer.from(value, "utf8");
  if (encoded.byteLength <= maximumBytes) return { value, truncated: false };
  let end = maximumBytes;
  while (end > 0 && (encoded[end] & 0xc0) === 0x80) end -= 1;
  return { value: encoded.subarray(0, end).toString("utf8"), truncated: true };
}

function stripQuotedHistory(value) {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  const kept = [];
  for (const line of lines) {
    if (/^\s*>/.test(line) || /^On .+ wrote:\s*$/.test(line) || /^--\s*$/.test(line)) break;
    kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function contentBytes(content) {
  if (typeof content === "string") return Buffer.from(content, "utf8");
  if (content instanceof ArrayBuffer) return Buffer.from(content);
  return Buffer.from(content.buffer, content.byteOffset, content.byteLength);
}

parentPort.on("message", async ({ buffer, byteOffset, byteLength, limits }) => {
  try {
    const [{ default: PostalMime }, { convert }] = await Promise.all([
      import("postal-mime"),
      import("html-to-text"),
    ]);
    const raw = new Uint8Array(buffer, byteOffset, byteLength);
    const email = await PostalMime.parse(raw, {
      attachmentEncoding: "arraybuffer",
      maxHeadersSize: limits.headerBytes,
      maxNestingDepth: limits.mimeDepth,
      maxRfc822NestingDepth: limits.rfc822Depth,
      rfc822Attachments: false,
    });
    const sourceText = email.text ?? (email.html ? convert(email.html.slice(0, limits.extractedTextBytes * 2), {
      selectors: [
        { selector: "script", format: "skip" },
        { selector: "style", format: "skip" },
        { selector: "form", format: "skip" },
        { selector: "iframe", format: "skip" },
        { selector: "img", format: "skip" },
        { selector: "a", options: { ignoreHref: true } },
      ],
      limits: {
        maxDepth: limits.mimeDepth,
        maxInputLength: limits.extractedTextBytes * 2,
        maxChildNodes: 100000,
      },
      wordwrap: false,
    }) : "");
    const safe = truncateUtf8(stripQuotedHistory(sourceText), limits.extractedTextBytes);
    let aggregateAttachmentBytes = 0;
    const attachments = email.attachments.map((attachment, ordinal) => {
      const content = contentBytes(attachment.content);
      aggregateAttachmentBytes += content.byteLength;
      return {
        ordinal,
        filename: attachment.filename,
        mediaType: attachment.mimeType,
        disposition: attachment.disposition,
        decodedSizeBytes: content.byteLength,
        contentSha256: createHash("sha256").update(content).digest("hex"),
        oversized: content.byteLength > limits.attachmentBytes,
      };
    });
    if (aggregateAttachmentBytes > limits.aggregateAttachmentBytes) {
      parentPort.postMessage({ ok: false, code: "attachment_too_large" });
      return;
    }
    parentPort.postMessage({
      ok: true,
      email: {
        headers: email.headers,
        from: email.from,
        replyTo: email.replyTo ?? [],
        to: email.to ?? [],
        cc: email.cc ?? [],
        bcc: email.bcc ?? [],
        subject: email.subject ?? "",
        messageId: email.messageId ?? null,
        inReplyTo: email.inReplyTo ?? null,
        references: email.references ?? null,
        date: email.date ?? null,
        safeText: safe.value,
        textTruncated: safe.truncated,
        attachments,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    parentPort.postMessage({
      ok: false,
      code: /nesting depth/i.test(message) ? "mime_depth_limit" : "mime_parse_failed",
    });
  }
});
`;
