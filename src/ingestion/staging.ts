import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, open, rename, rm } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { HistoricalImportError } from "@/domain/imports";
import { IMPORT_LIMITS } from "@/ingestion/import-limits";
import { sanitizeDisplayName } from "@/ingestion/safe-text";

const SOURCE_NAME = "source.mbox";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function defaultStagingRoot() {
  return resolve(process.cwd(), ".local", "imports");
}

function containedPath(root: string, importId: string) {
  if (!UUID.test(importId)) throw new HistoricalImportError("invalid_id", false);
  const resolvedRoot = resolve(root);
  const directory = resolve(resolvedRoot, importId);
  if (!directory.startsWith(`${resolvedRoot}${sep}`))
    throw new HistoricalImportError("invalid_id", false);
  return { root: resolvedRoot, directory, source: resolve(directory, SOURCE_NAME) };
}

function archiveMagic(bytes: Uint8Array) {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const zip =
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    [0x03, 0x05, 0x07].includes(buffer[2] ?? -1) &&
    [0x04, 0x06, 0x08].includes(buffer[3] ?? -1);
  const gzip = buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
  const tar = buffer.length >= 262 && buffer.subarray(257, 262).toString("ascii") === "ustar";
  return zip || gzip || tar;
}

export interface StagedSource {
  displayName: string;
  path: string;
  sourceFingerprint: string;
  sourceSizeBytes: number;
  expiresAt: string;
}

export function validateMboxSelection(originalName: string, declaredSize: number | null) {
  const displayName = sanitizeDisplayName(originalName);
  const extension = extname(displayName).toLowerCase();
  if ([".zip", ".tar", ".tgz", ".gz", ".gzip"].includes(extension))
    throw new HistoricalImportError("unsupported_archive", false);
  if (extension !== ".mbox") throw new HistoricalImportError("invalid_filename", false);
  if (
    declaredSize !== null &&
    (!Number.isSafeInteger(declaredSize) ||
      declaredSize < 0 ||
      declaredSize > IMPORT_LIMITS.sourceBytes)
  )
    throw new HistoricalImportError("source_too_large", false);
  return displayName;
}

export function validateLinkedInSelection(originalName: string, declaredSize: number | null) {
  const displayName = sanitizeDisplayName(originalName);
  if (![".zip", ".csv"].includes(extname(displayName).toLowerCase()))
    throw new HistoricalImportError("invalid_filename", false);
  if (
    declaredSize !== null &&
    (!Number.isSafeInteger(declaredSize) || declaredSize < 0 || declaredSize > 250 * 1024 * 1024)
  )
    throw new HistoricalImportError("source_too_large", false);
  return displayName;
}

async function stageSource(
  importId: string,
  displayName: string,
  declaredSize: number | null,
  chunks: AsyncIterable<Uint8Array>,
  root: string,
  maximumSourceBytes: number,
  allowArchive: boolean,
): Promise<StagedSource> {
  const paths = containedPath(root, importId);
  await mkdir(paths.root, { recursive: true, mode: 0o700 });
  await mkdir(paths.directory, { mode: 0o700 });
  const partial = `${paths.source}.part`;
  const handle = await open(partial, "wx", 0o600);
  const hash = createHash("sha256");
  let size = 0;
  let prefix = Buffer.alloc(0);
  try {
    for await (const chunk of chunks) {
      if (!ArrayBuffer.isView(chunk)) throw new HistoricalImportError("invalid_request", false);
      size += chunk.byteLength;
      if (size > maximumSourceBytes) throw new HistoricalImportError("source_too_large", false);
      if (prefix.byteLength < 512) {
        const remaining = 512 - prefix.byteLength;
        prefix = Buffer.concat([prefix, Buffer.from(chunk.subarray(0, remaining))]);
        if (!allowArchive && archiveMagic(prefix))
          throw new HistoricalImportError("unsupported_archive", false);
      }
      hash.update(chunk);
      let written = 0;
      while (written < chunk.byteLength) {
        const result = await handle.write(chunk.subarray(written));
        if (result.bytesWritten === 0) throw new HistoricalImportError("internal_error", false);
        written += result.bytesWritten;
      }
    }
    if (declaredSize !== null && size !== declaredSize)
      throw new HistoricalImportError("invalid_request", false);
    if (!allowArchive && archiveMagic(prefix))
      throw new HistoricalImportError("unsupported_archive", false);
    await handle.sync();
    await handle.close();
    await rename(partial, paths.source);
    await access(paths.source, constants.R_OK);
    return {
      displayName,
      path: paths.source,
      sourceFingerprint: hash.digest("hex"),
      sourceSizeBytes: size,
      expiresAt: new Date(Date.now() + IMPORT_LIMITS.stagingRetentionMilliseconds).toISOString(),
    };
  } catch (error) {
    await handle.close().catch(() => undefined);
    await rm(paths.directory, { recursive: true, force: true });
    throw error;
  }
}

export async function stageMbox(
  importId: string,
  originalName: string,
  declaredSize: number | null,
  chunks: AsyncIterable<Uint8Array>,
  root = defaultStagingRoot(),
  maximumSourceBytes = IMPORT_LIMITS.sourceBytes,
): Promise<StagedSource> {
  return stageSource(
    importId,
    validateMboxSelection(originalName, declaredSize),
    declaredSize,
    chunks,
    root,
    maximumSourceBytes,
    false,
  );
}

export async function stageLinkedInExport(
  importId: string,
  originalName: string,
  declaredSize: number | null,
  chunks: AsyncIterable<Uint8Array>,
  root = defaultStagingRoot(),
) {
  return stageSource(
    importId,
    validateLinkedInSelection(originalName, declaredSize),
    declaredSize,
    chunks,
    root,
    250 * 1024 * 1024,
    true,
  );
}

export function getStagedSourcePath(importId: string, root = defaultStagingRoot()) {
  return containedPath(root, importId).source;
}

export async function deleteStagedSource(importId: string, root = defaultStagingRoot()) {
  const { directory } = containedPath(root, importId);
  await rm(directory, { recursive: true, force: true });
}
