import Link from "next/link";
import { getHome } from "@/application/get-home";
import { repository, syntheticOwnerId } from "@/application/server";
import { MetricLedger } from "@/components/metric-ledger";

export const runtime = "nodejs";

export default function HomePage() {
  const jane = getHome(repository, syntheticOwnerId);
  return (
    <>
      <header className="page-heading">
        <div className="notice">
          Synthetic mode is active. Every person, company, message, and metric is fictional.
        </div>
        <h1>Your recruiting history, with receipts.</h1>
        <p>
          Follow Jane&apos;s sourced timeline, see what is known, and decide whether one uncertain
          company change belongs in the accepted record.
        </p>
        <p>
          <Link href={`/recruiters/${jane.id}`}>Open Jane Recruiter&apos;s evidence timeline</Link>
        </p>
      </header>
      <section className="section" aria-labelledby="jane-ledger">
        <h2 className="section-heading" id="jane-ledger">
          Jane&apos;s relationship ledger
        </h2>
        <p className="source-note">Derived from nine synthetic messages. No counters are stored.</p>
        <MetricLedger metrics={jane.metrics} />
      </section>
    </>
  );
}
