import type { ReadRepository, RecruiterDetail } from "@/domain/repositories";

export function getHome(repository: ReadRepository, ownerId: string): RecruiterDetail {
  return repository.getHome(ownerId);
}
