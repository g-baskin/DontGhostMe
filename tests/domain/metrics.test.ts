import { describe, expect, it } from "vitest";
import { deriveRecruiterMetrics } from "@/domain/metrics";
import { janeMessages } from "@/test/fixtures/jane-conversation";

const events = janeMessages.map((message) => ({
  occurredAt: message.occurredAt,
  direction: message.direction,
  conversationId: message.conversationKey,
}));

const opportunities = [
  { submitted: true, outcomeKnown: false },
  { submitted: false, outcomeKnown: false },
];

describe("deriveRecruiterMetrics", () => {
  it("derives the Jane ledger without turning silence into ghosting", () => {
    expect(deriveRecruiterMetrics(events, opportunities, "2025-06-03T14:00:00.000Z")).toEqual({
      firstContact: "2025-01-06T15:00:00.000Z",
      lastContact: "2025-06-02T14:00:00.000Z",
      recruiterMessages: 6,
      candidateReplies: 3,
      inferredFollowUps: 1,
      currentUnansweredSide: "candidate",
      unansweredDurationMilliseconds: 86_400_000,
      lastResponseLatencyMilliseconds: 98_100_000,
      candidateMedianResponseLatencyMilliseconds: 2_700_000,
      recruiterMedianResponseLatencyMilliseconds: 81_000_000,
      opportunities: 2,
      explicitSubmissions: 1,
      unknownOutcomes: 1,
    });
  });

  it("requires evidence before deriving metrics", () => {
    expect(() => deriveRecruiterMetrics([], [])).toThrow("without events");
  });
});
