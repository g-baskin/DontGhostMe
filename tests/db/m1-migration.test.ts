import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];

function apply(database: Database.Database, path: string) {
  database.exec(readFileSync(path, "utf8").replaceAll("--> statement-breakpoint", ""));
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("M1 additive migration", () => {
  it("migrates a populated M0 database without changing M0 rows", () => {
    const root = mkdtempSync(join(tmpdir(), "dontghostme-m1-migration-"));
    roots.push(root);
    const database = new Database(join(root, "m0-copy.sqlite"));
    database.pragma("foreign_keys = ON");
    apply(database, "drizzle/0000_m0.sql");
    database
      .prepare("insert into owners (id, display_name, created_at) values (?, ?, ?)")
      .run("owner-m0", "M0 Owner", "2025-01-01T00:00:00.000Z");

    apply(database, "drizzle/0001_safe_historical_import.sql");

    expect(database.prepare("select count(*) as count from owners").get()).toEqual({ count: 1 });
    const tables = new Set(
      (
        database.prepare("select name from sqlite_master where type = 'table'").all() as Array<{
          name: string;
        }>
      ).map(({ name }) => name),
    );
    for (const table of [
      "historical_imports",
      "import_checkpoints",
      "import_source_messages",
      "normalized_messages",
      "attachment_inventory",
      "import_errors",
    ]) {
      expect(tables.has(table)).toBe(true);
    }
    expect(database.pragma("foreign_key_check")).toEqual([]);
    database.close();
  });
});
