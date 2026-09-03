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
  CONSTRAINT `classification_proposals_type_check` CHECK(`proposal_type` in ('message_direction', 'recruiter_identity', 'identity_link', 'organization_affiliation', 'opportunity', 'conversation_group', 'submission', 'linkedin_export_row', 'linkedin_notification')),
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
