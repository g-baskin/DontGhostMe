import { createHash } from "node:crypto";
import type { SyntheticMessage } from "@/test/fixtures/jane-conversation";

const ids = {
  owner: "00000000-0000-4000-8000-000000000001",
  recruiter: "00000000-0000-4000-8000-000000000010",
  oldIdentity: "00000000-0000-4000-8000-000000000011",
  newIdentity: "00000000-0000-4000-8000-000000000012",
  oldAgency: "00000000-0000-4000-8000-000000000020",
  newAgency: "00000000-0000-4000-8000-000000000021",
  exampleCo: "00000000-0000-4000-8000-000000000022",
  sampleLabs: "00000000-0000-4000-8000-000000000023",
  oldAffiliation: "00000000-0000-4000-8000-000000000030",
  newAffiliation: "00000000-0000-4000-8000-000000000031",
  opportunityA: "00000000-0000-4000-8000-000000000040",
  opportunityB: "00000000-0000-4000-8000-000000000041",
  submission: "00000000-0000-4000-8000-000000000050",
  conversationA: "00000000-0000-4000-8000-000000000060",
  conversationB: "00000000-0000-4000-8000-000000000061",
  identityAssertion: "00000000-0000-4000-8000-000000000080",
  submissionAssertion: "00000000-0000-4000-8000-000000000081",
  opportunityAAssertion: "00000000-0000-4000-8000-000000000082",
  opportunityBAssertion: "00000000-0000-4000-8000-000000000083",
  proposedAffiliationAssertion: "00000000-0000-4000-8000-000000000090",
  batch: "00000000-0000-4000-8000-000000000099",
} as const;

export type NormalizedFixture = ReturnType<typeof normalizeSyntheticMessages>;

export function normalizeSyntheticMessages(messages: SyntheticMessage[]) {
  if (messages.length !== 9) throw new Error("The M0 fixture must contain exactly nine messages");
  const sorted = [...messages].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const sourceId = (index: number) =>
    `00000000-0000-4000-8000-${String(201 + index).padStart(12, "0")}`;
  const createdAt = "2025-06-02T14:01:00.000Z";
  const sources = sorted.map((message, index) => ({
    id: sourceId(index),
    ownerId: ids.owner,
    sourceKind: "synthetic_message" as const,
    sourceKey: message.sourceKey,
    content: message.body,
    contentSha256: createHash("sha256").update(message.body).digest("hex"),
    occurredAt: message.occurredAt,
    capturedAt: createdAt,
  }));

  return {
    owner: { id: ids.owner, displayName: "Synthetic Candidate", createdAt },
    recruiter: {
      id: ids.recruiter,
      ownerId: ids.owner,
      canonicalName: "Jane Recruiter",
      createdAt,
    },
    identities: [
      {
        id: ids.oldIdentity,
        ownerId: ids.owner,
        recruiterId: ids.recruiter,
        normalizedEmail: "jane@oldagency.example",
        displayEmail: "jane@oldagency.example",
        validFrom: sorted[0].occurredAt,
        validTo: "2025-06-01T23:59:59.000Z",
        createdAt,
      },
      {
        id: ids.newIdentity,
        ownerId: ids.owner,
        recruiterId: ids.recruiter,
        normalizedEmail: "jane@newagency.example",
        displayEmail: "jane@newagency.example",
        validFrom: sorted[8].occurredAt,
        validTo: null,
        createdAt,
      },
    ],
    organizations: [
      [ids.oldAgency, "Old Agency"],
      [ids.newAgency, "New Agency"],
      [ids.exampleCo, "ExampleCo"],
      [ids.sampleLabs, "Sample Labs"],
    ].map(([id, name]) => ({
      id,
      ownerId: ids.owner,
      displayName: name,
      normalizedName: name.toLowerCase(),
      createdAt,
    })),
    affiliations: [
      {
        id: ids.oldAffiliation,
        ownerId: ids.owner,
        recruiterId: ids.recruiter,
        organizationId: ids.oldAgency,
        validFrom: sorted[0].occurredAt,
        validTo: "2025-06-01T23:59:59.000Z",
        assertionId: null,
        createdAt,
      },
      {
        id: ids.newAffiliation,
        ownerId: ids.owner,
        recruiterId: ids.recruiter,
        organizationId: ids.newAgency,
        validFrom: sorted[8].occurredAt,
        validTo: null,
        assertionId: ids.proposedAffiliationAssertion,
        createdAt,
      },
    ],
    opportunities: [
      {
        id: ids.opportunityA,
        ownerId: ids.owner,
        recruiterId: ids.recruiter,
        staffingOrganizationId: ids.oldAgency,
        endClientOrganizationId: ids.exampleCo,
        title: "Senior Platform Engineer",
        sourceKey: "opportunity-a",
        introducedAt: sorted[0].occurredAt,
        createdAt,
      },
      {
        id: ids.opportunityB,
        ownerId: ids.owner,
        recruiterId: ids.recruiter,
        staffingOrganizationId: ids.newAgency,
        endClientOrganizationId: ids.sampleLabs,
        title: "Staff Engineer",
        sourceKey: "opportunity-b",
        introducedAt: sorted[8].occurredAt,
        createdAt,
      },
    ],
    submissions: [
      {
        id: ids.submission,
        ownerId: ids.owner,
        opportunityId: ids.opportunityA,
        recruiterId: ids.recruiter,
        submittedAt: sorted[6].occurredAt,
        createdAt,
      },
    ],
    conversations: [
      {
        id: ids.conversationA,
        ownerId: ids.owner,
        recruiterId: ids.recruiter,
        threadKey: "opportunity-a",
        subject: sorted[0].subject,
        startedAt: sorted[0].occurredAt,
        createdAt,
      },
      {
        id: ids.conversationB,
        ownerId: ids.owner,
        recruiterId: ids.recruiter,
        threadKey: "opportunity-b",
        subject: sorted[8].subject,
        startedAt: sorted[8].occurredAt,
        createdAt,
      },
    ],
    conversationOpportunities: [
      { ownerId: ids.owner, conversationId: ids.conversationA, opportunityId: ids.opportunityA },
      { ownerId: ids.owner, conversationId: ids.conversationB, opportunityId: ids.opportunityB },
    ],
    sources,
    events: sorted.map((message, index) => ({
      id: message.id,
      ownerId: ids.owner,
      conversationId:
        message.conversationKey === "opportunity-a" ? ids.conversationA : ids.conversationB,
      sourceReferenceId: sourceId(index),
      recruiterIdentityId:
        message.direction === "candidate_to_recruiter"
          ? null
          : message.from === "jane@oldagency.example"
            ? ids.oldIdentity
            : ids.newIdentity,
      direction: message.direction,
      occurredAt: message.occurredAt,
      createdAt,
    })),
    assertions: [
      {
        id: ids.identityAssertion,
        sourceIndex: 8,
        recruiterId: ids.recruiter,
        opportunityId: null,
        affiliationId: null,
        factType: "identity_link",
        canonicalValue: { emails: ["jane@oldagency.example", "jane@newagency.example"] },
        excerpt: "Jane, Principal Recruiter",
        confidenceBasisPoints: 10000,
        inferred: false,
        reviewRequirement: "none" as const,
        occurredAt: sorted[8].occurredAt,
      },
      {
        id: ids.opportunityAAssertion,
        sourceIndex: 0,
        recruiterId: ids.recruiter,
        opportunityId: ids.opportunityA,
        affiliationId: null,
        factType: "opportunity_introduced",
        canonicalValue: { title: "Senior Platform Engineer" },
        excerpt: "Senior Platform Engineer role at ExampleCo",
        confidenceBasisPoints: 10000,
        inferred: false,
        reviewRequirement: "none" as const,
        occurredAt: sorted[0].occurredAt,
      },
      {
        id: ids.submissionAssertion,
        sourceIndex: 6,
        recruiterId: ids.recruiter,
        opportunityId: ids.opportunityA,
        affiliationId: null,
        factType: "explicit_submission",
        canonicalValue: { submitted: true },
        excerpt: "I submitted your profile to ExampleCo today.",
        confidenceBasisPoints: 10000,
        inferred: false,
        reviewRequirement: "none" as const,
        occurredAt: sorted[6].occurredAt,
      },
      {
        id: ids.opportunityBAssertion,
        sourceIndex: 8,
        recruiterId: ids.recruiter,
        opportunityId: ids.opportunityB,
        affiliationId: null,
        factType: "opportunity_introduced",
        canonicalValue: { title: "Staff Engineer" },
        excerpt: "A new Staff Engineer opportunity may fit.",
        confidenceBasisPoints: 10000,
        inferred: false,
        reviewRequirement: "none" as const,
        occurredAt: sorted[8].occurredAt,
      },
      {
        id: ids.proposedAffiliationAssertion,
        sourceIndex: 8,
        recruiterId: ids.recruiter,
        opportunityId: null,
        affiliationId: ids.newAffiliation,
        factType: "recruiter_affiliation",
        canonicalValue: { organization: "New Agency" },
        excerpt: "Jane, Principal Recruiter, New Agency",
        confidenceBasisPoints: 9200,
        inferred: true,
        reviewRequirement: "user_review" as const,
        occurredAt: sorted[8].occurredAt,
      },
    ].map((assertion) => ({
      ...assertion,
      ownerId: ids.owner,
      sourceReferenceId: sourceId(assertion.sourceIndex),
      canonicalValueJson: JSON.stringify(assertion.canonicalValue),
      createdAt,
    })),
    batch: {
      id: ids.batch,
      ownerId: ids.owner,
      batchKey: "m0-jane-v1",
      sourceSetHash: createHash("sha256")
        .update(sources.map(({ contentSha256 }) => contentSha256).join(""))
        .digest("hex"),
      status: "completed" as const,
      checkpointSourceKey: sorted.at(-1)?.sourceKey ?? null,
      processedCount: sorted.length,
      startedAt: createdAt,
      completedAt: createdAt,
    },
  };
}
