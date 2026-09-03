import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { resolveDatabasePath } from "@/db/client";
import { isVersionAtLeast, verifyWritableConnection } from "@/db/startup";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("SQLite startup", () => {
  it("enforces and reads back the writable connection contract", () => {
    const directory = mkdtempSync(join(tmpdir(), "dontghostme-startup-"));
    directories.push(directory);
    const sqlite = new Database(join(directory, "test.sqlite"));
    try {
      expect(verifyWritableConnection(sqlite)).toMatchObject({
        foreignKeys: 1,
        journalMode: "wal",
        busyTimeout: 5000,
        synchronous: 2,
        fts5: true,
      });
    } finally {
      sqlite.close();
    }
  });

  it("compares semantic SQLite versions", () => {
    expect(isVersionAtLeast("3.51.3", "3.51.3")).toBe(true);
    expect(isVersionAtLeast("3.52.0", "3.51.3")).toBe(true);
    expect(isVersionAtLeast("3.50.9", "3.51.3")).toBe(false);
    expect(isVersionAtLeast("4.0.0", "3.51.3")).toBe(true);
  });

  it("keeps database paths inside the project and rejects network-style paths", () => {
    expect(resolveDatabasePath(".local/test.sqlite")).toBe(
      resolve(process.cwd(), ".local/test.sqlite"),
    );
    expect(() => resolveDatabasePath("../outside.sqlite")).toThrow(
      "DATABASE_PATH must stay within the project directory",
    );
    expect(() => resolveDatabasePath("/tmp/outside.sqlite")).toThrow(
      "DATABASE_PATH must stay within the project directory",
    );
    expect(() => resolveDatabasePath("//server/share.sqlite")).toThrow(
      "DATABASE_PATH must be a local filesystem path",
    );
    expect(() => resolveDatabasePath("\\\\server\\share.sqlite")).toThrow(
      "DATABASE_PATH must be a local filesystem path",
    );
    expect(() => resolveDatabasePath("FILE:data.sqlite")).toThrow(
      "DATABASE_PATH must be a local filesystem path",
    );
  });
});
