import type { MessageDirection, RecruiterMetrics, ResponseLatency } from "./models";

export interface MetricEvent {
  occurredAt: string;
  direction: MessageDirection;
  conversationId: string;
}

export interface MetricOpportunity {
  submitted: boolean;
  outcomeKnown: boolean;
}

function median(values: number[]): number | null {
  if (values.length < 3) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0 ? (ordered[middle - 1] + ordered[middle]) / 2 : ordered[middle];
}

export function pairResponseLatencies(events: MetricEvent[]): ResponseLatency[] {
  const conversations = new Map<string, MetricEvent[]>();
  for (const event of events) {
    const bucket = conversations.get(event.conversationId) ?? [];
    bucket.push(event);
    conversations.set(event.conversationId, bucket);
  }
  const pairs: ResponseLatency[] = [];
  for (const conversationEvents of conversations.values()) {
    const ordered = [...conversationEvents].sort((a, b) =>
      a.occurredAt.localeCompare(b.occurredAt),
    );
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      if (previous.direction === current.direction) continue;
      const milliseconds = Date.parse(current.occurredAt) - Date.parse(previous.occurredAt);
      if (!Number.isFinite(milliseconds) || milliseconds < 0) continue;
      pairs.push({
        conversationId: current.conversationId,
        responder: current.direction === "candidate_to_recruiter" ? "candidate" : "recruiter",
        startedAt: previous.occurredAt,
        respondedAt: current.occurredAt,
        milliseconds,
      });
    }
  }
  return pairs.sort(
    (a, b) =>
      a.respondedAt.localeCompare(b.respondedAt) ||
      a.conversationId.localeCompare(b.conversationId),
  );
}

export function deriveRecruiterMetrics(
  events: MetricEvent[],
  opportunities: MetricOpportunity[],
  now = new Date().toISOString(),
): RecruiterMetrics {
  if (events.length === 0) throw new Error("Cannot derive recruiter metrics without events");

  const ordered = [...events].sort(
    (a, b) =>
      a.occurredAt.localeCompare(b.occurredAt) || a.conversationId.localeCompare(b.conversationId),
  );
  let inferredFollowUps = 0;
  for (let index = 1; index < ordered.length; index += 1) {
    if (
      ordered[index - 1].conversationId === ordered[index].conversationId &&
      ordered[index - 1].direction === "recruiter_to_candidate" &&
      ordered[index].direction === "recruiter_to_candidate"
    )
      inferredFollowUps += 1;
  }

  const latencies = pairResponseLatencies(ordered);
  const last = ordered.at(-1) ?? ordered[0];
  const nowMilliseconds = Date.parse(now);
  const lastMilliseconds = Date.parse(last.occurredAt);
  return {
    firstContact: ordered[0].occurredAt,
    lastContact: last.occurredAt,
    recruiterMessages: ordered.filter(({ direction }) => direction === "recruiter_to_candidate")
      .length,
    candidateReplies: ordered.filter(({ direction }) => direction === "candidate_to_recruiter")
      .length,
    inferredFollowUps,
    currentUnansweredSide: last.direction === "recruiter_to_candidate" ? "candidate" : "recruiter",
    unansweredDurationMilliseconds:
      Number.isFinite(nowMilliseconds) && nowMilliseconds >= lastMilliseconds
        ? nowMilliseconds - lastMilliseconds
        : 0,
    lastResponseLatencyMilliseconds: latencies.at(-1)?.milliseconds ?? null,
    candidateMedianResponseLatencyMilliseconds: median(
      latencies
        .filter(({ responder }) => responder === "candidate")
        .map(({ milliseconds }) => milliseconds),
    ),
    recruiterMedianResponseLatencyMilliseconds: median(
      latencies
        .filter(({ responder }) => responder === "recruiter")
        .map(({ milliseconds }) => milliseconds),
    ),
    opportunities: opportunities.length,
    explicitSubmissions: opportunities.filter(({ submitted }) => submitted).length,
    unknownOutcomes: opportunities.filter(
      ({ submitted, outcomeKnown }) => submitted && !outcomeKnown,
    ).length,
  };
}
