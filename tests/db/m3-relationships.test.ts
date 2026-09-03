import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AppDatabase, createDatabaseConnection } from "@/db/client";
import { persistSyntheticBatch } from "@/db/import-batches";
import { createRepository } from "@/db/repositories";
import { normalizeSyntheticMessages } from "@/ingestion/synthetic-normalizer";
import {
  JANE_RECRUITER_ID,
  janeMessages,
  SYNTHETIC_OWNER_ID,
} from "@/test/fixtures/jane-conversation";

let directory: string;
let database: AppDatabase;

beforeEach(() => {
  mkdirSync(join(process.cwd(), ".local"), { recursive: true });
  directory = mkdtempSync(join(process.cwd(), ".local/dontghostme-m3-"));
  database = createDatabaseConnection(join(directory, "test.sqlite"));
  migrate(database.db, { migrationsFolder: "drizzle" });
  persistSyntheticBatch(database, normalizeSyntheticMessages(janeMessages));
});

afterEach(() => {
  database.sqlite.close();
  rmSync(directory, { recursive: true, force: true });
});

describe("M3 relationship repository", () => {
  it("searches, filters, and rejects malformed cursors", () => {
    const repository = createRepository(database);
    expect(
      repository.queryRecruiters(SYNTHETIC_OWNER_ID, { search: "old agency" }).items,
    ).toHaveLength(1);
    expect(repository.queryRecruiters(SYNTHETIC_OWNER_ID, { unresolved: true }).items).toHaveLength(
      1,
    );
    expect(() =>
      repository.queryRecruiters(SYNTHETIC_OWNER_ID, { cursor: "not-a-cursor" }),
    ).toThrow("Invalid pagination cursor");
  });

  it("keeps status while exclusion is reversed", () => {
    const repository = createRepository(database);
    repository.setRelationshipStatus(
      SYNTHETIC_OWNER_ID,
      JANE_RECRUITER_ID,
      "dormant",
      "2026-09-03T00:00:00.000Z",
    );
    repository.excludeRecruiter(SYNTHETIC_OWNER_ID, JANE_RECRUITER_ID, "2026-09-03T01:00:00.000Z");
    persistSyntheticBatch(database, normalizeSyntheticMessages(janeMessages));
    expect(repository.listRecruiters(SYNTHETIC_OWNER_ID)).toEqual([]);
    expect(
      repository.queryRecruiters(SYNTHETIC_OWNER_ID, { excluded: true }).items[0],
    ).toMatchObject({ relationshipStatus: "dormant", excluded: true });
    repository.restoreRecruiter(SYNTHETIC_OWNER_ID, JANE_RECRUITER_ID, "2026-09-03T02:00:00.000Z");
    expect(repository.listRecruiters(SYNTHETIC_OWNER_ID)[0]).toMatchObject({
      relationshipStatus: "dormant",
      excluded: false,
    });
  });

  it("exports excluded records explicitly instead of removing them", () => {
    const repository = createRepository(database);
    repository.excludeRecruiter(SYNTHETIC_OWNER_ID, JANE_RECRUITER_ID, "2026-09-03T00:00:00.000Z");
    const exported = repository.exportData(SYNTHETIC_OWNER_ID, "2026-09-03T01:00:00.000Z");
    expect(exported.recruiters).toHaveLength(1);
    expect(exported.recruiters[0]).toMatchObject({ id: JANE_RECRUITER_ID, excluded: true });
    expect(exported.relationshipStatuses).toHaveLength(1);
  });

  it("isolates writes by owner", () => {
    const repository = createRepository(database);
    expect(() =>
      repository.excludeRecruiter(
        "00000000-0000-4000-8000-000000000099",
        JANE_RECRUITER_ID,
        "2026-09-03T00:00:00.000Z",
      ),
    ).toThrow("Recruiter not found");
    expect(repository.getRecruiter(SYNTHETIC_OWNER_ID, JANE_RECRUITER_ID)?.excluded).toBe(false);
  });

  it("deletes only derived recruiter data and retains a non-PII audit", () => {
    const repository = createRepository(database);
    const sourceCount = database.sqlite
      .prepare("select count(*) as count from source_references where owner_id = ?")
      .get(SYNTHETIC_OWNER_ID);
    repository.deleteRecruiterData(
      SYNTHETIC_OWNER_ID,
      JANE_RECRUITER_ID,
      "2026-09-03T00:00:00.000Z",
    );
    expect(repository.getRecruiter(SYNTHETIC_OWNER_ID, JANE_RECRUITER_ID)).toBeNull();
    expect(
      database.sqlite
        .prepare("select count(*) as count from source_references where owner_id = ?")
        .get(SYNTHETIC_OWNER_ID),
    ).toEqual(sourceCount);
    const audit = database.sqlite
      .prepare("select * from recruiter_deletions where owner_id = ?")
      .get(SYNTHETIC_OWNER_ID) as Record<string, unknown>;
    expect(audit).toMatchObject({
      recruiter_id: JANE_RECRUITER_ID,
      scope: "recruiter_derived_data",
    });
    expect(JSON.stringify(audit).toLowerCase()).not.toContain("jane");
    expect(database.sqlite.prepare("pragma foreign_key_check").all()).toEqual([]);
  });
});
