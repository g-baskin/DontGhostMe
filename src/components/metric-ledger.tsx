import type { RecruiterMetrics } from "@/domain/models";

const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export function MetricLedger({ metrics }: { metrics: RecruiterMetrics }) {
  const items = [
    ["First contact", date.format(new Date(metrics.firstContact))],
    ["Last contact", date.format(new Date(metrics.lastContact))],
    ["Recruiter messages", String(metrics.recruiterMessages)],
    ["Candidate replies", String(metrics.candidateReplies)],
    ["Inferred follow-ups", String(metrics.inferredFollowUps)],
    ["Current unanswered side", metrics.currentUnansweredSide],
    ["Opportunities", String(metrics.opportunities)],
    ["Explicit submissions", String(metrics.explicitSubmissions)],
    ["Unknown outcomes", String(metrics.unknownOutcomes)],
  ];
  return (
    <dl className="metric-ledger">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
