import { describe, expect, it } from "vitest";
import {
  classifyDirection,
  classifyMessage,
  normalizeClassificationEmail,
} from "@/classification/engine";
import {
  CLASSIFICATION_RULESET_SHA256,
  SIGNAL_EXPLANATIONS,
  SIGNAL_WEIGHTS,
} from "@/classification/rules";
import { classificationCorpus, ownerEmails } from "@/test/fixtures/classification-corpus";

function proposals() {
  return classificationCorpus.map((item) => ({
    ...item,
    proposals: classifyMessage(item.message, ownerEmails),
  }));
}

describe("classification engine", () => {
  it("meets the frozen recruiter precision and recall thresholds", () => {
    const results = proposals();
    const positives = results.filter(({ proposals }) =>
      proposals.some(({ proposalType }) => proposalType === "recruiter_identity"),
    );
    const truePositives = positives.filter(({ recruiter }) => recruiter).length;
    const precision = truePositives / positives.length;
    const recall = truePositives / results.filter(({ recruiter }) => recruiter).length;

    expect(precision).toBeGreaterThanOrEqual(0.95);
    expect(recall).toBeGreaterThanOrEqual(0.8);
  });

  it("never infers identity links from equal names", () => {
    const alex = proposals().filter(({ message }) => message.sender[0]?.name === "Alex Kim");
    expect(
      alex
        .flatMap(({ proposals }) => proposals)
        .filter(({ proposalType }) => proposalType === "identity_link"),
    ).toEqual([]);
  });

  it("only proposes explicit submissions and always requires review", () => {
    const submissionResults = proposals().flatMap(({ submission, proposals }) =>
      proposals
        .filter(({ proposalType }) => proposalType === "submission")
        .map((proposal) => ({ proposal, submission })),
    );
    expect(submissionResults).toHaveLength(1);
    expect(submissionResults[0]?.submission).toBe(true);
    expect(submissionResults[0]?.proposal.reviewRequirement).toBe("user_review");
    expect(submissionResults[0]?.proposal.proposedValue).toMatchObject({ client: "Sample Labs" });
    const organization = proposals()
      .flatMap(({ proposals }) => proposals)
      .find(({ proposalType }) => proposalType === "organization_affiliation");
    expect(organization?.proposedValue).toMatchObject({ organization: "Agency Group" });
  });

  it("keeps unknown direction when ownership is ambiguous", () => {
    const ownedAddress = { address: "candidate@example.test" };
    expect(classifyDirection({ sender: [], recipients: [] }, ownerEmails)).toBe("unknown");
    expect(
      classifyDirection({ sender: [ownedAddress], recipients: [ownedAddress] }, ownerEmails),
    ).toBe("unknown");
  });

  it("normalizes IDNA addresses and rejects malformed input", () => {
    expect(normalizeClassificationEmail("Recruiter@BÜCHER.example")).toBe(
      "recruiter@xn--bcher-kva.example",
    );
    expect(normalizeClassificationEmail("not an address")).toBeNull();
  });

  it("produces stable bounded explainable output without outcomes", () => {
    const first = JSON.stringify(proposals().flatMap(({ proposals }) => proposals));
    const second = JSON.stringify(proposals().flatMap(({ proposals }) => proposals));
    expect(second).toBe(first);
    expect(first).not.toContain("rejected");
    expect(CLASSIFICATION_RULESET_SHA256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.keys(SIGNAL_WEIGHTS).sort()).toEqual(Object.keys(SIGNAL_EXPLANATIONS).sort());
    for (const result of proposals()) {
      for (const proposal of result.proposals) {
        expect(proposal.confidenceBasisPoints).toBeGreaterThanOrEqual(0);
        expect(proposal.confidenceBasisPoints).toBeLessThanOrEqual(10000);
        for (const evidence of proposal.evidence)
          expect(evidence.excerpt.length).toBeLessThanOrEqual(280);
      }
    }
  });
});
