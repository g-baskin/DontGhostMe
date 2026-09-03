import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { createDatabaseConnection } from "@/db/client";

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
      const counts = ["owners", "recruiters", "opportunities", "communication_events"].map(
        (table) => ({
          table,
          count: (copy.prepare(`select count(*) as count from ${table}`).get() as { count: number })
            .count,
        }),
      );
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
