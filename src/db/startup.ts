import type Database from "better-sqlite3";

export const MINIMUM_SQLITE_VERSION = "3.51.3";

export interface StartupVerification {
  sqliteVersion: string;
  foreignKeys: 1;
  journalMode: "wal";
  busyTimeout: 5000;
  synchronous: 2;
  fts5: true;
}

function versionParts(version: string): number[] {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid SQLite version: ${version}`);
  return version.split(".").map(Number);
}

export function isVersionAtLeast(actual: string, required: string): boolean {
  const actualParts = versionParts(actual);
  const requiredParts = versionParts(required);
  for (let index = 0; index < requiredParts.length; index += 1) {
    if (actualParts[index] !== requiredParts[index])
      return actualParts[index] > requiredParts[index];
  }
  return true;
}

export function verifyWritableConnection(sqlite: Database.Database): StartupVerification {
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = FULL");

  const foreignKeys = sqlite.pragma("foreign_keys", { simple: true });
  const journalMode = String(sqlite.pragma("journal_mode", { simple: true })).toLowerCase();
  const busyTimeout = sqlite.pragma("busy_timeout", { simple: true });
  const synchronous = sqlite.pragma("synchronous", { simple: true });
  const sqliteVersion = (
    sqlite.prepare("select sqlite_version() as version").get() as { version: string }
  ).version;

  if (foreignKeys !== 1) throw new Error("SQLite foreign keys are not enabled");
  if (journalMode !== "wal") throw new Error(`SQLite WAL is required; received ${journalMode}`);
  if (busyTimeout !== 5000)
    throw new Error(`SQLite busy timeout must be 5000ms; received ${busyTimeout}`);
  if (synchronous !== 2)
    throw new Error(`SQLite synchronous mode must be FULL; received ${synchronous}`);
  if (!isVersionAtLeast(sqliteVersion, MINIMUM_SQLITE_VERSION)) {
    throw new Error(`SQLite ${MINIMUM_SQLITE_VERSION}+ is required; received ${sqliteVersion}`);
  }

  sqlite.exec("create virtual table temp.__fts5_probe using fts5(value)");
  sqlite.exec("drop table temp.__fts5_probe");

  return {
    sqliteVersion,
    foreignKeys: 1,
    journalMode: "wal",
    busyTimeout: 5000,
    synchronous: 2,
    fts5: true,
  };
}
