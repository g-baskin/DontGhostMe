import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getRecruiterDetail } from "@/application/get-recruiter-detail";
import { database, repository, syntheticOwnerId } from "@/application/server";
import { EvidenceTimeline } from "@/components/evidence-timeline";
import { ManualCorrectionForm } from "@/components/manual-correction-form";
import { MetricLedger } from "@/components/metric-ledger";
import { RelationshipControls } from "@/components/relationship-controls";
import { latestManualAssertion } from "@/db/manual-assertions";

export const runtime = "nodejs";

export const metadata: Metadata = { title: "Recruiter evidence" };

export default async function RecruiterDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ recruiterId: string }>;
  searchParams: Promise<{ cursor?: string; direction?: string }>;
}) {
  const { recruiterId } = await params;
  const { cursor, direction } = await searchParams;
  const recruiter = getRecruiterDetail(
    repository,
    syntheticOwnerId,
    recruiterId,
    cursor,
    direction === "previous" ? "previous" : "next",
  );
  if (!recruiter) notFound();
  const manualName = latestManualAssertion(
    database,
    syntheticOwnerId,
    "recruiter",
    recruiter.id,
    "canonical_name",
  );

  return (
    <>
      <header className="page-heading">
        <h1>{recruiter.canonicalName}</h1>
        <p>
          Accepted affiliation: <strong>{recruiter.currentAffiliation}</strong>. The proposed New
          Agency change appears only after confirmation.
        </p>
      </header>
      <section className="section" aria-labelledby="manual-data">
        <h2 className="section-heading" id="manual-data">
          Manual data
        </h2>
        <ManualCorrectionForm
          entityId={recruiter.id}
          entityKind="recruiter"
          fieldName="canonical_name"
          label="Recruiter name"
          currentValue={recruiter.canonicalName}
          fallbackValue={recruiter.fallbackValues.canonicalName as string | null}
          revision={manualName?.revision ?? 0}
          assertionId={manualName?.id}
        />
      </section>
      <section className="section" aria-labelledby="relationship-controls">
        <h2 className="section-heading" id="relationship-controls">
          Relationship controls
        </h2>
        <RelationshipControls
          recruiterId={recruiter.id}
          status={recruiter.relationshipStatus}
          excluded={recruiter.excluded}
        />
      </section>
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
        <p className="source-note">
          Response latency pairs direction changes inside one conversation. Medians require three
          qualifying responses. Unanswered duration starts at the final message.
        </p>
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
        <nav className="pagination" aria-label="Recruiter timeline pages">
          {recruiter.timelinePage?.previousCursor ? (
            <Link
              href={
                `/recruiters/${recruiter.id}?cursor=${encodeURIComponent(recruiter.timelinePage.previousCursor)}&direction=previous` as Route
              }
            >
              Previous timeline page
            </Link>
          ) : (
            <span>Previous timeline page unavailable</span>
          )}
          {recruiter.timelinePage?.nextCursor ? (
            <Link
              href={
                `/recruiters/${recruiter.id}?cursor=${encodeURIComponent(recruiter.timelinePage.nextCursor)}&direction=next` as Route
              }
            >
              Next timeline page
            </Link>
          ) : (
            <span>Next timeline page unavailable</span>
          )}
        </nav>
      </section>
      <section className="section reading-width" aria-labelledby="delete-data">
        <h2 className="section-heading" id="delete-data">
          Delete recruiter data
        </h2>
        <p>
          Deletion removes derived recruiter records permanently. Imported source messages remain.
        </p>
        <Link href={`/recruiters/${recruiter.id}/delete` as Route}>
          Review deletion consequences
        </Link>
      </section>
    </>
  );
}
