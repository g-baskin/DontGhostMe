"use client";

import { useActionState } from "react";
import { type RelationshipActionState, submitDomainExclusion } from "@/app/actions/relationships";

const initialState: RelationshipActionState = { status: "idle", message: "" };

export function DomainExclusionForm() {
  const [state, action, pending] = useActionState(submitDomainExclusion, initialState);
  return (
    <form action={action} className="filter-form">
      <label htmlFor="excluded-domain">Sender domain</label>
      <input
        id="excluded-domain"
        name="domain"
        type="text"
        inputMode="url"
        required
        aria-describedby="domain-help"
      />
      <p id="domain-help" className="source-note">
        Example: staffing.example. Messages stay in local source records.
      </p>
      <label htmlFor="exclusion-reason">Reason (optional)</label>
      <textarea id="exclusion-reason" name="reason" maxLength={280} rows={2} />
      <button type="submit" disabled={pending}>
        {pending ? "Excluding domain" : "Exclude domain"}
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
