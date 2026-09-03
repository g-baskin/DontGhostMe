import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
const apply = (database: Database.Database, path: string) =>
  database.exec(readFileSync(path, "utf8").replaceAll("--> statement-breakpoint", ""));

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("M2 additive migration", () => {
  it("migrates populated M1 data with unknown outcomes and valid foreign keys", () => {
    const root = mkdtempSync(join(tmpdir(), "dontghostme-m2-migration-"));
    roots.push(root);
    const database = new Database(join(root, "m1-copy.sqlite"));
    database.pragma("foreign_keys = ON");
    apply(database, "drizzle/0000_m0.sql");
    apply(database, "drizzle/0001_safe_historical_import.sql");
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

    apply(database, "drizzle/0002_recruiter_discovery.sql");

    expect(database.prepare("select outcome_state from opportunities").get()).toEqual({
      outcome_state: "unknown",
    });
    const tables = new Set(
      (
        database.prepare("select name from sqlite_master where type = 'table'").all() as Array<{
          name: string;
        }>
      ).map(({ name }) => name),
    );
    for (const table of [
      "owner_email_identities",
      "classification_runs",
      "classification_proposals",
      "classification_evidence",
      "classification_decisions",
    ])
      expect(tables.has(table)).toBe(true);
    expect(database.pragma("foreign_key_check")).toEqual([]);
    database.close();
  });
});
