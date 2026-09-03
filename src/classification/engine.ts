import { createHash } from "node:crypto";
import { domainToASCII } from "node:url";
import type {
  ClassificationAddress,
  ClassificationEvidenceDraft,
  ClassificationMessage,
  ClassificationProposalDraft,
  ClassificationSignalCode,
  MessageDirection,
  ProposedValue,
} from "@/domain/classification";
import { linkedinNotificationProposals } from "./linkedin-notifications";
import { CLASSIFICATION_LIMITS, SIGNAL_WEIGHTS } from "./rules";

const recruiterTitle =
  /\b(recruiter|talent acquisition|staffing (?:consultant|specialist)|technical sourcer)\b/i;
const roleLanguage =
  /\b(role|position|opening|opportunity|engineer|developer|designer|analyst|architect|product manager)\b/i;
const interviewLanguage =
  /\b(interview|screening call|phone screen|meet(?:ing)? with (?:the )?hiring manager)\b/i;
const rightToRepresent = /\bright[- ]to[- ]represent\b|\bRTR\b/i;
const systemSender = /\b(no[-_.]?reply|do[-_.]?not[-_.]?reply|notifications?)\b/i;
const jobAlert = /\b(job alert|jobs? matching|new jobs? for you)\b/i;
const newsletter = /\b(unsubscribe|newsletter|email preferences)\b/i;
const receipt = /\b(receipt|invoice|payment confirmation|order confirmation)\b/i;
const calendarNotice = /\b(calendar|invitation:|accepted:|declined:)\b/i;
const atsAcknowledgement =
  /\b(application (?:was )?received|thank you for applying|application confirmation)\b/i;
const submission =
  /\b(?:submitted|presented)\s+(?:your|the)\s+(?:profile|r[eé]sum[eé]|candidacy)\s+to\s+([A-Z][\p{L}\p{N}&' -]{1,60}?)(?=\s+(?:today|for|regarding|on)\b|[.,\n]|$)/iu;
const organizationSignature =
  /\b(?:recruiter|talent acquisition|staffing (?:consultant|specialist))\s+(?:at|[,|])\s*([A-Z][\p{L}\p{N}&' -]{1,60}?)(?=[.,\n|]|$)/iu;
const identityContinuity =
  /\b(?:formerly|previously|my old (?:email|address)(?: was)?)\b[^\n]{0,80}?([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/i;

export function normalizeClassificationEmail(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1 || /[\s<>]/.test(trimmed)) return null;
  const local = trimmed.slice(0, at);
  const domain = domainToASCII(trimmed.slice(at + 1));
  if (!domain || local.length > 64 || `${local}@${domain}`.length > 254) return null;
  return `${local}@${domain}`;
}

export function classifyDirection(
  message: Pick<ClassificationMessage, "sender" | "recipients">,
  ownerEmails: ReadonlySet<string>,
): MessageDirection {
  const senderOwned = normalizedAddresses(message.sender).some((email) => ownerEmails.has(email));
  const recipientOwned = normalizedAddresses(message.recipients).some((email) =>
    ownerEmails.has(email),
  );
  if (senderOwned === recipientOwned) return "unknown";
  return senderOwned ? "candidate_to_recruiter" : "recruiter_to_candidate";
}

export function classifyMessage(
  message: ClassificationMessage,
  ownerEmails: ReadonlySet<string>,
): ClassificationProposalDraft[] {
  const proposals = classifyMessageCore(message, ownerEmails);
  proposals.push(...linkedinNotificationProposals(message));
  return proposals;
}

function classifyMessageCore(
  message: ClassificationMessage,
  ownerEmails: ReadonlySet<string>,
): ClassificationProposalDraft[] {
  const direction = classifyDirection(message, ownerEmails);
  const proposals: ClassificationProposalDraft[] = [];
  const directionCode =
    direction === "candidate_to_recruiter"
      ? "owner_sender_exact"
      : direction === "recruiter_to_candidate"
        ? "owner_recipient_exact"
        : "owner_ambiguous";
  const messageThreadKey =
    message.references.at(-1) ??
    message.normalizedMessageId ??
    stableHash(
      `${normalizeSubject(message.subject)}\n${normalizedAddresses(message.sender).join(",")}`,
    );
  proposals.push(
    proposal(
      "message_direction",
      { direction, messageId: message.id, threadKey: messageThreadKey },
      [evidence(message, directionCode, -1)],
    ),
  );

  if (direction !== "recruiter_to_candidate") return proposals;
  const sender = firstExternalSender(message.sender, ownerEmails);
  if (!sender) return proposals;
  const text = `${message.subject}\n${message.safeText}`;
  const recruiterEvidence = [evidence(message, "external_human_sender", -1)];
  addMatchEvidence(recruiterEvidence, message, recruiterTitle, "recruiter_title");
  addMatchEvidence(recruiterEvidence, message, roleLanguage, "role_language");
  addMatchEvidence(recruiterEvidence, message, interviewLanguage, "interview_coordination");
  addMatchEvidence(recruiterEvidence, message, rightToRepresent, "right_to_represent");
  addMatchEvidence(recruiterEvidence, message, systemSender, "system_sender");
  addMatchEvidence(recruiterEvidence, message, jobAlert, "job_alert");
  addMatchEvidence(recruiterEvidence, message, newsletter, "newsletter");
  addMatchEvidence(recruiterEvidence, message, receipt, "receipt");
  addMatchEvidence(recruiterEvidence, message, calendarNotice, "calendar_notice");
  addMatchEvidence(recruiterEvidence, message, atsAcknowledgement, "ats_acknowledgement");
  if (message.textTruncated || message.warningCodes.length > 0)
    recruiterEvidence.push(evidence(message, "truncated_or_warned", -1));

  const recruiterConfidence = confidence(recruiterEvidence);
  if (recruiterConfidence < 4000) return proposals;
  proposals.push(
    proposal(
      "recruiter_identity",
      {
        displayEmail: sender.address,
        name: sender.name?.trim() || sender.address.split("@")[0],
        normalizedEmail: normalizeClassificationEmail(sender.address) as string,
      },
      recruiterEvidence,
    ),
  );

  const threadKey = message.references.at(-1) ?? message.normalizedMessageId;
  proposals.push(
    proposal(
      "conversation_group",
      {
        messageIds: [message.id],
        subject: normalizeSubject(message.subject),
        threadKey: messageThreadKey,
      },
      [evidence(message, threadKey ? "thread_reference" : "subject_participant_match", -1)],
    ),
  );

  const organizationResult = findMessageMatch(message, organizationSignature);
  if (organizationResult?.match[1]) {
    const organizationMatch = organizationResult.match;
    proposals.push(
      proposal(
        "organization_affiliation",
        {
          normalizedEmail: normalizeClassificationEmail(sender.address) as string,
          organization: cleanCapture(organizationMatch[1]),
        },
        [evidenceForMessageMatch(message, "organization_signature", organizationResult)],
      ),
    );
  }

  const client = extractClient(text);
  if (roleLanguage.test(text) && (client || recruiterTitle.test(text))) {
    const opportunityEvidence = recruiterEvidence.filter(
      ({ contributionBasisPoints }) => contributionBasisPoints > 0,
    );
    if (client)
      opportunityEvidence.push(
        evidence(message, "explicit_client_role", message.safeText.indexOf(client)),
      );
    proposals.push(
      proposal(
        "opportunity",
        {
          client,
          recruiterEmail: normalizeClassificationEmail(sender.address) as string,
          title: normalizeSubject(message.subject) || "Untitled role",
        },
        opportunityEvidence,
      ),
    );
  }

  const submissionResult = findMessageMatch(message, submission);
  if (submissionResult?.match[1] && message.sentAt) {
    const submissionMatch = submissionResult.match;
    proposals.push(
      proposal(
        "submission",
        {
          client: cleanCapture(submissionMatch[1]),
          messageId: message.id,
          recruiterEmail: normalizeClassificationEmail(sender.address) as string,
          submittedAt: message.sentAt,
        },
        [evidenceForMessageMatch(message, "explicit_submission", submissionResult)],
      ),
    );
  }

  const continuityMatch = message.safeText.match(identityContinuity);
  const oldEmail = continuityMatch?.[1] ? normalizeClassificationEmail(continuityMatch[1]) : null;
  const currentEmail = normalizeClassificationEmail(sender.address);
  if (oldEmail && currentEmail && oldEmail !== currentEmail) {
    proposals.push(
      proposal(
        "identity_link",
        { emailA: oldEmail, emailB: currentEmail, reason: "explicit_continuity" },
        [
          evidenceFromMatch(
            message,
            "explicit_identity_continuity",
            continuityMatch as RegExpMatchArray,
          ),
        ],
      ),
    );
  }
  return proposals;
}

function proposal(
  proposalType: ClassificationProposalDraft["proposalType"],
  proposedValue: ProposedValue,
  evidenceRows: ClassificationEvidenceDraft[],
): ClassificationProposalDraft {
  const proposedValueJson = canonicalJson(proposedValue);
  if (Buffer.byteLength(proposedValueJson) > CLASSIFICATION_LIMITS.proposedValueBytes)
    throw new Error("classification_value_too_large");
  return {
    proposalKey: stableHash(`${proposalType}\n${proposedValueJson}`),
    proposalType,
    proposedValue,
    confidenceBasisPoints: confidence(evidenceRows),
    reviewRequirement:
      proposalType === "message_direction" &&
      (proposedValue as { direction?: string }).direction !== "unknown"
        ? "none"
        : "user_review",
    evidence: evidenceRows,
  };
}

function evidence(
  message: ClassificationMessage,
  signalCode: ClassificationSignalCode,
  start: number,
): ClassificationEvidenceDraft {
  const safeStart = start < 0 ? 0 : Math.max(0, Math.min(start, message.safeText.length));
  const excerpt =
    start < 0
      ? ""
      : message.safeText.slice(
          safeStart,
          safeStart + CLASSIFICATION_LIMITS.evidenceExcerptCharacters,
        );
  return {
    normalizedMessageId: message.id,
    signalCode,
    contributionBasisPoints: SIGNAL_WEIGHTS[signalCode],
    excerpt,
    excerptStart: safeStart,
    excerptEnd: safeStart + excerpt.length,
  };
}

function evidenceFromMatch(
  message: ClassificationMessage,
  signalCode: ClassificationSignalCode,
  match: RegExpMatchArray,
) {
  return evidence(message, signalCode, Math.max(0, (match.index ?? 0) - 70));
}

function addMatchEvidence(
  rows: ClassificationEvidenceDraft[],
  message: ClassificationMessage,
  pattern: RegExp,
  code: ClassificationSignalCode,
) {
  const result = findMessageMatch(message, pattern);
  if (result) rows.push(evidenceForMessageMatch(message, code, result));
}

function findMessageMatch(message: ClassificationMessage, pattern: RegExp) {
  const bodyMatch = message.safeText.match(pattern);
  if (bodyMatch) return { match: bodyMatch, body: true } as const;
  const subjectMatch = message.subject.match(pattern);
  return subjectMatch ? ({ match: subjectMatch, body: false } as const) : null;
}

function evidenceForMessageMatch(
  message: ClassificationMessage,
  signalCode: ClassificationSignalCode,
  result: NonNullable<ReturnType<typeof findMessageMatch>>,
) {
  return result.body
    ? evidenceFromMatch(message, signalCode, result.match)
    : evidence(message, signalCode, -1);
}

function confidence(rows: ClassificationEvidenceDraft[]) {
  return Math.max(
    0,
    Math.min(
      10000,
      rows.reduce((total, row) => total + row.contributionBasisPoints, 0),
    ),
  );
}

function normalizedAddresses(addresses: ClassificationAddress[]) {
  return addresses.flatMap(({ address }) => {
    const normalized = normalizeClassificationEmail(address);
    return normalized ? [normalized] : [];
  });
}

function firstExternalSender(addresses: ClassificationAddress[], ownerEmails: ReadonlySet<string>) {
  return addresses.find(({ address }) => {
    const normalized = normalizeClassificationEmail(address);
    return normalized && !ownerEmails.has(normalized) && !systemSender.test(normalized);
  });
}

function normalizeSubject(subject: string) {
  return subject
    .replace(/^\s*(?:(?:re|fw|fwd):\s*)+/i, "")
    .trim()
    .slice(0, 200);
}

function extractClient(text: string) {
  const match = text.match(
    /\b(?:role|position|opportunity)\s+(?:with|at|for)\s+([A-Z][\p{L}\p{N}&' -]{1,60}?)(?=\s+(?:role|position|opening|today|regarding|on)\b|[.,\n]|$)/iu,
  );
  return match?.[1] ? cleanCapture(match[1]) : null;
}

function cleanCapture(value: string) {
  return value
    .trim()
    .replace(/[.,;:!?]+$/, "")
    .slice(0, 80);
}

export function stableHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalJson(value: ProposedValue): string {
  return JSON.stringify(value, Object.keys(value).sort());
}
