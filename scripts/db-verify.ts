import { createDatabaseConnection } from "@/db/client";

const database = createDatabaseConnection();
try {
  const integrity = database.sqlite.pragma("integrity_check", { simple: true });
  const foreignKeyIssues = database.sqlite.pragma("foreign_key_check") as unknown[];
  if (integrity !== "ok" || foreignKeyIssues.length > 0) {
    throw new Error("database_verification_failed");
  }
  console.log(JSON.stringify({ integrity, foreignKeyIssues: 0 }));
} finally {
  database.sqlite.close();
}
