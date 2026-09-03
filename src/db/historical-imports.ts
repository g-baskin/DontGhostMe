import { randomUUID } from "node:crypto";
import type { AppDatabase } from "@/db/client";
import { withImmediateTransaction } from "@/db/write";
import {
  HistoricalImportError,
  type HistoricalImportSummary,
  type ImportCounts,
  type ImportErrorCode,
  type ImportSourceKind,
  type ImportStatus,
} from "@/domain/imports";
import type { LinkedInSourceRow } from "@/ingestion/linkedin-export";
import type { FramedMboxMessage } from "@/ingestion/mbox-framer";
import type { ParsedNormalizedMessage } from "@/ingestion/mime-parser";

interface ImportRow {
  id: string;
  source_kind: ImportSourceKind;
  original_name_display: string;
  source_size_bytes: number;
  status: ImportStatus;
  discovered_count: number;
  parsed_count: number;
  skipped_count: number;
  duplicate_count: number;
  failed_count: number;
  imported_count: number;
  last_error_code: ImportErrorCode | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  staged_source_deleted: number;
}

interface CheckpointRow {
  source_fingerprint: string;
  logical_cursor_json: string | null;
  committed_byte_offset: number;
  message_ordinal: number;
  discovered_count: number;
  parsed_count: number;
  skipped_count: number;
  duplicate_count: number;
  failed_count: number;
  imported_count: number;
}

export interface ParsedFrame {
  frame: FramedMboxMessage;
  message?: ParsedNormalizedMessage;
  errorCode?: ImportErrorCode;
}

function mapImport(row: ImportRow): HistoricalImportSummary {
  return {
    id: row.id,
    sourceKind: row.source_kind,
    displayName: row.original_name_display,
    sourceSizeBytes: row.source_size_bytes,
    status: row.status,
    discovered: row.discovered_count,
    parsed: row.parsed_count,
    skipped: row.skipped_count,
    duplicated: row.duplicate_count,
    failed: row.failed_count,
    imported: row.imported_count,
    errorCode: row.last_error_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    stagedSourceDeleted: row.staged_source_deleted === 1,
  };
}

export function createHistoricalImport(
  database: AppDatabase,
  ownerId: string,
  displayName: string,
  sourceKind: ImportSourceKind = "gmail_mbox",
  now = new Date(),
) {
  const id = randomUUID();
  const timestamp = now.toISOString();
  withImmediateTransaction(database, () => {
    database.sqlite
      .prepare(
        `insert into historical_imports (
          id, owner_id, source_kind, original_name_display, status, created_at, updated_at
        ) values (?, ?, ?, ?, 'uploading', ?, ?)`,
      )
      .run(id, ownerId, sourceKind, displayName, timestamp, timestamp);
  });
  return id;
}

export function attachStagedSource(
  database: AppDatabase,
  ownerId: string,
  importId: string,
  sourceFingerprint: string,
  sourceSizeBytes: number,
  stagedExpiresAt: string,
  now = new Date(),
) {
  return withImmediateTransaction(database, () => {
    const existing = database.sqlite
      .prepare(
        `select id from historical_imports
         where owner_id = ? and source_fingerprint = ? and id <> ?`,
      )
      .get(ownerId, sourceFingerprint, importId) as { id: string } | undefined;
    if (existing) {
      database.sqlite
        .prepare(
          "delete from historical_imports where id = ? and owner_id = ? and status = 'uploading'",
        )
        .run(importId, ownerId);
      return { id: existing.id, reused: true };
    }
    const result = database.sqlite
      .prepare(
        `update historical_imports set
          source_fingerprint = ?, source_size_bytes = ?, staged_expires_at = ?,
          staged_source_deleted = 0, updated_at = ?
         where id = ? and owner_id = ? and status = 'uploading'`,
      )
      .run(
        sourceFingerprint,
        sourceSizeBytes,
        stagedExpiresAt,
        now.toISOString(),
        importId,
        ownerId,
      );
    if (result.changes !== 1) throw new HistoricalImportError("invalid_state", false);
    return { id: importId, reused: false };
  });
}

export function saveImportPreview(
  database: AppDatabase,
  ownerId: string,
  importId: string,
  discoveredCount: number,
  skippedCount: number,
  now = new Date(),
) {
  withImmediateTransaction(database, () => {
    const row = database.sqlite
      .prepare(
        `select source_fingerprint from historical_imports
         where id = ? and owner_id = ? and status = 'uploading'`,
      )
      .get(importId, ownerId) as { source_fingerprint: string } | undefined;
    if (!row) throw new HistoricalImportError("invalid_state", false);
    const timestamp = now.toISOString();
    database.sqlite
      .prepare(
        `insert into import_checkpoints (
          id, owner_id, historical_import_id, source_fingerprint,
          discovered_count, skipped_count, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        ownerId,
        importId,
        row.source_fingerprint,
        discoveredCount,
        skippedCount,
        timestamp,
        timestamp,
      );
    database.sqlite
      .prepare(
        `update historical_imports set status = 'preview_ready', discovered_count = ?,
          skipped_count = ?, updated_at = ? where id = ? and owner_id = ?`,
      )
      .run(discoveredCount, skippedCount, timestamp, importId, ownerId);
  });
}

export function getHistoricalImport(database: AppDatabase, ownerId: string, importId: string) {
  const row = database.sqlite
    .prepare(
      `select id, source_kind, original_name_display, source_size_bytes, status, discovered_count,
        parsed_count, skipped_count, duplicate_count, failed_count, imported_count,
        last_error_code, created_at, updated_at, completed_at, staged_source_deleted
       from historical_imports where id = ? and owner_id = ?`,
    )
    .get(importId, ownerId) as ImportRow | undefined;
  if (!row) throw new HistoricalImportError("invalid_id", false);
  return mapImport(row);
}

export function listHistoricalImports(database: AppDatabase, ownerId: string) {
  return (
    database.sqlite
      .prepare(
        `select id, source_kind, original_name_display, source_size_bytes, status, discovered_count,
          parsed_count, skipped_count, duplicate_count, failed_count, imported_count,
          last_error_code, created_at, updated_at, completed_at, staged_source_deleted
         from historical_imports where owner_id = ? order by created_at desc`,
      )
      .all(ownerId) as ImportRow[]
  ).map(mapImport);
}

export function getImportCheckpoint(database: AppDatabase, ownerId: string, importId: string) {
  const row = database.sqlite
    .prepare(
      `select source_fingerprint, logical_cursor_json, committed_byte_offset, message_ordinal,
        discovered_count, parsed_count, skipped_count, duplicate_count, failed_count, imported_count
       from import_checkpoints where historical_import_id = ? and owner_id = ?`,
    )
    .get(importId, ownerId) as CheckpointRow | undefined;
  if (!row) throw new HistoricalImportError("invalid_state", false);
  return {
    sourceFingerprint: row.source_fingerprint,
    committedByteOffset: row.committed_byte_offset,
    messageOrdinal: row.message_ordinal,
    logicalCursor: row.logical_cursor_json
      ? (JSON.parse(row.logical_cursor_json) as { datasetIndex: number; rowOrdinal: number })
      : null,
    discovered: row.discovered_count,
    parsed: row.parsed_count,
    skipped: row.skipped_count,
    duplicated: row.duplicate_count,
    failed: row.failed_count,
    imported: row.imported_count,
  };
}

function insertError(
  database: AppDatabase,
  ownerId: string,
  importId: string,
  code: ImportErrorCode,
  ordinal: number | null,
  sourceMessageId: string | null,
  now: string,
) {
  database.sqlite
    .prepare(
      `insert into import_errors (
        id, owner_id, historical_import_id, source_message_id, stage,
        code, recoverable, message_ordinal, created_at
      ) values (?, ?, ?, ?, 'message', ?, 1, ?, ?)`,
    )
    .run(randomUUID(), ownerId, importId, sourceMessageId, code, ordinal, now);
}

export function persistParsedFrames(
  database: AppDatabase,
  ownerId: string,
  importId: string,
  frames: ParsedFrame[],
  nextOffset: number,
  nextOrdinal: number,
  now = new Date(),
) {
  return withImmediateTransaction(database, () => {
    const current = getImportCheckpoint(database, ownerId, importId);
    if (current.messageOrdinal !== nextOrdinal - frames.length)
      throw new HistoricalImportError("invalid_state", true);
    const counts: ImportCounts = { ...current };
    const timestamp = now.toISOString();

    for (const item of frames) {
      const ordinal = nextOrdinal - frames.length + item.frame.ordinal;
      if (item.errorCode || !item.message) {
        const code = item.errorCode ?? "mime_parse_failed";
        const status = code === "message_too_large" ? "skipped" : "failed";
        if (status === "failed") counts.failed += 1;
        const sourceMessageId = randomUUID();
        database.sqlite
          .prepare(
            `insert into import_source_messages (
              id, owner_id, historical_import_id, message_ordinal, byte_offset, byte_length,
              raw_sha256, parse_status, warning_codes_json, error_code, created_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?)`,
          )
          .run(
            sourceMessageId,
            ownerId,
            importId,
            ordinal,
            item.frame.byteOffset,
            item.frame.byteLength,
            item.frame.rawSha256,
            status,
            code,
            timestamp,
          );
        insertError(database, ownerId, importId, code, ordinal, sourceMessageId, timestamp);
        continue;
      }

      counts.parsed += 1;
      const duplicate = database.sqlite
        .prepare(
          `select id from import_source_messages
           where owner_id = ? and parse_status = 'imported'
             and (raw_sha256 = ? or canonical_sha256 = ?)
           limit 1`,
        )
        .get(ownerId, item.frame.rawSha256, item.message.canonicalSha256) as
        | { id: string }
        | undefined;
      if (duplicate) {
        counts.duplicated += 1;
        continue;
      }

      const sameMessageId = item.message.normalizedMessageId
        ? (database.sqlite
            .prepare(
              `select canonical_sha256 from import_source_messages
               where owner_id = ? and normalized_message_id = ? and parse_status = 'imported'
               limit 1`,
            )
            .get(ownerId, item.message.normalizedMessageId) as
            | { canonical_sha256: string }
            | undefined)
        : undefined;
      if (sameMessageId) {
        if (sameMessageId.canonical_sha256 === item.message.canonicalSha256) {
          counts.duplicated += 1;
          continue;
        }
        counts.failed += 1;
        const sourceMessageId = randomUUID();
        database.sqlite
          .prepare(
            `insert into import_source_messages (
              id, owner_id, historical_import_id, message_ordinal, byte_offset, byte_length,
              raw_sha256, canonical_sha256, normalized_message_id, parse_status,
              warning_codes_json, error_code, created_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, 'conflict', '[]', 'message_id_conflict', ?)`,
          )
          .run(
            sourceMessageId,
            ownerId,
            importId,
            ordinal,
            item.frame.byteOffset,
            item.frame.byteLength,
            item.frame.rawSha256,
            item.message.canonicalSha256,
            item.message.normalizedMessageId,
            timestamp,
          );
        insertError(
          database,
          ownerId,
          importId,
          "message_id_conflict",
          ordinal,
          sourceMessageId,
          timestamp,
        );
        continue;
      }

      const sourceMessageId = randomUUID();
      database.sqlite
        .prepare(
          `insert into import_source_messages (
            id, owner_id, historical_import_id, message_ordinal, byte_offset, byte_length,
            raw_sha256, canonical_sha256, normalized_message_id, parse_status,
            warning_codes_json, created_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, 'imported', ?, ?)`,
        )
        .run(
          sourceMessageId,
          ownerId,
          importId,
          ordinal,
          item.frame.byteOffset,
          item.frame.byteLength,
          item.frame.rawSha256,
          item.message.canonicalSha256,
          item.message.normalizedMessageId,
          JSON.stringify(item.message.warningCodes),
          timestamp,
        );
      database.sqlite
        .prepare(
          `insert into normalized_messages (
            id, owner_id, source_message_id, sent_at, subject, sender_json, recipients_json,
            reply_to_json, normalized_message_id, references_json, safe_text, text_truncated,
            warning_codes_json, created_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          ownerId,
          sourceMessageId,
          item.message.sentAt,
          item.message.subject,
          JSON.stringify(item.message.sender),
          JSON.stringify(item.message.recipients),
          JSON.stringify(item.message.replyTo),
          item.message.normalizedMessageId,
          JSON.stringify(item.message.references),
          item.message.safeText,
          item.message.textTruncated ? 1 : 0,
          JSON.stringify(item.message.warningCodes),
          timestamp,
        );
      const attachmentStatement = database.sqlite.prepare(
        `insert into attachment_inventory (
          id, owner_id, source_message_id, ordinal, filename_display, media_type,
          disposition, decoded_size_bytes, content_sha256, oversized, created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const attachment of item.message.attachments) {
        attachmentStatement.run(
          randomUUID(),
          ownerId,
          sourceMessageId,
          attachment.ordinal,
          attachment.filenameDisplay,
          attachment.mediaType,
          attachment.disposition,
          attachment.decodedSizeBytes,
          attachment.contentSha256,
          attachment.oversized ? 1 : 0,
          timestamp,
        );
      }
      counts.imported += 1;
    }

    database.sqlite
      .prepare(
        `update import_checkpoints set committed_byte_offset = ?, message_ordinal = ?,
          parsed_count = ?, skipped_count = ?, duplicate_count = ?, failed_count = ?,
          imported_count = ?, updated_at = ? where historical_import_id = ? and owner_id = ?`,
      )
      .run(
        nextOffset,
        nextOrdinal,
        counts.parsed,
        counts.skipped,
        counts.duplicated,
        counts.failed,
        counts.imported,
        timestamp,
        importId,
        ownerId,
      );
    database.sqlite
      .prepare(
        `update historical_imports set
          status = case when status = 'paused_user' then status else 'processing' end,
          parsed_count = ?, skipped_count = ?, duplicate_count = ?, failed_count = ?, imported_count = ?,
          started_at = coalesce(started_at, ?), updated_at = ?
         where id = ? and owner_id = ?`,
      )
      .run(
        counts.parsed,
        counts.skipped,
        counts.duplicated,
        counts.failed,
        counts.imported,
        timestamp,
        timestamp,
        importId,
        ownerId,
      );
    return counts;
  });
}

export function persistLinkedInRows(
  database: AppDatabase,
  ownerId: string,
  importId: string,
  rows: LinkedInSourceRow[],
  logicalCursor: { datasetIndex: number; rowOrdinal: number },
  now = new Date(),
) {
  return withImmediateTransaction(database, () => {
    const summary = getHistoricalImport(database, ownerId, importId);
    if (summary.sourceKind !== "linkedin_export" || summary.status !== "processing")
      throw new HistoricalImportError("invalid_state", false);
    const timestamp = now.toISOString();
    const runId = `linkedin-export:${importId}`;
    const fingerprint = getImportCheckpoint(database, ownerId, importId).sourceFingerprint;
    database.sqlite
      .prepare(`insert into classification_runs
        (id, owner_id, engine_version, ruleset_sha256, source_set_sha256, status,
         processed_count, proposal_count, started_at, updated_at)
        values (?, ?, 'linkedin-export-v1', ?, ?, 'running', 0, 0, ?, ?)
        on conflict(id) do nothing`)
      .run(runId, ownerId, "linkedin-export-v1", fingerprint, timestamp, timestamp);
    let inserted = 0;
    for (const row of rows) {
      const normalizedJson = JSON.stringify(row.normalized);
      const recordId = randomUUID();
      const result = database.sqlite
        .prepare(`insert into import_source_records
          (id, owner_id, historical_import_id, dataset_kind, row_ordinal, row_sha256,
           normalized_json, parse_status, created_at)
          values (?, ?, ?, ?, ?, ?, ?, 'parsed', ?)
          on conflict(historical_import_id, dataset_kind, row_ordinal) do nothing`)
        .run(
          recordId,
          ownerId,
          importId,
          row.datasetKind,
          row.rowOrdinal,
          row.rowSha256,
          normalizedJson,
          timestamp,
        );
      if (result.changes === 0) continue;
      inserted += 1;
      const proposed = JSON.stringify({
        importSourceRecordId: recordId,
        datasetKind: row.datasetKind,
        rowOrdinal: row.rowOrdinal,
        values: row.normalized,
        proofBoundary:
          row.datasetKind === "job_applications"
            ? "application_record_only"
            : "relationship_clue_only",
      });
      database.sqlite
        .prepare(`insert into classification_proposals
          (id, owner_id, run_id, proposal_key, proposal_type, proposed_value_json,
           confidence_basis_points, review_requirement, state, created_at, updated_at)
          values (?, ?, ?, ?, 'linkedin_export_row', ?, 5000, 'user_review', 'proposed', ?, ?)
          on conflict(run_id, proposal_key) do nothing`)
        .run(
          randomUUID(),
          ownerId,
          runId,
          `${row.datasetKind}:${row.rowSha256}`,
          proposed,
          timestamp,
          timestamp,
        );
    }
    const checkpoint = getImportCheckpoint(database, ownerId, importId);
    const imported = checkpoint.imported + inserted;
    database.sqlite
      .prepare(`update import_checkpoints set logical_cursor_json = ?, message_ordinal = ?,
        parsed_count = ?, imported_count = ?, updated_at = ?
        where historical_import_id = ? and owner_id = ?`)
      .run(
        JSON.stringify(logicalCursor),
        logicalCursor.rowOrdinal,
        imported,
        imported,
        timestamp,
        importId,
        ownerId,
      );
    database.sqlite
      .prepare(`update historical_imports set parsed_count = ?, imported_count = ?,
        started_at = coalesce(started_at, ?), updated_at = ? where id = ? and owner_id = ?`)
      .run(imported, imported, timestamp, timestamp, importId, ownerId);
    database.sqlite
      .prepare(
        `update classification_runs set processed_count = ?, proposal_count = ?, updated_at = ? where id = ? and owner_id = ?`,
      )
      .run(imported, imported, timestamp, runId, ownerId);
    return inserted;
  });
}

export function transitionImport(
  database: AppDatabase,
  ownerId: string,
  importId: string,
  from: ImportStatus[],
  to: ImportStatus,
  errorCode: ImportErrorCode | null = null,
  now = new Date(),
) {
  if (from.length === 0) throw new HistoricalImportError("invalid_state", false);
  const placeholders = from.map(() => "?").join(", ");
  withImmediateTransaction(database, () => {
    const result = database.sqlite
      .prepare(
        `update historical_imports set status = ?, last_error_code = ?, updated_at = ?
         where id = ? and owner_id = ? and status in (${placeholders})`,
      )
      .run(to, errorCode, now.toISOString(), importId, ownerId, ...from);
    if (result.changes !== 1) throw new HistoricalImportError("invalid_state", false);
  });
}

export function completeImport(
  database: AppDatabase,
  ownerId: string,
  importId: string,
  now = new Date(),
) {
  withImmediateTransaction(database, () => {
    const timestamp = now.toISOString();
    const result = database.sqlite
      .prepare(
        `update historical_imports set status = 'completed', staged_source_deleted = 1,
          staged_expires_at = null, completed_at = ?, updated_at = ?
         where id = ? and owner_id = ? and status = 'processing'`,
      )
      .run(timestamp, timestamp, importId, ownerId);
    if (result.changes !== 1) throw new HistoricalImportError("invalid_state", false);
  });
}

export function markStagedSourceDeleted(
  database: AppDatabase,
  ownerId: string,
  importId: string,
  status: "failed" | "cancelled",
  errorCode: ImportErrorCode | null,
  now = new Date(),
) {
  withImmediateTransaction(database, () => {
    database.sqlite
      .prepare(
        `update historical_imports set status = ?, staged_source_deleted = 1,
          staged_expires_at = null, last_error_code = ?, updated_at = ?
         where id = ? and owner_id = ?`,
      )
      .run(status, errorCode, now.toISOString(), importId, ownerId);
  });
}

export function listExpiredImports(database: AppDatabase, ownerId: string, now = new Date()) {
  return database.sqlite
    .prepare(
      `select id from historical_imports
       where owner_id = ? and staged_source_deleted = 0 and staged_expires_at < ?`,
    )
    .all(ownerId, now.toISOString()) as Array<{ id: string }>;
}

export function getImportDeletionImpact(database: AppDatabase, ownerId: string, importId: string) {
  getHistoricalImport(database, ownerId, importId);
  const count = (table: string) =>
    Number(
      (
        database.sqlite
          .prepare(
            `select count(*) as count from ${table} where owner_id = ? and historical_import_id = ?`,
          )
          .get(ownerId, importId) as { count: number }
      ).count,
    );
  return {
    sourceMessages: count("import_source_messages"),
    sourceRecords: count("import_source_records"),
    normalizedMessages: Number(
      (
        database.sqlite
          .prepare(`select count(*) as count from normalized_messages nm
            join import_source_messages ism on ism.id = nm.source_message_id
            where ism.owner_id = ? and ism.historical_import_id = ?`)
          .get(ownerId, importId) as { count: number }
      ).count,
    ),
    proposals: Number(
      (
        database.sqlite
          .prepare(
            "select count(*) as count from classification_proposals where owner_id = ? and run_id = ?",
          )
          .get(ownerId, `linkedin-export:${importId}`) as { count: number }
      ).count,
    ),
  };
}

export function deleteImportMetadata(database: AppDatabase, ownerId: string, importId: string) {
  withImmediateTransaction(database, () => {
    database.sqlite
      .prepare("delete from classification_runs where id = ? and owner_id = ?")
      .run(`linkedin-export:${importId}`, ownerId);
    const result = database.sqlite
      .prepare("delete from historical_imports where id = ? and owner_id = ?")
      .run(importId, ownerId);
    if (result.changes !== 1) throw new HistoricalImportError("invalid_id", false);
  });
}
