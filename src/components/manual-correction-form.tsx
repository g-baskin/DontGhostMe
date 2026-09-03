"use client";

import { type FormEvent, useState } from "react";

export function ManualCorrectionForm({
  entityId,
  entityKind,
  fieldName,
  label,
  currentValue,
  fallbackValue,
  revision = 0,
  assertionId,
}: {
  entityId: string;
  entityKind: string;
  fieldName: string;
  label: string;
  currentValue: string;
  fallbackValue?: string | null;
  revision?: number;
  assertionId?: string;
}) {
  const [status, setStatus] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("Saving…");
    const value = String(new FormData(event.currentTarget).get("value") ?? "");
    const response = await fetch("/api/manual-assertions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "correct",
        entityId,
        expectedRevision: revision,
        field: { entityKind, fieldName, value },
      }),
    });
    setStatus(
      response.ok ? "Saved. Reload to see the effective value." : "Not saved. Reload and retry.",
    );
  };
  const retract = async () => {
    if (
      !assertionId ||
      !window.confirm(
        `Remove this correction? The value will return to ${fallbackValue ?? currentValue}.`,
      )
    )
      return;
    setStatus("Removing…");
    const response = await fetch(`/api/manual-assertions/${assertionId}/retract`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedRevision: revision }),
    });
    setStatus(
      response.ok
        ? "Correction removed. Reload to see the fallback."
        : "Not removed. Reload and retry.",
    );
  };
  return (
    <form className="stack" onSubmit={submit}>
      <label>
        {label}
        <input name="value" defaultValue={currentValue} required maxLength={300} />
      </label>
      <p className="source-note">
        Source: {revision ? "Manual" : "Machine"}. Retraction falls back to{" "}
        {fallbackValue ?? currentValue}.
      </p>
      <button className="button" type="submit">
        Save correction
      </button>
      {assertionId ? (
        <button className="button button-danger" type="button" onClick={retract}>
          Retract manual correction
        </button>
      ) : null}
      <p role="status" aria-live="polite">
        {status}
      </p>
    </form>
  );
}
