import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createDatabaseConnection } from "@/db/client";

const database = createDatabaseConnection();
try {
  migrate(database.db, { migrationsFolder: "drizzle" });
  console.log(`Migrated ${database.path} with SQLite ${database.startup.sqliteVersion}`);
} finally {
  database.sqlite.close();
}
