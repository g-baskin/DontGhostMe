import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { createDatabaseConnection } from "@/db/client";

const verifiedTables = [
  "owners",
  "recruiters",
  "opportunities",
  "communication_events",
  "historical_imports",
  "import_checkpoints",
  "import_source_messages",
  "normalized_messages",
  "attachment_inventory",
  "import_errors",
  "owner_email_identities",
  "classification_runs",
  "classification_proposals",
  "classification_evidence",
  "classification_decisions",
] as const;

async function main() {
  const source = createDatabaseConnection();
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const destination = resolve(process.cwd(), "backups", `dontghostme-${stamp}.sqlite`);
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });

  try {
    await source.sqlite.backup(destination);
    const copy = new Database(destination, { readonly: true, fileMustExist: true });
    try {
      const integrity = copy.pragma("integrity_check", { simple: true });
      const foreignKeyIssues = copy.pragma("foreign_key_check") as unknown[];
      const availableTables = new Set(
        (
          copy.prepare("select name from sqlite_master where type = 'table'").all() as Array<{
            name: string;
          }>
        ).map(({ name }) => name),
      );
      const missingTables = verifiedTables.filter((table) => !availableTables.has(table));
      const counts = verifiedTables.map((table) => ({
        table,
        count: (copy.prepare(`select count(*) as count from ${table}`).get() as { count: number })
          .count,
      }));
      if (missingTables.length > 0)
        throw new Error(`Backup is missing required tables: ${missingTables.join(", ")}`);
      if (integrity !== "ok") throw new Error(`Backup integrity check failed: ${integrity}`);
      if (foreignKeyIssues.length > 0) throw new Error("Backup foreign key check failed");
      console.log(JSON.stringify({ destination, integrity, foreignKeyIssues: 0, counts }, null, 2));
    } finally {
      copy.close();
    }
  } finally {
    source.sqlite.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
