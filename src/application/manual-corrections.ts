import { randomUUID } from "node:crypto";
import type { AppDatabase } from "@/db/client";
import {
  createManualAssertion,
  createManualAssertionInTransaction,
  retractManualAssertion,
} from "@/db/manual-assertions";
import { withImmediateTransaction } from "@/db/write";
import {
  ManualAssertionError,
  type ManualCreationInput,
  type ManualFieldValue,
} from "@/domain/manual-assertions";
import type { OpportunityOutcome } from "@/domain/models";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OUTCOMES = new Set<OpportunityOutcome>([
  "unknown",
  "rejected",
  "offer",
  "candidate_withdrew",
  "closed_without_outcome",
]);
const FIELDS = new Set([
  "recruiter:canonical_name",
  "recruiter_identity:email",
  "recruiter_identity:valid_from",
  "recruiter_identity:valid_to",
  "recruiter_affiliation:organization_id",
  "recruiter_affiliation:valid_from",
  "recruiter_affiliation:valid_to",
  "organization:display_name",
  "opportunity:title",
  "opportunity:staffing_organization_id",
  "opportunity:end_client_organization_id",
  "opportunity:introduced_at",
  "opportunity:outcome_state",
]);

function text(value: unknown, maximum = 300) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum)
    throw new ManualAssertionError("invalid_input");
  return value.trim();
}

function date(value: unknown, nullable = false): string | null {
  if (nullable && value === null) return null;
  const candidate = text(value, 40);
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*Z)?$/.test(candidate) || Number.isNaN(Date.parse(candidate)))
    throw new ManualAssertionError("invalid_input");
  return candidate;
}

export function validateManualField(input: unknown): ManualFieldValue {
  if (!input || typeof input !== "object") throw new ManualAssertionError("invalid_input");
  const raw = input as Record<string, unknown>;
  const key = `${String(raw.entityKind)}:${String(raw.fieldName)}`;
  if (!FIELDS.has(key)) throw new ManualAssertionError("unsupported_field");
  let value = raw.value;
  if (raw.fieldName === "email") {
    value = text(value, 320).toLocaleLowerCase("en-US");
    if (!EMAIL.test(String(value))) throw new ManualAssertionError("invalid_input");
  } else if (raw.fieldName === "valid_from" || raw.fieldName === "introduced_at") {
    value = date(value);
  } else if (raw.fieldName === "valid_to") {
    value = date(value, true);
  } else if (raw.fieldName === "outcome_state") {
    if (typeof value !== "string" || !OUTCOMES.has(value as OpportunityOutcome))
      throw new ManualAssertionError("invalid_input");
  } else if (raw.fieldName === "end_client_organization_id") {
    value = value === null ? null : text(value, 100);
  } else {
    value = text(value, 300);
  }
  return { entityKind: raw.entityKind, fieldName: raw.fieldName, value } as ManualFieldValue;
}

export function correctManualValue(
  database: AppDatabase,
  ownerId: string,
  entityId: string,
  input: unknown,
  expectedRevision: number,
  now = new Date().toISOString(),
) {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
    throw new ManualAssertionError("invalid_input");
  return createManualAssertion(
    database,
    ownerId,
    text(entityId, 100),
    validateManualField(input),
    expectedRevision,
    now,
  );
}

export function retractManualValue(
  database: AppDatabase,
  ownerId: string,
  assertionId: string,
  expectedRevision: number,
  now = new Date().toISOString(),
) {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
    throw new ManualAssertionError("invalid_input");
  return retractManualAssertion(database, ownerId, text(assertionId, 100), expectedRevision, now);
}

export function createManualEntity(
  database: AppDatabase,
  ownerId: string,
  raw: unknown,
  now = new Date().toISOString(),
) {
  if (!raw || typeof raw !== "object") throw new ManualAssertionError("invalid_input");
  const input = raw as ManualCreationInput;
  return withImmediateTransaction(database, () => {
    if (input.kind === "recruiter") {
      const recruiterId = randomUUID();
      const identityId = randomUUID();
      const name = text(input.name);
      const email = text(input.email, 320).toLocaleLowerCase("en-US");
      if (!EMAIL.test(email)) throw new ManualAssertionError("invalid_input");
      const validFrom = date(input.validFrom ?? now.slice(0, 10)) as string;
      database.sqlite
        .prepare(
          "insert into recruiters (id, owner_id, canonical_name, created_at) values (?, ?, ?, ?)",
        )
        .run(recruiterId, ownerId, name, now);
      database.sqlite
        .prepare(`insert into recruiter_identities
          (id, owner_id, recruiter_id, normalized_email, display_email, valid_from, valid_to, created_at)
          values (?, ?, ?, ?, ?, ?, null, ?)`)
        .run(identityId, ownerId, recruiterId, email, email, validFrom, now);
      createManualAssertionInTransaction(
        database,
        ownerId,
        recruiterId,
        { entityKind: "recruiter", fieldName: "canonical_name", value: name },
        0,
        now,
      );
      createManualAssertionInTransaction(
        database,
        ownerId,
        identityId,
        { entityKind: "recruiter_identity", fieldName: "email", value: email },
        0,
        now,
      );
      return { kind: input.kind, id: recruiterId };
    }
    if (input.kind === "organization") {
      const id = randomUUID();
      const name = text(input.name);
      database.sqlite
        .prepare(`insert into organizations
        (id, owner_id, display_name, normalized_name, created_at) values (?, ?, ?, ?, ?)`)
        .run(id, ownerId, name, name.toLocaleLowerCase("en-US"), now);
      createManualAssertionInTransaction(
        database,
        ownerId,
        id,
        { entityKind: "organization", fieldName: "display_name", value: name },
        0,
        now,
      );
      return { kind: input.kind, id };
    }
    if (input.kind === "opportunity") {
      const id = randomUUID();
      const recruiterId = text(input.recruiterId, 100);
      const staffingId = text(input.staffingOrganizationId, 100);
      const title = text(input.title ?? input.name);
      const introducedAt = date(input.introducedAt) as string;
      const outcome = input.outcome ?? "unknown";
      if (!OUTCOMES.has(outcome)) throw new ManualAssertionError("invalid_input");
      const recruiter = database.sqlite
        .prepare("select 1 from recruiters where owner_id = ? and id = ?")
        .get(ownerId, recruiterId);
      const organization = database.sqlite
        .prepare("select 1 from organizations where owner_id = ? and id = ?")
        .get(ownerId, staffingId);
      if (!recruiter || !organization) throw new ManualAssertionError("not_found");
      database.sqlite
        .prepare(`insert into opportunities
        (id, owner_id, recruiter_id, staffing_organization_id, end_client_organization_id,
         title, source_key, introduced_at, outcome_state, created_at)
        values (?, ?, ?, ?, null, ?, ?, ?, ?, ?)`)
        .run(
          id,
          ownerId,
          recruiterId,
          staffingId,
          title,
          `manual:${id}`,
          introducedAt,
          outcome,
          now,
        );
      createManualAssertionInTransaction(
        database,
        ownerId,
        id,
        { entityKind: "opportunity", fieldName: "title", value: title },
        0,
        now,
      );
      return { kind: input.kind, id };
    }
    throw new ManualAssertionError("invalid_input");
  });
}
