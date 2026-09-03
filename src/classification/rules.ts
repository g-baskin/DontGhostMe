import { createHash } from "node:crypto";
import type { ClassificationSignalCode } from "@/domain/classification";

export const CLASSIFICATION_ENGINE_VERSION = "m2-rules-v1";
export const CLASSIFICATION_LIMITS = Object.freeze({
  batchMessages: 100,
  evidenceExcerptCharacters: 280,
  proposedValueBytes: 16 * 1024,
});

export const SIGNAL_WEIGHTS: Readonly<Record<ClassificationSignalCode, number>> = Object.freeze({
  owner_sender_exact: 10000,
  owner_recipient_exact: 10000,
  owner_ambiguous: -10000,
  external_human_sender: 1200,
  recruiter_title: 3500,
  role_language: 2500,
  interview_coordination: 1800,
  right_to_represent: 2200,
  explicit_client_role: 3200,
  explicit_submission: 6000,
  system_sender: -7000,
  job_alert: -6500,
  newsletter: -6000,
  receipt: -6000,
  calendar_notice: -4000,
  ats_acknowledgement: -4500,
  truncated_or_warned: -1500,
  thread_reference: 5000,
  subject_participant_match: 2000,
  organization_signature: 1800,
  explicit_identity_continuity: 5000,
});

const canonicalRules = Object.entries(SIGNAL_WEIGHTS)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([code, weight]) => `${code}:${weight}`)
  .join("\n");

export const CLASSIFICATION_RULESET_SHA256 = createHash("sha256")
  .update(`${CLASSIFICATION_ENGINE_VERSION}\n${canonicalRules}`)
  .digest("hex");

export const SIGNAL_EXPLANATIONS: Readonly<Record<ClassificationSignalCode, string>> =
  Object.freeze({
    owner_sender_exact: "The sender exactly matches a confirmed address you own.",
    owner_recipient_exact: "A recipient exactly matches a confirmed address you own.",
    owner_ambiguous: "Mailbox ownership is missing or appears on both sides.",
    external_human_sender: "The sender looks like a person outside your confirmed addresses.",
    recruiter_title: "The message includes a recruiting or staffing title.",
    role_language: "The message directly discusses a role or position.",
    interview_coordination: "The message coordinates an interview or screening call.",
    right_to_represent: "The message discusses right-to-represent consent.",
    explicit_client_role: "The message names a client and role together.",
    explicit_submission: "The recruiter explicitly says your profile was submitted or presented.",
    system_sender: "The sender is automated or does not accept replies.",
    job_alert: "The content is a job alert rather than a recruiter conversation.",
    newsletter: "The content is a newsletter or marketing mailing.",
    receipt: "The content is a receipt or transactional notice.",
    calendar_notice: "The content is a calendar-only notice.",
    ats_acknowledgement: "The content only acknowledges an application automatically.",
    truncated_or_warned: "The imported message is incomplete or carries parser warnings.",
    thread_reference: "Message headers provide a strong thread relationship.",
    subject_participant_match: "Subject and participants suggest, but do not prove, a thread.",
    organization_signature: "A signature appears to name the sender's organization.",
    explicit_identity_continuity:
      "The sender explicitly identifies a previous address or employer.",
  });
