"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DELETE_CONFIRMATION, deleteRecruiterData } from "@/application/delete-recruiter-data";
import {
  excludeIdentityDomain,
  normalizeExcludedDomain,
} from "@/application/exclude-identity-domain";
import { excludeRecruiter } from "@/application/exclude-recruiter";
import { restoreRecruiter } from "@/application/restore-recruiter";
import { repository, syntheticOwnerId } from "@/application/server";
import { setRelationshipStatus } from "@/application/set-relationship-status";
import type { RelationshipStatus } from "@/domain/models";

export interface RelationshipActionState {
  status: "idle" | "success" | "error";
  message: string;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses = new Set<RelationshipStatus>(["active", "dormant", "do_not_contact", null]);
const safeError = (
  message = "The change could not be saved. Try again.",
): RelationshipActionState => ({ status: "error", message });

function refreshRelationships(recruiterId?: string): void {
  revalidatePath("/");
  revalidatePath("/recruiters");
  if (recruiterId) revalidatePath(`/recruiters/${recruiterId}`);
  revalidatePath("/opportunities");
  revalidatePath("/data-privacy");
}

function recruiterIdFrom(formData: FormData): string | null {
  const value = formData.get("recruiterId");
  return typeof value === "string" && uuidPattern.test(value) ? value : null;
}

export async function submitRelationshipStatus(
  _state: RelationshipActionState,
  formData: FormData,
): Promise<RelationshipActionState> {
  const recruiterId = recruiterIdFrom(formData);
  const rawStatus = formData.get("status");
  const status = rawStatus === "" ? null : rawStatus;
  if (!recruiterId || !statuses.has(status as RelationshipStatus))
    return safeError("The relationship status was invalid. Reload and try again.");
  try {
    setRelationshipStatus(repository, {
      ownerId: syntheticOwnerId,
      recruiterId,
      status: status as RelationshipStatus,
      now: new Date().toISOString(),
    });
    refreshRelationships(recruiterId);
    return { status: "success", message: "Relationship status saved." };
  } catch {
    return safeError();
  }
}

export async function submitRecruiterExclusion(
  _state: RelationshipActionState,
  formData: FormData,
): Promise<RelationshipActionState> {
  const recruiterId = recruiterIdFrom(formData);
  if (!recruiterId) return safeError("The recruiter request was invalid. Reload and try again.");
  try {
    excludeRecruiter(repository, {
      ownerId: syntheticOwnerId,
      recruiterId,
      now: new Date().toISOString(),
    });
    refreshRelationships(recruiterId);
    return {
      status: "success",
      message: "Recruiter excluded from product views. Source data remains.",
    };
  } catch {
    return safeError();
  }
}

export async function submitRecruiterRestore(
  _state: RelationshipActionState,
  formData: FormData,
): Promise<RelationshipActionState> {
  const recruiterId = recruiterIdFrom(formData);
  if (!recruiterId) return safeError("The recruiter request was invalid. Reload and try again.");
  try {
    restoreRecruiter(repository, {
      ownerId: syntheticOwnerId,
      recruiterId,
      now: new Date().toISOString(),
    });
    refreshRelationships(recruiterId);
    return { status: "success", message: "Recruiter restored with prior status and evidence." };
  } catch {
    return safeError();
  }
}

export async function submitDomainExclusion(
  _state: RelationshipActionState,
  formData: FormData,
): Promise<RelationshipActionState> {
  const domain = formData.get("domain");
  const reason = formData.get("reason");
  if (
    typeof domain !== "string" ||
    !normalizeExcludedDomain(domain) ||
    (typeof reason === "string" && reason.length > 280)
  )
    return safeError("Enter a valid domain and a reason under 280 characters.");
  try {
    excludeIdentityDomain(repository, {
      ownerId: syntheticOwnerId,
      domain,
      reason: typeof reason === "string" ? reason : undefined,
      now: new Date().toISOString(),
    });
    refreshRelationships();
    return { status: "success", message: "Domain excluded from product views." };
  } catch {
    return safeError();
  }
}

export async function submitIdentityExclusionRestore(
  _state: RelationshipActionState,
  formData: FormData,
): Promise<RelationshipActionState> {
  const exclusionId = formData.get("exclusionId");
  if (typeof exclusionId !== "string" || !uuidPattern.test(exclusionId))
    return safeError("The exclusion request was invalid. Reload and try again.");
  try {
    repository.restoreIdentityExclusion(syntheticOwnerId, exclusionId);
    refreshRelationships();
    return { status: "success", message: "Sender or domain exclusion restored." };
  } catch {
    return safeError();
  }
}

export async function submitRecruiterDeletion(
  _state: RelationshipActionState,
  formData: FormData,
): Promise<RelationshipActionState> {
  const recruiterId = recruiterIdFrom(formData);
  const confirmation = formData.get("confirmation");
  if (!recruiterId || confirmation !== DELETE_CONFIRMATION)
    return safeError(`Type ${DELETE_CONFIRMATION} exactly to confirm.`);
  try {
    deleteRecruiterData(repository, {
      ownerId: syntheticOwnerId,
      recruiterId,
      confirmation,
      now: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("active import"))
      return safeError(error.message);
    return safeError("Recruiter data could not be deleted. No partial deletion was kept.");
  }
  refreshRelationships();
  redirect("/data-privacy?deleted=1");
}
