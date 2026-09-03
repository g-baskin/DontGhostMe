import type { RecruiterMetrics } from "@/domain/models";

const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

const duration = (milliseconds: number | null): string =>
  milliseconds === null
    ? "Unavailable: fewer than three pairs"
    : `${Math.round(milliseconds / 3_600_000)} hours`;

export function MetricLedger({ metrics }: { metrics: RecruiterMetrics }) {
  const items = [
    ["First contact", date.format(new Date(metrics.firstContact))],
    ["Last contact", date.format(new Date(metrics.lastContact))],
    ["Recruiter messages", String(metrics.recruiterMessages)],
    ["Candidate replies", String(metrics.candidateReplies)],
    ["Inferred follow-ups", String(metrics.inferredFollowUps)],
    ["Current unanswered side", metrics.currentUnansweredSide],
    ["Current unanswered duration", duration(metrics.unansweredDurationMilliseconds)],
    ["Candidate median response", duration(metrics.candidateMedianResponseLatencyMilliseconds)],
    ["Recruiter median response", duration(metrics.recruiterMedianResponseLatencyMilliseconds)],
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
