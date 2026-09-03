import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { verifyWritableConnection } from "./startup";

export type AppDatabase = ReturnType<typeof createDatabaseConnection>;

export function resolveDatabasePath(configuredPath = process.env.DATABASE_PATH): string {
  const value = configuredPath?.trim() || ".local/dontghostme.sqlite";
  if (
    value === ":memory:" ||
    /^file:/i.test(value) ||
    value.startsWith("//") ||
    value.startsWith("\\\\")
  ) {
    throw new Error("DATABASE_PATH must be a local filesystem path");
  }

  const projectRoot = resolve(/* turbopackIgnore: true */ process.cwd());
  const databasePath = isAbsolute(value)
    ? resolve(/* turbopackIgnore: true */ value)
    : resolve(/* turbopackIgnore: true */ projectRoot, value);
  const projectRelativePath = relative(projectRoot, databasePath);
  if (
    projectRelativePath === "" ||
    projectRelativePath === ".." ||
    projectRelativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(projectRelativePath)
  ) {
    throw new Error("DATABASE_PATH must stay within the project directory");
  }
  return databasePath;
}

export function createDatabaseConnection(configuredPath?: string) {
  const path = resolveDatabasePath(configuredPath);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const sqlite = new Database(path);
  try {
    const startup = verifyWritableConnection(sqlite);
    return { path, sqlite, db: drizzle(sqlite, { schema }), startup };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}
