import { describe, expect, it, vi } from "vitest";
import { DELETE_CONFIRMATION, deleteRecruiterData } from "@/application/delete-recruiter-data";
import {
  excludeIdentityDomain,
  normalizeExcludedDomain,
} from "@/application/exclude-identity-domain";
import { setRelationshipStatus } from "@/application/set-relationship-status";
import type { RelationshipRepository } from "@/domain/repositories";

const repository = (): RelationshipRepository => ({
  setRelationshipStatus: vi.fn(),
  excludeRecruiter: vi.fn(),
  restoreRecruiter: vi.fn(),
  excludeIdentity: vi.fn(),
  excludeDomain: vi.fn(),
  restoreIdentityExclusion: vi.fn(),
  deleteRecruiterData: vi.fn(),
});

describe("M3 relationship services", () => {
  it("normalizes IDNA domains", () => {
    expect(normalizeExcludedDomain(" @BÜCHER.example ")).toBe("xn--bcher-kva.example");
    expect(normalizeExcludedDomain("invalid")).toBeNull();
  });

  it("passes owner scope to status and exclusions", () => {
    const target = repository();
    setRelationshipStatus(target, {
      ownerId: "owner",
      recruiterId: "recruiter",
      status: "active",
      now: "now",
    });
    excludeIdentityDomain(target, { ownerId: "owner", domain: "EXAMPLE.COM", now: "now" });
    expect(target.setRelationshipStatus).toHaveBeenCalledWith(
      "owner",
      "recruiter",
      "active",
      "now",
    );
    expect(target.excludeDomain).toHaveBeenCalledWith("owner", "example.com", null, "now");
  });

  it("requires exact deletion confirmation before writing", () => {
    const target = repository();
    expect(() =>
      deleteRecruiterData(target, {
        ownerId: "owner",
        recruiterId: "recruiter",
        confirmation: "delete",
        now: "now",
      }),
    ).toThrow("confirmation");
    expect(target.deleteRecruiterData).not.toHaveBeenCalled();
    deleteRecruiterData(target, {
      ownerId: "owner",
      recruiterId: "recruiter",
      confirmation: DELETE_CONFIRMATION,
      now: "now",
    });
    expect(target.deleteRecruiterData).toHaveBeenCalledOnce();
  });
});
