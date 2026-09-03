import type { Metadata } from "next";
import Link from "next/link";
import { exportData } from "@/application/export-data";
import { repository, syntheticOwnerId } from "@/application/server";

export const runtime = "nodejs";
export const metadata: Metadata = { title: "Data & Privacy" };

export default function DataPrivacyPage() {
  const data = exportData(repository, syntheticOwnerId);
  return (
    <>
      <header className="page-heading">
        <h1>Data & Privacy</h1>
        <p>Everything in M0 is synthetic, local, inspectable, correctable, and portable.</p>
      </header>
      <section className="section" aria-labelledby="data-inventory">
        <h2 className="section-heading" id="data-inventory">
          Local data inventory
        </h2>
        <dl className="metric-ledger">
          <div>
            <dt>Recruiters</dt>
            <dd>{data.recruiters.length}</dd>
          </div>
          <div>
            <dt>Messages</dt>
            <dd>{data.communications.length}</dd>
          </div>
          <div>
            <dt>Evidence assertions</dt>
            <dd>{data.evidence.length}</dd>
          </div>
          <div>
            <dt>Storage</dt>
            <dd>Ignored local app data</dd>
          </div>
        </dl>
      </section>
      <section className="section reading-width" aria-labelledby="network-boundary">
        <h2 className="section-heading" id="network-boundary">
          Network boundary
        </h2>
        <p>
          The app has no Gmail, LinkedIn, AI, analytics, telemetry, or outbound communication
          connection. It reads only the bundled synthetic fixture and local SQLite database.
        </p>
      </section>
      <section className="section reading-width" aria-labelledby="portable-copy">
        <h2 className="section-heading" id="portable-copy">
          Portable copy
        </h2>
        <p>The JSON includes normalized records, evidence hashes, excerpts, and review history.</p>
        <p>
          <Link className="export-link" href="/api/export" download>
            Download portable JSON
          </Link>
        </p>
      </section>
    </>
  );
}
