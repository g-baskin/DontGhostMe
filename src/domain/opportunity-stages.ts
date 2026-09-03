import type {
  OpportunityOutcome,
  OpportunityStage,
  OpportunityStageEvidence,
  OpportunityStageHistoryEntry,
} from "./models";

const stagesByFactType: Readonly<Record<string, OpportunityStage>> = {
  opportunity_details: "discussed",
  opportunity_introduced: "discussed",
  resume_requested: "resume_requested",
  resume_received: "resume_requested",
  right_to_represent_requested: "right_to_represent",
  right_to_represent_confirmed: "right_to_represent",
  submission_claimed: "submitted",
  explicit_submission: "submitted",
  submission_confirmed_by_user: "submitted",
  interview_requested: "interview",
  interview_scheduled: "interview",
  interview_completed: "interview",
  rejection: "terminal",
  offer: "terminal",
  candidate_withdrew: "terminal",
  opportunity_closed: "terminal",
};

export function deriveOpportunityStageHistory(
  evidence: OpportunityStageEvidence[],
  outcome: OpportunityOutcome = "unknown",
): OpportunityStageHistoryEntry[] {
  const accepted = evidence
    .filter(
      ({ reviewState }) =>
        reviewState === "accepted" || reviewState === "confirmed" || reviewState === "corrected",
    )
    .sort(
      (a, b) =>
        a.occurredAt.localeCompare(b.occurredAt) || a.evidenceId.localeCompare(b.evidenceId),
    );
  const history = accepted.flatMap((item) => {
    const stage = stagesByFactType[item.factType];
    return stage ? [{ ...item, stage }] : [];
  });
  if (outcome !== "unknown" && history.every(({ stage }) => stage !== "terminal")) {
    const last = accepted.at(-1);
    if (last) history.push({ ...last, factType: `outcome:${outcome}`, stage: "terminal" });
  }
  return history;
}

export function deriveOpportunityStage(
  evidence: OpportunityStageEvidence[],
  outcome: OpportunityOutcome = "unknown",
): OpportunityStage {
  return deriveOpportunityStageHistory(evidence, outcome).at(-1)?.stage ?? "not_started";
}
