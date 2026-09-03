import type { RelationshipStatus } from "@/domain/models";
import type { RelationshipRepository } from "@/domain/repositories";

export function setRelationshipStatus(
  repository: RelationshipRepository,
  input: { ownerId: string; recruiterId: string; status: RelationshipStatus; now: string },
): void {
  repository.setRelationshipStatus(input.ownerId, input.recruiterId, input.status, input.now);
}
