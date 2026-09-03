export const CLASSIFICATION_PROPOSAL_TYPES = [
  "message_direction",
  "recruiter_identity",
  "identity_link",
  "organization_affiliation",
  "opportunity",
  "conversation_group",
  "submission",
] as const;
export type ClassificationProposalType = (typeof CLASSIFICATION_PROPOSAL_TYPES)[number];

export const CLASSIFICATION_STATES = [
  "proposed",
  "accepted",
  "rejected",
  "corrected",
  "superseded",
] as const;
export type ClassificationState = (typeof CLASSIFICATION_STATES)[number];

export const CLASSIFICATION_DECISIONS = [
  "accepted",
  "rejected",
  "corrected",
  "merge",
  "split",
] as const;
export type ClassificationDecision = (typeof CLASSIFICATION_DECISIONS)[number];
export type ClassificationRunStatus = "running" | "completed" | "failed" | "superseded";
export type MessageDirection = "recruiter_to_candidate" | "candidate_to_recruiter" | "unknown";
export type OpportunityOutcome = "unknown";
export type ReviewRequirement = "none" | "user_review";

export interface OwnerEmailIdentity {
  id: string;
  ownerId: string;
  normalizedEmail: string;
  displayEmail: string;
  confirmedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClassificationRun {
  id: string;
  ownerId: string;
  engineVersion: string;
  rulesetSha256: string;
  sourceSetSha256: string;
  status: ClassificationRunStatus;
  processedCount: number;
  proposalCount: number;
  checkpointMessageId: string | null;
  errorCode: "classification_failed" | null;
  startedAt: string;
  completedAt: string | null;
  updatedAt: string;
}

export interface ClassificationAddress {
  address: string;
  name?: string;
}

export interface ClassificationMessage {
  id: string;
  sourceMessageId: string;
  sentAt: string | null;
  subject: string;
  sender: ClassificationAddress[];
  recipients: ClassificationAddress[];
  replyTo: ClassificationAddress[];
  normalizedMessageId: string | null;
  references: string[];
  safeText: string;
  textTruncated: boolean;
  warningCodes: string[];
}

export type ProposedValue =
  | { direction: MessageDirection; messageId: string; threadKey: string }
  | { displayEmail: string; name: string; normalizedEmail: string }
  | { emailA: string; emailB: string; reason: "explicit_continuity" | "user_selected" }
  | { normalizedEmail: string; organization: string }
  | { client: string | null; recruiterEmail: string; title: string }
  | { messageIds: string[]; subject: string; threadKey: string }
  | { client: string; messageId: string; recruiterEmail: string; submittedAt: string };

export interface ClassificationEvidenceDraft {
  normalizedMessageId: string;
  signalCode: ClassificationSignalCode;
  contributionBasisPoints: number;
  excerpt: string;
  excerptStart: number;
  excerptEnd: number;
  sourceLabel?: string;
  sourceDate?: string | null;
}

export interface ClassificationProposalDraft {
  proposalKey: string;
  proposalType: ClassificationProposalType;
  proposedValue: ProposedValue;
  confidenceBasisPoints: number;
  reviewRequirement: ReviewRequirement;
  evidence: ClassificationEvidenceDraft[];
}

export interface ClassificationProposal extends Omit<ClassificationProposalDraft, "evidence"> {
  id: string;
  ownerId: string;
  runId: string;
  state: ClassificationState;
  supersedesProposalId: string | null;
  promotedEntityKind: string | null;
  promotedEntityId: string | null;
  createdAt: string;
  updatedAt: string;
  evidence: ClassificationEvidenceDraft[];
  revision: number;
}

export interface ClassificationDecisionInput {
  decision: ClassificationDecision;
  correctedValue?: ProposedValue;
  expectedRevision: number;
}

export type ClassificationSignalCode =
  | "owner_sender_exact"
  | "owner_recipient_exact"
  | "owner_ambiguous"
  | "external_human_sender"
  | "recruiter_title"
  | "role_language"
  | "interview_coordination"
  | "right_to_represent"
  | "explicit_client_role"
  | "explicit_submission"
  | "system_sender"
  | "job_alert"
  | "newsletter"
  | "receipt"
  | "calendar_notice"
  | "ats_acknowledgement"
  | "truncated_or_warned"
  | "thread_reference"
  | "subject_participant_match"
  | "organization_signature"
  | "explicit_identity_continuity";
