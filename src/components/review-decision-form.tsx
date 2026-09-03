"use client";

import { useActionState } from "react";
import { type ReviewActionState, submitReviewDecision } from "@/app/actions/review";

const initialState: ReviewActionState = { status: "idle", message: "" };

export function ReviewDecisionForm({
  assertionId,
  revision,
}: {
  assertionId: string;
  revision: number;
}) {
  const [state, action, pending] = useActionState(submitReviewDecision, initialState);
  return (
    <form action={action} className="review-form">
      <input type="hidden" name="assertionId" value={assertionId} />
      <input type="hidden" name="expectedRevision" value={revision} />
      <div className="button-row">
        <button name="decision" value="confirmed" type="submit" disabled={pending}>
          {pending ? "Saving decision" : "Confirm fact"}
        </button>
        <button
          className="secondary"
          name="decision"
          value="rejected"
          type="submit"
          disabled={pending}
        >
          Reject fact
        </button>
      </div>
      <p
        className={state.status === "error" ? "form-message error" : "form-message"}
        aria-live="polite"
      >
        {state.message}
      </p>
    </form>
  );
}
