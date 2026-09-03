import type { OpportunityDetail, ReadRepository } from "@/domain/repositories";

export function getOpportunityDetail(
  repository: ReadRepository,
  ownerId: string,
  opportunityId: string,
): OpportunityDetail | null {
  return repository.getOpportunity(ownerId, opportunityId);
}
