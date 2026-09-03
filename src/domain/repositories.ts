import type {
  CursorPage,
  Id,
  Opportunity,
  OpportunityOutcome,
  OpportunityStage,
  OpportunityStageHistoryEntry,
  Recruiter,
  RecruiterIdentity,
  RecruiterMetrics,
  RelationshipStatus,
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
  relationshipStatus: RelationshipStatus;
  excluded: boolean;
  possibleCompanyChange: boolean;
  provenance: Record<string, "manual" | "machine">;
  fallbackValues: Record<string, unknown>;
}

export interface OpportunitySummary extends Opportunity {
  staffingOrganization: string;
  endClientOrganization: string | null;
  submitted: boolean;
  outcome: OpportunityOutcome;
  stage: OpportunityStage;
  excluded: boolean;
  provenance: Record<string, "manual" | "machine">;
  fallbackValues: Record<string, unknown>;
}

export interface RecruiterFilters {
  search?: string;
  status?: Exclude<RelationshipStatus, null>;
  unresolved?: boolean;
  possibleCompanyChange?: boolean;
  excluded?: boolean;
  cursor?: string;
  direction?: "next" | "previous";
  limit?: number;
}

export interface OpportunityFilters {
  stage?: OpportunityStage;
  outcome?: OpportunityOutcome;
  cursor?: string;
  direction?: "next" | "previous";
  limit?: number;
}

export interface OpportunityDetail extends OpportunitySummary {
  stageHistory: OpportunityStageHistoryEntry[];
}

export interface RecruiterDetail extends RecruiterSummary {
  timeline: TimelineEvent[];
  metrics: RecruiterMetrics;
  opportunities: Opportunity[];
  timelinePage?: CursorPage<TimelineEvent>;
}

export interface PortableExport {
  exportedAt: string;
  formatVersion: 3;
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
  relationshipStatuses: unknown[];
  identityExclusions: unknown[];
  recruiterDeletions: unknown[];
  manualAssertions: unknown[];
  importSourceRecords: unknown[];
}

export interface ReadRepository {
  getHome(ownerId: Id): RecruiterDetail;
  listRecruiters(ownerId: Id): RecruiterSummary[];
  queryRecruiters(ownerId: Id, filters?: RecruiterFilters): CursorPage<RecruiterSummary>;
  getRecruiter(
    ownerId: Id,
    recruiterId: Id,
    cursor?: string,
    direction?: "next" | "previous",
  ): RecruiterDetail | null;
  listOpportunities(ownerId: Id): OpportunitySummary[];
  queryOpportunities(ownerId: Id, filters?: OpportunityFilters): CursorPage<OpportunitySummary>;
  getOpportunity(ownerId: Id, opportunityId: Id): OpportunityDetail | null;
  listReviewItems(ownerId: Id): ReviewItem[];
  exportData(ownerId: Id, exportedAt: string): PortableExport;
}

export interface RelationshipRepository {
  setRelationshipStatus(
    ownerId: Id,
    recruiterId: Id,
    status: RelationshipStatus,
    now: string,
  ): void;
  excludeRecruiter(ownerId: Id, recruiterId: Id, now: string): void;
  restoreRecruiter(ownerId: Id, recruiterId: Id, now: string): void;
  excludeIdentity(ownerId: Id, identityId: Id, reason: string | null, now: string): void;
  excludeDomain(ownerId: Id, domain: string, reason: string | null, now: string): void;
  restoreIdentityExclusion(ownerId: Id, exclusionId: Id): void;
  deleteRecruiterData(ownerId: Id, recruiterId: Id, now: string): void;
}

export interface ReviewRepository {
  decide(
    ownerId: Id,
    assertionId: Id,
    expectedRevision: number,
    decision: Exclude<ReviewDecision, "corrected">,
  ): { revision: number };
}

export type AppRepository = ReadRepository & ReviewRepository & RelationshipRepository;
