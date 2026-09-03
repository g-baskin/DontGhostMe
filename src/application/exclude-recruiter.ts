import type { RelationshipRepository } from "@/domain/repositories";

export function excludeRecruiter(
  repository: RelationshipRepository,
  input: { ownerId: string; recruiterId: string; now: string },
): void {
  repository.excludeRecruiter(input.ownerId, input.recruiterId, input.now);
}
