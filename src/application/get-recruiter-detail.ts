import type { ReadRepository, RecruiterDetail } from "@/domain/repositories";

export function getRecruiterDetail(
  repository: ReadRepository,
  ownerId: string,
  recruiterId: string,
): RecruiterDetail | null {
  return repository.getRecruiter(ownerId, recruiterId);
}
