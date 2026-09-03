import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  correctManualValue,
  createManualEntity,
  retractManualValue,
} from "@/application/manual-corrections";
import { type AppDatabase, createDatabaseConnection } from "@/db/client";
import { deleteOwnerData } from "@/db/owner-data";
import { createRepository } from "@/db/repositories";
import { ManualAssertionError } from "@/domain/manual-assertions";

let directory: string;
let database: AppDatabase;
const ownerId = "manual-owner";

beforeEach(() => {
  mkdirSync(join(process.cwd(), ".local"), { recursive: true });
  directory = mkdtempSync(join(process.cwd(), ".local/manual-"));
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

describe("manual assertions", () => {
  it("creates, corrects, preserves history, and retracts to the machine value", () => {
    const created = createManualEntity(
      database,
      ownerId,
      { kind: "recruiter", name: "Jane", email: "JANE@example.com" },
      "2026-09-03T00:00:00.000Z",
    );
    const assertion = correctManualValue(
      database,
      ownerId,
      created.id,
      { entityKind: "recruiter", fieldName: "canonical_name", value: "Jane Smith" },
      1,
      "2026-09-03T01:00:00.000Z",
    );
    const repository = createRepository(database);
    expect(repository.getRecruiter(ownerId, created.id)?.canonicalName).toBe("Jane Smith");
    expect(() =>
      correctManualValue(
        database,
        ownerId,
        created.id,
        { entityKind: "recruiter", fieldName: "canonical_name", value: "Stale" },
        1,
      ),
    ).toThrowError(ManualAssertionError);
    retractManualValue(database, ownerId, assertion.id, 2, "2026-09-03T02:00:00.000Z");
    expect(repository.getRecruiter(ownerId, created.id)?.canonicalName).toBe("Jane");
    expect(
      database.sqlite
        .prepare("select count(*) as count from manual_assertions where owner_id = ?")
        .get(ownerId),
    ).toEqual({ count: 3 });
  });

  it("rejects cross-owner correction and exports/deletes manual history", () => {
    const created = createManualEntity(database, ownerId, { kind: "organization", name: "Agency" });
    database.sqlite
      .prepare("insert into owners (id, display_name, created_at) values (?, ?, ?)")
      .run("other", "Other", "2026-09-03T00:00:00.000Z");
    expect(() =>
      correctManualValue(
        database,
        "other",
        created.id,
        { entityKind: "organization", fieldName: "display_name", value: "Nope" },
        0,
      ),
    ).toThrowError("not_found");
    const exported = createRepository(database).exportData(ownerId, "2026-09-03T03:00:00.000Z");
    expect(exported.formatVersion).toBe(3);
    expect(exported.manualAssertions).toHaveLength(1);
    deleteOwnerData(database, ownerId);
    expect(
      database.sqlite.prepare("select count(*) as count from manual_assertions").get(),
    ).toEqual({ count: 0 });
    expect(database.sqlite.pragma("foreign_key_check")).toEqual([]);
  });
});
