import type { AppDatabase } from "@/db/client";
import { HistoricalImportError } from "@/domain/imports";

const RETRY_DELAYS_MS = [20, 50, 100] as const;

function isBusy(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as Error & { code?: string }).code?.startsWith("SQLITE_BUSY")
  );
}

export function withImmediateTransaction<T>(
  database: Pick<AppDatabase, "sqlite">,
  operation: () => T,
): T {
  for (let attempt = 0; ; attempt += 1) {
    try {
      database.sqlite.exec("begin immediate");
      const result = operation();
      database.sqlite.exec("commit");
      return result;
    } catch (error) {
      if (database.sqlite.inTransaction) database.sqlite.exec("rollback");
      const delay = RETRY_DELAYS_MS[attempt];
      if (!isBusy(error) || delay === undefined)
        throw isBusy(error) ? new HistoricalImportError("database_busy", true) : error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);
    }
  }
}
