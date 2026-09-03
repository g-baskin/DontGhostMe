import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOpportunityDetail } from "@/application/get-opportunity-detail";
import { database, repository, syntheticOwnerId } from "@/application/server";
import { ManualCorrectionForm } from "@/components/manual-correction-form";
import { latestManualAssertion } from "@/db/manual-assertions";

export const runtime = "nodejs";
export const metadata: Metadata = { title: "Opportunity evidence" };
const date = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});
const label = (value: string) => value.replaceAll("_", " ");

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ opportunityId: string }>;
}) {
  const { opportunityId } = await params;
  const opportunity = getOpportunityDetail(repository, syntheticOwnerId, opportunityId);
  if (!opportunity) notFound();
  const manualTitle = latestManualAssertion(
    database,
    syntheticOwnerId,
    "opportunity",
    opportunity.id,
    "title",
  );
  return (
    <>
      <header className="page-heading">
        <h1>{opportunity.title}</h1>
        <p>
          Current stage: <strong>{label(opportunity.stage)}</strong>. Outcome:{" "}
          <strong>{label(opportunity.outcome)}</strong>.
        </p>
        <Link href="/opportunities">Return to opportunity pipeline</Link>
      </header>
      <section className="section" aria-labelledby="manual-data">
        <h2 className="section-heading" id="manual-data">
          Manual data
        </h2>
        <ManualCorrectionForm
          entityId={opportunity.id}
          entityKind="opportunity"
          fieldName="title"
          label="Opportunity title"
          currentValue={opportunity.title}
          fallbackValue={opportunity.fallbackValues.title as string | null}
          revision={manualTitle?.revision ?? 0}
          assertionId={manualTitle?.id}
        />
      </section>
      <section className="section" aria-labelledby="stage-history">
        <h2 className="section-heading" id="stage-history">
          Evidence-backed stage history
        </h2>
        {opportunity.stageHistory.length ? (
          <ol className="evidence-timeline">
            {opportunity.stageHistory.map((entry) => (
              <li key={`${entry.occurredAt}:${entry.evidenceId}`}>
                <article>
                  <div className="timeline-heading">
                    <h3>{label(entry.stage)}</h3>
                    <time dateTime={entry.occurredAt}>
                      {date.format(new Date(entry.occurredAt))}
                    </time>
                  </div>
                  <p>
                    {entry.inferred ? "Inferred fact" : "Explicit fact"}; confidence{" "}
                    {entry.confidenceBasisPoints / 100}%.
                  </p>
                  <p className="source-note">
                    Source: {entry.sourceKey}. Evidence: {entry.evidenceId}.
                  </p>
                </article>
              </li>
            ))}
          </ol>
        ) : (
          <div className="empty-state">
            <h3>No accepted stage evidence</h3>
            <p>This opportunity remains not started. Requests alone do not prove submission.</p>
          </div>
        )}
      </section>
    </>
  );
}
