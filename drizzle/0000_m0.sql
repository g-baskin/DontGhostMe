CREATE TABLE `communication_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`source_reference_id` text NOT NULL,
	`recruiter_identity_id` text,
	`direction` text NOT NULL,
	`occurred_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_reference_id`) REFERENCES `source_references`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`recruiter_identity_id`) REFERENCES `recruiter_identities`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "communication_events_direction_check" CHECK("communication_events"."direction" in ('recruiter_to_candidate', 'candidate_to_recruiter'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `communication_events_source_uq` ON `communication_events` (`source_reference_id`);--> statement-breakpoint
CREATE INDEX `communication_events_timeline_idx` ON `communication_events` (`owner_id`,`conversation_id`,`occurred_at`,`id`);--> statement-breakpoint
CREATE TABLE `conversation_opportunities` (
	`owner_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`opportunity_id` text NOT NULL,
	PRIMARY KEY(`owner_id`, `conversation_id`, `opportunity_id`),
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`recruiter_id` text NOT NULL,
	`thread_key` text NOT NULL,
	`subject` text NOT NULL,
	`started_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`recruiter_id`) REFERENCES `recruiters`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_owner_thread_key_uq` ON `conversations` (`owner_id`,`thread_key`);--> statement-breakpoint
CREATE TABLE `evidence_assertions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`source_reference_id` text NOT NULL,
	`recruiter_id` text,
	`opportunity_id` text,
	`affiliation_id` text,
	`fact_type` text NOT NULL,
	`canonical_value_json` text NOT NULL,
	`excerpt` text NOT NULL,
	`confidence_basis_points` integer NOT NULL,
	`inferred` integer NOT NULL,
	`review_requirement` text NOT NULL,
	`occurred_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_reference_id`) REFERENCES `source_references`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`recruiter_id`) REFERENCES `recruiters`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`affiliation_id`) REFERENCES `recruiter_affiliations`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "evidence_assertions_entity_check" CHECK("evidence_assertions"."recruiter_id" is not null or "evidence_assertions"."opportunity_id" is not null or "evidence_assertions"."affiliation_id" is not null),
	CONSTRAINT "evidence_assertions_confidence_check" CHECK("evidence_assertions"."confidence_basis_points" between 0 and 10000),
	CONSTRAINT "evidence_assertions_review_requirement_check" CHECK("evidence_assertions"."review_requirement" in ('none', 'user_review'))
);
--> statement-breakpoint
CREATE INDEX `evidence_assertions_source_idx` ON `evidence_assertions` (`owner_id`,`source_reference_id`);--> statement-breakpoint
CREATE INDEX `evidence_assertions_fact_type_idx` ON `evidence_assertions` (`owner_id`,`fact_type`);--> statement-breakpoint
CREATE INDEX `evidence_assertions_recruiter_idx` ON `evidence_assertions` (`owner_id`,`recruiter_id`);--> statement-breakpoint
CREATE INDEX `evidence_assertions_opportunity_idx` ON `evidence_assertions` (`owner_id`,`opportunity_id`);--> statement-breakpoint
CREATE INDEX `evidence_assertions_review_idx` ON `evidence_assertions` (`owner_id`,`review_requirement`);--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`batch_key` text NOT NULL,
	`source_set_hash` text NOT NULL,
	`status` text NOT NULL,
	`checkpoint_source_key` text,
	`processed_count` integer NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "import_batches_status_check" CHECK("import_batches"."status" in ('running', 'completed', 'failed')),
	CONSTRAINT "import_batches_processed_count_check" CHECK("import_batches"."processed_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_batches_owner_batch_key_uq` ON `import_batches` (`owner_id`,`batch_key`);--> statement-breakpoint
CREATE TABLE `opportunities` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`recruiter_id` text NOT NULL,
	`staffing_organization_id` text NOT NULL,
	`end_client_organization_id` text,
	`title` text NOT NULL,
	`source_key` text NOT NULL,
	`introduced_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`recruiter_id`) REFERENCES `recruiters`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`staffing_organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`end_client_organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `opportunities_owner_source_key_uq` ON `opportunities` (`owner_id`,`source_key`);--> statement-breakpoint
CREATE INDEX `opportunities_owner_recruiter_date_idx` ON `opportunities` (`owner_id`,`recruiter_id`,`introduced_at`);--> statement-breakpoint
CREATE INDEX `opportunities_owner_date_idx` ON `opportunities` (`owner_id`,`introduced_at`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`display_name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `organizations_owner_name_idx` ON `organizations` (`owner_id`,`normalized_name`);--> statement-breakpoint
CREATE TABLE `owners` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recruiter_affiliations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`recruiter_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`valid_from` text NOT NULL,
	`valid_to` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`recruiter_id`) REFERENCES `recruiters`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "recruiter_affiliations_valid_range" CHECK("recruiter_affiliations"."valid_to" is null or "recruiter_affiliations"."valid_to" >= "recruiter_affiliations"."valid_from")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recruiter_affiliations_owner_recruiter_org_from_uq` ON `recruiter_affiliations` (`owner_id`,`recruiter_id`,`organization_id`,`valid_from`);--> statement-breakpoint
CREATE TABLE `recruiter_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`recruiter_id` text NOT NULL,
	`normalized_email` text NOT NULL,
	`display_email` text NOT NULL,
	`valid_from` text NOT NULL,
	`valid_to` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`recruiter_id`) REFERENCES `recruiters`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "recruiter_identities_valid_range" CHECK("recruiter_identities"."valid_to" is null or "recruiter_identities"."valid_to" >= "recruiter_identities"."valid_from")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recruiter_identities_owner_email_uq` ON `recruiter_identities` (`owner_id`,`normalized_email`);--> statement-breakpoint
CREATE TABLE `recruiters` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`canonical_name` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `recruiters_owner_name_idx` ON `recruiters` (`owner_id`,`canonical_name`);--> statement-breakpoint
CREATE TABLE `review_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`assertion_id` text NOT NULL,
	`revision` integer NOT NULL,
	`decision` text NOT NULL,
	`corrected_value_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`assertion_id`) REFERENCES `evidence_assertions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "review_decisions_decision_check" CHECK("review_decisions"."decision" in ('confirmed', 'rejected', 'corrected')),
	CONSTRAINT "review_decisions_corrected_value_check" CHECK(("review_decisions"."decision" = 'corrected' and "review_decisions"."corrected_value_json" is not null) or ("review_decisions"."decision" != 'corrected' and "review_decisions"."corrected_value_json" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_decisions_owner_assertion_revision_uq` ON `review_decisions` (`owner_id`,`assertion_id`,`revision`);--> statement-breakpoint
CREATE TABLE `source_references` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`source_kind` text NOT NULL,
	`source_key` text NOT NULL,
	`content` text NOT NULL,
	`content_sha256` text NOT NULL,
	`occurred_at` text NOT NULL,
	`captured_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_references_owner_kind_key_uq` ON `source_references` (`owner_id`,`source_kind`,`source_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `source_references_owner_hash_key_uq` ON `source_references` (`owner_id`,`content_sha256`,`source_key`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`opportunity_id` text NOT NULL,
	`recruiter_id` text NOT NULL,
	`submitted_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`recruiter_id`) REFERENCES `recruiters`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submissions_owner_opportunity_uq` ON `submissions` (`owner_id`,`opportunity_id`);