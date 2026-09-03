import { describe, expect, it } from "vitest";
import { classifyMessage } from "@/classification/engine";
import { linkedinNotificationProposals } from "@/classification/linkedin-notifications";
import type { ClassificationMessage } from "@/domain/classification";

function message(overrides: Partial<ClassificationMessage> = {}): ClassificationMessage {
  return {
    id: "message-1",
    subject: "You have a new invitation",
    sender: [{ address: "invitation@linkedin.com", name: "LinkedIn" }],
    recipients: [{ address: "you@example.test", name: "" }],
    replyTo: [],
    normalizedMessageId: "<1@linkedin.example>",
    references: [],
    safeText: "Ada Lovelace invited you to connect on LinkedIn.",
    textTruncated: false,
    warningCodes: [],
    sentAt: "2026-09-01T10:00:00.000Z",
    ...overrides,
  } as ClassificationMessage;
}

describe("LinkedIn notification recognizers", () => {
  it("produces no proposal for a spoofed sender without structure evidence", () => {
    const spoof = message({
      subject: "Quarterly invoice",
      safeText: "Please review your quarterly invoice attachment.",
      warningCodes: [],
    });
    expect(linkedinNotificationProposals(spoof)).toEqual([]);
    const all = classifyMessage(spoof, new Set(["you@example.test"]));
    expect(all.filter((proposal) => proposal.proposalType === "linkedin_notification")).toEqual([]);
  });

  it("produces review-required, bounded, source-linked proposals for valid structure", () => {
    const proposals = linkedinNotificationProposals(message());
    expect(proposals).toHaveLength(1);
    const [proposal] = proposals;
    if (!proposal) throw new Error("missing proposal");
    expect(proposal.proposalType).toBe("linkedin_notification");
    expect(proposal.reviewRequirement).toBe("user_review");
    expect(proposal.proposedValue).toMatchObject({
      eventKind: "invitation",
      messageId: "message-1",
    });
    expect(proposal.evidence.every((row) => row.excerpt.length <= 280)).toBe(true);
    expect(proposal.evidence.every((row) => row.normalizedMessageId === "message-1")).toBe(true);
  });

  it("requires the deterministic sender domain even when structure matches", () => {
    const lookalike = message({
      sender: [{ address: "invitation@linkedin.example.test", name: "Lookalike" }],
    });
    expect(linkedinNotificationProposals(lookalike)).toEqual([]);
  });

  it("recognizes application and job update structures with distinct event kinds", () => {
    const application = linkedinNotificationProposals(
      message({
        subject: "Your application to Example Corp has been updated",
        safeText: "Your application status has been updated.",
      }),
    );
    expect(
      application.map((proposal) => (proposal.proposedValue as { eventKind: string }).eventKind),
    ).toEqual(["application_update"]);
    const job = linkedinNotificationProposals(
      message({
        subject: "Your job alert",
        safeText: "New jobs matching your profile.",
      }),
    );
    expect(
      job.map((proposal) => (proposal.proposedValue as { eventKind: string }).eventKind),
    ).toEqual(["job_update"]);
  });
});
