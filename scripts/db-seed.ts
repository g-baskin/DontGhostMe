import { createDatabaseConnection } from "@/db/client";
import { persistSyntheticBatch } from "@/db/import-batches";
import { normalizeSyntheticMessages } from "@/ingestion/synthetic-normalizer";
import { janeMessages } from "@/test/fixtures/jane-conversation";

const database = createDatabaseConnection();
try {
  persistSyntheticBatch(database, normalizeSyntheticMessages(janeMessages));
  const count = database.sqlite
    .prepare("select count(*) as count from communication_events")
    .get() as {
    count: number;
  };
  console.log(`Synthetic seed complete: ${count.count} communications`);
} finally {
  database.sqlite.close();
}
