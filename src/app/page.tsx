import type { Route } from "next";
import Link from "next/link";
import { repository, syntheticOwnerId } from "@/application/server";
import { MetricLedger } from "@/components/metric-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export default function HomePage() {
  const recruiters = repository.listRecruiters(syntheticOwnerId);
  const opportunities = repository.listOpportunities(syntheticOwnerId);
  const primaryRecruiter = recruiters[0]
    ? repository.getRecruiter(syntheticOwnerId, recruiters[0].id)
    : null;
  const review = recruiters.filter(({ unresolvedItems }) => unresolvedItems > 0);
  const companyChanges = recruiters.filter(({ possibleCompanyChange }) => possibleCompanyChange);
  const awaiting = opportunities.filter(({ outcome }) => outcome === "unknown");
  const stale = awaiting.filter(
    ({ submitted, introducedAt }) =>
      submitted && Date.now() - Date.parse(introducedAt) > 30 * 86_400_000,
  );
  return (
    <>
      <header className="page-heading">
        <div className="notice">
          Synthetic mode is active. Every person, company, message, and metric is fictional.
        </div>
        <h1>Your recruiting history, with receipts.</h1>
        <p>
          Review uncertain relationships and evidence-backed opportunity progress without sending or
          syncing anything.
        </p>
        {recruiters[0] ? (
          <p>
            <Link href={`/recruiters/${recruiters[0].id}`}>
              Open Jane Recruiter&apos;s evidence timeline
            </Link>
          </p>
        ) : null}
      </header>
      {primaryRecruiter ? (
        <section className="section" aria-labelledby="relationship-ledger">
          <h2 className="section-heading" id="relationship-ledger">
            Relationship ledger
          </h2>
          <MetricLedger metrics={primaryRecruiter.metrics} />
        </section>
      ) : null}
      <section className="section" aria-labelledby="dashboard-review">
        <h2 className="section-heading" id="dashboard-review">
          Relationships needing review
        </h2>
        {review.length ? (
          <ul>
            {review.map((item) => (
              <li key={item.id}>
                <Link href={`/recruiters/${item.id}`}>{item.canonicalName}</Link>:{" "}
                {item.unresolvedItems} unresolved facts
              </li>
            ))}
          </ul>
        ) : (
          <p>No relationship facts currently need review.</p>
        )}
      </section>
      <section className="section" aria-labelledby="dashboard-opportunities">
        <h2 className="section-heading" id="dashboard-opportunities">
          Opportunities awaiting updates
        </h2>
        {awaiting.length ? (
          <ul>
            {awaiting.map((item) => (
              <li key={item.id}>
                <Link href={`/opportunities/${item.id}` as Route}>{item.title}</Link>:{" "}
                {item.stage.replaceAll("_", " ")}, outcome unknown
              </li>
            ))}
          </ul>
        ) : (
          <p>No opportunities are awaiting updates.</p>
        )}
      </section>
      <section className="section" aria-labelledby="dashboard-activity">
        <h2 className="section-heading" id="dashboard-activity">
          Recent activity
        </h2>
        {recruiters.length ? (
          <ul>
            {recruiters.slice(0, 5).map((item) => (
              <li key={item.id}>
                {item.canonicalName}: last contact{" "}
                {item.lastContact === "Unknown"
                  ? "unknown"
                  : date.format(new Date(item.lastContact))}
              </li>
            ))}
          </ul>
        ) : (
          <p>No included recruiter activity.</p>
        )}
      </section>
      <section className="section" aria-labelledby="dashboard-attention">
        <h2 className="section-heading" id="dashboard-attention">
          Attention checks
        </h2>
        <p>
          {companyChanges.length} possible company changes. {stale.length} submissions older than 30
          days with unknown outcomes.
        </p>
      </section>
    </>
  );
}
