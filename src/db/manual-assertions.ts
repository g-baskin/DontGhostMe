import { createHash, randomUUID } from "node:crypto";
import {
  type ManualAssertion,
  ManualAssertionError,
  type ManualFieldValue,
} from "@/domain/manual-assertions";
import type { AppDatabase } from "./client";
import { withImmediateTransaction } from "./write";

const ENTITY_TABLES = {
  recruiter: "recruiters",
  recruiter_identity: "recruiter_identities",
  recruiter_affiliation: "recruiter_affiliations",
  organization: "organizations",
  opportunity: "opportunities",
} as const;

interface AssertionRow {
  id: string;
  owner_id: string;
  entity_kind: ManualFieldValue["entityKind"];
  entity_id: string;
  field_name: string;
  value_json: string;
  source_reference_id: string;
  supersedes_assertion_id: string | null;
  retracted_at: string | null;
  created_at: string;
  revision: number;
}

function parseRow(row: AssertionRow): ManualAssertion {
  return {
    id: row.id,
    ownerId: row.owner_id,
    entityKind: row.entity_kind,
    entityId: row.entity_id,
    fieldName: row.field_name,
    value: JSON.parse(row.value_json) as never,
    sourceReferenceId: row.source_reference_id,
    supersedesAssertionId: row.supersedes_assertion_id,
    retractedAt: row.retracted_at,
    createdAt: row.created_at,
    revision: row.revision,
  } as ManualAssertion;
}

export function latestManualAssertion(
  database: AppDatabase,
  ownerId: string,
  entityKind: ManualFieldValue["entityKind"],
  entityId: string,
  fieldName: string,
): ManualAssertion | null {
  const row = database.sqlite
    .prepare(
      `select ma.*, (select count(*) from manual_assertions history
       where history.owner_id = ma.owner_id and history.entity_kind = ma.entity_kind
       and history.entity_id = ma.entity_id and history.field_name = ma.field_name) as revision
       from manual_assertions ma where ma.owner_id = ? and ma.entity_kind = ?
       and ma.entity_id = ? and ma.field_name = ? and ma.retracted_at is null
       and not exists (select 1 from manual_assertions newer
         where newer.owner_id = ma.owner_id and newer.supersedes_assertion_id = ma.id
         and newer.retracted_at is null)
       order by ma.created_at desc, ma.id desc limit 1`,
    )
    .get(ownerId, entityKind, entityId, fieldName) as AssertionRow | undefined;
  return row ? parseRow(row) : null;
}

export function listManualAssertions(database: AppDatabase, ownerId: string, entityId: string) {
  return (
    database.sqlite
      .prepare(
        `select ma.*, row_number() over (
         partition by ma.entity_kind, ma.entity_id, ma.field_name order by ma.created_at, ma.id
       ) as revision from manual_assertions ma
       where ma.owner_id = ? and ma.entity_id = ? order by ma.created_at, ma.id`,
      )
      .all(ownerId, entityId) as AssertionRow[]
  ).map(parseRow);
}

export function createManualAssertionInTransaction(
  database: AppDatabase,
  ownerId: string,
  entityId: string,
  field: ManualFieldValue,
  expectedRevision: number,
  now: string,
): ManualAssertion {
  const table = ENTITY_TABLES[field.entityKind];
  const entity = database.sqlite
    .prepare(`select 1 from ${table} where owner_id = ? and id = ?`)
    .get(ownerId, entityId);
  if (!entity) throw new ManualAssertionError("not_found");
  const latest = latestManualAssertion(
    database,
    ownerId,
    field.entityKind,
    entityId,
    field.fieldName,
  );
  if ((latest?.revision ?? 0) !== expectedRevision)
    throw new ManualAssertionError("revision_conflict");

  const id = randomUUID();
  const sourceReferenceId = randomUUID();
  const sourceKey = `manual:${id}`;
  const valueJson = JSON.stringify(field.value);
  const content = JSON.stringify({ entityKind: field.entityKind, fieldName: field.fieldName });
  database.sqlite
    .prepare(
      `insert into source_references
         (id, owner_id, source_kind, source_key, content, content_sha256, occurred_at, captured_at)
         values (?, ?, 'user_manual', ?, ?, ?, ?, ?)`,
    )
    .run(
      sourceReferenceId,
      ownerId,
      sourceKey,
      content,
      createHash("sha256").update(content).digest("hex"),
      now,
      now,
    );
  database.sqlite
    .prepare(
      `insert into manual_assertions
         (id, owner_id, entity_kind, entity_id, field_name, value_json, source_reference_id,
          supersedes_assertion_id, retracted_at, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, null, ?)`,
    )
    .run(
      id,
      ownerId,
      field.entityKind,
      entityId,
      field.fieldName,
      valueJson,
      sourceReferenceId,
      latest?.id ?? null,
      now,
    );
  const created = latestManualAssertion(
    database,
    ownerId,
    field.entityKind,
    entityId,
    field.fieldName,
  );
  if (!created) throw new Error("manual_assertion_write_failed");
  return created;
}

export function createManualAssertion(
  database: AppDatabase,
  ownerId: string,
  entityId: string,
  field: ManualFieldValue,
  expectedRevision: number,
  now: string,
): ManualAssertion {
  return withImmediateTransaction(database, () =>
    createManualAssertionInTransaction(database, ownerId, entityId, field, expectedRevision, now),
  );
}

export function retractManualAssertion(
  database: AppDatabase,
  ownerId: string,
  assertionId: string,
  expectedRevision: number,
  now: string,
) {
  return withImmediateTransaction(database, () => {
    const row = database.sqlite
      .prepare("select * from manual_assertions where owner_id = ? and id = ?")
      .get(ownerId, assertionId) as AssertionRow | undefined;
    if (!row) throw new ManualAssertionError("not_found");
    const latest = latestManualAssertion(
      database,
      ownerId,
      row.entity_kind,
      row.entity_id,
      row.field_name,
    );
    if (!latest || latest.id !== assertionId || latest.revision !== expectedRevision)
      throw new ManualAssertionError("revision_conflict");
    database.sqlite
      .prepare(
        "update manual_assertions set retracted_at = coalesce(retracted_at, ?) where owner_id = ? and id = ?",
      )
      .run(now, ownerId, assertionId);
    return { id: assertionId, retractedAt: now };
  });
}
