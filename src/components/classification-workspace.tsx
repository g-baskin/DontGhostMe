"use client";

import { useState } from "react";
import { SIGNAL_EXPLANATIONS } from "@/classification/rules";
import type {
  ClassificationProposal,
  ClassificationProposalType,
  ClassificationRun,
  ClassificationState,
  OwnerEmailIdentity,
} from "@/domain/classification";

interface Props {
  initialIdentities: OwnerEmailIdentity[];
  initialProposals: ClassificationProposal[];
  initialRuns: ClassificationRun[];
}

export function ClassificationWorkspace({
  initialIdentities,
  initialProposals,
  initialRuns,
}: Props) {
  const [identities, setIdentities] = useState(initialIdentities);
  const [proposals, setProposals] = useState(initialProposals);
  const [runs, setRuns] = useState(initialRuns);
  const [email, setEmail] = useState("");
  const [type, setType] = useState<ClassificationProposalType | "">("");
  const [state, setState] = useState<ClassificationState | "">("proposed");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function addIdentity(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await request<{ identity: OwnerEmailIdentity }>(
        "/api/classification/identities",
        {
          method: "POST",
          body: JSON.stringify({ email }),
        },
      );
      setIdentities((current) => [
        ...current.filter((item) => item.id !== response.identity.id),
        response.identity,
      ]);
      setEmail("");
      setMessage("Confirmed address saved.");
    } catch (error) {
      setMessage(readError(error));
    } finally {
      setBusy(false);
    }
  }

  async function removeIdentity(identityId: string) {
    setBusy(true);
    try {
      const response = await request<{ identities: OwnerEmailIdentity[] }>(
        `/api/classification/identities/${identityId}`,
        {
          method: "DELETE",
        },
      );
      setIdentities(response.identities);
      setMessage("Confirmed address removed. Reprocess before relying on direction.");
    } catch (error) {
      setMessage(readError(error));
    } finally {
      setBusy(false);
    }
  }

  async function runClassification() {
    setBusy(true);
    setMessage("Classifying locally. Nothing leaves this device.");
    try {
      const unfinished =
        runs[0]?.status === "running" || runs[0]?.status === "failed" ? runs[0] : null;
      const started = unfinished
        ? unfinished.status === "failed"
          ? await request<{ run: ClassificationRun }>(
              `/api/classification/runs/${unfinished.id}/resume`,
              { method: "POST" },
            )
          : { run: unfinished }
        : await request<{ run: ClassificationRun }>("/api/classification/runs", {
            method: "POST",
          });
      let run = started.run;
      while (run.status === "running") {
        const next = await request<{ run: ClassificationRun }>(
          `/api/classification/runs/${run.id}/process`,
          { method: "POST" },
        );
        run = next.run;
      }
      setRuns((current) => [run, ...current.filter((item) => item.id !== run.id)]);
      await refreshProposals();
      setMessage(`Classification completed with ${run.proposalCount} proposals.`);
    } catch (error) {
      setMessage(readError(error));
    } finally {
      setBusy(false);
    }
  }

  async function refreshProposals(nextType = type, nextState = state) {
    const parameters = new URLSearchParams();
    if (nextType) parameters.set("type", nextType);
    if (nextState) parameters.set("state", nextState);
    const response = await request<{ proposals: ClassificationProposal[] }>(
      `/api/classification/proposals?${parameters}`,
    );
    setProposals(response.proposals);
  }

  async function decide(
    proposal: ClassificationProposal,
    decision: "accepted" | "rejected" | "corrected" | "merge" | "split",
    correctedValue?: unknown,
  ) {
    if (
      ["merge", "split"].includes(decision) &&
      !window.confirm("This changes which addresses belong to one recruiter. Continue?")
    )
      return;
    if (
      proposal.proposalType === "submission" &&
      decision !== "rejected" &&
      !window.confirm(
        "Confirm explicit submission evidence. Consent, resume requests, and scheduling are not proof.",
      )
    )
      return;
    if (
      ["opportunity", "conversation_group"].includes(proposal.proposalType) &&
      decision !== "rejected" &&
      !window.confirm("Confirm this grouping. Similar subjects alone do not prove one opportunity.")
    )
      return;
    setBusy(true);
    try {
      const action = decision === "merge" || decision === "split" ? decision : "decide";
      await request(`/api/classification/proposals/${proposal.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({
          ...(action === "decide" ? { decision } : {}),
          expectedRevision: proposal.revision,
          ...(correctedValue === undefined ? {} : { correctedValue }),
        }),
      });
      await refreshProposals();
      setMessage("Decision saved with its evidence history.");
    } catch (error) {
      setMessage(readError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <section className="panel" aria-labelledby="mailbox-owner-heading">
        <h2 id="mailbox-owner-heading">Your confirmed mailbox addresses</h2>
        <p>
          Direction stays unknown until an address is confirmed. Add every alias used in this
          import.
        </p>
        <form className="review-form" onSubmit={addIdentity}>
          <label htmlFor="owner-email">Email address</label>
          <input
            id="owner-email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <button type="submit" disabled={busy}>
            Confirm this address
          </button>
        </form>
        {identities.length === 0 ? (
          <p className="empty-state">No confirmed addresses yet.</p>
        ) : (
          <ul className="record-list">
            {identities.map((identity) => (
              <li className="record" key={identity.id}>
                <strong>{identity.displayEmail}</strong>
                <button
                  className="secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => removeIdentity(identity.id)}
                >
                  Remove address
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel" aria-labelledby="classification-heading">
        <h2 id="classification-heading">Local classification</h2>
        <p>
          Rules propose facts for review. Confidence ranks evidence; it never makes a fact true.
        </p>
        <button
          type="button"
          disabled={busy || identities.length === 0}
          onClick={runClassification}
        >
          {busy
            ? "Working locally…"
            : runs[0]?.status === "failed"
              ? "Retry classification"
              : runs[0]?.status === "running"
                ? "Resume classification"
                : "Classify imported messages"}
        </button>
        <p className="form-message" aria-live="polite">
          {message}
        </p>
        {runs[0] ? (
          <div aria-live="polite">
            <p>
              Latest run: <strong>{runs[0].status}</strong> · {runs[0].processedCount} messages
            </p>
            {runs[0].status === "running" && !busy ? (
              <p>An interrupted or unfinished run is ready to resume.</p>
            ) : null}
            {runs[0].status === "failed" ? (
              <p>Classification stopped with a redacted error.</p>
            ) : null}
            {runs[0].status === "completed" ? <p>Classification is complete.</p> : null}
          </div>
        ) : null}
      </section>

      <section className="panel" aria-labelledby="proposals-heading">
        <h2 id="proposals-heading">Classification proposals</h2>
        <div className="button-row">
          <label>
            Type{" "}
            <select
              value={type}
              onChange={(event) => {
                const value = event.target.value as ClassificationProposalType | "";
                setType(value);
                void refreshProposals(value, state);
              }}
            >
              <option value="">All</option>
              <option value="recruiter_identity">Recruiters</option>
              <option value="organization_affiliation">Organizations</option>
              <option value="opportunity">Opportunities</option>
              <option value="conversation_group">Conversations</option>
              <option value="submission">Submissions</option>
              <option value="identity_link">Identity links</option>
              <option value="message_direction">Direction</option>
            </select>
          </label>
          <label>
            State{" "}
            <select
              value={state}
              onChange={(event) => {
                const value = event.target.value as ClassificationState | "";
                setState(value);
                void refreshProposals(type, value);
              }}
            >
              <option value="">All</option>
              <option value="proposed">Needs review</option>
              <option value="accepted">Accepted</option>
              <option value="corrected">Corrected</option>
              <option value="rejected">Rejected</option>
              <option value="superseded">Superseded</option>
            </select>
          </label>
        </div>
        {proposals.length === 0 ? (
          <p className="empty-state">No proposals match these filters.</p>
        ) : (
          <ul className="record-list">
            {proposals.map((proposal) => (
              <ProposalCard key={proposal.id} proposal={proposal} busy={busy} onDecide={decide} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ProposalCard({
  proposal,
  busy,
  onDecide,
}: {
  proposal: ClassificationProposal;
  busy: boolean;
  onDecide: (
    proposal: ClassificationProposal,
    decision: "accepted" | "rejected" | "corrected" | "merge" | "split",
    correctedValue?: unknown,
  ) => Promise<void>;
}) {
  const [correction, setCorrection] = useState(JSON.stringify(proposal.proposedValue, null, 2));
  const [correctionError, setCorrectionError] = useState("");
  return (
    <li className="record">
      <div className="timeline-heading">
        <h3>{proposal.proposalType.replaceAll("_", " ")}</h3>
        <span className="status-label">{proposal.state}</span>
      </div>
      <pre className="proposal-value">{JSON.stringify(proposal.proposedValue, null, 2)}</pre>
      <label>
        Confidence: {Math.round(proposal.confidenceBasisPoints / 100)}%
        <meter min="0" max="10000" value={proposal.confidenceBasisPoints}>
          {proposal.confidenceBasisPoints}
        </meter>
      </label>
      <details>
        <summary>Why this was proposed</summary>
        {proposal.evidence.map((item) => (
          <div
            className="evidence-box"
            key={`${item.normalizedMessageId}-${item.signalCode}-${item.excerptStart}-${item.excerptEnd}`}
          >
            <strong>{SIGNAL_EXPLANATIONS[item.signalCode]}</strong>
            <p>
              Source: {item.sourceLabel ?? "Imported message"}
              {item.sourceDate ? ` · ${new Date(item.sourceDate).toLocaleDateString()}` : ""}
            </p>
            <blockquote>{item.excerpt || "Header evidence only"}</blockquote>
          </div>
        ))}
      </details>
      {proposal.state === "proposed" ? (
        <>
          <div className="button-row">
            <button type="button" disabled={busy} onClick={() => onDecide(proposal, "accepted")}>
              Accept
            </button>
            <button
              className="secondary"
              type="button"
              disabled={busy}
              onClick={() => onDecide(proposal, "rejected")}
            >
              Reject
            </button>
            {proposal.proposalType === "identity_link" ? (
              <>
                <button
                  className="secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => onDecide(proposal, "merge")}
                >
                  Merge identities
                </button>
                <button
                  className="secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => onDecide(proposal, "split")}
                >
                  Keep separate
                </button>
              </>
            ) : null}
          </div>
          <details>
            <summary>Correct proposed value</summary>
            <form
              className="review-form"
              onSubmit={(event) => {
                event.preventDefault();
                try {
                  const correctedValue: unknown = JSON.parse(correction);
                  setCorrectionError("");
                  void onDecide(proposal, "corrected", correctedValue);
                } catch {
                  setCorrectionError("Correction must be valid JSON.");
                }
              }}
            >
              <label htmlFor={`correction-${proposal.id}`}>Corrected value</label>
              <textarea
                id={`correction-${proposal.id}`}
                rows={6}
                maxLength={16384}
                value={correction}
                onChange={(event) => setCorrection(event.target.value)}
              />
              <button type="submit" disabled={busy}>
                Save correction
              </button>
              <p className="form-message error" aria-live="polite">
                {correctionError}
              </p>
            </form>
          </details>
        </>
      ) : null}
    </li>
  );
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = (await response.json()) as T & { error?: { code?: string } };
  if (!response.ok) throw new Error(body.error?.code ?? "classification_request_failed");
  return body;
}

function readError(error: unknown) {
  return error instanceof Error
    ? error.message.replaceAll("_", " ")
    : "classification request failed";
}
