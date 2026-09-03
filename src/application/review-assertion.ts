import type { ReviewDecision } from "@/domain/models";
import type { ReviewRepository } from "@/domain/repositories";

export function reviewAssertion(
  repository: ReviewRepository,
  input: {
    ownerId: string;
    assertionId: string;
    expectedRevision: number;
    decision: Exclude<ReviewDecision, "corrected">;
  },
): { revision: number } {
  return repository.decide(
    input.ownerId,
    input.assertionId,
    input.expectedRevision,
    input.decision,
  );
}
