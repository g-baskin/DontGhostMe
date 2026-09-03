import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
const apply = (database: Database.Database, path: string) =>
  database.exec(readFileSync(path, "utf8").replaceAll("--> statement-breakpoint", ""));

const createOwnerRecruiterOrgOpportunity = (database: Database.Database) => {
  database
    .prepare("insert into owners (id, display_name, created_at) values (?, ?, ?)")
    .run("owner", "Owner", "2026-01-01T00:00:00.000Z");
  database
    .prepare(
      "insert into recruiters (id, owner_id, canonical_name, created_at) values (?, ?, ?, ?)",
    )
    .run("recruiter", "owner", "Recruiter", "2026-01-01T00:00:00.000Z");
  database
    .prepare(
      "insert into organizations (id, owner_id, display_name, normalized_name, created_at) values (?, ?, ?, ?, ?)",
    )
    .run("staffing", "owner", "Staffing", "staffing", "2026-01-01T00:00:00.000Z");
  database
    .prepare(
      "insert into opportunities (id, owner_id, recruiter_id, staffing_organization_id, title, source_key, introduced_at, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      "opportunity",
      "owner",
      "recruiter",
      "staffing",
      "Engineer",
      "source",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    );
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("M3 relationship status migration", () => {
  it("migrates populated M2 data, widens outcomes, and keeps foreign keys clean", () => {
    const root = mkdtempSync(join(tmpdir(), "dontghostme-m3-migration-"));
    roots.push(root);
    const database = new Database(join(root, "m2-copy.sqlite"));
    database.pragma("foreign_keys = ON");
    apply(database, "drizzle/0000_m0.sql");
    apply(database, "drizzle/0001_safe_historical_import.sql");
    apply(database, "drizzle/0002_recruiter_discovery.sql");
    createOwnerRecruiterOrgOpportunity(database);

    apply(database, "drizzle/0003_m3_relationship_status.sql");

    // Existing rows survive with the default outcome.
    expect(database.prepare("select outcome_state from opportunities").get()).toEqual({
      outcome_state: "unknown",
    });
    // Widened vocabulary accepted; invalid values rejected.
    for (const state of ["rejected", "offer", "candidate_withdrew", "closed_without_outcome"]) {
      expect(() =>
        database
          .prepare("update opportunities set outcome_state = ? where id = ?")
          .run(state, "opportunity"),
      ).not.toThrow();
    }
    expect(() =>
      database
        .prepare("update opportunities set outcome_state = 'definitely_hired' where id = ?")
        .run("opportunity"),
    ).toThrow();

    // New tables exist and enforce their constraints.
    const tables = new Set(
      (
        database.prepare("select name from sqlite_master where type = 'table'").all() as Array<{
          name: string;
        }>
      ).map(({ name }) => name),
    );
    for (const table of [
      "recruiter_relationship_statuses",
      "identity_exclusions",
      "recruiter_deletions",
    ])
      expect(tables.has(table)).toBe(true);

    expect(() =>
      database
        .prepare(
          "insert into recruiter_relationship_statuses (id, owner_id, recruiter_id, status, updated_at) values (?, ?, ?, ?, ?)",
        )
        .run("status-1", "owner", "recruiter", "dormant", "2026-01-02T00:00:00.000Z"),
    ).not.toThrow();
    expect(() =>
      database
        .prepare(
          "insert into recruiter_relationship_statuses (id, owner_id, recruiter_id, status, updated_at) values (?, ?, ?, ?, ?)",
        )
        .run("status-2", "owner", "recruiter", "ghosted", "2026-01-02T00:00:00.000Z"),
    ).toThrow();

    // Identity exclusions: exactly one of identity/domain, unique per owner.
    expect(() =>
      database
        .prepare(
          "insert into identity_exclusions (id, owner_id, domain, excluded_at) values (?, ?, ?, ?)",
        )
        .run("excl-1", "owner", "example.com", "2026-01-02T00:00:00.000Z"),
    ).not.toThrow();
    expect(() =>
      database
        .prepare(
          "insert into identity_exclusions (id, owner_id, domain, excluded_at) values (?, ?, ?, ?)",
        )
        .run("excl-duplicate", "owner", "example.com", "2026-01-03T00:00:00.000Z"),
    ).toThrow();
    expect(() =>
      database
        .prepare(
          "insert into identity_exclusions (id, owner_id, identity_id, domain, excluded_at) values (?, ?, ?, ?, ?)",
        )
        .run("excl-2", "owner", null, null, "2026-01-02T00:00:00.000Z"),
    ).toThrow();

    expect(database.pragma("foreign_key_check")).toEqual([]);
    database.close();
  });
});
