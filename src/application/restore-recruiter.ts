import type { RelationshipRepository } from "@/domain/repositories";

export function restoreRecruiter(
  repository: RelationshipRepository,
  input: { ownerId: string; recruiterId: string; now: string },
): void {
  repository.restoreRecruiter(input.ownerId, input.recruiterId, input.now);
}
