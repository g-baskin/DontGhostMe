import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClassificationWorkspace } from "@/components/classification-workspace";
import type {
  ClassificationProposal,
  ClassificationRun,
  OwnerEmailIdentity,
} from "@/domain/classification";

const proposal: ClassificationProposal = {
  id: "proposal-1",
  ownerId: "owner-1",
  runId: "run-1",
  proposalKey: "key-1",
  proposalType: "submission",
  proposedValue: {
    client: "Sample Labs",
    messageId: "message-1",
    recruiterEmail: "jane@agency.example",
    submittedAt: "2026-01-01T00:00:00.000Z",
  },
  confidenceBasisPoints: 7200,
  reviewRequirement: "user_review",
  state: "proposed",
  supersedesProposalId: null,
  promotedEntityKind: null,
  promotedEntityId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  revision: 0,
  evidence: [
    {
      normalizedMessageId: "message-1",
      signalCode: "explicit_submission",
      contributionBasisPoints: 6000,
      excerpt: "I submitted your profile to Sample Labs.",
      excerptStart: 0,
      excerptEnd: 40,
      sourceLabel: "fixture.mbox",
      sourceDate: "2026-01-01T00:00:00.000Z",
    },
  ],
};

const identity: OwnerEmailIdentity = {
  id: "identity-1",
  ownerId: "owner-1",
  normalizedEmail: "candidate@example.test",
  displayEmail: "candidate@example.test",
  confirmedAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const run: ClassificationRun = {
  id: "run-1",
  ownerId: "owner-1",
  engineVersion: "m2-rules-v1",
  rulesetSha256: "a".repeat(64),
  sourceSetSha256: "b".repeat(64),
  status: "running",
  processedCount: 2,
  proposalCount: 4,
  checkpointMessageId: "message-2",
  errorCode: null,
  startedAt: "2026-01-01T00:00:00.000Z",
  completedAt: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("ClassificationWorkspace", () => {
  it("requires a confirmed owner address before classification", () => {
    render(
      <ClassificationWorkspace initialIdentities={[]} initialRuns={[]} initialProposals={[]} />,
    );
    expect(screen.getByRole("button", { name: "Classify imported messages" })).toBeDisabled();
    expect(screen.getByLabelText("Email address")).toHaveAttribute("type", "email");
  });

  it("shows explainable evidence and explicit review controls", () => {
    render(
      <ClassificationWorkspace
        initialIdentities={[]}
        initialRuns={[]}
        initialProposals={[proposal]}
      />,
    );
    expect(screen.getByText("submission")).toBeVisible();
    expect(screen.getByText("Confidence: 72%")).toBeVisible();
    expect(screen.getByRole("button", { name: "Accept" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Reject" })).toBeVisible();
    const evidenceSummary = screen.getByText("Why this was proposed");
    expect(evidenceSummary).toBeVisible();
    fireEvent.click(evidenceSummary);
    expect(screen.getByText(/Source: fixture\.mbox/)).toBeVisible();
    expect(screen.getByText("Correct proposed value")).toBeVisible();
  });

  it("renders interrupted, failed, and completed run controls", () => {
    const view = render(
      <ClassificationWorkspace
        key="running"
        initialIdentities={[identity]}
        initialRuns={[run]}
        initialProposals={[]}
      />,
    );
    expect(
      within(view.container).getByRole("button", { name: "Resume classification" }),
    ).toBeEnabled();
    expect(within(view.container).getByText(/interrupted or unfinished/)).toBeVisible();

    view.rerender(
      <ClassificationWorkspace
        key="failed"
        initialIdentities={[identity]}
        initialRuns={[{ ...run, status: "failed", errorCode: "classification_failed" }]}
        initialProposals={[]}
      />,
    );
    expect(
      within(view.container).getByRole("button", { name: "Retry classification" }),
    ).toBeEnabled();
    expect(within(view.container).getByText(/redacted error/)).toBeVisible();

    view.rerender(
      <ClassificationWorkspace
        key="completed"
        initialIdentities={[identity]}
        initialRuns={[{ ...run, status: "completed" }]}
        initialProposals={[]}
      />,
    );
    expect(
      within(view.container).getByRole("button", { name: "Classify imported messages" }),
    ).toBeEnabled();
    expect(within(view.container).getByText("Classification is complete.")).toBeVisible();
  });
});
