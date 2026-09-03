import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { HistoricalImportError } from "@/domain/imports";
import { IMPORT_LIMITS } from "@/ingestion/import-limits";

const MAX_ENVELOPE_BYTES = 512;
const ENVELOPE =
  /^From \S+ (?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2} \d{2}:\d{2}(?::\d{2})?(?: [+-]\d{4})? \d{4}$/;

export interface FramedMboxMessage {
  ordinal: number;
  byteOffset: number;
  byteLength: number;
  nextOffset: number;
  rawSha256: string;
  raw: Uint8Array;
  oversized: boolean;
}

function isEnvelopeLine(bytes: Uint8Array): boolean {
  const line = Buffer.from(bytes)
    .toString("ascii")
    .replace(/\r?\n$/, "");
  return ENVELOPE.test(line);
}

export async function* frameMbox(
  filePath: string,
  startOffset = 0,
  maximumMessageBytes = IMPORT_LIMITS.messageBytes,
  chunkBytes = 64 * 1024,
): AsyncGenerator<FramedMboxMessage> {
  const size = (await stat(filePath)).size;
  if (startOffset < 0 || startOffset > size) throw new HistoricalImportError("invalid_mbox", false);

  let ordinal = 0;
  let absoluteOffset = startOffset;
  let messageOffset = startOffset;
  let messageLength = 0;
  let oversized = false;
  let sawEnvelope = false;
  let atLineStart = true;
  let probe: number[] = [];
  let storage = Buffer.allocUnsafe(maximumMessageBytes);
  let hash = createHash("sha256");

  const append = (bytes: Uint8Array) => {
    if (bytes.byteLength === 0) return;
    hash.update(bytes);
    if (!oversized && messageLength + bytes.byteLength <= maximumMessageBytes) {
      Buffer.from(bytes).copy(storage, messageLength);
    } else {
      oversized = true;
    }
    messageLength += bytes.byteLength;
  };

  const finish = (nextOffset: number): FramedMboxMessage | null => {
    if (!sawEnvelope) return null;
    ordinal += 1;
    const result: FramedMboxMessage = {
      ordinal,
      byteOffset: messageOffset,
      byteLength: messageLength,
      nextOffset,
      rawSha256: hash.digest("hex"),
      raw: oversized ? new Uint8Array() : storage.subarray(0, messageLength),
      oversized,
    };
    return result;
  };

  const reset = (offset: number) => {
    messageOffset = offset;
    messageLength = 0;
    oversized = false;
    storage = Buffer.allocUnsafe(maximumMessageBytes);
    hash = createHash("sha256");
  };

  for await (const chunk of createReadStream(filePath, {
    start: startOffset,
    highWaterMark: chunkBytes,
  })) {
    const bytes = chunk as Buffer;
    let index = 0;
    while (index < bytes.length) {
      if (atLineStart) {
        probe.push(bytes[index] ?? 0);
        index += 1;
        absoluteOffset += 1;
        const ended = probe.at(-1) === 0x0a;
        if (ended || probe.length > MAX_ENVELOPE_BYTES) {
          if (ended && isEnvelopeLine(Uint8Array.from(probe))) {
            const delimiterOffset = absoluteOffset - probe.length;
            const previous = finish(delimiterOffset);
            if (previous) yield previous;
            sawEnvelope = true;
            reset(absoluteOffset);
            atLineStart = true;
          } else {
            if (!sawEnvelope) {
              if (probe.some((byte) => ![0x0a, 0x0d, 0x20, 0x09].includes(byte))) {
                throw new HistoricalImportError("invalid_mbox", false);
              }
            } else {
              append(Uint8Array.from(probe));
            }
            atLineStart = ended;
          }
          probe = [];
        }
        continue;
      }

      const newline = bytes.indexOf(0x0a, index);
      const end = newline === -1 ? bytes.length : newline + 1;
      if (sawEnvelope) append(bytes.subarray(index, end));
      absoluteOffset += end - index;
      index = end;
      atLineStart = newline !== -1;
    }
  }

  if (probe.length > 0) {
    if (!sawEnvelope) throw new HistoricalImportError("invalid_mbox", false);
    append(Uint8Array.from(probe));
  }
  const final = finish(size);
  if (!final) throw new HistoricalImportError("invalid_mbox", false);
  yield final;
}
