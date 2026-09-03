import type { ReadRepository, RecruiterDetail } from "@/domain/repositories";

export function getRecruiterDetail(
  repository: ReadRepository,
  ownerId: string,
  recruiterId: string,
  cursor?: string,
  direction?: "next" | "previous",
): RecruiterDetail | null {
  return repository.getRecruiter(ownerId, recruiterId, cursor, direction);
}
