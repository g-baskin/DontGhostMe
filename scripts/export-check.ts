import { exportData } from "@/application/export-data";
import { createDatabaseConnection } from "@/db/client";
import { createRepository } from "@/db/repositories";
import { SYNTHETIC_OWNER_ID } from "@/test/fixtures/jane-conversation";

const database = createDatabaseConnection();
try {
  const exported = exportData(
    createRepository(database),
    SYNTHETIC_OWNER_ID,
    () => new Date("2026-09-02T00:00:00.000Z"),
  );
  const serialized = JSON.stringify(exported);
  if (exported.recruiterIdentities.length !== 2) throw new Error("Expected two identities");
  if (exported.recruiterAffiliations.length !== 2) throw new Error("Expected two affiliations");
  if (exported.submissions.length !== 1) throw new Error("Expected one submission");
  if (exported.conversationOpportunities.length !== 2)
    throw new Error("Expected two conversation links");
  if (exported.communications.length !== 9) throw new Error("Expected nine communications");
  if (exported.sourceReferences.length !== 9) throw new Error("Expected nine source references");
  if (exported.evidence.length !== 5) throw new Error("Expected five evidence assertions");
  if (exported.importBatches.length !== 1) throw new Error("Expected one import batch");
  if (serialized.includes(".sqlite")) throw new Error("Export contains a local database path");
  console.log(
    JSON.stringify({
      identities: exported.recruiterIdentities.length,
      affiliations: exported.recruiterAffiliations.length,
      submissions: exported.submissions.length,
      conversationLinks: exported.conversationOpportunities.length,
      communications: exported.communications.length,
      sourceReferences: exported.sourceReferences.length,
      evidence: exported.evidence.length,
      reviewHistory: exported.reviewHistory.length,
      importBatches: exported.importBatches.length,
      pathLeak: false,
    }),
  );
} finally {
  database.sqlite.close();
}
