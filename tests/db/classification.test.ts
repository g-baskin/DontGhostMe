import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addOwnerEmailIdentity,
  ClassificationInputError,
  ClassificationNotFoundError,
  deleteOwnerEmailIdentity,
  listClassificationProposals,
  listOwnerEmailIdentities,
  processClassificationBatch,
  resumeClassificationRun,
  startClassificationRun,
} from "@/db/classification";
import {
  ClassificationDecisionConflict,
  decideClassificationProposal,
} from "@/db/classification-decisions";
import { type AppDatabase, createDatabaseConnection } from "@/db/client";
import { deleteOwnerData } from "@/db/owner-data";
import { createRepository } from "@/db/repositories";

const OWNER = "owner-m2";
const OTHER_OWNER = "owner-other";
let root: string;
let databasePath: string;
let database: AppDatabase;

beforeEach(() => {
  mkdirSync(join(process.cwd(), ".local"), { recursive: true });
  root = mkdtempSync(join(process.cwd(), ".local/dontghostme-classification-"));
  databasePath = join(root, "test.sqlite");
  database = openDatabase();
  seedOwner(OWNER);
  seedOwner(OTHER_OWNER);
});

afterEach(() => {
  if (database.sqlite.open) database.sqlite.close();
  rmSync(root, { recursive: true, force: true });
});

function openDatabase() {
  const connection = createDatabaseConnection(databasePath);
  migrate(connection.db, { migrationsFolder: "drizzle" });
  return connection;
}

function seedOwner(ownerId: string) {
  database.sqlite
    .prepare("insert into owners (id, display_name, created_at) values (?, ?, ?)")
    .run(ownerId, ownerId, "2026-01-01T00:00:00.000Z");
}

function seedMessage(
  id: string,
  ownerId = OWNER,
  body = "I am a Technical Recruiter at Agency Group. I have a Senior Engineer role at ExampleCo.",
) {
  const importId = `import-${ownerId}`;
  database.sqlite
    .prepare(
      `insert into historical_imports
        (id, owner_id, source_fingerprint, original_name_display, source_size_bytes,
         staged_source_deleted, status, discovered_count, parsed_count, skipped_count,
         duplicate_count, failed_count, imported_count, created_at, updated_at, completed_at)
       values (?, ?, ?, 'fixture.mbox', 1, 1, 'completed', 1, 1, 0, 0, 0, 1, ?, ?, ?)
       on conflict(id) do nothing`,
    )
    .run(
      importId,
      ownerId,
      `fingerprint-${ownerId}`,
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    );
  const sourceId = `source-${ownerId}-${id}`;
  const numericId = Number(id.replace(/\D/g, ""));
  const ordinal = numericId || (id.endsWith("two") ? 2 : 1);
  database.sqlite
    .prepare(
      `insert into import_source_messages
        (id, owner_id, historical_import_id, message_ordinal, byte_offset, byte_length, raw_sha256,
         canonical_sha256, normalized_message_id, parse_status, warning_codes_json, created_at)
       values (?, ?, ?, ?, ?, 1, ?, ?, ?, 'imported', '[]', ?)`,
    )
    .run(
      sourceId,
      ownerId,
      importId,
      ordinal,
      ordinal,
      id.padEnd(64, "a").slice(0, 64),
      id.padEnd(64, "b").slice(0, 64),
      `<${id}@fixture.example>`,
      "2026-01-01T00:00:00.000Z",
    );
  database.sqlite
    .prepare(
      `insert into normalized_messages
        (id, owner_id, source_message_id, normalized_message_id, references_json, sent_at,
         subject, sender_json, recipients_json, reply_to_json, safe_text, text_truncated,
         warning_codes_json, created_at)
       values (?, ?, ?, ?, '[]', ?, ?, ?, ?, '[]', ?, 0, '[]', ?)`,
    )
    .run(
      id,
      ownerId,
      sourceId,
      `<${id}@fixture.example>`,
      "2026-01-02T12:00:00.000Z",
      "Senior Engineer role at ExampleCo",
      JSON.stringify([{ address: "jane@agency.example", name: "Jane Recruiter" }]),
      JSON.stringify([{ address: "candidate@example.test", name: "Casey Candidate" }]),
      body,
      "2026-01-02T12:00:00.000Z",
    );
}

function completeRun(ownerId = OWNER) {
  const started = startClassificationRun(database, ownerId);
  let run = started;
  while (run.status === "running") run = processClassificationBatch(database, ownerId, run.id);
  return run;
}

function stableProjection(ownerId = OWNER) {
  return listClassificationProposals(database, ownerId).map((proposal) => ({
    proposalKey: proposal.proposalKey,
    proposalType: proposal.proposalType,
    proposedValue: proposal.proposedValue,
    confidenceBasisPoints: proposal.confidenceBasisPoints,
    reviewRequirement: proposal.reviewRequirement,
    evidence: proposal.evidence.map(({ sourceLabel: _, sourceDate: __, ...item }) => item),
  }));
}

describe("classification persistence", () => {
  it("requires and owner-scopes confirmed aliases", () => {
    expect(() => startClassificationRun(database, OWNER)).toThrowError(ClassificationInputError);
    expect(() => addOwnerEmailIdentity(database, OWNER, "bad address")).toThrowError(
      ClassificationInputError,
    );
    const identity = addOwnerEmailIdentity(database, OWNER, "Candidate@Example.Test");
    expect(identity.normalizedEmail).toBe("candidate@example.test");
    expect(listOwnerEmailIdentities(database, OTHER_OWNER)).toEqual([]);
    expect(() => deleteOwnerEmailIdentity(database, OTHER_OWNER, identity.id)).toThrowError(
      ClassificationNotFoundError,
    );
  });

  it("persists deterministic proposals idempotently across resumed batches", () => {
    addOwnerEmailIdentity(database, OWNER, "candidate@example.test");
    for (let index = 1; index <= 101; index += 1)
      seedMessage(`m${index.toString().padStart(3, "0")}`);
    let run = startClassificationRun(database, OWNER);
    run = processClassificationBatch(database, OWNER, run.id);
    expect(run.processedCount).toBe(100);
    database.sqlite.close();
    database = openDatabase();
    run = processClassificationBatch(database, OWNER, run.id);
    expect(run.processedCount).toBe(101);
    run = processClassificationBatch(database, OWNER, run.id);
    expect(run.status).toBe("completed");
    const interruptedProjection = stableProjection();
    expect(startClassificationRun(database, OWNER).id).toBe(run.id);
    expect(listClassificationProposals(database, OWNER)).toHaveLength(interruptedProjection.length);

    database.sqlite.close();
    databasePath = join(root, "uninterrupted.sqlite");
    database = openDatabase();
    seedOwner(OWNER);
    addOwnerEmailIdentity(database, OWNER, "candidate@example.test");
    for (let index = 1; index <= 101; index += 1)
      seedMessage(`m${index.toString().padStart(3, "0")}`);
    completeRun();
    expect(stableProjection()).toEqual(interruptedProjection);
  });

  it("persists a redacted failure and resumes from the last checkpoint", () => {
    addOwnerEmailIdentity(database, OWNER, "candidate@example.test");
    seedMessage("message-failure");
    database.sqlite.exec(
      `create temp trigger force_classification_failure
       before insert on classification_proposals
       begin select raise(abort, 'forced classification failure'); end`,
    );
    const started = startClassificationRun(database, OWNER);
    expect(() => processClassificationBatch(database, OWNER, started.id)).toThrowError(
      "classification_failed",
    );
    expect(
      database.sqlite
        .prepare("select status, error_code, processed_count from classification_runs where id = ?")
        .get(started.id),
    ).toEqual({ status: "failed", error_code: "classification_failed", processed_count: 0 });
    database.sqlite.exec("drop trigger force_classification_failure");
    let resumed = resumeClassificationRun(database, OWNER, started.id);
    while (resumed.status === "running")
      resumed = processClassificationBatch(database, OWNER, resumed.id);
    expect(resumed.status).toBe("completed");
    expect(resumed.processedCount).toBe(1);
  });

  it("promotes acceptance transactionally and preserves append-only decisions", () => {
    addOwnerEmailIdentity(database, OWNER, "candidate@example.test");
    seedMessage("message-one");
    completeRun();
    const recruiter = listClassificationProposals(database, OWNER).find(
      ({ proposalType }) => proposalType === "recruiter_identity",
    );
    expect(recruiter).toBeDefined();
    if (!recruiter) throw new Error("Expected recruiter proposal");
    const result = decideClassificationProposal(database, OWNER, recruiter.id, {
      decision: "accepted",
      expectedRevision: 0,
    });
    expect(result.promotedEntityId).toBeTruthy();
    expect(
      database.sqlite
        .prepare("select count(*) as count from recruiters where owner_id = ?")
        .get(OWNER),
    ).toEqual({ count: 1 });
    expect(
      database.sqlite
        .prepare("select count(*) as count from evidence_assertions where owner_id = ?")
        .get(OWNER),
    ).toEqual({ count: 1 });
    expect(
      database.sqlite
        .prepare("select count(*) as count from review_decisions where owner_id = ?")
        .get(OWNER),
    ).toEqual({ count: 1 });
    expect(
      decideClassificationProposal(database, OWNER, recruiter.id, {
        decision: "accepted",
        expectedRevision: 0,
      }),
    ).toEqual(result);
    expect(() =>
      decideClassificationProposal(database, OWNER, recruiter.id, {
        decision: "merge",
        expectedRevision: 0,
      }),
    ).toThrowError(ClassificationDecisionConflict);
  });

  it("rolls back missing dependencies and promotes every canonical proposal type", () => {
    addOwnerEmailIdentity(database, OWNER, "candidate@example.test");
    seedMessage(
      "message-flow",
      OWNER,
      "I am a Technical Recruiter at Agency Group. I submitted your profile to ExampleCo today for the Senior Engineer role.",
    );
    completeRun();
    const byType = new Map(
      listClassificationProposals(database, OWNER).map((proposal) => [
        proposal.proposalType,
        proposal,
      ]),
    );
    const opportunity = byType.get("opportunity");
    if (!opportunity) throw new Error("Expected opportunity proposal");
    expect(() =>
      decideClassificationProposal(database, OWNER, opportunity.id, {
        decision: "accepted",
        expectedRevision: 0,
      }),
    ).toThrowError("classification_dependency_required");
    expect(
      database.sqlite
        .prepare("select count(*) as count from classification_decisions where proposal_id = ?")
        .get(opportunity.id),
    ).toEqual({ count: 0 });

    for (const type of [
      "recruiter_identity",
      "organization_affiliation",
      "opportunity",
      "conversation_group",
      "message_direction",
      "submission",
    ] as const) {
      const proposal = byType.get(type);
      if (!proposal) throw new Error(`Expected ${type} proposal`);
      decideClassificationProposal(database, OWNER, proposal.id, {
        decision: "accepted",
        expectedRevision: 0,
      });
    }
    expect(database.sqlite.prepare("select count(*) as count from recruiters").get()).toEqual({
      count: 1,
    });
    expect(
      database.sqlite.prepare("select count(*) as count from recruiter_affiliations").get(),
    ).toEqual({ count: 1 });
    expect(database.sqlite.prepare("select count(*) as count from opportunities").get()).toEqual({
      count: 1,
    });
    expect(database.sqlite.prepare("select count(*) as count from conversations").get()).toEqual({
      count: 1,
    });
    expect(
      database.sqlite.prepare("select count(*) as count from communication_events").get(),
    ).toEqual({ count: 1 });
    expect(database.sqlite.prepare("select count(*) as count from submissions").get()).toEqual({
      count: 1,
    });
  });

  it("promotes corrected recruiter values", () => {
    addOwnerEmailIdentity(database, OWNER, "candidate@example.test");
    seedMessage("message-correction");
    completeRun();
    const proposal = listClassificationProposals(database, OWNER).find(
      ({ proposalType }) => proposalType === "recruiter_identity",
    );
    if (!proposal || !("normalizedEmail" in proposal.proposedValue))
      throw new Error("Expected recruiter proposal");
    decideClassificationProposal(database, OWNER, proposal.id, {
      decision: "corrected",
      expectedRevision: 0,
      correctedValue: { ...proposal.proposedValue, name: "Corrected Recruiter" },
    });
    expect(database.sqlite.prepare("select canonical_name from recruiters").get()).toEqual({
      canonical_name: "Corrected Recruiter",
    });
    expect(database.sqlite.prepare("select decision from classification_decisions").get()).toEqual({
      decision: "corrected",
    });
  });

  it("merges explicit address continuity and can split it on a later reviewed proposal", () => {
    addOwnerEmailIdentity(database, OWNER, "candidate@example.test");
    seedMessage(
      "message-link",
      OWNER,
      "I am a Technical Recruiter at Agency Group. I previously used old@agency.example. I have a Senior Engineer role at ExampleCo.",
    );
    completeRun();
    const first = listClassificationProposals(database, OWNER);
    const recruiter = first.find(({ proposalType }) => proposalType === "recruiter_identity");
    const link = first.find(({ proposalType }) => proposalType === "identity_link");
    if (!recruiter || !link) throw new Error("Expected identity proposals");
    decideClassificationProposal(database, OWNER, recruiter.id, {
      decision: "accepted",
      expectedRevision: 0,
    });
    decideClassificationProposal(database, OWNER, link.id, {
      decision: "merge",
      expectedRevision: 0,
    });
    expect(
      database.sqlite
        .prepare("select count(distinct recruiter_id) as count from recruiter_identities")
        .get(),
    ).toEqual({ count: 1 });

    const rerun = startClassificationRun(database, OWNER, new Date(), {
      engineVersion: "m2-rules-v2-test",
      rulesetSha256: "c".repeat(64),
    });
    let current = rerun;
    while (current.status === "running")
      current = processClassificationBatch(database, OWNER, current.id);
    const split = listClassificationProposals(database, OWNER).find(
      (proposal) => proposal.runId === rerun.id && proposal.proposalType === "identity_link",
    );
    if (!split) throw new Error("Expected replacement identity proposal");
    decideClassificationProposal(database, OWNER, split.id, {
      decision: "split",
      expectedRevision: 0,
    });
    expect(
      database.sqlite
        .prepare("select count(distinct recruiter_id) as count from recruiter_identities")
        .get(),
    ).toEqual({ count: 2 });
    expect(
      database.sqlite.prepare("select count(*) as count from classification_decisions").get(),
    ).toEqual({ count: 3 });
  });

  it("rejects without creating canonical facts and preserves decisions after reprocessing", () => {
    addOwnerEmailIdentity(database, OWNER, "candidate@example.test");
    seedMessage("message-one");
    completeRun();
    const proposal = listClassificationProposals(database, OWNER).find(
      ({ proposalType }) => proposalType === "recruiter_identity",
    );
    if (!proposal) throw new Error("Expected recruiter proposal");
    decideClassificationProposal(database, OWNER, proposal.id, {
      decision: "rejected",
      expectedRevision: 0,
    });
    seedMessage("message-two");
    let rerun = startClassificationRun(database, OWNER, new Date(), {
      engineVersion: "m2-rules-v2-test",
      rulesetSha256: "d".repeat(64),
    });
    while (rerun.status === "running")
      rerun = processClassificationBatch(database, OWNER, rerun.id);
    expect(rerun.status).toBe("completed");
    expect(
      database.sqlite
        .prepare("select decision from classification_decisions where proposal_id = ?")
        .all(proposal.id),
    ).toEqual([{ decision: "rejected" }]);
    expect(
      database.sqlite
        .prepare("select count(*) as count from recruiters where owner_id = ?")
        .get(OWNER),
    ).toEqual({ count: 0 });
    const superseded = database.sqlite
      .prepare("select count(*) as count from classification_proposals where state = 'superseded'")
      .get() as { count: number };
    expect(superseded.count).toBeGreaterThan(0);
  });

  it("backs up and restores populated M2 rows with valid foreign keys", async () => {
    addOwnerEmailIdentity(database, OWNER, "candidate@example.test");
    seedMessage("message-backup");
    completeRun();
    const backupPath = join(root, "backup.sqlite");
    await database.sqlite.backup(backupPath);
    const restored = createDatabaseConnection(backupPath);
    expect(
      restored.sqlite.prepare("select count(*) as count from classification_proposals").get(),
    ).toEqual({ count: 5 });
    expect(restored.sqlite.pragma("foreign_key_check")).toEqual([]);
    restored.sqlite.close();
  });

  it("exports and deletes every M2 row without crossing owner scope", () => {
    addOwnerEmailIdentity(database, OWNER, "candidate@example.test");
    addOwnerEmailIdentity(database, OTHER_OWNER, "other@example.test");
    seedMessage("message-one");
    completeRun();
    const exported = createRepository(database).exportData(OWNER, "2026-02-01T00:00:00.000Z");
    expect(exported.ownerEmailIdentities).toHaveLength(1);
    expect(exported.classificationRuns).toHaveLength(1);
    expect(exported.classificationProposals.length).toBeGreaterThan(0);
    expect(JSON.stringify(exported)).not.toContain(root);
    deleteOwnerData(database, OWNER);
    expect(listOwnerEmailIdentities(database, OWNER)).toEqual([]);
    expect(listOwnerEmailIdentities(database, OTHER_OWNER)).toHaveLength(1);
    expect(database.sqlite.pragma("foreign_key_check")).toEqual([]);
  });
});
