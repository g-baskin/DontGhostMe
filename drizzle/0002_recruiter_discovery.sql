CREATE TABLE `classification_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`proposal_id` text NOT NULL,
	`revision` integer NOT NULL,
	`decision` text NOT NULL,
	`corrected_value_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`proposal_id`) REFERENCES `classification_proposals`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "classification_decisions_revision_check" CHECK("classification_decisions"."revision" > 0),
	CONSTRAINT "classification_decisions_decision_check" CHECK("classification_decisions"."decision" in ('accepted', 'rejected', 'corrected', 'merge', 'split')),
	CONSTRAINT "classification_decisions_value_check" CHECK(("classification_decisions"."decision" = 'corrected' and "classification_decisions"."corrected_value_json" is not null and length(cast("classification_decisions"."corrected_value_json" as blob)) <= 16384) or ("classification_decisions"."decision" != 'corrected' and "classification_decisions"."corrected_value_json" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `classification_decisions_owner_proposal_revision_uq` ON `classification_decisions` (`owner_id`,`proposal_id`,`revision`);--> statement-breakpoint
CREATE INDEX `classification_decisions_owner_proposal_idx` ON `classification_decisions` (`owner_id`,`proposal_id`);--> statement-breakpoint
CREATE TABLE `classification_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`proposal_id` text NOT NULL,
	`normalized_message_id` text NOT NULL,
	`signal_code` text NOT NULL,
	`contribution_basis_points` integer NOT NULL,
	`excerpt` text NOT NULL,
	`excerpt_start` integer NOT NULL,
	`excerpt_end` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`proposal_id`) REFERENCES `classification_proposals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`normalized_message_id`) REFERENCES `normalized_messages`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "classification_evidence_excerpt_check" CHECK("classification_evidence"."excerpt_start" >= 0 and "classification_evidence"."excerpt_end" >= "classification_evidence"."excerpt_start" and length("classification_evidence"."excerpt") <= 280)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `classification_evidence_tuple_uq` ON `classification_evidence` (`proposal_id`,`normalized_message_id`,`signal_code`,`excerpt_start`,`excerpt_end`);--> statement-breakpoint
CREATE INDEX `classification_evidence_owner_proposal_idx` ON `classification_evidence` (`owner_id`,`proposal_id`);--> statement-breakpoint
CREATE TABLE `classification_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`run_id` text NOT NULL,
	`proposal_key` text NOT NULL,
	`proposal_type` text NOT NULL,
	`proposed_value_json` text NOT NULL,
	`confidence_basis_points` integer NOT NULL,
	`review_requirement` text NOT NULL,
	`state` text DEFAULT 'proposed' NOT NULL,
	`supersedes_proposal_id` text,
	`promoted_entity_kind` text,
	`promoted_entity_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`run_id`) REFERENCES `classification_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "classification_proposals_type_check" CHECK("classification_proposals"."proposal_type" in ('message_direction', 'recruiter_identity', 'identity_link', 'organization_affiliation', 'opportunity', 'conversation_group', 'submission')),
	CONSTRAINT "classification_proposals_confidence_check" CHECK("classification_proposals"."confidence_basis_points" between 0 and 10000),
	CONSTRAINT "classification_proposals_review_check" CHECK("classification_proposals"."review_requirement" in ('none', 'user_review')),
	CONSTRAINT "classification_proposals_state_check" CHECK("classification_proposals"."state" in ('proposed', 'accepted', 'rejected', 'corrected', 'superseded')),
	CONSTRAINT "classification_proposals_value_size_check" CHECK(length(cast("classification_proposals"."proposed_value_json" as blob)) <= 16384),
	CONSTRAINT "classification_proposals_promotion_check" CHECK(("classification_proposals"."promoted_entity_kind" is null) = ("classification_proposals"."promoted_entity_id" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `classification_proposals_run_key_uq` ON `classification_proposals` (`run_id`,`proposal_key`);--> statement-breakpoint
CREATE INDEX `classification_proposals_owner_state_type_idx` ON `classification_proposals` (`owner_id`,`state`,`proposal_type`);--> statement-breakpoint
CREATE TABLE `classification_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`engine_version` text NOT NULL,
	`ruleset_sha256` text NOT NULL,
	`source_set_sha256` text NOT NULL,
	`status` text NOT NULL,
	`processed_count` integer DEFAULT 0 NOT NULL,
	`proposal_count` integer DEFAULT 0 NOT NULL,
	`checkpoint_message_id` text,
	`error_code` text,
	`started_at` text NOT NULL,
	`completed_at` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "classification_runs_status_check" CHECK("classification_runs"."status" in ('running', 'completed', 'failed', 'superseded')),
	CONSTRAINT "classification_runs_counts_check" CHECK("classification_runs"."processed_count" >= 0 and "classification_runs"."proposal_count" >= 0),
	CONSTRAINT "classification_runs_error_check" CHECK("classification_runs"."error_code" is null or "classification_runs"."error_code" = 'classification_failed')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `classification_runs_idempotency_uq` ON `classification_runs` (`owner_id`,`engine_version`,`ruleset_sha256`,`source_set_sha256`);--> statement-breakpoint
CREATE INDEX `classification_runs_owner_status_idx` ON `classification_runs` (`owner_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `owner_email_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`normalized_email` text NOT NULL,
	`display_email` text NOT NULL,
	`confirmed_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `owner_email_identities_owner_email_uq` ON `owner_email_identities` (`owner_id`,`normalized_email`);--> statement-breakpoint
ALTER TABLE `opportunities` ADD `outcome_state` text DEFAULT 'unknown' NOT NULL CHECK (`outcome_state` = 'unknown');