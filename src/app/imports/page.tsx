import { cleanupExpiredImports, listHistoricalImports } from "@/application/historical-imports";
import { database, syntheticOwnerId } from "@/application/server";
import { ImportWorkspace } from "@/components/import-workspace";

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  await cleanupExpiredImports(database, syntheticOwnerId);
  const imports = listHistoricalImports(database, syntheticOwnerId);

  return (
    <div className="page-stack">
      <header className="page-heading reading-width">
        <p className="eyebrow">Local evidence intake</p>
        <h1>Imports</h1>
        <p className="lede">
          Preview an extracted Google Takeout MBOX before writing normalized messages to your local
          evidence ledger.
        </p>
      </header>
      <ImportWorkspace initialImports={imports} />
    </div>
  );
}
