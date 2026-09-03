import type { OpportunitySummary, ReadRepository } from "@/domain/repositories";

export function getOpportunities(
  repository: ReadRepository,
  ownerId: string,
): OpportunitySummary[] {
  return repository.listOpportunities(ownerId);
}
