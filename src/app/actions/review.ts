"use server";

import { revalidatePath } from "next/cache";
import { reviewAssertion } from "@/application/review-assertion";
import { repository, syntheticOwnerId } from "@/application/server";
import { ReviewConflictError } from "@/domain/reviews";

export interface ReviewActionState {
  status: "idle" | "success" | "error";
  message: string;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function submitReviewDecision(
  _previousState: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const assertionId = formData.get("assertionId");
  const decision = formData.get("decision");
  const revisionValue = formData.get("expectedRevision");
  const expectedRevision = Number(revisionValue);

  if (
    typeof assertionId !== "string" ||
    !uuidPattern.test(assertionId) ||
    (decision !== "confirmed" && decision !== "rejected") ||
    typeof revisionValue !== "string" ||
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0
  ) {
    return { status: "error", message: "The review request was invalid. Reload and try again." };
  }

  try {
    reviewAssertion(repository, {
      ownerId: syntheticOwnerId,
      assertionId,
      expectedRevision,
      decision,
    });
    revalidatePath("/");
    revalidatePath("/recruiters");
    revalidatePath("/review-queue");
    return {
      status: "success",
      message:
        decision === "confirmed"
          ? "Fact confirmed and history preserved."
          : "Fact rejected and source preserved.",
    };
  } catch (error) {
    if (error instanceof ReviewConflictError) return { status: "error", message: error.message };
    return { status: "error", message: "The decision could not be saved. Try again." };
  }
}
