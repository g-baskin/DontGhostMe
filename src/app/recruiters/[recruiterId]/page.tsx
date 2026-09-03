import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRecruiterDetail } from "@/application/get-recruiter-detail";
import { repository, syntheticOwnerId } from "@/application/server";
import { EvidenceTimeline } from "@/components/evidence-timeline";
import { MetricLedger } from "@/components/metric-ledger";

export const runtime = "nodejs";

export const metadata: Metadata = { title: "Recruiter evidence" };

export default async function RecruiterDetailPage({
  params,
}: {
  params: Promise<{ recruiterId: string }>;
}) {
  const { recruiterId } = await params;
  const recruiter = getRecruiterDetail(repository, syntheticOwnerId, recruiterId);
  if (!recruiter) notFound();

  return (
    <>
      <header className="page-heading">
        <h1>{recruiter.canonicalName}</h1>
        <p>
          Accepted affiliation: <strong>{recruiter.currentAffiliation}</strong>. The proposed New
          Agency change appears only after confirmation.
        </p>
      </header>
      <section className="section" aria-labelledby="identity-history">
        <h2 className="section-heading" id="identity-history">
          Identity history
        </h2>
        <ul>
          {recruiter.identities.map((identity) => (
            <li key={identity.id}>{identity.email}</li>
          ))}
        </ul>
        <p className="source-note">
          The two addresses are linked by an explicit synthetic assertion.
        </p>
      </section>
      <section className="section" aria-labelledby="relationship-metrics">
        <h2 className="section-heading" id="relationship-metrics">
          Relationship metrics
        </h2>
        <MetricLedger metrics={recruiter.metrics} />
      </section>
      <section className="section" aria-labelledby="opportunity-history">
        <h2 className="section-heading" id="opportunity-history">
          Two separate opportunities
        </h2>
        <ul>
          {recruiter.opportunities.map((opportunity) => (
            <li key={opportunity.id}>
              <strong>{opportunity.title}</strong> ({opportunity.sourceKey})
            </li>
          ))}
        </ul>
      </section>
      <section className="section" aria-labelledby="evidence-history">
        <h2 className="section-heading" id="evidence-history">
          Evidence chronology
        </h2>
        <EvidenceTimeline events={recruiter.timeline} />
      </section>
    </>
  );
}
