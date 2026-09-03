"use client";

import { useActionState } from "react";
import { type RelationshipActionState, submitRecruiterDeletion } from "@/app/actions/relationships";
import { DELETE_CONFIRMATION } from "@/application/delete-recruiter-data";

const initialState: RelationshipActionState = { status: "idle", message: "" };

export function DeleteRecruiterForm({
  recruiterId,
  recruiterName,
}: {
  recruiterId: string;
  recruiterName: string;
}) {
  const [state, action, pending] = useActionState(submitRecruiterDeletion, initialState);
  return (
    <form action={action} className="review-form">
      <input type="hidden" name="recruiterId" value={recruiterId} />
      <p>This permanently removes derived records for {recruiterName}. Source messages remain.</p>
      <label htmlFor="delete-confirmation">
        Type <strong>{DELETE_CONFIRMATION}</strong> to confirm
      </label>
      <input id="delete-confirmation" name="confirmation" type="text" autoComplete="off" required />
      <button className="danger" type="submit" disabled={pending}>
        {pending ? "Deleting recruiter data" : "Delete recruiter-derived data"}
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
