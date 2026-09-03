import { createHash, randomUUID } from "node:crypto";
import { classifyMessage, normalizeClassificationEmail } from "@/classification/engine";
import {
  CLASSIFICATION_ENGINE_VERSION,
  CLASSIFICATION_LIMITS,
  CLASSIFICATION_RULESET_SHA256,
} from "@/classification/rules";
import type {
  ClassificationAddress,
  ClassificationMessage,
  ClassificationProposal,
  ClassificationProposalDraft,
  ClassificationProposalType,
  ClassificationRun,
  ClassificationState,
  OwnerEmailIdentity,
} from "@/domain/classification";
import type { AppDatabase } from "./client";
import { withImmediateTransaction } from "./write";

interface RunRow {
  id: string;
  owner_id: string;
  engine_version: string;
  ruleset_sha256: string;
  source_set_sha256: string;
  status: ClassificationRun["status"];
  processed_count: number;
  proposal_count: number;
  checkpoint_message_id: string | null;
  error_code: ClassificationRun["errorCode"];
  started_at: string;
  completed_at: string | null;
  updated_at: string;
}

interface MessageRow {
  id: string;
  source_message_id: string;
  sent_at: string | null;
  subject: string;
  sender_json: string;
  recipients_json: string;
  reply_to_json: string;
  normalized_message_id: string | null;
  references_json: string;
  safe_text: string;
  text_truncated: number;
  warning_codes_json: string;
}

export function listOwnerEmailIdentities(
  database: AppDatabase,
  ownerId: string,
): OwnerEmailIdentity[] {
  return (
    database.sqlite
      .prepare(
        `select id, owner_id, normalized_email, display_email, confirmed_at, created_at, updated_at
         from owner_email_identities where owner_id = ? order by normalized_email`,
      )
      .all(ownerId) as Array<{
      id: string;
      owner_id: string;
      normalized_email: string;
      display_email: string;
      confirmed_at: string;
      created_at: string;
      updated_at: string;
    }>
  ).map((row) => ({
    id: row.id,
    ownerId: row.owner_id,
    normalizedEmail: row.normalized_email,
    displayEmail: row.display_email,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function addOwnerEmailIdentity(
  database: AppDatabase,
  ownerId: string,
  displayEmail: string,
  now = new Date(),
): OwnerEmailIdentity {
  const normalizedEmail = normalizeClassificationEmail(displayEmail);
  if (!normalizedEmail) throw new ClassificationInputError("invalid_owner_email");
  const timestamp = now.toISOString();
  withImmediateTransaction(database, () => {
    database.sqlite
      .prepare(
        `insert into owner_email_identities
          (id, owner_id, normalized_email, display_email, confirmed_at, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?)
         on conflict(owner_id, normalized_email) do update set
          display_email = excluded.display_email,
          confirmed_at = excluded.confirmed_at,
          updated_at = excluded.updated_at`,
      )
      .run(
        randomUUID(),
        ownerId,
        normalizedEmail,
        displayEmail.trim(),
        timestamp,
        timestamp,
        timestamp,
      );
  });
  const identity = listOwnerEmailIdentities(database, ownerId).find(
    (candidate) => candidate.normalizedEmail === normalizedEmail,
  );
  if (!identity) throw new Error("classification_identity_write_failed");
  return identity;
}

export function deleteOwnerEmailIdentity(
  database: AppDatabase,
  ownerId: string,
  identityId: string,
) {
  withImmediateTransaction(database, () => {
    const result = database.sqlite
      .prepare("delete from owner_email_identities where id = ? and owner_id = ?")
      .run(identityId, ownerId);
    if (result.changes !== 1) throw new ClassificationNotFoundError();
  });
}

export function sourceSetSha256(database: AppDatabase, ownerId: string) {
  const rows = database.sqlite
    .prepare(
      `select nm.id, ism.canonical_sha256
       from normalized_messages nm
       join import_source_messages ism on ism.id = nm.source_message_id
       where nm.owner_id = ? order by nm.id`,
    )
    .all(ownerId) as Array<{ id: string; canonical_sha256: string | null }>;
  const hash = createHash("sha256");
  for (const identity of listOwnerEmailIdentities(database, ownerId))
    hash.update(`owner:${identity.normalizedEmail}\n`);
  for (const row of rows) hash.update(`${row.id}:${row.canonical_sha256 ?? ""}\n`);
  return hash.digest("hex");
}

export function startClassificationRun(
  database: AppDatabase,
  ownerId: string,
  now = new Date(),
  configuration: { engineVersion: string; rulesetSha256: string } = {
    engineVersion: CLASSIFICATION_ENGINE_VERSION,
    rulesetSha256: CLASSIFICATION_RULESET_SHA256,
  },
): ClassificationRun {
  if (listOwnerEmailIdentities(database, ownerId).length === 0)
    throw new ClassificationInputError("owner_email_required");
  const sourceHash = sourceSetSha256(database, ownerId);
  const timestamp = now.toISOString();
  withImmediateTransaction(database, () => {
    database.sqlite
      .prepare(
        `insert into classification_runs
          (id, owner_id, engine_version, ruleset_sha256, source_set_sha256, status,
           processed_count, proposal_count, started_at, updated_at)
         values (?, ?, ?, ?, ?, 'running', 0, 0, ?, ?)
         on conflict(owner_id, engine_version, ruleset_sha256, source_set_sha256) do nothing`,
      )
      .run(
        randomUUID(),
        ownerId,
        configuration.engineVersion,
        configuration.rulesetSha256,
        sourceHash,
        timestamp,
        timestamp,
      );
  });
  const row = database.sqlite
    .prepare(
      `select * from classification_runs
       where owner_id = ? and engine_version = ? and ruleset_sha256 = ? and source_set_sha256 = ?`,
    )
    .get(ownerId, configuration.engineVersion, configuration.rulesetSha256, sourceHash) as
    | RunRow
    | undefined;
  if (!row) throw new Error("classification_run_write_failed");
  return mapRun(row);
}

export function listClassificationRuns(
  database: AppDatabase,
  ownerId: string,
): ClassificationRun[] {
  return (
    database.sqlite
      .prepare("select * from classification_runs where owner_id = ? order by started_at desc")
      .all(ownerId) as RunRow[]
  ).map(mapRun);
}

export function getClassificationRun(database: AppDatabase, ownerId: string, runId: string) {
  const row = database.sqlite
    .prepare("select * from classification_runs where id = ? and owner_id = ?")
    .get(runId, ownerId) as RunRow | undefined;
  if (!row) throw new ClassificationNotFoundError();
  return mapRun(row);
}

export function processClassificationBatch(
  database: AppDatabase,
  ownerId: string,
  runId: string,
  now = new Date(),
): ClassificationRun {
  const run = getClassificationRun(database, ownerId, runId);
  if (run.status === "completed") return run;
  if (run.status !== "running") throw new ClassificationInputError("invalid_run_state");
  try {
    const messages = readMessageBatch(database, ownerId, run.checkpointMessageId);
    if (messages.length === 0) {
      withImmediateTransaction(database, () => {
        database.sqlite
          .prepare(
            "update classification_runs set status = 'completed', completed_at = ?, updated_at = ? where id = ? and owner_id = ? and status = 'running'",
          )
          .run(now.toISOString(), now.toISOString(), runId, ownerId);
      });
      return getClassificationRun(database, ownerId, runId);
    }
    const ownerEmails = new Set(
      listOwnerEmailIdentities(database, ownerId).map(({ normalizedEmail }) => normalizedEmail),
    );
    const classified = messages.map((message) => ({
      message,
      proposals: classifyMessage(message, ownerEmails),
    }));
    persistClassificationBatch(database, ownerId, runId, run.checkpointMessageId, classified, now);
    return getClassificationRun(database, ownerId, runId);
  } catch (error) {
    if (error instanceof ClassificationRunConflict) throw error;
    withImmediateTransaction(database, () => {
      database.sqlite
        .prepare(
          "update classification_runs set status = 'failed', error_code = 'classification_failed', updated_at = ? where id = ? and owner_id = ? and status = 'running'",
        )
        .run(now.toISOString(), runId, ownerId);
    });
    throw new ClassificationProcessingError();
  }
}

export function resumeClassificationRun(
  database: AppDatabase,
  ownerId: string,
  runId: string,
  now = new Date(),
) {
  withImmediateTransaction(database, () => {
    const result = database.sqlite
      .prepare(
        "update classification_runs set status = 'running', error_code = null, updated_at = ? where id = ? and owner_id = ? and status = 'failed'",
      )
      .run(now.toISOString(), runId, ownerId);
    if (result.changes !== 1) throw new ClassificationInputError("invalid_run_state");
  });
  return getClassificationRun(database, ownerId, runId);
}

export function listClassificationProposals(
  database: AppDatabase,
  ownerId: string,
  filters: { state?: ClassificationState; type?: ClassificationProposalType } = {},
): ClassificationProposal[] {
  const clauses = ["owner_id = ?"];
  const parameters: unknown[] = [ownerId];
  if (filters.state) {
    clauses.push("state = ?");
    parameters.push(filters.state);
  }
  if (filters.type) {
    clauses.push("proposal_type = ?");
    parameters.push(filters.type);
  }
  const rows = database.sqlite
    .prepare(
      `select * from classification_proposals where ${clauses.join(" and ")}
       order by created_at desc, proposal_key`,
    )
    .all(...parameters) as Array<Record<string, unknown>>;
  return rows.map((row) => {
    const evidence = database.sqlite
      .prepare(
        `select ce.normalized_message_id, ce.signal_code, ce.contribution_basis_points,
          ce.excerpt, ce.excerpt_start, ce.excerpt_end, nm.sent_at,
          hi.original_name_display
         from classification_evidence ce
         join normalized_messages nm on nm.id = ce.normalized_message_id
         join import_source_messages ism on ism.id = nm.source_message_id
         join historical_imports hi on hi.id = ism.historical_import_id
         where ce.proposal_id = ? and ce.owner_id = ?
         order by ce.normalized_message_id, ce.signal_code, ce.excerpt_start, ce.excerpt_end`,
      )
      .all(String(row.id), ownerId) as Array<Record<string, unknown>>;
    const revisionRow = database.sqlite
      .prepare(
        "select coalesce(max(revision), 0) as revision from classification_decisions where proposal_id = ? and owner_id = ?",
      )
      .get(String(row.id), ownerId) as { revision: number };
    return {
      id: String(row.id),
      ownerId,
      runId: String(row.run_id),
      proposalKey: String(row.proposal_key),
      proposalType: row.proposal_type as ClassificationProposalType,
      proposedValue: JSON.parse(String(row.proposed_value_json)),
      confidenceBasisPoints: Number(row.confidence_basis_points),
      reviewRequirement: row.review_requirement as ClassificationProposal["reviewRequirement"],
      state: row.state as ClassificationState,
      supersedesProposalId: row.supersedes_proposal_id ? String(row.supersedes_proposal_id) : null,
      promotedEntityKind: row.promoted_entity_kind ? String(row.promoted_entity_kind) : null,
      promotedEntityId: row.promoted_entity_id ? String(row.promoted_entity_id) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      revision: revisionRow.revision,
      evidence: evidence.map((item) => ({
        normalizedMessageId: String(item.normalized_message_id),
        signalCode: item.signal_code as ClassificationProposal["evidence"][number]["signalCode"],
        contributionBasisPoints: Number(item.contribution_basis_points),
        excerpt: String(item.excerpt),
        excerptStart: Number(item.excerpt_start),
        excerptEnd: Number(item.excerpt_end),
        sourceLabel: String(item.original_name_display),
        sourceDate: item.sent_at ? String(item.sent_at) : null,
      })),
    };
  });
}

function readMessageBatch(
  database: AppDatabase,
  ownerId: string,
  checkpointMessageId: string | null,
): ClassificationMessage[] {
  const rows = database.sqlite
    .prepare(
      `select * from normalized_messages
       where owner_id = ? and (? is null or id > ?)
       order by id limit ?`,
    )
    .all(
      ownerId,
      checkpointMessageId,
      checkpointMessageId,
      CLASSIFICATION_LIMITS.batchMessages,
    ) as MessageRow[];
  return rows.map((row) => ({
    id: row.id,
    sourceMessageId: row.source_message_id,
    sentAt: row.sent_at,
    subject: row.subject,
    sender: parseAddresses(row.sender_json),
    recipients: parseAddresses(row.recipients_json),
    replyTo: parseAddresses(row.reply_to_json),
    normalizedMessageId: row.normalized_message_id,
    references: parseStrings(row.references_json),
    safeText: row.safe_text,
    textTruncated: row.text_truncated === 1,
    warningCodes: parseStrings(row.warning_codes_json),
  }));
}

function persistClassificationBatch(
  database: AppDatabase,
  ownerId: string,
  runId: string,
  expectedCheckpointMessageId: string | null,
  rows: Array<{ message: ClassificationMessage; proposals: ClassificationProposalDraft[] }>,
  now: Date,
) {
  const timestamp = now.toISOString();
  withImmediateTransaction(database, () => {
    let inserted = 0;
    for (const { proposals } of rows) {
      for (const proposal of proposals) {
        const proposalId = randomUUID();
        const previous = database.sqlite
          .prepare(
            `select cp.id from classification_proposals cp
             join classification_evidence ce on ce.proposal_id = cp.id
             left join classification_decisions cd on cd.proposal_id = cp.id
             where cp.owner_id = ? and cp.proposal_type = ? and cp.run_id != ?
               and ce.normalized_message_id = ? and cp.state = 'proposed' and cd.id is null
             order by cp.created_at desc limit 1`,
          )
          .get(
            ownerId,
            proposal.proposalType,
            runId,
            proposal.evidence[0]?.normalizedMessageId ?? "",
          ) as { id: string } | undefined;
        const result = database.sqlite
          .prepare(
            `insert into classification_proposals
              (id, owner_id, run_id, proposal_key, proposal_type, proposed_value_json,
               confidence_basis_points, review_requirement, state, supersedes_proposal_id,
               created_at, updated_at)
             values (?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?, ?, ?)
             on conflict(run_id, proposal_key) do nothing`,
          )
          .run(
            proposalId,
            ownerId,
            runId,
            proposal.proposalKey,
            proposal.proposalType,
            JSON.stringify(proposal.proposedValue),
            proposal.confidenceBasisPoints,
            proposal.reviewRequirement,
            previous?.id ?? null,
            timestamp,
            timestamp,
          );
        if (result.changes === 0) continue;
        inserted += 1;
        if (previous)
          database.sqlite
            .prepare(
              "update classification_proposals set state = 'superseded', updated_at = ? where id = ? and owner_id = ?",
            )
            .run(timestamp, previous.id, ownerId);
        for (const item of proposal.evidence) {
          database.sqlite
            .prepare(
              `insert into classification_evidence
                (id, owner_id, proposal_id, normalized_message_id, signal_code,
                 contribution_basis_points, excerpt, excerpt_start, excerpt_end, created_at)
               values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              randomUUID(),
              ownerId,
              proposalId,
              item.normalizedMessageId,
              item.signalCode,
              item.contributionBasisPoints,
              item.excerpt,
              item.excerptStart,
              item.excerptEnd,
              timestamp,
            );
        }
      }
    }
    const checkpointUpdate = database.sqlite
      .prepare(
        `update classification_runs set
          processed_count = processed_count + ?, proposal_count = proposal_count + ?,
          checkpoint_message_id = ?, updated_at = ?
         where id = ? and owner_id = ? and status = 'running' and checkpoint_message_id is ?`,
      )
      .run(
        rows.length,
        inserted,
        rows.at(-1)?.message.id ?? null,
        timestamp,
        runId,
        ownerId,
        expectedCheckpointMessageId,
      );
    if (checkpointUpdate.changes !== 1) throw new ClassificationRunConflict();
  });
}

function parseAddresses(value: string): ClassificationAddress[] {
  const parsed = parseUnknownArray(value);
  return parsed.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (typeof record.address !== "string") return [];
    return [
      { address: record.address, name: typeof record.name === "string" ? record.name : undefined },
    ];
  });
}

function parseStrings(value: string): string[] {
  return parseUnknownArray(value).filter((item): item is string => typeof item === "string");
}

function parseUnknownArray(value: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapRun(row: RunRow): ClassificationRun {
  return {
    id: row.id,
    ownerId: row.owner_id,
    engineVersion: row.engine_version,
    rulesetSha256: row.ruleset_sha256,
    sourceSetSha256: row.source_set_sha256,
    status: row.status,
    processedCount: row.processed_count,
    proposalCount: row.proposal_count,
    checkpointMessageId: row.checkpoint_message_id,
    errorCode: row.error_code,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

export class ClassificationInputError extends Error {
  constructor(readonly code: "invalid_owner_email" | "owner_email_required" | "invalid_run_state") {
    super(code);
    this.name = "ClassificationInputError";
  }
}

export class ClassificationProcessingError extends Error {
  constructor() {
    super("classification_failed");
    this.name = "ClassificationProcessingError";
  }
}

export class ClassificationRunConflict extends Error {
  constructor() {
    super("classification_run_conflict");
    this.name = "ClassificationRunConflict";
  }
}

export class ClassificationNotFoundError extends Error {
  constructor() {
    super("classification_not_found");
    this.name = "ClassificationNotFoundError";
  }
}
