"use client";

import { useActionState } from "react";
import {
  type RelationshipActionState,
  submitRecruiterExclusion,
  submitRecruiterRestore,
  submitRelationshipStatus,
} from "@/app/actions/relationships";
import type { RelationshipStatus } from "@/domain/models";

const initialState: RelationshipActionState = { status: "idle", message: "" };

export function RelationshipControls({
  recruiterId,
  status,
  excluded,
}: {
  recruiterId: string;
  status: RelationshipStatus;
  excluded: boolean;
}) {
  const [statusState, statusAction, statusPending] = useActionState(
    submitRelationshipStatus,
    initialState,
  );
  const [exclusionState, exclusionAction, exclusionPending] = useActionState(
    excluded ? submitRecruiterRestore : submitRecruiterExclusion,
    initialState,
  );
  return (
    <div className="control-stack">
      <form action={statusAction} className="filter-form">
        <input type="hidden" name="recruiterId" value={recruiterId} />
        <label htmlFor="relationship-status">Relationship status</label>
        <select id="relationship-status" name="status" defaultValue={status ?? ""}>
          <option value="">Unset</option>
          <option value="active">Active</option>
          <option value="dormant">Dormant</option>
          <option value="do_not_contact">Do not contact</option>
        </select>
        <button type="submit" disabled={statusPending}>
          {statusPending ? "Saving status" : "Save status"}
        </button>
        <p
          className={statusState.status === "error" ? "form-message error" : "form-message"}
          aria-live="polite"
        >
          {statusState.message}
        </p>
      </form>
      <form action={exclusionAction} className="review-form">
        <input type="hidden" name="recruiterId" value={recruiterId} />
        <p>
          {excluded
            ? "Restoring returns this recruiter to lists with prior status and evidence."
            : "Excluding hides this recruiter from default views without deleting source data."}
        </p>
        <button className="secondary" type="submit" disabled={exclusionPending}>
          {exclusionPending ? "Saving" : excluded ? "Restore recruiter" : "Exclude recruiter"}
        </button>
        <p
          className={exclusionState.status === "error" ? "form-message error" : "form-message"}
          aria-live="polite"
        >
          {exclusionState.message}
        </p>
      </form>
    </div>
  );
}
