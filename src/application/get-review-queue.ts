import type { ReviewItem } from "@/domain/models";
import type { ReadRepository } from "@/domain/repositories";

export function getReviewQueue(repository: ReadRepository, ownerId: string): ReviewItem[] {
  return repository.listReviewItems(ownerId);
}
