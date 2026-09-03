import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AppDatabase, createDatabaseConnection } from "@/db/client";
import { persistSyntheticBatch } from "@/db/import-batches";
import { createRepository } from "@/db/repositories";
import { ReviewConflictError } from "@/domain/reviews";
import { normalizeSyntheticMessages } from "@/ingestion/synthetic-normalizer";
import {
  janeMessages,
  PROPOSED_AFFILIATION_ASSERTION_ID,
  SYNTHETIC_OWNER_ID,
} from "@/test/fixtures/jane-conversation";

let directory: string;
let database: AppDatabase;

beforeEach(() => {
  directory = mkdtempSync(join(process.cwd(), ".local/dontghostme-repository-"));
  database = createDatabaseConnection(join(directory, "test.sqlite"));
  migrate(database.db, { migrationsFolder: "drizzle" });
  persistSyntheticBatch(database, normalizeSyntheticMessages(janeMessages));
});

afterEach(() => {
  database.sqlite.close();
  rmSync(directory, { recursive: true, force: true });
});

describe("SQLite repository", () => {
  it("replays the fixture idempotently and derives expected records", () => {
    persistSyntheticBatch(database, normalizeSyntheticMessages(janeMessages));
    const repository = createRepository(database);
    const jane = repository.getHome(SYNTHETIC_OWNER_ID);

    expect(jane.identities).toHaveLength(2);
    expect(jane.opportunities).toHaveLength(2);
    expect(jane.metrics).toMatchObject({
      recruiterMessages: 6,
      candidateReplies: 3,
      inferredFollowUps: 1,
      explicitSubmissions: 1,
      unknownOutcomes: 1,
    });
    expect(
      database.sqlite.prepare("select count(*) as count from communication_events").get(),
    ).toEqual({ count: 9 });
  });

  it("rejects a proposed affiliation without deleting evidence", () => {
    const repository = createRepository(database);
    repository.decide(SYNTHETIC_OWNER_ID, PROPOSED_AFFILIATION_ASSERTION_ID, 0, "rejected");

    expect(repository.getHome(SYNTHETIC_OWNER_ID).currentAffiliation).toBe("Old Agency");
    expect(repository.listReviewItems(SYNTHETIC_OWNER_ID)[0]).toMatchObject({
      state: "rejected",
      revision: 1,
    });
    expect(
      database.sqlite.prepare("select count(*) as count from source_references").get(),
    ).toEqual({ count: 9 });
    expect(
      database.sqlite.prepare("select count(*) as count from evidence_assertions").get(),
    ).toEqual({ count: 5 });
  });

  it("confirms a proposed affiliation and rejects stale revisions", () => {
    const repository = createRepository(database);
    repository.decide(SYNTHETIC_OWNER_ID, PROPOSED_AFFILIATION_ASSERTION_ID, 0, "confirmed");

    expect(repository.getHome(SYNTHETIC_OWNER_ID).currentAffiliation).toBe("New Agency");
    expect(() =>
      repository.decide(SYNTHETIC_OWNER_ID, PROPOSED_AFFILIATION_ASSERTION_ID, 0, "rejected"),
    ).toThrow(ReviewConflictError);
    expect(database.sqlite.prepare("select count(*) as count from review_decisions").get()).toEqual(
      { count: 1 },
    );
  });

  it("exports normalized data without an absolute database path", () => {
    const exported = createRepository(database).exportData(
      SYNTHETIC_OWNER_ID,
      "2026-09-02T00:00:00.000Z",
    );
    expect(exported.recruiterIdentities).toHaveLength(2);
    expect(exported.recruiterAffiliations).toHaveLength(2);
    expect(exported.submissions).toHaveLength(1);
    expect(exported.conversationOpportunities).toHaveLength(2);
    expect(exported.communications).toHaveLength(9);
    expect(exported.sourceReferences).toHaveLength(9);
    expect(exported.evidence).toHaveLength(5);
    expect(exported.importBatches).toHaveLength(1);
    expect(JSON.stringify(exported)).not.toContain(directory);
  });
});
