import { createHash, randomUUID } from "node:crypto";
import { normalizeClassificationEmail } from "@/classification/engine";
import { CLASSIFICATION_LIMITS } from "@/classification/rules";
import type {
  ClassificationDecisionInput,
  ClassificationProposalType,
  ProposedValue,
} from "@/domain/classification";
import { ClassificationInputError, ClassificationNotFoundError } from "./classification";
import type { AppDatabase } from "./client";
import { withImmediateTransaction } from "./write";

interface ProposalRow {
  id: string;
  proposal_key: string;
  proposal_type: ClassificationProposalType;
  proposed_value_json: string;
  confidence_basis_points: number;
  state: string;
  promoted_entity_kind: string | null;
  promoted_entity_id: string | null;
}

interface SourceRow {
  id: string;
  safe_text: string;
  sent_at: string | null;
  created_at: string;
  sender_json: string;
  recipients_json: string;
  normalized_message_id: string | null;
}

export function decideClassificationProposal(
  database: AppDatabase,
  ownerId: string,
  proposalId: string,
  input: ClassificationDecisionInput,
  now = new Date(),
) {
  return withImmediateTransaction(database, () => {
    const proposal = getProposal(database, ownerId, proposalId);
    const revision = currentRevision(database, ownerId, proposalId);
    const correctedJson =
      input.decision === "corrected"
        ? validateProposedValue(proposal.proposal_type, input.correctedValue)
        : null;
    if (input.decision === "corrected" && !correctedJson)
      throw new ClassificationInputError("invalid_run_state");
    if (revision !== input.expectedRevision) {
      const latest = database.sqlite
        .prepare(
          "select decision, corrected_value_json from classification_decisions where owner_id = ? and proposal_id = ? and revision = ?",
        )
        .get(ownerId, proposalId, revision) as
        | { decision: string; corrected_value_json: string | null }
        | undefined;
      if (
        proposal.promoted_entity_id &&
        input.expectedRevision === revision - 1 &&
        latest?.decision === input.decision &&
        latest.corrected_value_json === correctedJson
      )
        return { revision, promotedEntityId: proposal.promoted_entity_id };
      throw new ClassificationDecisionConflict();
    }
    if (proposal.promoted_entity_id && input.decision !== "rejected")
      return { revision, promotedEntityId: proposal.promoted_entity_id };
    const nextRevision = revision + 1;
    const timestamp = now.toISOString();
    database.sqlite
      .prepare(
        `insert into classification_decisions
          (id, owner_id, proposal_id, revision, decision, corrected_value_json, created_at)
         values (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        ownerId,
        proposalId,
        nextRevision,
        input.decision,
        correctedJson,
        timestamp,
      );
    if (input.decision === "rejected") {
      database.sqlite
        .prepare(
          "update classification_proposals set state = 'rejected', updated_at = ? where id = ? and owner_id = ?",
        )
        .run(timestamp, proposalId, ownerId);
      return { revision: nextRevision, promotedEntityId: null };
    }
    if (
      proposal.proposal_type === "linkedin_export_row" ||
      proposal.proposal_type === "linkedin_notification"
    ) {
      // Review-only evidence types: decisions never silently create or mutate
      // recruiters, opportunities, submissions, or relationship statuses.
      database.sqlite
        .prepare(
          "update classification_proposals set state = ?, updated_at = ? where id = ? and owner_id = ?",
        )
        .run(
          input.decision === "corrected" ? "corrected" : "accepted",
          timestamp,
          proposalId,
          ownerId,
        );
      return { revision: nextRevision, promotedEntityId: null };
    }
    const value = JSON.parse(correctedJson ?? proposal.proposed_value_json) as ProposedValue;
    const promoted = promote(database, ownerId, proposal, value, timestamp, input.decision);
    database.sqlite
      .prepare(
        `update classification_proposals set state = ?, promoted_entity_kind = ?,
          promoted_entity_id = ?, updated_at = ? where id = ? and owner_id = ?`,
      )
      .run(
        input.decision === "corrected" ? "corrected" : "accepted",
        promoted.kind,
        promoted.id,
        timestamp,
        proposalId,
        ownerId,
      );
    return { revision: nextRevision, promotedEntityId: promoted.id };
  });
}

function promote(
  database: AppDatabase,
  ownerId: string,
  proposal: ProposalRow,
  value: ProposedValue,
  timestamp: string,
  decision: ClassificationDecisionInput["decision"],
): { kind: string; id: string } {
  const source = getSource(database, ownerId, proposal.id);
  const sourceReferenceId = ensureSourceReference(database, ownerId, source, timestamp);
  let promoted: {
    kind: string;
    id: string;
    recruiterId?: string;
    opportunityId?: string;
    affiliationId?: string;
  };
  switch (proposal.proposal_type) {
    case "recruiter_identity":
      promoted = promoteRecruiterIdentity(database, ownerId, value, source, timestamp);
      break;
    case "identity_link":
      promoted = promoteIdentityLink(database, ownerId, value, source, timestamp, decision);
      break;
    case "organization_affiliation":
      promoted = promoteAffiliation(database, ownerId, value, source, timestamp);
      break;
    case "opportunity":
      promoted = promoteOpportunity(
        database,
        ownerId,
        proposal.proposal_key,
        value,
        source,
        timestamp,
      );
      break;
    case "conversation_group":
      promoted = promoteConversation(database, ownerId, value, source, timestamp);
      break;
    case "message_direction":
      promoted = promoteCommunication(
        database,
        ownerId,
        value,
        source,
        sourceReferenceId,
        timestamp,
      );
      break;
    case "submission":
      promoted = promoteSubmission(database, ownerId, value, timestamp);
      break;
    case "linkedin_export_row":
    case "linkedin_notification":
      throw new ClassificationInputError("invalid_run_state");
  }
  const assertionId = randomUUID();
  const excerpt = database.sqlite
    .prepare(
      "select excerpt from classification_evidence where proposal_id = ? and owner_id = ? order by id limit 1",
    )
    .get(proposal.id, ownerId) as { excerpt: string } | undefined;
  database.sqlite
    .prepare(
      `insert into evidence_assertions
        (id, owner_id, source_reference_id, recruiter_id, opportunity_id, affiliation_id,
         fact_type, canonical_value_json, excerpt, confidence_basis_points, inferred,
         review_requirement, occurred_at, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'none', ?, ?)`,
    )
    .run(
      assertionId,
      ownerId,
      sourceReferenceId,
      promoted.recruiterId ?? (promoted.kind === "recruiter" ? promoted.id : null),
      promoted.opportunityId ?? (promoted.kind === "opportunity" ? promoted.id : null),
      promoted.affiliationId ?? (promoted.kind === "affiliation" ? promoted.id : null),
      proposal.proposal_type,
      JSON.stringify(value),
      excerpt?.excerpt ?? "",
      proposal.confidence_basis_points,
      source.sent_at ?? source.created_at,
      timestamp,
    );
  database.sqlite
    .prepare(
      `insert into review_decisions
        (id, owner_id, assertion_id, revision, decision, corrected_value_json, created_at)
       values (?, ?, ?, 1, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      ownerId,
      assertionId,
      decision === "corrected" ? "corrected" : "confirmed",
      decision === "corrected" ? JSON.stringify(value) : null,
      timestamp,
    );
  return promoted;
}

function promoteRecruiterIdentity(
  database: AppDatabase,
  ownerId: string,
  value: ProposedValue,
  source: SourceRow,
  timestamp: string,
) {
  const identity = recruiterIdentityValue(value);
  const existing = findRecruiterByEmail(database, ownerId, identity.normalizedEmail);
  if (existing)
    return { kind: "recruiter", id: existing.recruiter_id, recruiterId: existing.recruiter_id };
  const recruiterId = randomUUID();
  database.sqlite
    .prepare(
      "insert into recruiters (id, owner_id, canonical_name, created_at) values (?, ?, ?, ?)",
    )
    .run(recruiterId, ownerId, identity.name, timestamp);
  database.sqlite
    .prepare(
      `insert into recruiter_identities
        (id, owner_id, recruiter_id, normalized_email, display_email, valid_from, created_at)
       values (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      ownerId,
      recruiterId,
      identity.normalizedEmail,
      identity.displayEmail,
      source.sent_at ?? source.created_at,
      timestamp,
    );
  return { kind: "recruiter", id: recruiterId, recruiterId };
}

function promoteIdentityLink(
  database: AppDatabase,
  ownerId: string,
  value: ProposedValue,
  source: SourceRow,
  timestamp: string,
  decision: ClassificationDecisionInput["decision"],
) {
  if (!("emailA" in value)) throw new ClassificationDependencyError();
  const first = findRecruiterByEmail(database, ownerId, value.emailA);
  const second = findRecruiterByEmail(database, ownerId, value.emailB);
  if (decision === "split") {
    if (!second || !first || first.recruiter_id !== second.recruiter_id)
      throw new ClassificationDependencyError();
    const recruiterId = randomUUID();
    database.sqlite
      .prepare(
        "insert into recruiters (id, owner_id, canonical_name, created_at) values (?, ?, ?, ?)",
      )
      .run(recruiterId, ownerId, value.emailB.split("@")[0], timestamp);
    database.sqlite
      .prepare("update recruiter_identities set recruiter_id = ? where id = ? and owner_id = ?")
      .run(recruiterId, second.identity_id, ownerId);
    return { kind: "recruiter", id: recruiterId, recruiterId };
  }
  if (first && second && first.recruiter_id !== second.recruiter_id) {
    if (decision !== "merge") throw new ClassificationDependencyError();
    mergeRecruiters(database, ownerId, first.recruiter_id, second.recruiter_id);
    return { kind: "recruiter", id: first.recruiter_id, recruiterId: first.recruiter_id };
  }
  const recruiterId = first?.recruiter_id ?? second?.recruiter_id;
  if (!recruiterId) throw new ClassificationDependencyError();
  const missingEmail = first ? value.emailB : value.emailA;
  database.sqlite
    .prepare(
      `insert into recruiter_identities
        (id, owner_id, recruiter_id, normalized_email, display_email, valid_from, created_at)
       values (?, ?, ?, ?, ?, ?, ?) on conflict(owner_id, normalized_email) do nothing`,
    )
    .run(
      randomUUID(),
      ownerId,
      recruiterId,
      missingEmail,
      missingEmail,
      source.sent_at ?? source.created_at,
      timestamp,
    );
  return { kind: "recruiter", id: recruiterId, recruiterId };
}

function promoteAffiliation(
  database: AppDatabase,
  ownerId: string,
  value: ProposedValue,
  source: SourceRow,
  timestamp: string,
) {
  if (!("organization" in value)) throw new ClassificationDependencyError();
  const recruiter = findRecruiterByEmail(database, ownerId, value.normalizedEmail);
  if (!recruiter) throw new ClassificationDependencyError();
  const organizationId = ensureOrganization(database, ownerId, value.organization, timestamp);
  const validFrom = source.sent_at ?? source.created_at;
  const existing = database.sqlite
    .prepare(
      `select id from recruiter_affiliations
       where owner_id = ? and recruiter_id = ? and organization_id = ? and valid_from = ?`,
    )
    .get(ownerId, recruiter.recruiter_id, organizationId, validFrom) as { id: string } | undefined;
  const id = existing?.id ?? randomUUID();
  if (!existing)
    database.sqlite
      .prepare(
        `insert into recruiter_affiliations
          (id, owner_id, recruiter_id, organization_id, valid_from, created_at)
         values (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, ownerId, recruiter.recruiter_id, organizationId, validFrom, timestamp);
  return { kind: "affiliation", id, recruiterId: recruiter.recruiter_id, affiliationId: id };
}

function promoteOpportunity(
  database: AppDatabase,
  ownerId: string,
  proposalKey: string,
  value: ProposedValue,
  source: SourceRow,
  timestamp: string,
) {
  if (!("recruiterEmail" in value) || !("title" in value))
    throw new ClassificationDependencyError();
  const recruiter = findRecruiterByEmail(database, ownerId, value.recruiterEmail);
  if (!recruiter) throw new ClassificationDependencyError();
  const affiliation = database.sqlite
    .prepare(
      `select organization_id from recruiter_affiliations
       where owner_id = ? and recruiter_id = ? order by valid_from desc limit 1`,
    )
    .get(ownerId, recruiter.recruiter_id) as { organization_id: string } | undefined;
  if (!affiliation) throw new ClassificationDependencyError();
  const clientId = value.client
    ? ensureOrganization(database, ownerId, value.client, timestamp)
    : null;
  const existing = database.sqlite
    .prepare("select id from opportunities where owner_id = ? and source_key = ?")
    .get(ownerId, `classification:${proposalKey}`) as { id: string } | undefined;
  const id = existing?.id ?? randomUUID();
  if (!existing)
    database.sqlite
      .prepare(
        `insert into opportunities
          (id, owner_id, recruiter_id, staffing_organization_id, end_client_organization_id,
           title, source_key, introduced_at, outcome_state, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, 'unknown', ?)`,
      )
      .run(
        id,
        ownerId,
        recruiter.recruiter_id,
        affiliation.organization_id,
        clientId,
        value.title,
        `classification:${proposalKey}`,
        source.sent_at ?? source.created_at,
        timestamp,
      );
  return { kind: "opportunity", id, recruiterId: recruiter.recruiter_id, opportunityId: id };
}

function promoteConversation(
  database: AppDatabase,
  ownerId: string,
  value: ProposedValue,
  source: SourceRow,
  timestamp: string,
) {
  if (!("messageIds" in value)) throw new ClassificationDependencyError();
  const recruiter = recruiterFromSource(database, ownerId, source);
  if (!recruiter) throw new ClassificationDependencyError();
  const existing = database.sqlite
    .prepare("select id from conversations where owner_id = ? and thread_key = ?")
    .get(ownerId, value.threadKey) as { id: string } | undefined;
  const id = existing?.id ?? randomUUID();
  if (!existing)
    database.sqlite
      .prepare(
        `insert into conversations
          (id, owner_id, recruiter_id, thread_key, subject, started_at, created_at)
         values (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        ownerId,
        recruiter.recruiter_id,
        value.threadKey,
        value.subject,
        source.sent_at ?? source.created_at,
        timestamp,
      );
  return { kind: "conversation", id, recruiterId: recruiter.recruiter_id };
}

function promoteCommunication(
  database: AppDatabase,
  ownerId: string,
  value: ProposedValue,
  source: SourceRow,
  sourceReferenceId: string,
  timestamp: string,
) {
  if (!("direction" in value) || value.direction === "unknown")
    throw new ClassificationDependencyError();
  const recruiter = recruiterFromSource(database, ownerId, source);
  if (!recruiter) throw new ClassificationDependencyError();
  const conversation = database.sqlite
    .prepare(
      `select id from conversations where owner_id = ? and recruiter_id = ? and thread_key = ?`,
    )
    .get(ownerId, recruiter.recruiter_id, value.threadKey) as { id: string } | undefined;
  if (!conversation) throw new ClassificationDependencyError();
  const existing = database.sqlite
    .prepare("select id from communication_events where source_reference_id = ?")
    .get(sourceReferenceId) as { id: string } | undefined;
  const id = existing?.id ?? randomUUID();
  if (!existing)
    database.sqlite
      .prepare(
        `insert into communication_events
          (id, owner_id, conversation_id, source_reference_id, recruiter_identity_id,
           direction, occurred_at, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        ownerId,
        conversation.id,
        sourceReferenceId,
        recruiter.identity_id,
        value.direction,
        source.sent_at ?? source.created_at,
        timestamp,
      );
  return { kind: "communication", id, recruiterId: recruiter.recruiter_id };
}

function promoteSubmission(
  database: AppDatabase,
  ownerId: string,
  value: ProposedValue,
  timestamp: string,
) {
  if (!("submittedAt" in value)) throw new ClassificationDependencyError();
  const recruiter = findRecruiterByEmail(database, ownerId, value.recruiterEmail);
  if (!recruiter) throw new ClassificationDependencyError();
  const opportunities = database.sqlite
    .prepare(
      `select o.id from opportunities o
       left join organizations client on client.id = o.end_client_organization_id
       where o.owner_id = ? and o.recruiter_id = ? and lower(client.normalized_name) = ?`,
    )
    .all(ownerId, recruiter.recruiter_id, normalizeOrganization(value.client)) as Array<{
    id: string;
  }>;
  if (opportunities.length !== 1) throw new ClassificationDependencyError();
  const opportunityId = opportunities[0]?.id as string;
  const existing = database.sqlite
    .prepare("select id from submissions where owner_id = ? and opportunity_id = ?")
    .get(ownerId, opportunityId) as { id: string } | undefined;
  const id = existing?.id ?? randomUUID();
  if (!existing)
    database.sqlite
      .prepare(
        `insert into submissions
          (id, owner_id, opportunity_id, recruiter_id, submitted_at, created_at)
         values (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, ownerId, opportunityId, recruiter.recruiter_id, value.submittedAt, timestamp);
  return { kind: "submission", id, recruiterId: recruiter.recruiter_id, opportunityId };
}

function mergeRecruiters(
  database: AppDatabase,
  ownerId: string,
  targetId: string,
  sourceId: string,
) {
  database.sqlite
    .prepare(
      "update recruiter_identities set recruiter_id = ? where owner_id = ? and recruiter_id = ?",
    )
    .run(targetId, ownerId, sourceId);
  for (const table of [
    "recruiter_affiliations",
    "opportunities",
    "submissions",
    "conversations",
    "evidence_assertions",
  ]) {
    database.sqlite
      .prepare(`update ${table} set recruiter_id = ? where owner_id = ? and recruiter_id = ?`)
      .run(targetId, ownerId, sourceId);
  }
  database.sqlite
    .prepare("delete from recruiters where id = ? and owner_id = ?")
    .run(sourceId, ownerId);
}

function getProposal(database: AppDatabase, ownerId: string, proposalId: string) {
  const row = database.sqlite
    .prepare("select * from classification_proposals where id = ? and owner_id = ?")
    .get(proposalId, ownerId) as ProposalRow | undefined;
  if (!row) throw new ClassificationNotFoundError();
  return row;
}

function currentRevision(database: AppDatabase, ownerId: string, proposalId: string) {
  return (
    database.sqlite
      .prepare(
        "select coalesce(max(revision), 0) as revision from classification_decisions where owner_id = ? and proposal_id = ?",
      )
      .get(ownerId, proposalId) as { revision: number }
  ).revision;
}

function getSource(database: AppDatabase, ownerId: string, proposalId: string) {
  const source = database.sqlite
    .prepare(
      `select nm.id, nm.safe_text, nm.sent_at, nm.created_at, nm.sender_json, nm.recipients_json
       from classification_evidence ce
       join normalized_messages nm on nm.id = ce.normalized_message_id
       where ce.proposal_id = ? and ce.owner_id = ? order by ce.id limit 1`,
    )
    .get(proposalId, ownerId) as SourceRow | undefined;
  if (!source) throw new ClassificationDependencyError();
  return source;
}

function ensureSourceReference(
  database: AppDatabase,
  ownerId: string,
  source: SourceRow,
  timestamp: string,
) {
  const sourceKey = `normalized:${source.id}`;
  database.sqlite
    .prepare(
      `insert into source_references
        (id, owner_id, source_kind, source_key, content, content_sha256, occurred_at, captured_at)
       values (?, ?, 'historical_mbox', ?, ?, ?, ?, ?)
       on conflict(owner_id, source_kind, source_key) do nothing`,
    )
    .run(
      randomUUID(),
      ownerId,
      sourceKey,
      source.safe_text,
      createHash("sha256").update(source.safe_text).digest("hex"),
      source.sent_at ?? source.created_at,
      timestamp,
    );
  const row = database.sqlite
    .prepare(
      "select id from source_references where owner_id = ? and source_kind = 'historical_mbox' and source_key = ?",
    )
    .get(ownerId, sourceKey) as { id: string };
  return row.id;
}

function findRecruiterByEmail(database: AppDatabase, ownerId: string, email: string) {
  return database.sqlite
    .prepare(
      `select id as identity_id, recruiter_id from recruiter_identities
       where owner_id = ? and normalized_email = ?`,
    )
    .get(ownerId, normalizeClassificationEmail(email)) as
    | { identity_id: string; recruiter_id: string }
    | undefined;
}

function recruiterFromSource(database: AppDatabase, ownerId: string, source: SourceRow) {
  const candidates = [...addresses(source.sender_json), ...addresses(source.recipients_json)];
  for (const email of candidates) {
    const recruiter = findRecruiterByEmail(database, ownerId, email);
    if (recruiter) return recruiter;
  }
  return undefined;
}

function addresses(json: string): string[] {
  try {
    const value: unknown = JSON.parse(json);
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const address = (item as Record<string, unknown>).address;
      return typeof address === "string" ? [address] : [];
    });
  } catch {
    return [];
  }
}

function ensureOrganization(
  database: AppDatabase,
  ownerId: string,
  name: string,
  timestamp: string,
) {
  const normalized = normalizeOrganization(name);
  const existing = database.sqlite
    .prepare(
      "select id from organizations where owner_id = ? and normalized_name = ? order by id limit 1",
    )
    .get(ownerId, normalized) as { id: string } | undefined;
  if (existing) return existing.id;
  const id = randomUUID();
  database.sqlite
    .prepare(
      "insert into organizations (id, owner_id, display_name, normalized_name, created_at) values (?, ?, ?, ?, ?)",
    )
    .run(id, ownerId, name.trim().slice(0, 120), normalized, timestamp);
  return id;
}

function normalizeOrganization(value: string) {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120);
  if (!normalized) throw new ClassificationDependencyError();
  return normalized;
}

function recruiterIdentityValue(value: ProposedValue) {
  if (!("normalizedEmail" in value) || !("name" in value) || !("displayEmail" in value))
    throw new ClassificationDependencyError();
  const normalizedEmail = normalizeClassificationEmail(value.normalizedEmail);
  if (!normalizedEmail || !value.name.trim()) throw new ClassificationDependencyError();
  return { ...value, normalizedEmail };
}

function validateProposedValue(type: ClassificationProposalType, value: ProposedValue | undefined) {
  if (!value || typeof value !== "object") return null;
  const json = JSON.stringify(value);
  if (Buffer.byteLength(json) > CLASSIFICATION_LIMITS.proposedValueBytes) return null;
  const valid =
    (type === "message_direction" && "direction" in value && "messageId" in value) ||
    (type === "recruiter_identity" && "normalizedEmail" in value && "name" in value) ||
    (type === "identity_link" && "emailA" in value && "emailB" in value) ||
    (type === "organization_affiliation" && "organization" in value) ||
    (type === "opportunity" && "title" in value && "recruiterEmail" in value) ||
    (type === "conversation_group" && "messageIds" in value) ||
    (type === "submission" && "submittedAt" in value && "client" in value);
  return valid ? json : null;
}

export class ClassificationDecisionConflict extends Error {
  constructor() {
    super("classification_revision_conflict");
    this.name = "ClassificationDecisionConflict";
  }
}

export class ClassificationDependencyError extends Error {
  constructor() {
    super("classification_dependency_required");
    this.name = "ClassificationDependencyError";
  }
}
