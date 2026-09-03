import type { Metadata } from "next";
import { getReviewQueue } from "@/application/get-review-queue";
import { database, repository, syntheticOwnerId } from "@/application/server";
import { ClassificationWorkspace } from "@/components/classification-workspace";
import { ReviewDecisionForm } from "@/components/review-decision-form";
import {
  listClassificationProposals,
  listClassificationRuns,
  listOwnerEmailIdentities,
} from "@/db/classification";

export const runtime = "nodejs";
export const metadata: Metadata = { title: "Review Queue" };

export default function ReviewQueuePage() {
  const items = getReviewQueue(repository, syntheticOwnerId);
  return (
    <>
      <header className="page-heading">
        <h1>Review Queue</h1>
        <p>
          Decide whether uncertain facts belong in the accepted view. Evidence is never deleted.
        </p>
      </header>
      <ClassificationWorkspace
        initialIdentities={listOwnerEmailIdentities(database, syntheticOwnerId)}
        initialRuns={listClassificationRuns(database, syntheticOwnerId)}
        initialProposals={listClassificationProposals(database, syntheticOwnerId, {
          state: "proposed",
        })}
      />

      <section className="panel" aria-labelledby="legacy-review-heading">
        <h2 id="legacy-review-heading">Existing imported review items</h2>
        <ul className="record-list">
          {items.map((item) => (
            <li className="record" key={item.assertionId}>
              <div>
                <span className="status-label">State: {item.state}</span>
              </div>
              <h2>Jane may now work at New Agency</h2>
              <p>{item.excerpt}</p>
              <dl>
                <dt>Source</dt>
                <dd>{item.sourceKey}</dd>
                <dt>Confidence</dt>
                <dd>{item.confidenceBasisPoints / 100}%</dd>
                <dt>Basis</dt>
                <dd>Signature-derived inference</dd>
              </dl>
              <ReviewDecisionForm assertionId={item.assertionId} revision={item.revision} />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
