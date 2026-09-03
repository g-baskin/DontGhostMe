export interface ImportLimits {
  sourceBytes: number;
  acceptedArchiveBytes: number;
  messageBytes: number;
  attachmentBytes: number;
  aggregateAttachmentBytes: number;
  headerCount: number;
  headerLineBytes: number;
  headerBytes: number;
  mimeDepth: number;
  rfc822Depth: number;
  extractedTextBytes: number;
  storedExcerptBytes: number;
  batchMessages: number;
  batchBytes: number;
  batchMilliseconds: number;
  messageMilliseconds: number;
  stagingRetentionMilliseconds: number;
}

export const IMPORT_LIMITS: Readonly<ImportLimits> = Object.freeze({
  sourceBytes: 2 * 1024 * 1024 * 1024,
  acceptedArchiveBytes: 0,
  messageBytes: 25 * 1024 * 1024,
  attachmentBytes: 10 * 1024 * 1024,
  aggregateAttachmentBytes: 20 * 1024 * 1024,
  headerCount: 500,
  headerLineBytes: 16 * 1024,
  headerBytes: 256 * 1024,
  mimeDepth: 20,
  rfc822Depth: 3,
  extractedTextBytes: 1024 * 1024,
  storedExcerptBytes: 16 * 1024,
  batchMessages: 100,
  batchBytes: 100 * 1024 * 1024,
  batchMilliseconds: 30_000,
  messageMilliseconds: 5_000,
  stagingRetentionMilliseconds: 24 * 60 * 60 * 1000,
});
