import { describe, expect, it } from "vitest";
import type { OpportunityStageEvidence } from "@/domain/models";
import { deriveOpportunityStage, deriveOpportunityStageHistory } from "@/domain/opportunity-stages";

const evidence = (
  factType: string,
  occurredAt: string,
  evidenceId: string,
): OpportunityStageEvidence => ({
  factType,
  occurredAt,
  evidenceId,
  sourceKey: `source:${evidenceId}`,
  confidenceBasisPoints: 9000,
  inferred: false,
  reviewState: "accepted",
});

describe("opportunity stages", () => {
  it("orders promoted evidence deterministically", () => {
    const items = [
      evidence("submission_claimed", "2026-01-02T00:00:00.000Z", "b"),
      evidence("opportunity_details", "2026-01-01T00:00:00.000Z", "c"),
      evidence("resume_requested", "2026-01-02T00:00:00.000Z", "a"),
    ];
    expect(deriveOpportunityStageHistory(items).map(({ evidenceId }) => evidenceId)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("does not treat a resume request as submission", () => {
    expect(
      deriveOpportunityStage([evidence("resume_requested", "2026-01-01T00:00:00.000Z", "a")]),
    ).toBe("resume_requested");
  });

  it("requires accepted evidence", () => {
    expect(
      deriveOpportunityStage([
        {
          ...evidence("submission_claimed", "2026-01-01T00:00:00.000Z", "a"),
          reviewState: "proposed",
        },
      ]),
    ).toBe("not_started");
  });
});
