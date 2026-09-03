import { domainToASCII } from "node:url";
import type { RelationshipRepository } from "@/domain/repositories";

export function normalizeExcludedDomain(value: string): string | null {
  const domain = domainToASCII(value.trim().toLocaleLowerCase("en-US").replace(/^@/, ""));
  if (!domain || domain.length > 253 || !domain.includes(".") || /[^a-z0-9.-]/.test(domain))
    return null;
  return domain;
}

export function excludeIdentityDomain(
  repository: RelationshipRepository,
  input: { ownerId: string; domain: string; reason?: string; now: string },
): void {
  const domain = normalizeExcludedDomain(input.domain);
  if (!domain) throw new Error("Invalid domain");
  repository.excludeDomain(input.ownerId, domain, input.reason?.trim() || null, input.now);
}
