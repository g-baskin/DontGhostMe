import type { ReadRepository, RecruiterSummary } from "@/domain/repositories";

export function getRecruiters(repository: ReadRepository, ownerId: string): RecruiterSummary[] {
  return repository.listRecruiters(ownerId);
}
