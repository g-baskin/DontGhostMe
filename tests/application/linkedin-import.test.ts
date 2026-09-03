import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  beginHistoricalImport,
  previewHistoricalImport,
  processHistoricalImportBatch,
  uploadHistoricalImport,
} from "@/application/historical-imports";
import { type AppDatabase, createDatabaseConnection } from "@/db/client";

let directory: string;
let database: AppDatabase;
const ownerId = "linkedin-owner";

beforeEach(() => {
  mkdirSync(join(process.cwd(), ".local"), { recursive: true });
  directory = mkdtempSync(join(process.cwd(), ".local/linkedin-import-"));
  database = createDatabaseConnection(join(directory, "test.sqlite"));
  migrate(database.db, { migrationsFolder: "drizzle" });
  database.sqlite
    .prepare("insert into owners (id, display_name, created_at) values (?, ?, ?)")
    .run(ownerId, "Owner", "2026-09-03T00:00:00.000Z");
});

afterEach(() => {
  database.sqlite.close();
  rmSync(directory, { recursive: true, force: true });
});

describe("LinkedIn export lifecycle", () => {
  it("keeps preview pure, then writes review-only rows and proposals", async () => {
    const csv = Buffer.from(
      "Company Name,Job Title,Application Date\nExample Corp,Engineer,2026-09-01\n",
    );
    const id = beginHistoricalImport(
      database,
      ownerId,
      "Job Applications.csv",
      csv.length,
      "linkedin_export",
    );
    await uploadHistoricalImport(
      database,
      ownerId,
      id,
      "Job Applications.csv",
      csv.length,
      (async function* () {
        yield csv;
      })(),
      directory,
    );
    const preview = await previewHistoricalImport(database, ownerId, id, directory);
    expect(preview).toMatchObject({
      sourceKind: "linkedin_export",
      status: "preview_ready",
      discovered: 1,
    });
    expect(
      database.sqlite.prepare("select count(*) as count from import_source_records").get(),
    ).toEqual({ count: 0 });
    const completed = await processHistoricalImportBatch(database, ownerId, id, directory);
    expect(completed.status).toBe("completed");
    expect(
      database.sqlite
        .prepare("select proposal_type, review_requirement from classification_proposals")
        .all(),
    ).toEqual([{ proposal_type: "linkedin_export_row", review_requirement: "user_review" }]);
    expect(database.sqlite.prepare("select count(*) as count from recruiters").get()).toEqual({
      count: 0,
    });
    expect(database.sqlite.prepare("select count(*) as count from submissions").get()).toEqual({
      count: 0,
    });
  });
});
