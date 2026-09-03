import type { AppDatabase } from "@/db/client";
import { withImmediateTransaction } from "@/db/write";

export const OWNER_DATA_DELETE_ORDER = [
  "classification_decisions",
  "classification_evidence",
  "classification_proposals",
  "classification_runs",
  "owner_email_identities",
  "import_errors",
  "attachment_inventory",
  "normalized_messages",
  "import_source_messages",
  "import_checkpoints",
  "historical_imports",
  "review_decisions",
  "evidence_assertions",
  "submissions",
  "communication_events",
  "conversation_opportunities",
  "source_references",
  "conversations",
  "opportunities",
  "recruiter_affiliations",
  "recruiter_identities",
  "recruiters",
  "organizations",
  "import_batches",
] as const;

export function deleteOwnerData(database: AppDatabase, ownerId: string) {
  withImmediateTransaction(database, () => {
    for (const table of OWNER_DATA_DELETE_ORDER) {
      database.sqlite.prepare(`delete from ${table} where owner_id = ?`).run(ownerId);
    }
    database.sqlite.prepare("delete from owners where id = ?").run(ownerId);
  });
}
