import { createHash } from "node:crypto";
import type {
  ClassificationEvidenceDraft,
  ClassificationMessage,
  ClassificationProposalDraft,
  ClassificationSignalCode,
  ProposedValue,
} from "@/domain/classification";
import { SIGNAL_WEIGHTS } from "./rules";

const stableHash = (value: string) => createHash("sha256").update(value).digest("hex");
const canonicalJson = (value: ProposedValue) => JSON.stringify(value);

const LINKEDIN_SENDER_DOMAINS = new Set([
  "linkedin.com",
  "e.linkedin.com",
  "notifications.linkedin.com",
]);
const STRUCTURE_PATTERNS: Array<{
  eventKind: LinkedInNotificationEventKind;
  subject: RegExp;
  body: RegExp;
}> = [
  {
    eventKind: "invitation",
    subject: /^you have a new invitation/i,
    body: /invited you to connect|wants to connect/i,
  },
  {
    eventKind: "recruiter_message",
    subject: /^you have a new message/i,
    body: /sent you a message|messaged you about/i,
  },
  {
    eventKind: "application_update",
    subject: /your application (to|for) .+ has been (updated|viewed|reviewed)/i,
    body: /application (has been )?(updated|viewed|reviewed|status)/i,
  },
  {
    eventKind: "job_update",
    subject: /^(new jobs|job alert|your job alert)/i,
    body: /matching (your|your profile)|new (jobs|roles) for you/i,
  },
];

export type LinkedInNotificationEventKind =
  | "invitation"
  | "recruiter_message"
  | "application_update"
  | "job_update";

const NOTIFICATION_WEIGHTS = SIGNAL_WEIGHTS;

export function linkedinNotificationWeights() {
  return NOTIFICATION_WEIGHTS;
}

function excerptAt(message: ClassificationMessage, index: number) {
  const start = Math.max(0, Math.min(index, message.safeText.length));
  const end = Math.min(message.safeText.length, start + 280);
  return message.safeText.slice(start, end);
}

/**
 * Recognizes already-imported LinkedIn notification emails. Deterministic
 * sender plus explicit message-structure evidence is required; a matching
 * sender alone never produces a proposal.
 */
export function linkedinNotificationProposals(
  message: ClassificationMessage,
): ClassificationProposalDraft[] {
  const senderAddresses = Array.isArray(message.sender)
    ? message.sender
    : typeof message.sender === "string"
      ? [message.sender]
      : [];
  const deterministic = senderAddresses.some((entry) => {
    const address =
      typeof entry === "string" ? entry : ((entry as { address?: string })?.address ?? "");
    const domain = address.split("@")[1]?.toLocaleLowerCase("en-US") ?? "";
    return LINKEDIN_SENDER_DOMAINS.has(domain);
  });
  if (!deterministic) return [];
  const haystack = `${message.subject}\n${message.safeText}`.toLocaleLowerCase("en-US");
  const proposals: ClassificationProposalDraft[] = [];
  for (const pattern of STRUCTURE_PATTERNS) {
    const subjectMatch = message.subject.match(pattern.subject);
    const bodyMatch = haystack.match(new RegExp(pattern.body.source, "i"));
    if (!subjectMatch && !bodyMatch) continue;
    const signalCode =
      `linkedin_${pattern.eventKind === "recruiter_message" ? "message" : pattern.eventKind === "invitation" ? "invitation" : pattern.eventKind === "application_update" ? "application" : "job"}_structure` as ClassificationSignalCode;
    const weight = NOTIFICATION_WEIGHTS[signalCode as keyof typeof NOTIFICATION_WEIGHTS] ?? 2000;
    const evidence: ClassificationEvidenceDraft[] = [
      {
        normalizedMessageId: message.id,
        signalCode: "linkedin_deterministic_sender",
        contributionBasisPoints: NOTIFICATION_WEIGHTS.linkedin_deterministic_sender,
        excerpt: "",
        excerptStart: 0,
        excerptEnd: 0,
      },
      {
        normalizedMessageId: message.id,
        signalCode,
        contributionBasisPoints: weight,
        excerpt: excerptAt(message, bodyMatch?.index ?? subjectMatch?.index ?? 0),
        excerptStart: bodyMatch?.index ?? 0,
        excerptEnd: (bodyMatch?.index ?? 0) + 280,
      },
    ];
    const proposedValue = {
      eventKind: pattern.eventKind,
      messageId: message.id,
      occurredAt: message.sentAt,
      confidenceReasons: ["deterministic_sender", "structured_notification"],
    };
    const proposedValueJson = canonicalJson(proposedValue);
    proposals.push({
      proposalKey: stableHash(`linkedin_notification\n${proposedValueJson}`),
      proposalType: "linkedin_notification",
      proposedValue,
      confidenceBasisPoints: evidence.reduce(
        (total, item) => total + item.contributionBasisPoints,
        0,
      ),
      reviewRequirement: "user_review",
      evidence,
    });
  }
  return proposals;
}
