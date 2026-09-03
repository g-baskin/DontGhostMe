import type {
  Id,
  Opportunity,
  Recruiter,
  RecruiterIdentity,
  RecruiterMetrics,
  ReviewDecision,
  ReviewItem,
  TimelineEvent,
} from "./models";

export interface RecruiterSummary extends Recruiter {
  identities: RecruiterIdentity[];
  firstAffiliation: string;
  currentAffiliation: string;
  lastContact: string;
  unresolvedItems: number;
}

export interface OpportunitySummary extends Opportunity {
  staffingOrganization: string;
  endClientOrganization: string | null;
  submitted: boolean;
  outcome: "unknown" | "not_started";
}

export interface RecruiterDetail extends RecruiterSummary {
  timeline: TimelineEvent[];
  metrics: RecruiterMetrics;
  opportunities: Opportunity[];
}

export interface PortableExport {
  exportedAt: string;
  formatVersion: 1;
  owner: { id: Id; displayName: string };
  recruiters: unknown[];
  recruiterIdentities: unknown[];
  recruiterAffiliations: unknown[];
  organizations: unknown[];
  opportunities: unknown[];
  submissions: unknown[];
  conversations: unknown[];
  conversationOpportunities: unknown[];
  communications: unknown[];
  sourceReferences: unknown[];
  evidence: unknown[];
  reviewHistory: unknown[];
  importBatches: unknown[];
  historicalImports: unknown[];
  importCheckpoints: unknown[];
  importSourceMessages: unknown[];
  normalizedMessages: unknown[];
  attachmentInventory: unknown[];
  importErrors: unknown[];
  ownerEmailIdentities: unknown[];
  classificationRuns: unknown[];
  classificationProposals: unknown[];
  classificationEvidence: unknown[];
  classificationDecisions: unknown[];
}

export interface ReadRepository {
  getHome(ownerId: Id): RecruiterDetail;
  listRecruiters(ownerId: Id): RecruiterSummary[];
  getRecruiter(ownerId: Id, recruiterId: Id): RecruiterDetail | null;
  listOpportunities(ownerId: Id): OpportunitySummary[];
  listReviewItems(ownerId: Id): ReviewItem[];
  exportData(ownerId: Id, exportedAt: string): PortableExport;
}

export interface ReviewRepository {
  decide(
    ownerId: Id,
    assertionId: Id,
    expectedRevision: number,
    decision: Exclude<ReviewDecision, "corrected">,
  ): { revision: number };
}

export type AppRepository = ReadRepository & ReviewRepository;
