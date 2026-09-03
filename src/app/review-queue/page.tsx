import type { Metadata } from "next";
import { getReviewQueue } from "@/application/get-review-queue";
import { repository, syntheticOwnerId } from "@/application/server";
import { ReviewDecisionForm } from "@/components/review-decision-form";

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
    </>
  );
}
