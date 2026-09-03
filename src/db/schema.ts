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
    outcomeState: text("outcome_state").notNull().default("unknown"),
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
    check("opportunities_outcome_check", sql`${table.outcomeState} = 'unknown'`),
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

export const historicalImports = sqliteTable(
  "historical_imports",
  {
    id: text().primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    sourceFingerprint: text("source_fingerprint"),
    originalNameDisplay: text("original_name_display").notNull(),
    sourceSizeBytes: integer("source_size_bytes").notNull().default(0),
    stagedExpiresAt: text("staged_expires_at"),
    stagedSourceDeleted: integer("staged_source_deleted", { mode: "boolean" })
      .notNull()
      .default(false),
    status: text().notNull(),
    discoveredCount: integer("discovered_count").notNull().default(0),
    parsedCount: integer("parsed_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    importedCount: integer("imported_count").notNull().default(0),
    lastErrorCode: text("last_error_code"),
    createdAt: text("created_at").notNull(),
    startedAt: text("started_at"),
    updatedAt: text("updated_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [
    uniqueIndex("historical_imports_owner_fingerprint_uq").on(
      table.ownerId,
      table.sourceFingerprint,
    ),
    index("historical_imports_owner_status_time_idx").on(
      table.ownerId,
      table.status,
      table.updatedAt,
    ),
    check(
      "historical_imports_status_check",
      sql`${table.status} in ('uploading', 'preview_ready', 'processing', 'paused_user', 'paused_interrupted', 'completed', 'failed', 'cancelled')`,
    ),
    check(
      "historical_imports_counts_check",
      sql`${table.sourceSizeBytes} >= 0 and ${table.discoveredCount} >= 0 and ${table.parsedCount} >= 0 and ${table.skippedCount} >= 0 and ${table.duplicateCount} >= 0 and ${table.failedCount} >= 0 and ${table.importedCount} >= 0`,
    ),
  ],
);

export const importCheckpoints = sqliteTable(
  "import_checkpoints",
  {
    id: text().primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    historicalImportId: text("historical_import_id")
      .notNull()
      .references(() => historicalImports.id, { onDelete: "cascade" }),
    sourceFingerprint: text("source_fingerprint").notNull(),
    committedByteOffset: integer("committed_byte_offset").notNull().default(0),
    messageOrdinal: integer("message_ordinal").notNull().default(0),
    discoveredCount: integer("discovered_count").notNull().default(0),
    parsedCount: integer("parsed_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    importedCount: integer("imported_count").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("import_checkpoints_import_uq").on(table.historicalImportId),
    index("import_checkpoints_owner_idx").on(table.ownerId, table.historicalImportId),
    check(
      "import_checkpoints_values_check",
      sql`${table.committedByteOffset} >= 0 and ${table.messageOrdinal} >= 0 and ${table.discoveredCount} >= 0 and ${table.parsedCount} >= 0 and ${table.skippedCount} >= 0 and ${table.duplicateCount} >= 0 and ${table.failedCount} >= 0 and ${table.importedCount} >= 0`,
    ),
  ],
);

export const importSourceMessages = sqliteTable(
  "import_source_messages",
  {
    id: text().primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    historicalImportId: text("historical_import_id")
      .notNull()
      .references(() => historicalImports.id, { onDelete: "cascade" }),
    messageOrdinal: integer("message_ordinal").notNull(),
    byteOffset: integer("byte_offset").notNull(),
    byteLength: integer("byte_length").notNull(),
    rawSha256: text("raw_sha256").notNull(),
    canonicalSha256: text("canonical_sha256"),
    normalizedMessageId: text("normalized_message_id"),
    parseStatus: text("parse_status").notNull(),
    warningCodesJson: text("warning_codes_json").notNull().default("[]"),
    errorCode: text("error_code"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("import_source_messages_import_ordinal_uq").on(
      table.historicalImportId,
      table.messageOrdinal,
    ),
    index("import_source_messages_owner_raw_hash_idx").on(table.ownerId, table.rawSha256),
    index("import_source_messages_owner_canonical_hash_idx").on(
      table.ownerId,
      table.canonicalSha256,
    ),
    index("import_source_messages_owner_message_id_idx").on(
      table.ownerId,
      table.normalizedMessageId,
    ),
    check(
      "import_source_messages_status_check",
      sql`${table.parseStatus} in ('imported', 'conflict', 'failed', 'skipped')`,
    ),
    check(
      "import_source_messages_offsets_check",
      sql`${table.messageOrdinal} > 0 and ${table.byteOffset} >= 0 and ${table.byteLength} >= 0`,
    ),
  ],
);

export const normalizedMessages = sqliteTable(
  "normalized_messages",
  {
    id: text().primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    sourceMessageId: text("source_message_id")
      .notNull()
      .references(() => importSourceMessages.id, { onDelete: "cascade" }),
    sentAt: text("sent_at"),
    subject: text().notNull(),
    senderJson: text("sender_json").notNull(),
    recipientsJson: text("recipients_json").notNull(),
    replyToJson: text("reply_to_json").notNull(),
    normalizedMessageId: text("normalized_message_id"),
    referencesJson: text("references_json").notNull(),
    safeText: text("safe_text").notNull(),
    textTruncated: integer("text_truncated", { mode: "boolean" }).notNull().default(false),
    warningCodesJson: text("warning_codes_json").notNull().default("[]"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("normalized_messages_source_uq").on(table.sourceMessageId),
    index("normalized_messages_owner_date_idx").on(table.ownerId, table.sentAt),
    index("normalized_messages_owner_message_id_idx").on(table.ownerId, table.normalizedMessageId),
  ],
);

export const attachmentInventory = sqliteTable(
  "attachment_inventory",
  {
    id: text().primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    sourceMessageId: text("source_message_id")
      .notNull()
      .references(() => importSourceMessages.id, { onDelete: "cascade" }),
    ordinal: integer().notNull(),
    filenameDisplay: text("filename_display"),
    mediaType: text("media_type").notNull(),
    disposition: text(),
    decodedSizeBytes: integer("decoded_size_bytes").notNull(),
    contentSha256: text("content_sha256").notNull(),
    oversized: integer({ mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("attachment_inventory_source_ordinal_uq").on(table.sourceMessageId, table.ordinal),
    index("attachment_inventory_owner_source_idx").on(table.ownerId, table.sourceMessageId),
    check(
      "attachment_inventory_values_check",
      sql`${table.ordinal} >= 0 and ${table.decodedSizeBytes} >= 0`,
    ),
  ],
);

export const importErrors = sqliteTable(
  "import_errors",
  {
    id: text().primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    historicalImportId: text("historical_import_id")
      .notNull()
      .references(() => historicalImports.id, { onDelete: "cascade" }),
    sourceMessageId: text("source_message_id").references(() => importSourceMessages.id, {
      onDelete: "cascade",
    }),
    stage: text().notNull(),
    code: text().notNull(),
    recoverable: integer({ mode: "boolean" }).notNull(),
    messageOrdinal: integer("message_ordinal"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("import_errors_owner_import_idx").on(table.ownerId, table.historicalImportId),
    check(
      "import_errors_ordinal_check",
      sql`${table.messageOrdinal} is null or ${table.messageOrdinal} > 0`,
    ),
  ],
);

export const ownerEmailIdentities = sqliteTable(
  "owner_email_identities",
  {
    id: text().primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    normalizedEmail: text("normalized_email").notNull(),
    displayEmail: text("display_email").notNull(),
    confirmedAt: text("confirmed_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("owner_email_identities_owner_email_uq").on(table.ownerId, table.normalizedEmail),
  ],
);

export const classificationRuns = sqliteTable(
  "classification_runs",
  {
    id: text().primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    engineVersion: text("engine_version").notNull(),
    rulesetSha256: text("ruleset_sha256").notNull(),
    sourceSetSha256: text("source_set_sha256").notNull(),
    status: text().notNull(),
    processedCount: integer("processed_count").notNull().default(0),
    proposalCount: integer("proposal_count").notNull().default(0),
    checkpointMessageId: text("checkpoint_message_id"),
    errorCode: text("error_code"),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("classification_runs_idempotency_uq").on(
      table.ownerId,
      table.engineVersion,
      table.rulesetSha256,
      table.sourceSetSha256,
    ),
    index("classification_runs_owner_status_idx").on(table.ownerId, table.status, table.updatedAt),
    check(
      "classification_runs_status_check",
      sql`${table.status} in ('running', 'completed', 'failed', 'superseded')`,
    ),
    check(
      "classification_runs_counts_check",
      sql`${table.processedCount} >= 0 and ${table.proposalCount} >= 0`,
    ),
    check(
      "classification_runs_error_check",
      sql`${table.errorCode} is null or ${table.errorCode} = 'classification_failed'`,
    ),
  ],
);

export const classificationProposals = sqliteTable(
  "classification_proposals",
  {
    id: text().primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    runId: text("run_id")
      .notNull()
      .references(() => classificationRuns.id, { onDelete: "cascade" }),
    proposalKey: text("proposal_key").notNull(),
    proposalType: text("proposal_type").notNull(),
    proposedValueJson: text("proposed_value_json").notNull(),
    confidenceBasisPoints: integer("confidence_basis_points").notNull(),
    reviewRequirement: text("review_requirement").notNull(),
    state: text().notNull().default("proposed"),
    supersedesProposalId: text("supersedes_proposal_id"),
    promotedEntityKind: text("promoted_entity_kind"),
    promotedEntityId: text("promoted_entity_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("classification_proposals_run_key_uq").on(table.runId, table.proposalKey),
    index("classification_proposals_owner_state_type_idx").on(
      table.ownerId,
      table.state,
      table.proposalType,
    ),
    check(
      "classification_proposals_type_check",
      sql`${table.proposalType} in ('message_direction', 'recruiter_identity', 'identity_link', 'organization_affiliation', 'opportunity', 'conversation_group', 'submission')`,
    ),
    check(
      "classification_proposals_confidence_check",
      sql`${table.confidenceBasisPoints} between 0 and 10000`,
    ),
    check(
      "classification_proposals_review_check",
      sql`${table.reviewRequirement} in ('none', 'user_review')`,
    ),
    check(
      "classification_proposals_state_check",
      sql`${table.state} in ('proposed', 'accepted', 'rejected', 'corrected', 'superseded')`,
    ),
    check(
      "classification_proposals_value_size_check",
      sql`length(cast(${table.proposedValueJson} as blob)) <= 16384`,
    ),
    check(
      "classification_proposals_promotion_check",
      sql`(${table.promotedEntityKind} is null) = (${table.promotedEntityId} is null)`,
    ),
  ],
);

export const classificationEvidence = sqliteTable(
  "classification_evidence",
  {
    id: text().primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    proposalId: text("proposal_id")
      .notNull()
      .references(() => classificationProposals.id, { onDelete: "cascade" }),
    normalizedMessageId: text("normalized_message_id")
      .notNull()
      .references(() => normalizedMessages.id, { onDelete: "cascade" }),
    signalCode: text("signal_code").notNull(),
    contributionBasisPoints: integer("contribution_basis_points").notNull(),
    excerpt: text().notNull(),
    excerptStart: integer("excerpt_start").notNull(),
    excerptEnd: integer("excerpt_end").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("classification_evidence_tuple_uq").on(
      table.proposalId,
      table.normalizedMessageId,
      table.signalCode,
      table.excerptStart,
      table.excerptEnd,
    ),
    index("classification_evidence_owner_proposal_idx").on(table.ownerId, table.proposalId),
    check(
      "classification_evidence_excerpt_check",
      sql`${table.excerptStart} >= 0 and ${table.excerptEnd} >= ${table.excerptStart} and length(${table.excerpt}) <= 280`,
    ),
  ],
);

export const classificationDecisions = sqliteTable(
  "classification_decisions",
  {
    id: text().primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    proposalId: text("proposal_id")
      .notNull()
      .references(() => classificationProposals.id, { onDelete: "restrict" }),
    revision: integer().notNull(),
    decision: text().notNull(),
    correctedValueJson: text("corrected_value_json"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("classification_decisions_owner_proposal_revision_uq").on(
      table.ownerId,
      table.proposalId,
      table.revision,
    ),
    index("classification_decisions_owner_proposal_idx").on(table.ownerId, table.proposalId),
    check("classification_decisions_revision_check", sql`${table.revision} > 0`),
    check(
      "classification_decisions_decision_check",
      sql`${table.decision} in ('accepted', 'rejected', 'corrected', 'merge', 'split')`,
    ),
    check(
      "classification_decisions_value_check",
      sql`(${table.decision} = 'corrected' and ${table.correctedValueJson} is not null and length(cast(${table.correctedValueJson} as blob)) <= 16384) or (${table.decision} != 'corrected' and ${table.correctedValueJson} is null)`,
    ),
  ],
);
