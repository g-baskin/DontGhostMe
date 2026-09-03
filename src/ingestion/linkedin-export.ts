import { createHash } from "node:crypto";
import { createReadStream, type ReadStream } from "node:fs";
import { extname, isAbsolute, posix } from "node:path";
import { parse } from "csv-parse";
import yauzl, { type Entry, type ZipFile } from "yauzl";
import { HistoricalImportError } from "@/domain/imports";
import {
  type LinkedInDatasetKind,
  normalizeLinkedInRow,
  routeHeaders,
  schemaForFilename,
} from "./linkedin-export-adapters";

export const LINKEDIN_EXPORT_LIMITS = {
  entries: 100,
  entryBytes: 100 * 1024 * 1024,
  totalBytes: 500 * 1024 * 1024,
  compressionRatio: 100,
  rows: 1_000_000,
  batchRows: 250,
} as const;

export interface LinkedInInventoryItem {
  datasetKind: LinkedInDatasetKind | null;
  recognized: boolean;
  rowCount: number;
}

export interface LinkedInSourceRow {
  datasetKind: LinkedInDatasetKind;
  rowOrdinal: number;
  rowSha256: string;
  normalized: Record<string, string>;
}

function validateEntry(entry: Entry, paths: Set<string>) {
  const path = entry.fileName.replaceAll("\\", "/");
  const normalized = posix.normalize(path);
  if (
    path.includes("\0") ||
    isAbsolute(path) ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    paths.has(normalized.toLocaleLowerCase("en-US"))
  )
    throw new HistoricalImportError("archive_path_invalid", false);
  paths.add(normalized.toLocaleLowerCase("en-US"));
  if ((entry.generalPurposeBitFlag & 1) !== 0)
    throw new HistoricalImportError("encrypted_archive", false);
  const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
  if (unixMode && (unixMode & 0o170000) !== 0o100000 && !path.endsWith("/"))
    throw new HistoricalImportError("archive_path_invalid", false);
  if ([".zip", ".tar", ".gz", ".tgz"].includes(extname(path).toLocaleLowerCase("en-US")))
    throw new HistoricalImportError("nested_archive", false);
  if (entry.uncompressedSize > LINKEDIN_EXPORT_LIMITS.entryBytes)
    throw new HistoricalImportError("archive_size_limit", false);
  if (
    entry.uncompressedSize > 0 &&
    entry.uncompressedSize / Math.max(1, entry.compressedSize) >
      LINKEDIN_EXPORT_LIMITS.compressionRatio
  )
    throw new HistoricalImportError("archive_ratio_limit", false);
}

const openZip = (path: string) =>
  new Promise<ZipFile>((resolve, reject) => {
    yauzl.open(
      path,
      { lazyEntries: true, decodeStrings: true, validateEntrySizes: true },
      (error, zip) => {
        if (error || !zip) reject(new HistoricalImportError("unsupported_archive", false));
        else resolve(zip);
      },
    );
  });

const openEntry = (zip: ZipFile, entry: Entry) =>
  new Promise<NodeJS.ReadableStream>((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) reject(new HistoricalImportError("unsupported_archive", false));
      else resolve(stream);
    });
  });

async function parseCsv(
  stream: NodeJS.ReadableStream,
  filename: string,
  collectRows: boolean,
): Promise<{ inventory: LinkedInInventoryItem; rows: LinkedInSourceRow[] }> {
  const schema = schemaForFilename(filename);
  if (!schema) {
    for await (const _chunk of stream) {
      // Drain unknown entries without interpreting or retaining their contents.
    }
    return { inventory: { datasetKind: null, recognized: false, rowCount: 0 }, rows: [] };
  }
  const parser = stream.pipe(
    parse({ bom: true, relax_column_count: false, max_record_size: 128 * 256 * 1024 }),
  );
  let headers: string[] | null = null;
  let indexes: Record<string, number> | null = null;
  let rowCount = 0;
  const rows: LinkedInSourceRow[] = [];
  try {
    for await (const raw of parser) {
      if (!Array.isArray(raw) || raw.some((value) => typeof value !== "string"))
        throw new HistoricalImportError("malformed_csv", false);
      if (!headers) {
        headers = raw;
        indexes = routeHeaders(schema, headers);
        continue;
      }
      rowCount += 1;
      if (rowCount > LINKEDIN_EXPORT_LIMITS.rows)
        throw new HistoricalImportError("row_limit", false);
      if (collectRows) {
        const normalized = normalizeLinkedInRow(schema, indexes ?? {}, raw);
        const canonical = JSON.stringify(normalized.values);
        rows.push({
          datasetKind: normalized.datasetKind,
          rowOrdinal: rowCount,
          rowSha256: createHash("sha256").update(canonical).digest("hex"),
          normalized: normalized.values,
        });
      }
    }
  } catch (error) {
    if (error instanceof HistoricalImportError) throw error;
    throw new HistoricalImportError("malformed_csv", false);
  }
  if (!headers) throw new HistoricalImportError("schema_drift", false);
  return { inventory: { datasetKind: schema.kind, recognized: true, rowCount }, rows };
}

async function inspectZip(path: string, collectRows: boolean) {
  const zip = await openZip(path);
  const paths = new Set<string>();
  const inventory: LinkedInInventoryItem[] = [];
  const rows: LinkedInSourceRow[] = [];
  let entries = 0;
  let totalBytes = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      zip.on("error", () => reject(new HistoricalImportError("unsupported_archive", false)));
      zip.on("end", resolve);
      zip.on("entry", (entry: Entry) => {
        void (async () => {
          try {
            entries += 1;
            if (entries > LINKEDIN_EXPORT_LIMITS.entries)
              throw new HistoricalImportError("archive_entry_limit", false);
            validateEntry(entry, paths);
            totalBytes += entry.uncompressedSize;
            if (totalBytes > LINKEDIN_EXPORT_LIMITS.totalBytes)
              throw new HistoricalImportError("archive_size_limit", false);
            if (!entry.fileName.endsWith("/")) {
              const parsed = await parseCsv(
                await openEntry(zip, entry),
                entry.fileName,
                collectRows,
              );
              inventory.push(parsed.inventory);
              rows.push(...parsed.rows);
            }
            zip.readEntry();
          } catch (error) {
            reject(error);
          }
        })();
      });
      zip.readEntry();
    });
  } finally {
    zip.close();
  }
  return { inventory, rows };
}

export async function inspectLinkedInExport(
  path: string,
  displayName: string,
  collectRows = false,
) {
  if (extname(displayName).toLocaleLowerCase("en-US") === ".csv") {
    const parsed = await parseCsv(createReadStream(path) as ReadStream, displayName, collectRows);
    return { inventory: [parsed.inventory], rows: parsed.rows };
  }
  return inspectZip(path, collectRows);
}
