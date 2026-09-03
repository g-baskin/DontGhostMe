import type { RelationshipRepository } from "@/domain/repositories";

export const DELETE_CONFIRMATION = "DELETE RECRUITER DATA";

export function deleteRecruiterData(
  repository: RelationshipRepository,
  input: { ownerId: string; recruiterId: string; confirmation: string; now: string },
): void {
  if (input.confirmation !== DELETE_CONFIRMATION)
    throw new Error("Deletion confirmation did not match");
  repository.deleteRecruiterData(input.ownerId, input.recruiterId, input.now);
}
