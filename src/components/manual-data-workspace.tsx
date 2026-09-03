"use client";

import { type FormEvent, useState } from "react";

export function ManualDataWorkspace({
  recruiters,
  organizations,
}: {
  recruiters: Array<{ id: string; name: string }>;
  organizations: Array<{ id: string; name: string }>;
}) {
  const [status, setStatus] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("Saving…");
    const form = new FormData(event.currentTarget);
    const kind = String(form.get("kind"));
    const entity = Object.fromEntries(form.entries());
    const response = await fetch("/api/manual-assertions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "create", entity: { ...entity, kind } }),
    });
    const body = (await response.json()) as { error?: { code?: string } };
    if (!response.ok) {
      setStatus(
        body.error?.code === "revision_conflict"
          ? "This record changed. Reload and retry."
          : "Check the highlighted values and retry.",
      );
      return;
    }
    event.currentTarget.reset();
    setStatus("Saved locally.");
  };

  return (
    <section className="panel stack" aria-labelledby="manual-data-title">
      <div>
        <p className="eyebrow">Candidate-owned facts</p>
        <h2 id="manual-data-title">Add manual data</h2>
        <p>Manual facts take priority over imported suggestions and keep their history.</p>
      </div>
      <form className="stack" onSubmit={submit}>
        <label>
          Record type
          <select name="kind" required>
            <option value="recruiter">Recruiter</option>
            <option value="organization">Organization</option>
            <option value="opportunity">Opportunity</option>
          </select>
        </label>
        <label>
          Name or opportunity title
          <input name="name" maxLength={300} />
        </label>
        <label>
          Recruiter email
          <input name="email" type="email" maxLength={320} />
        </label>
        <label>
          Recruiter for opportunity
          <select name="recruiterId">
            <option value="">Select recruiter</option>
            {recruiters.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Staffing company
          <select name="staffingOrganizationId">
            <option value="">Select company</option>
            {organizations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Introduced date
          <input name="introducedAt" type="date" />
        </label>
        <button className="button" type="submit">
          Save manual record
        </button>
        <p role="status" aria-live="polite">
          {status}
        </p>
      </form>
    </section>
  );
}
