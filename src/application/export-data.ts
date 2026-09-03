import type { PortableExport, ReadRepository } from "@/domain/repositories";

export function exportData(
  repository: ReadRepository,
  ownerId: string,
  now: () => Date = () => new Date(),
): PortableExport {
  return repository.exportData(ownerId, now().toISOString());
}
