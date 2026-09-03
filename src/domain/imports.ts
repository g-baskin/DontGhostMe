export type ImportSourceKind = "gmail_mbox" | "linkedin_export";

export type ImportStatus =
  | "uploading"
  | "preview_ready"
  | "processing"
  | "paused_user"
  | "paused_interrupted"
  | "completed"
  | "failed"
  | "cancelled";

export type SourceMessageStatus = "imported" | "conflict" | "failed" | "skipped";

export const importErrorCodes = [
  "invalid_id",
  "invalid_request",
  "invalid_filename",
  "unsupported_archive",
  "source_too_large",
  "source_missing",
  "source_expired",
  "invalid_mbox",
  "message_too_large",
  "header_limit",
  "header_line_too_long",
  "mime_depth_limit",
  "mime_parse_failed",
  "message_timeout",
  "attachment_too_large",
  "message_id_conflict",
  "database_busy",
  "invalid_state",
  "cancelled",
  "internal_error",
  "encrypted_archive",
  "archive_entry_limit",
  "archive_size_limit",
  "archive_ratio_limit",
  "archive_path_invalid",
  "nested_archive",
  "malformed_csv",
  "schema_drift",
  "row_limit",
  "column_limit",
  "field_limit",
] as const;

export type ImportErrorCode = (typeof importErrorCodes)[number];

export interface ImportCounts {
  discovered: number;
  parsed: number;
  skipped: number;
  duplicated: number;
  failed: number;
  imported: number;
}

export interface HistoricalImportSummary extends ImportCounts {
  id: string;
  sourceKind: ImportSourceKind;
  displayName: string;
  sourceSizeBytes: number;
  status: ImportStatus;
  errorCode: ImportErrorCode | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  stagedSourceDeleted: boolean;
}

export interface ImportCheckpoint extends ImportCounts {
  sourceFingerprint: string;
  committedByteOffset: number;
  messageOrdinal: number;
  logicalCursor: { datasetIndex: number; rowOrdinal: number } | null;
}

export class HistoricalImportError extends Error {
  constructor(
    readonly code: ImportErrorCode,
    readonly recoverable: boolean,
  ) {
    super(code);
    this.name = "HistoricalImportError";
  }
}

export function emptyImportCounts(): ImportCounts {
  return { discovered: 0, parsed: 0, skipped: 0, duplicated: 0, failed: 0, imported: 0 };
}

export function isImportErrorCode(value: unknown): value is ImportErrorCode {
  return typeof value === "string" && importErrorCodes.includes(value as ImportErrorCode);
}
