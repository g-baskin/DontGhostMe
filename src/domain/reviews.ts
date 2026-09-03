import type { ReviewDecision, ReviewState } from "./models";

export class ReviewConflictError extends Error {
  constructor() {
    super("This fact changed while you were reviewing it. Reload and try again.");
    this.name = "ReviewConflictError";
  }
}

export function deriveReviewState(
  requirement: "none" | "user_review",
  latestDecision?: ReviewDecision,
): ReviewState {
  if (latestDecision) return latestDecision;
  return requirement === "user_review" ? "proposed" : "accepted";
}
