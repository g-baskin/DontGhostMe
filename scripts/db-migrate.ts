import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createDatabaseConnection } from "@/db/client";

const database = createDatabaseConnection();
try {
  // Drizzle wraps each migration in a transaction, which makes the
  // PRAGMA foreign_keys toggles inside table-rebuild migrations no-ops.
  // Disable enforcement before migrating and verify integrity afterwards.
  database.sqlite.pragma("foreign_keys = OFF");
  migrate(database.db, { migrationsFolder: "drizzle" });
  database.sqlite.pragma("foreign_keys = ON");
  const violations = database.sqlite.pragma("foreign_key_check");
  if (Array.isArray(violations) && violations.length > 0) {
    throw new Error(`Migration left ${violations.length} foreign-key violation(s)`);
  }
  console.log(`Migrated ${database.path} with SQLite ${database.startup.sqliteVersion}`);
} finally {
  database.sqlite.pragma("foreign_keys = ON");
  database.sqlite.close();
}
