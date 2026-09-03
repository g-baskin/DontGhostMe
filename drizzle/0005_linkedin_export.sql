ALTER TABLE `historical_imports` ADD `source_kind` text DEFAULT 'gmail_mbox' NOT NULL CHECK (`source_kind` in ('gmail_mbox', 'linkedin_export'));--> statement-breakpoint
ALTER TABLE `import_checkpoints` ADD `logical_cursor_json` text CHECK (`logical_cursor_json` is null or length(cast(`logical_cursor_json` as blob)) <= 4096);--> statement-breakpoint
CREATE TABLE `import_source_records` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_id` text NOT NULL,
  `historical_import_id` text NOT NULL,
  `dataset_kind` text NOT NULL,
  `row_ordinal` integer NOT NULL,
  `row_sha256` text NOT NULL,
  `normalized_json` text NOT NULL,
  `parse_status` text NOT NULL,
  `error_code` text,
  `created_at` text NOT NULL,
  FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`historical_import_id`) REFERENCES `historical_imports`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `import_source_records_dataset_check` CHECK(`dataset_kind` in ('connections', 'invitations', 'job_applications')),
  CONSTRAINT `import_source_records_status_check` CHECK(`parse_status` in ('parsed', 'failed', 'ignored')),
  CONSTRAINT `import_source_records_row_check` CHECK(`row_ordinal` > 0),
  CONSTRAINT `import_source_records_hash_check` CHECK(length(`row_sha256`) = 64),
  CONSTRAINT `import_source_records_json_size_check` CHECK(length(cast(`normalized_json` as blob)) <= 262144)
);--> statement-breakpoint
CREATE UNIQUE INDEX `import_source_records_import_dataset_row_uq` ON `import_source_records` (`historical_import_id`,`dataset_kind`,`row_ordinal`);--> statement-breakpoint
CREATE INDEX `import_source_records_owner_import_idx` ON `import_source_records` (`owner_id`,`historical_import_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_classification_proposals` (
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
  CONSTRAINT `classification_proposals_type_check` CHECK(`proposal_type` in ('message_direction', 'recruiter_identity', 'identity_link', 'organization_affiliation', 'opportunity', 'conversation_group', 'submission', 'linkedin_export_row')),
  CONSTRAINT `classification_proposals_confidence_check` CHECK(`confidence_basis_points` between 0 and 10000),
  CONSTRAINT `classification_proposals_review_check` CHECK(`review_requirement` in ('none', 'user_review')),
  CONSTRAINT `classification_proposals_state_check` CHECK(`state` in ('proposed', 'accepted', 'rejected', 'corrected', 'superseded')),
  CONSTRAINT `classification_proposals_value_size_check` CHECK(length(cast(`proposed_value_json` as blob)) <= 16384),
  CONSTRAINT `classification_proposals_promotion_check` CHECK((`promoted_entity_kind` is null) = (`promoted_entity_id` is null))
);--> statement-breakpoint
INSERT INTO `__new_classification_proposals` SELECT * FROM `classification_proposals`;--> statement-breakpoint
DROP TABLE `classification_proposals`;--> statement-breakpoint
ALTER TABLE `__new_classification_proposals` RENAME TO `classification_proposals`;--> statement-breakpoint
CREATE UNIQUE INDEX `classification_proposals_run_key_uq` ON `classification_proposals` (`run_id`,`proposal_key`);--> statement-breakpoint
CREATE INDEX `classification_proposals_owner_state_type_idx` ON `classification_proposals` (`owner_id`,`state`,`proposal_type`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
