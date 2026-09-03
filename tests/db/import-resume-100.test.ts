import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, describe, expect, it } from "vitest";
import {
  beginHistoricalImport,
  pauseHistoricalImport,
  previewHistoricalImport,
  processHistoricalImportBatch,
  uploadHistoricalImport,
} from "@/application/historical-imports";
import { type AppDatabase, createDatabaseConnection } from "@/db/client";
import { persistSyntheticBatch } from "@/db/import-batches";
import { createRepository } from "@/db/repositories";
import { IMPORT_LIMITS } from "@/ingestion/import-limits";
import { normalizeSyntheticMessages } from "@/ingestion/synthetic-normalizer";
import { janeMessages, SYNTHETIC_OWNER_ID } from "@/test/fixtures/jane-conversation";

const directories: string[] = [];
const databases: AppDatabase[] = [];

function openDatabase(path: string) {
  const database = createDatabaseConnection(path);
  migrate(database.db, { migrationsFolder: "drizzle" });
  persistSyntheticBatch(database, normalizeSyntheticMessages(janeMessages));
  databases.push(database);
  return database;
}

async function* chunks(bytes: Uint8Array) {
  for (let offset = 0; offset < bytes.byteLength; offset += 17) {
    yield bytes.subarray(offset, offset + 17);
  }
}

function mailbox(count: number) {
  return Buffer.from(
    Array.from(
      { length: count },
      (_, index) =>
        `From sender@example.test Mon Jan  6 10:00:00 2025\nFrom: Sender <sender@example.test>\nTo: owner@example.test\nDate: Mon, 6 Jan 2025 10:${String(index % 60).padStart(2, "0")}:00 +0000\nMessage-ID: <resume-${index}@example.test>\nSubject: Message ${index}\n\nSynthetic body ${index}\n`,
    ).join(""),
  );
}

async function prepare(database: AppDatabase, stagingRoot: string, bytes: Buffer) {
  const id = beginHistoricalImport(database, SYNTHETIC_OWNER_ID, "hundred.mbox", bytes.length);
  await uploadHistoricalImport(
    database,
    SYNTHETIC_OWNER_ID,
    id,
    "hundred.mbox",
    bytes.length,
    chunks(bytes),
    stagingRoot,
  );
  await previewHistoricalImport(database, SYNTHETIC_OWNER_ID, id, stagingRoot);
  return id;
}

const volatileColumns = new Set([
  "id",
  "owner_id",
  "historical_import_id",
  "source_message_id",
  "created_at",
  "updated_at",
  "started_at",
  "completed_at",
  "staged_expires_at",
]);

function stableExport(database: AppDatabase) {
  const exported = createRepository(database).exportData(
    SYNTHETIC_OWNER_ID,
    "2025-01-10T00:00:00.000Z",
  );
  const stableRows = (rows: unknown[]) =>
    rows
      .map((row) =>
        Object.fromEntries(
          Object.entries(row as Record<string, unknown>).filter(
            ([key]) => !volatileColumns.has(key),
          ),
        ),
      )
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return {
    historicalImports: stableRows(exported.historicalImports),
    importCheckpoints: stableRows(exported.importCheckpoints),
    importSourceMessages: stableRows(exported.importSourceMessages),
    normalizedMessages: stableRows(exported.normalizedMessages),
    attachmentInventory: stableRows(exported.attachmentInventory),
    importErrors: stableRows(exported.importErrors),
  };
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    if (database.sqlite.open) database.sqlite.close();
  }
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("100-message resume equivalence", () => {
  it("exports the same stable owner data after interruption and exact resume", async () => {
    mkdirSync(join(process.cwd(), ".local"), { recursive: true });
    const root = mkdtempSync(join(process.cwd(), ".local/dontghostme-resume-"));
    directories.push(root);
    const bytes = mailbox(100);
    const hundredMessageLimits = { ...IMPORT_LIMITS, batchMilliseconds: 180_000 };

    const uninterrupted = openDatabase(join(root, "uninterrupted.sqlite"));
    const uninterruptedStaging = join(root, "uninterrupted-staging");
    const uninterruptedId = await prepare(uninterrupted, uninterruptedStaging, bytes);
    const uninterruptedResult = await processHistoricalImportBatch(
      uninterrupted,
      SYNTHETIC_OWNER_ID,
      uninterruptedId,
      uninterruptedStaging,
      hundredMessageLimits,
    );
    expect(uninterruptedResult).toMatchObject({ status: "completed", imported: 100 });

    const resumedPath = join(root, "resumed.sqlite");
    let resumed = openDatabase(resumedPath);
    const resumedStaging = join(root, "resumed-staging");
    const resumedId = await prepare(resumed, resumedStaging, bytes);
    const partial = await processHistoricalImportBatch(
      resumed,
      SYNTHETIC_OWNER_ID,
      resumedId,
      resumedStaging,
      { ...hundredMessageLimits, batchMessages: 37 },
    );
    expect(partial).toMatchObject({ status: "processing", imported: 37 });
    pauseHistoricalImport(resumed, SYNTHETIC_OWNER_ID, resumedId);
    resumed.sqlite.close();
    resumed = openDatabase(resumedPath);

    let result = await processHistoricalImportBatch(
      resumed,
      SYNTHETIC_OWNER_ID,
      resumedId,
      resumedStaging,
      { ...hundredMessageLimits, batchMessages: 37 },
    );
    while (result.status === "processing") {
      result = await processHistoricalImportBatch(
        resumed,
        SYNTHETIC_OWNER_ID,
        resumedId,
        resumedStaging,
        { ...hundredMessageLimits, batchMessages: 37 },
      );
    }
    expect(result).toMatchObject({ status: "completed", imported: 100 });
    expect(stableExport(resumed)).toEqual(stableExport(uninterrupted));
  }, 300_000);
});
