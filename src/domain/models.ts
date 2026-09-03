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

export interface Opportunity {
  id: Id;
  ownerId: Id;
  recruiterId: Id;
  staffingOrganizationId: Id;
  endClientOrganizationId: Id | null;
  title: string;
  sourceKey: string;
  introducedAt: IsoTimestamp;
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
  opportunities: number;
  explicitSubmissions: number;
  unknownOutcomes: number;
}
