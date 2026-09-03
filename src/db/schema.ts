import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const owners = sqliteTable("owners", {
  id: text().primaryKey(),
  displayName: text("display_name").notNull(),
  createdAt: text("created_at").notNull(),
});

export const recruiters = sqliteTable(
  "recruiters",
  {
    id: text().primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    canonicalName: text("canonical_name").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("recruiters_owner_name_idx").on(table.ownerId, table.canonicalName)],
);

export const recruiterIdentities = sqliteTable(
  "recruiter_identities",
  {
    id: text().primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    recruiterId: text("recruiter_id")
      .notNull()
      .references(() => recruiters.id, { onDelete: "cascade" }),
    normalizedEmail: text("normalized_email").notNull(),
    displayEmail: text("display_email").notNull(),
    validFrom: text("valid_from").notNull(),
    validTo: text("valid_to"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("recruiter_identities_owner_email_uq").on(table.ownerId, table.normalizedEmail),
    check(
      "recruiter_identities_valid_range",
      sql`${table.validTo} is null or ${table.validTo} >= ${table.validFrom}`,
    ),
  ],
);

export const organizations = sqliteTable(
  "organizations",
  {
    id: text().primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    displayName: text("display_name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("organizations_owner_name_idx").on(table.ownerId, table.normalizedName)],
);

export const recruiterAffiliations = sqliteTable(
  "recruiter_affiliations",
  {
    id: text().primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    recruiterId: text("recruiter_id")
      .notNull()
      .references(() => recruiters.id, { onDelete: "restrict" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    validFrom: text("valid_from").notNull(),
    validTo: text("valid_to"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("recruiter_affiliations_owner_recruiter_org_from_uq").on(
      table.ownerId,
      table.recruiterId,
      table.organizationId,
      table.validFrom,
    ),
    check(
      "recruiter_affiliations_valid_range",
      sql`${table.validTo} is null or ${table.validTo} >= ${table.validFrom}`,
    ),
  ],
);

export const opportunities = sqliteTable(
  "opportunities",
  {
    id: text().primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    recruiterId: text("recruiter_id")
      .notNull()
      .references(() => recruiters.id, { onDelete: "restrict" }),
    staffingOrganizationId: text("staffing_organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    endClientOrganizationId: text("end_client_organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    title: text().notNull(),
    sourceKey: text("source_key").notNull(),
    introducedAt: text("introduced_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("opportunities_owner_source_key_uq").on(table.ownerId, table.sourceKey),
    index("opportunities_owner_recruiter_date_idx").on(
      table.ownerId,
      table.recruiterId,
      table.introducedAt,
    ),
    index("opportunities_owner_date_idx").on(table.ownerId, table.introducedAt),
  ],
);

export const submissions = sqliteTable(
  "submissions",
  {
    id: text().primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "restrict" }),
    recruiterId: text("recruiter_id")
      .notNull()
      .references(() => recruiters.id, { onDelete: "restrict" }),
    submittedAt: text("submitted_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("submissions_owner_opportunity_uq").on(table.ownerId, table.opportunityId),
  ],
);

export const conversations = sqliteTable(
  "conversations",
  {
    id: text().primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    recruiterId: text("recruiter_id")
      .notNull()
      .references(() => recruiters.id, { onDelete: "restrict" }),
    threadKey: text("thread_key").notNull(),
    subject: text().notNull(),
    startedAt: text("started_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("conversations_owner_thread_key_uq").on(table.ownerId, table.threadKey)],
);

export const conversationOpportunities = sqliteTable(
  "conversation_opportunities",
  {
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.ownerId, table.conversationId, table.opportunityId] })],
);

export const sourceReferences = sqliteTable(
  "source_references",
  {
    id: text().primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    sourceKind: text("source_kind").notNull(),
    sourceKey: text("source_key").notNull(),
    content: text().notNull(),
    contentSha256: text("content_sha256").notNull(),
    occurredAt: text("occurred_at").notNull(),
    capturedAt: text("captured_at").notNull(),
  },
  (table) => [
    uniqueIndex("source_references_owner_kind_key_uq").on(
      table.ownerId,
      table.sourceKind,
      table.sourceKey,
    ),
    uniqueIndex("source_references_owner_hash_key_uq").on(
      table.ownerId,
      table.contentSha256,
      table.sourceKey,
    ),
  ],
);

export const communicationEvents = sqliteTable(
  "communication_events",
  {
    id: text().primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "restrict" }),
    sourceReferenceId: text("source_reference_id")
      .notNull()
      .references(() => sourceReferences.id, { onDelete: "restrict" }),
    recruiterIdentityId: text("recruiter_identity_id").references(() => recruiterIdentities.id, {
      onDelete: "restrict",
    }),
    direction: text().notNull(),
    occurredAt: text("occurred_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("communication_events_source_uq").on(table.sourceReferenceId),
    index("communication_events_timeline_idx").on(
      table.ownerId,
      table.conversationId,
      table.occurredAt,
      table.id,
    ),
    check(
      "communication_events_direction_check",
      sql`${table.direction} in ('recruiter_to_candidate', 'candidate_to_recruiter')`,
    ),
  ],
);

export const evidenceAssertions = sqliteTable(
  "evidence_assertions",
  {
    id: text().primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    sourceReferenceId: text("source_reference_id")
      .notNull()
      .references(() => sourceReferences.id, { onDelete: "restrict" }),
    recruiterId: text("recruiter_id").references(() => recruiters.id, { onDelete: "restrict" }),
    opportunityId: text("opportunity_id").references(() => opportunities.id, {
      onDelete: "restrict",
    }),
    affiliationId: text("affiliation_id").references(() => recruiterAffiliations.id, {
      onDelete: "restrict",
    }),
    factType: text("fact_type").notNull(),
    canonicalValueJson: text("canonical_value_json").notNull(),
    excerpt: text().notNull(),
    confidenceBasisPoints: integer("confidence_basis_points").notNull(),
    inferred: integer({ mode: "boolean" }).notNull(),
    reviewRequirement: text("review_requirement").notNull(),
    occurredAt: text("occurred_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("evidence_assertions_source_idx").on(table.ownerId, table.sourceReferenceId),
    index("evidence_assertions_fact_type_idx").on(table.ownerId, table.factType),
    index("evidence_assertions_recruiter_idx").on(table.ownerId, table.recruiterId),
    index("evidence_assertions_opportunity_idx").on(table.ownerId, table.opportunityId),
    index("evidence_assertions_review_idx").on(table.ownerId, table.reviewRequirement),
    check(
      "evidence_assertions_entity_check",
      sql`${table.recruiterId} is not null or ${table.opportunityId} is not null or ${table.affiliationId} is not null`,
    ),
    check(
      "evidence_assertions_confidence_check",
      sql`${table.confidenceBasisPoints} between 0 and 10000`,
    ),
    check(
      "evidence_assertions_review_requirement_check",
      sql`${table.reviewRequirement} in ('none', 'user_review')`,
    ),
  ],
);

export const reviewDecisions = sqliteTable(
  "review_decisions",
  {
    id: text().primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    assertionId: text("assertion_id")
      .notNull()
      .references(() => evidenceAssertions.id, { onDelete: "restrict" }),
    revision: integer().notNull(),
    decision: text().notNull(),
    correctedValueJson: text("corrected_value_json"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("review_decisions_owner_assertion_revision_uq").on(
      table.ownerId,
      table.assertionId,
      table.revision,
    ),
    check(
      "review_decisions_decision_check",
      sql`${table.decision} in ('confirmed', 'rejected', 'corrected')`,
    ),
    check(
      "review_decisions_corrected_value_check",
      sql`(${table.decision} = 'corrected' and ${table.correctedValueJson} is not null) or (${table.decision} != 'corrected' and ${table.correctedValueJson} is null)`,
    ),
  ],
);

export const importBatches = sqliteTable(
  "import_batches",
  {
    id: text().primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    batchKey: text("batch_key").notNull(),
    sourceSetHash: text("source_set_hash").notNull(),
    status: text().notNull(),
    checkpointSourceKey: text("checkpoint_source_key"),
    processedCount: integer("processed_count").notNull(),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [
    uniqueIndex("import_batches_owner_batch_key_uq").on(table.ownerId, table.batchKey),
    check(
      "import_batches_status_check",
      sql`${table.status} in ('running', 'completed', 'failed')`,
    ),
    check("import_batches_processed_count_check", sql`${table.processedCount} >= 0`),
  ],
);
