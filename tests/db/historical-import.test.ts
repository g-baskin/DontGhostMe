import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  beginHistoricalImport,
  cleanupExpiredImports,
  pauseHistoricalImport,
  previewHistoricalImport,
  processHistoricalImportBatch,
  uploadHistoricalImport,
} from "@/application/historical-imports";
import { type AppDatabase, createDatabaseConnection } from "@/db/client";
import { getImportCheckpoint } from "@/db/historical-imports";
import { persistSyntheticBatch } from "@/db/import-batches";
import { deleteOwnerData } from "@/db/owner-data";
import { createRepository } from "@/db/repositories";
import type { ImportLimits } from "@/ingestion/import-limits";
import { IMPORT_LIMITS } from "@/ingestion/import-limits";
import { frameMbox } from "@/ingestion/mbox-framer";
import { getStagedSourcePath } from "@/ingestion/staging";
import { normalizeSyntheticMessages } from "@/ingestion/synthetic-normalizer";
import {
  janeMessages,
  PROPOSED_AFFILIATION_ASSERTION_ID,
  SYNTHETIC_OWNER_ID,
} from "@/test/fixtures/jane-conversation";

const OWNER_ID = SYNTHETIC_OWNER_ID;
let directory: string;
let stagingRoot: string;
let databasePath: string;
let database: AppDatabase;

async function* chunks(bytes: Uint8Array, size = 7) {
  for (let offset = 0; offset < bytes.byteLength; offset += size) {
    yield bytes.subarray(offset, offset + size);
  }
}

function limit(overrides: Partial<ImportLimits>) {
  return { ...IMPORT_LIMITS, ...overrides };
}

function openDatabase() {
  const connection = createDatabaseConnection(databasePath);
  migrate(connection.db, { migrationsFolder: "drizzle" });
  return connection;
}

beforeEach(() => {
  mkdirSync(join(process.cwd(), ".local"), { recursive: true });
  directory = mkdtempSync(join(process.cwd(), ".local/dontghostme-import-"));
  stagingRoot = join(directory, "staging");
  databasePath = join(directory, "test.sqlite");
  database = openDatabase();
  persistSyntheticBatch(database, normalizeSyntheticMessages(janeMessages));
});

afterEach(() => {
  if (database.sqlite.open) database.sqlite.close();
  rmSync(directory, { recursive: true, force: true });
});

async function prepareBytes(bytes: Buffer, name = "takeout-small.mbox") {
  const id = beginHistoricalImport(database, OWNER_ID, name, bytes.length);
  await uploadHistoricalImport(
    database,
    OWNER_ID,
    id,
    name,
    bytes.length,
    chunks(bytes),
    stagingRoot,
  );
  await previewHistoricalImport(database, OWNER_ID, id, stagingRoot);
  return { id, bytes };
}

async function prepareImport() {
  return prepareBytes(await readFile("src/test/fixtures/takeout-small.mbox"));
}

describe("historical import coordination", () => {
  it("imports a valid synthetic MBOX and deletes staged bytes after completion", async () => {
    const { id } = await prepareImport();
    expect(
      database.sqlite.prepare("select count(*) as count from normalized_messages").get(),
    ).toEqual({ count: 0 });
    const completed = await processHistoricalImportBatch(database, OWNER_ID, id, stagingRoot);

    expect(completed).toMatchObject({
      status: "completed",
      discovered: 2,
      parsed: 2,
      skipped: 0,
      duplicated: 0,
      failed: 0,
      imported: 2,
      stagedSourceDeleted: true,
    });
    expect(
      database.sqlite.prepare("select count(*) as count from normalized_messages").get(),
    ).toEqual({ count: 2 });
    expect(() =>
      database.sqlite.prepare("select safe_text from normalized_messages").all(),
    ).not.toThrow();
    const exported = createRepository(database).exportData(OWNER_ID, "2025-01-10T00:00:00.000Z");
    expect(exported.historicalImports).toHaveLength(1);
    expect(exported.importCheckpoints).toHaveLength(1);
    expect(exported.importSourceMessages).toHaveLength(2);
    expect(exported.normalizedMessages).toHaveLength(2);
    expect(exported.attachmentInventory).toHaveLength(0);
    expect(exported.importErrors).toHaveLength(0);
    expect(JSON.stringify(exported)).not.toContain(stagingRoot);
    await expect(readFile(getStagedSourcePath(id, stagingRoot))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("pauses at an exact checkpoint, survives interruption, and resumes idempotently", async () => {
    const { id } = await prepareImport();
    const oneMessage = limit({ batchMessages: 1 });
    const partial = await processHistoricalImportBatch(
      database,
      OWNER_ID,
      id,
      stagingRoot,
      oneMessage,
    );
    expect(partial).toMatchObject({ status: "processing", imported: 1 });
    const checkpoint = getImportCheckpoint(database, OWNER_ID, id);
    expect(checkpoint).toMatchObject({ messageOrdinal: 1, imported: 1 });

    const paused = pauseHistoricalImport(database, OWNER_ID, id);
    expect(paused.status).toBe("paused_user");
    database.sqlite.close();
    database = openDatabase();

    const completed = await processHistoricalImportBatch(
      database,
      OWNER_ID,
      id,
      stagingRoot,
      oneMessage,
    );
    expect(completed).toMatchObject({ status: "completed", imported: 2 });
    expect(
      database.sqlite.prepare("select count(*) as count from normalized_messages").get(),
    ).toEqual({ count: 2 });
  });

  it("honors batch time and exact byte checkpoints without partial writes", async () => {
    const { id } = await prepareImport();
    const initial = await processHistoricalImportBatch(
      database,
      OWNER_ID,
      id,
      stagingRoot,
      limit({ batchMilliseconds: 0 }),
    );
    expect(initial).toMatchObject({ status: "processing", imported: 0 });
    expect(getImportCheckpoint(database, OWNER_ID, id).committedByteOffset).toBe(0);

    const framed = [];
    for await (const frame of frameMbox(getStagedSourcePath(id, stagingRoot))) framed.push(frame);
    const firstMessageBytes = framed[0]?.byteLength ?? 0;
    const bounded = await processHistoricalImportBatch(
      database,
      OWNER_ID,
      id,
      stagingRoot,
      limit({ batchBytes: firstMessageBytes }),
    );
    expect(bounded).toMatchObject({ status: "processing", imported: 1 });
    expect(getImportCheckpoint(database, OWNER_ID, id).committedByteOffset).toBe(
      framed[0]?.nextOffset,
    );
  });

  it("allows only one processing batch per import", async () => {
    const { id } = await prepareImport();
    const first = processHistoricalImportBatch(
      database,
      OWNER_ID,
      id,
      stagingRoot,
      limit({ batchMessages: 1 }),
    );
    await expect(
      processHistoricalImportBatch(database, OWNER_ID, id, stagingRoot),
    ).rejects.toMatchObject({ code: "database_busy", recoverable: true });
    await expect(first).resolves.toMatchObject({ status: "processing", imported: 1 });
  });

  it("reuses the completed fingerprint instead of duplicating messages", async () => {
    const { id, bytes } = await prepareImport();
    await processHistoricalImportBatch(database, OWNER_ID, id, stagingRoot);

    const repeatId = beginHistoricalImport(database, OWNER_ID, "takeout-small.mbox", bytes.length);
    const repeated = await uploadHistoricalImport(
      database,
      OWNER_ID,
      repeatId,
      "takeout-small.mbox",
      bytes.length,
      chunks(bytes, 13),
      stagingRoot,
    );

    expect(repeated.id).toBe(id);
    expect(
      database.sqlite.prepare("select count(*) as count from historical_imports").get(),
    ).toEqual({ count: 1 });
    expect(
      database.sqlite.prepare("select count(*) as count from normalized_messages").get(),
    ).toEqual({ count: 2 });
  });

  it("deduplicates exact content and quarantines same-ID conflicts", async () => {
    const delimiter = "From sender@example.test Mon Jan  6 10:00:00 2025\n";
    const original =
      "From: sender@example.test\nTo: owner@example.test\nMessage-ID: <same@example.test>\nSubject: Same\n\nBody\n";
    const conflict =
      "From: sender@example.test\nTo: owner@example.test\nMessage-ID: <same@example.test>\nSubject: Changed\n\nDifferent\n";
    const missingId = "From: sender@example.test\nTo: owner@example.test\nSubject: No ID\n\nBody\n";
    const bytes = Buffer.from(
      delimiter +
        original +
        delimiter +
        original +
        delimiter +
        conflict +
        delimiter +
        missingId +
        delimiter +
        missingId,
    );
    const { id } = await prepareBytes(bytes, "duplicates.mbox");

    const completed = await processHistoricalImportBatch(database, OWNER_ID, id, stagingRoot);

    expect(completed).toMatchObject({
      status: "completed",
      discovered: 5,
      parsed: 5,
      duplicated: 2,
      failed: 1,
      imported: 2,
    });
    expect(
      database.sqlite.prepare("select count(*) as count from normalized_messages").get(),
    ).toEqual({ count: 2 });
    expect(
      database.sqlite
        .prepare(
          "select parse_status, error_code from import_source_messages where parse_status = 'conflict'",
        )
        .get(),
    ).toEqual({ parse_status: "conflict", error_code: "message_id_conflict" });
  }, 30_000);

  it("preserves conflicting recruiter identities for later review", async () => {
    const bytes = Buffer.from(
      [
        "From first@example.test Mon Jan  6 10:00:00 2025",
        "From: Jane Rivera <first@agency-one.example>",
        "To: owner@example.test",
        "Message-ID: <identity-1@example.test>",
        "",
        "First identity",
        "From second@example.test Tue Jan  7 10:00:00 2025",
        "From: Jane Rivera <second@agency-two.example>",
        "To: owner@example.test",
        "Message-ID: <identity-2@example.test>",
        "",
        "Second identity",
      ].join("\n"),
    );
    const { id } = await prepareBytes(bytes, "identity-conflict.mbox");
    await processHistoricalImportBatch(database, OWNER_ID, id, stagingRoot);

    const senders = database.sqlite
      .prepare("select sender_json from normalized_messages order by sender_json")
      .all() as Array<{ sender_json: string }>;
    expect(senders.map(({ sender_json }) => JSON.parse(sender_json))).toEqual([
      [{ name: "Jane Rivera", address: "first@agency-one.example" }],
      [{ name: "Jane Rivera", address: "second@agency-two.example" }],
    ]);
  });
  it("stores bounded attachment metadata and hashes without attachment content", async () => {
    const bytes = Buffer.from(
      [
        "From sender@example.test Mon Jan  6 10:00:00 2025",
        "From: sender@example.test",
        "To: owner@example.test",
        "Content-Type: multipart/mixed; boundary=a",
        "",
        "--a",
        "Content-Type: application/octet-stream",
        "Content-Disposition: attachment; filename=../../resume.bin",
        "Content-Transfer-Encoding: base64",
        "",
        Buffer.from("12345").toString("base64"),
        "--a--",
        "",
      ].join("\n"),
    );
    const { id } = await prepareBytes(bytes, "attachment.mbox");
    await processHistoricalImportBatch(database, OWNER_ID, id, stagingRoot);

    expect(
      database.sqlite
        .prepare(
          "select filename_display, decoded_size_bytes, length(content_sha256) as hash_length from attachment_inventory",
        )
        .get(),
    ).toEqual({ filename_display: "resume.bin", decoded_size_bytes: 5, hash_length: 64 });
    const columns = database.sqlite
      .prepare("pragma table_info(attachment_inventory)")
      .all() as Array<{
      name: string;
    }>;
    expect(columns.map(({ name }) => name)).not.toContain("content");
  });

  it("preserves user corrections during import and repeat processing", async () => {
    database.sqlite
      .prepare(
        `insert into review_decisions
          (id, owner_id, assertion_id, revision, decision, corrected_value_json, created_at)
         values (?, ?, ?, 1, 'corrected', ?, ?)`,
      )
      .run(
        "10000000-0000-4000-8000-000000000099",
        OWNER_ID,
        PROPOSED_AFFILIATION_ASSERTION_ID,
        JSON.stringify("Fictional Agency"),
        "2025-01-01T00:00:00.000Z",
      );
    const before = database.sqlite
      .prepare("select * from review_decisions where assertion_id = ? order by revision")
      .all(PROPOSED_AFFILIATION_ASSERTION_ID);
    const { id } = await prepareImport();
    await processHistoricalImportBatch(database, OWNER_ID, id, stagingRoot);
    await processHistoricalImportBatch(database, OWNER_ID, id, stagingRoot);

    const after = database.sqlite
      .prepare("select * from review_decisions where assertion_id = ? order by revision")
      .all(PROPOSED_AFFILIATION_ASSERTION_ID);
    expect(after).toEqual(before);
  });

  it("deletes every new owner-data collection in foreign-key-safe order", async () => {
    const { id } = await prepareImport();
    await processHistoricalImportBatch(database, OWNER_ID, id, stagingRoot);

    deleteOwnerData(database, OWNER_ID);

    expect(database.sqlite.prepare("select count(*) as count from owners").get()).toEqual({
      count: 0,
    });
    expect(database.sqlite.pragma("foreign_key_check")).toEqual([]);
  });

  it("cleans expired staged sources and records only a redacted code", async () => {
    const { id } = await prepareImport();
    database.sqlite
      .prepare("update historical_imports set staged_expires_at = ? where id = ?")
      .run("2020-01-01T00:00:00.000Z", id);

    await cleanupExpiredImports(
      database,
      OWNER_ID,
      new Date("2025-01-01T00:00:00.000Z"),
      stagingRoot,
    );

    const row = database.sqlite
      .prepare(
        "select status, last_error_code, staged_source_deleted from historical_imports where id = ?",
      )
      .get(id);
    expect(row).toEqual({
      status: "failed",
      last_error_code: "source_expired",
      staged_source_deleted: 1,
    });
    const serialized = JSON.stringify(
      database.sqlite.prepare("select * from import_errors where historical_import_id = ?").all(id),
    );
    expect(serialized).not.toMatch(/Jane|Senior Platform|candidate@|agency@/i);
  });
});
