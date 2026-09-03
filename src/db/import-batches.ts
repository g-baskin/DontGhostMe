import type { NormalizedFixture } from "@/ingestion/synthetic-normalizer";
import type { AppDatabase } from "./client";
import {
  communicationEvents,
  conversationOpportunities,
  conversations,
  evidenceAssertions,
  importBatches,
  opportunities,
  organizations,
  owners,
  recruiterAffiliations,
  recruiterIdentities,
  recruiters,
  sourceReferences,
  submissions,
} from "./schema";

const RETRY_DELAYS_MS = [25, 50, 100, 200, 400] as const;

function sleep(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function isBusy(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "SQLITE_BUSY";
}

function insertFixture({ db }: AppDatabase, fixture: NormalizedFixture): void {
  db.insert(owners).values(fixture.owner).onConflictDoNothing().run();
  db.insert(recruiters).values(fixture.recruiter).onConflictDoNothing().run();
  db.insert(recruiterIdentities).values(fixture.identities).onConflictDoNothing().run();
  db.insert(organizations).values(fixture.organizations).onConflictDoNothing().run();
  db.insert(recruiterAffiliations)
    .values(fixture.affiliations.map(({ assertionId: _, ...affiliation }) => affiliation))
    .onConflictDoNothing()
    .run();
  db.insert(opportunities).values(fixture.opportunities).onConflictDoNothing().run();
  db.insert(submissions).values(fixture.submissions).onConflictDoNothing().run();
  db.insert(conversations).values(fixture.conversations).onConflictDoNothing().run();
  db.insert(conversationOpportunities)
    .values(fixture.conversationOpportunities)
    .onConflictDoNothing()
    .run();
  db.insert(sourceReferences).values(fixture.sources).onConflictDoNothing().run();
  db.insert(communicationEvents).values(fixture.events).onConflictDoNothing().run();
  db.insert(evidenceAssertions)
    .values(
      fixture.assertions.map(({ sourceIndex: _, canonicalValue: __, ...assertion }) => assertion),
    )
    .onConflictDoNothing()
    .run();
  db.insert(importBatches).values(fixture.batch).onConflictDoNothing().run();
}

export function persistSyntheticBatch(database: AppDatabase, fixture: NormalizedFixture): void {
  if (fixture.sources.length > 100)
    throw new Error("Import batches may contain at most 100 sources");

  for (let attempt = 0; ; attempt += 1) {
    try {
      database.sqlite.exec("BEGIN IMMEDIATE");
      insertFixture(database, fixture);
      database.sqlite.exec("COMMIT");
      return;
    } catch (error) {
      if (database.sqlite.inTransaction) database.sqlite.exec("ROLLBACK");
      if (!isBusy(error) || attempt >= RETRY_DELAYS_MS.length) throw error;
      sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}
