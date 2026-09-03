export type Id = string;
export type IsoTimestamp = string;

export interface Recruiter {
  id: Id;
  ownerId: Id;
  canonicalName: string;
}

export interface RecruiterIdentity {
  id: Id;
  ownerId: Id;
  recruiterId: Id;
  email: string;
  validFrom: IsoTimestamp;
  validTo: IsoTimestamp | null;
}

export interface Organization {
  id: Id;
  ownerId: Id;
  name: string;
}

export interface Affiliation {
  id: Id;
  ownerId: Id;
  recruiterId: Id;
  organizationId: Id;
  validFrom: IsoTimestamp;
  validTo: IsoTimestamp | null;
  reviewState: ReviewState;
}

export type RelationshipStatus = "active" | "dormant" | "do_not_contact" | null;
export type OpportunityOutcome =
  | "unknown"
  | "rejected"
  | "offer"
  | "candidate_withdrew"
  | "closed_without_outcome";
export type OpportunityStage =
  | "not_started"
  | "discussed"
  | "resume_requested"
  | "right_to_represent"
  | "submitted"
  | "interview"
  | "terminal";

export interface Opportunity {
  id: Id;
  ownerId: Id;
  recruiterId: Id;
  staffingOrganizationId: Id;
  endClientOrganizationId: Id | null;
  title: string;
  sourceKey: string;
  introducedAt: IsoTimestamp;
  outcome?: OpportunityOutcome;
}

export interface OpportunityStageEvidence {
  evidenceId: Id;
  factType: string;
  occurredAt: IsoTimestamp;
  sourceKey: string;
  confidenceBasisPoints: number;
  inferred: boolean;
  reviewState: ReviewState;
}

export interface OpportunityStageHistoryEntry extends OpportunityStageEvidence {
  stage: OpportunityStage;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  previousCursor: string | null;
}

export interface ResponseLatency {
  conversationId: Id;
  responder: "candidate" | "recruiter";
  startedAt: IsoTimestamp;
  respondedAt: IsoTimestamp;
  milliseconds: number;
}

export type MessageDirection = "recruiter_to_candidate" | "candidate_to_recruiter";

export interface TimelineEvent {
  id: Id;
  occurredAt: IsoTimestamp;
  direction: MessageDirection;
  subject: string;
  excerpt: string;
  sourceKey: string;
  confidenceBasisPoints: number;
  inferred: boolean;
}

export type ReviewDecision = "confirmed" | "rejected" | "corrected";
export type ReviewState = "accepted" | "proposed" | ReviewDecision;

export interface ReviewItem {
  assertionId: Id;
  recruiterId: Id;
  factType: string;
  value: unknown;
  excerpt: string;
  confidenceBasisPoints: number;
  sourceKey: string;
  state: ReviewState;
  revision: number;
}

export interface RecruiterMetrics {
  firstContact: IsoTimestamp;
  lastContact: IsoTimestamp;
  recruiterMessages: number;
  candidateReplies: number;
  inferredFollowUps: number;
  currentUnansweredSide: "candidate" | "recruiter" | "none";
  unansweredDurationMilliseconds: number;
  lastResponseLatencyMilliseconds: number | null;
  candidateMedianResponseLatencyMilliseconds: number | null;
  recruiterMedianResponseLatencyMilliseconds: number | null;
  opportunities: number;
  explicitSubmissions: number;
  unknownOutcomes: number;
}
