import type { MessageDirection, RecruiterMetrics } from "./models";

export interface MetricEvent {
  occurredAt: string;
  direction: MessageDirection;
  conversationId: string;
}

export interface MetricOpportunity {
  submitted: boolean;
  outcomeKnown: boolean;
}

export function deriveRecruiterMetrics(
  events: MetricEvent[],
  opportunities: MetricOpportunity[],
): RecruiterMetrics {
  if (events.length === 0) throw new Error("Cannot derive recruiter metrics without events");

  const ordered = [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  let inferredFollowUps = 0;
  for (let index = 1; index < ordered.length; index += 1) {
    if (
      ordered[index - 1].conversationId === ordered[index].conversationId &&
      ordered[index - 1].direction === "recruiter_to_candidate" &&
      ordered[index].direction === "recruiter_to_candidate"
    ) {
      inferredFollowUps += 1;
    }
  }

  const lastDirection = ordered.at(-1)?.direction;
  return {
    firstContact: ordered[0].occurredAt,
    lastContact: ordered.at(-1)?.occurredAt ?? ordered[0].occurredAt,
    recruiterMessages: ordered.filter(({ direction }) => direction === "recruiter_to_candidate")
      .length,
    candidateReplies: ordered.filter(({ direction }) => direction === "candidate_to_recruiter")
      .length,
    inferredFollowUps,
    currentUnansweredSide:
      lastDirection === "recruiter_to_candidate"
        ? "candidate"
        : lastDirection === "candidate_to_recruiter"
          ? "recruiter"
          : "none",
    opportunities: opportunities.length,
    explicitSubmissions: opportunities.filter(({ submitted }) => submitted).length,
    unknownOutcomes: opportunities.filter(
      ({ submitted, outcomeKnown }) => submitted && !outcomeKnown,
    ).length,
  };
}
