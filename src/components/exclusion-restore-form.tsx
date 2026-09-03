"use client";

import { useActionState } from "react";
import {
  type RelationshipActionState,
  submitIdentityExclusionRestore,
} from "@/app/actions/relationships";

const initialState: RelationshipActionState = { status: "idle", message: "" };

export function ExclusionRestoreForm({
  exclusionId,
  label,
}: {
  exclusionId: string;
  label: string;
}) {
  const [state, action, pending] = useActionState(submitIdentityExclusionRestore, initialState);
  return (
    <form action={action} className="review-form">
      <input type="hidden" name="exclusionId" value={exclusionId} />
      <span>{label}</span>
      <button className="secondary" type="submit" disabled={pending}>
        {pending ? "Restoring" : "Restore exclusion"}
      </button>
      <p
        className={state.status === "error" ? "form-message error" : "form-message"}
        aria-live="polite"
      >
        {state.message}
      </p>
    </form>
  );
}
