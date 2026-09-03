import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { AppDatabase } from "@/db/client";
import {
  attachStagedSource,
  completeImport,
  createHistoricalImport,
  deleteImportMetadata,
  getHistoricalImport,
  getImportCheckpoint,
  listExpiredImports,
  listHistoricalImports,
  markStagedSourceDeleted,
  type ParsedFrame,
  persistLinkedInRows,
  persistParsedFrames,
  saveImportPreview,
  transitionImport,
} from "@/db/historical-imports";
import {
  HistoricalImportError,
  type ImportErrorCode,
  type ImportSourceKind,
} from "@/domain/imports";
import { IMPORT_LIMITS, type ImportLimits } from "@/ingestion/import-limits";
import { inspectLinkedInExport, LINKEDIN_EXPORT_LIMITS } from "@/ingestion/linkedin-export";
import { frameMbox } from "@/ingestion/mbox-framer";
import { parseMimeBounded } from "@/ingestion/mime-parser";
import {
  deleteStagedSource,
  getStagedSourcePath,
  stageLinkedInExport,
  stageMbox,
  validateLinkedInSelection,
  validateMboxSelection,
} from "@/ingestion/staging";

export interface ImportSourceAdapter {
  sourceKind: ImportSourceKind;
  validateSelection(name: string, size: number | null): string;
  stage(
    importId: string,
    name: string,
    size: number | null,
    chunks: AsyncIterable<Uint8Array>,
    stagingRoot?: string,
  ): ReturnType<typeof stageMbox>;
}

export const importSourceAdapters: Record<ImportSourceKind, ImportSourceAdapter> = {
  gmail_mbox: {
    sourceKind: "gmail_mbox",
    validateSelection: validateMboxSelection,
    stage: stageMbox,
  },
  linkedin_export: {
    sourceKind: "linkedin_export",
    validateSelection: validateLinkedInSelection,
    stage: stageLinkedInExport,
  },
};

async function fingerprint(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function verifyStagedSource(
  database: AppDatabase,
  ownerId: string,
  importId: string,
  expectedFingerprint: string,
  stagingRoot?: string,
) {
  const path = getStagedSourcePath(importId, stagingRoot);
  const details = await stat(path).catch(() => null);
  if (!details?.isFile()) throw new HistoricalImportError("source_missing", false);
  const summary = getHistoricalImport(database, ownerId, importId);
  if (details.size !== summary.sourceSizeBytes)
    throw new HistoricalImportError("source_missing", false);
  if ((await fingerprint(path)) !== expectedFingerprint)
    throw new HistoricalImportError("source_missing", false);
  return path;
}

export function beginHistoricalImport(
  database: AppDatabase,
  ownerId: string,
  originalName: string,
  declaredSize: number | null,
  sourceKind: ImportSourceKind = "gmail_mbox",
) {
  const displayName = importSourceAdapters[sourceKind].validateSelection(
    originalName,
    declaredSize,
  );
  return createHistoricalImport(database, ownerId, displayName, sourceKind);
}

export async function uploadHistoricalImport(
  database: AppDatabase,
  ownerId: string,
  importId: string,
  originalName: string,
  declaredSize: number | null,
  chunks: AsyncIterable<Uint8Array>,
  stagingRoot?: string,
) {
  const summary = getHistoricalImport(database, ownerId, importId);
  const staged = await importSourceAdapters[summary.sourceKind].stage(
    importId,
    originalName,
    declaredSize,
    chunks,
    stagingRoot,
  );
  const attached = attachStagedSource(
    database,
    ownerId,
    importId,
    staged.sourceFingerprint,
    staged.sourceSizeBytes,
    staged.expiresAt,
  );
  if (attached.reused) await deleteStagedSource(importId, stagingRoot);
  return getHistoricalImport(database, ownerId, attached.id);
}

export async function previewHistoricalImport(
  database: AppDatabase,
  ownerId: string,
  importId: string,
  stagingRoot?: string,
  limits: Readonly<ImportLimits> = IMPORT_LIMITS,
) {
  const summary = getHistoricalImport(database, ownerId, importId);
  if (summary.status !== "uploading") {
    if (summary.status === "preview_ready") return summary;
    throw new HistoricalImportError("invalid_state", false);
  }
  const row = database.sqlite
    .prepare("select source_fingerprint from historical_imports where id = ? and owner_id = ?")
    .get(importId, ownerId) as { source_fingerprint: string } | undefined;
  if (!row?.source_fingerprint) throw new HistoricalImportError("source_missing", false);
  const path = await verifyStagedSource(
    database,
    ownerId,
    importId,
    row.source_fingerprint,
    stagingRoot,
  );
  let discovered = 0;
  let skipped = 0;
  if (summary.sourceKind === "linkedin_export") {
    const { inventory } = await inspectLinkedInExport(path, summary.displayName);
    discovered = inventory.reduce((count, item) => count + item.rowCount, 0);
    skipped = inventory.filter((item) => !item.recognized).length;
  } else {
    for await (const message of frameMbox(path, 0, limits.messageBytes)) {
      discovered += 1;
      if (message.oversized) skipped += 1;
    }
  }
  saveImportPreview(database, ownerId, importId, discovered, skipped);
  return getHistoricalImport(database, ownerId, importId);
}

async function parseFrame(
  frame: Awaited<ReturnType<typeof nextFrame>>,
  limits: Readonly<ImportLimits>,
): Promise<ParsedFrame> {
  if (!frame) throw new HistoricalImportError("invalid_state", false);
  if (frame.oversized) return { frame, errorCode: "message_too_large" };
  try {
    return { frame, message: await parseMimeBounded(frame.raw, limits) };
  } catch (error) {
    if (error instanceof HistoricalImportError) return { frame, errorCode: error.code };
    return { frame, errorCode: "mime_parse_failed" };
  }
}

async function nextFrame(
  iterator: AsyncIterator<import("@/ingestion/mbox-framer").FramedMboxMessage>,
) {
  const result = await iterator.next();
  return result.done ? null : result.value;
}

async function runHistoricalImportBatch(
  database: AppDatabase,
  ownerId: string,
  importId: string,
  stagingRoot?: string,
  limits: Readonly<ImportLimits> = IMPORT_LIMITS,
) {
  let summary = getHistoricalImport(database, ownerId, importId);
  if (summary.status === "completed") return summary;
  const verifyBeforeProcessing = ["preview_ready", "paused_user", "paused_interrupted"].includes(
    summary.status,
  );
  if (verifyBeforeProcessing) {
    transitionImport(database, ownerId, importId, [summary.status], "processing");
    summary = getHistoricalImport(database, ownerId, importId);
  }
  if (summary.status !== "processing") throw new HistoricalImportError("invalid_state", false);

  const checkpoint = getImportCheckpoint(database, ownerId, importId);
  const path = verifyBeforeProcessing
    ? await verifyStagedSource(
        database,
        ownerId,
        importId,
        checkpoint.sourceFingerprint,
        stagingRoot,
      )
    : getStagedSourcePath(importId, stagingRoot);
  if (summary.sourceKind === "linkedin_export") {
    // simplification: each bounded batch rescans at most 1,000,000 local rows; replace with indexed entry offsets if profiling shows this ceiling is reached.
    const { rows } = await inspectLinkedInExport(path, summary.displayName, true);
    const batch = rows.slice(
      checkpoint.messageOrdinal,
      checkpoint.messageOrdinal + LINKEDIN_EXPORT_LIMITS.batchRows,
    );
    if (batch.length) {
      const last = batch.at(-1);
      persistLinkedInRows(database, ownerId, importId, batch, {
        datasetIndex: Math.max(
          0,
          ["connections", "invitations", "job_applications"].indexOf(
            last?.datasetKind ?? "connections",
          ),
        ),
        rowOrdinal: checkpoint.messageOrdinal + batch.length,
      });
    }
    if (checkpoint.messageOrdinal + batch.length >= rows.length) {
      await deleteStagedSource(importId, stagingRoot);
      completeImport(database, ownerId, importId);
      database.sqlite
        .prepare(
          "update classification_runs set status = 'completed', completed_at = ?, updated_at = ? where id = ? and owner_id = ?",
        )
        .run(
          new Date().toISOString(),
          new Date().toISOString(),
          `linkedin-export:${importId}`,
          ownerId,
        );
    }
    return getHistoricalImport(database, ownerId, importId);
  }

  const fileSize = (await stat(path)).size;
  if (checkpoint.committedByteOffset >= fileSize) {
    await deleteStagedSource(importId, stagingRoot);
    completeImport(database, ownerId, importId);
    return getHistoricalImport(database, ownerId, importId);
  }

  const iterator = frameMbox(path, checkpoint.committedByteOffset, limits.messageBytes)[
    Symbol.asyncIterator
  ]();
  const frames: ParsedFrame[] = [];
  let consumedBytes = 0;
  let nextOffset = checkpoint.committedByteOffset;
  const started = performance.now();
  while (
    frames.length < limits.batchMessages &&
    consumedBytes < limits.batchBytes &&
    performance.now() - started < limits.batchMilliseconds
  ) {
    if (getHistoricalImport(database, ownerId, importId).status === "paused_user") break;
    const frame = await nextFrame(iterator);
    if (!frame) break;
    if (
      frames.length > 0 &&
      (consumedBytes + frame.byteLength > limits.batchBytes ||
        performance.now() - started >= limits.batchMilliseconds)
    )
      break;
    consumedBytes += frame.byteLength;
    nextOffset = frame.nextOffset;
    frames.push(await parseFrame(frame, limits));
  }

  if (frames.length > 0) {
    persistParsedFrames(
      database,
      ownerId,
      importId,
      frames,
      nextOffset,
      checkpoint.messageOrdinal + frames.length,
    );
  }
  if (
    nextOffset >= fileSize &&
    getHistoricalImport(database, ownerId, importId).status === "processing"
  ) {
    await deleteStagedSource(importId, stagingRoot);
    completeImport(database, ownerId, importId);
  }
  return getHistoricalImport(database, ownerId, importId);
}

const activeBatches = new WeakMap<AppDatabase, Set<string>>();

export async function processHistoricalImportBatch(
  database: AppDatabase,
  ownerId: string,
  importId: string,
  stagingRoot?: string,
  limits: Readonly<ImportLimits> = IMPORT_LIMITS,
) {
  const active = activeBatches.get(database) ?? new Set<string>();
  activeBatches.set(database, active);
  if (active.has(importId)) throw new HistoricalImportError("database_busy", true);
  active.add(importId);
  try {
    return await runHistoricalImportBatch(database, ownerId, importId, stagingRoot, limits);
  } finally {
    active.delete(importId);
  }
}

export function pauseHistoricalImport(database: AppDatabase, ownerId: string, importId: string) {
  const summary = getHistoricalImport(database, ownerId, importId);
  if (summary.status === "paused_user") return summary;
  transitionImport(database, ownerId, importId, ["preview_ready", "processing"], "paused_user");
  return getHistoricalImport(database, ownerId, importId);
}

export async function failHistoricalImport(
  database: AppDatabase,
  ownerId: string,
  importId: string,
  code: ImportErrorCode,
  stagingRoot?: string,
) {
  await deleteStagedSource(importId, stagingRoot);
  markStagedSourceDeleted(database, ownerId, importId, "failed", code);
  return getHistoricalImport(database, ownerId, importId);
}

export async function deleteHistoricalImport(
  database: AppDatabase,
  ownerId: string,
  importId: string,
  stagingRoot?: string,
) {
  await deleteStagedSource(importId, stagingRoot);
  deleteImportMetadata(database, ownerId, importId);
}

export async function cleanupExpiredImports(
  database: AppDatabase,
  ownerId: string,
  now = new Date(),
  stagingRoot?: string,
) {
  for (const item of listExpiredImports(database, ownerId, now)) {
    await deleteStagedSource(item.id, stagingRoot);
    markStagedSourceDeleted(database, ownerId, item.id, "failed", "source_expired", now);
  }
}

export { getHistoricalImport, listHistoricalImports };
