CREATE TABLE `manual_assertions` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_id` text NOT NULL,
  `entity_kind` text NOT NULL,
  `entity_id` text NOT NULL,
  `field_name` text NOT NULL,
  `value_json` text NOT NULL,
  `source_reference_id` text NOT NULL,
  `supersedes_assertion_id` text,
  `retracted_at` text,
  `created_at` text NOT NULL,
  FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`source_reference_id`) REFERENCES `source_references`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`supersedes_assertion_id`) REFERENCES `manual_assertions`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `manual_assertions_entity_check` CHECK(`entity_kind` in ('recruiter', 'recruiter_identity', 'recruiter_affiliation', 'organization', 'opportunity')),
  CONSTRAINT `manual_assertions_field_check` CHECK(
    (`entity_kind` = 'recruiter' and `field_name` = 'canonical_name') or
    (`entity_kind` = 'recruiter_identity' and `field_name` in ('email', 'valid_from', 'valid_to')) or
    (`entity_kind` = 'recruiter_affiliation' and `field_name` in ('organization_id', 'valid_from', 'valid_to')) or
    (`entity_kind` = 'organization' and `field_name` = 'display_name') or
    (`entity_kind` = 'opportunity' and `field_name` in ('title', 'staffing_organization_id', 'end_client_organization_id', 'introduced_at', 'outcome_state'))
  ),
  CONSTRAINT `manual_assertions_value_size_check` CHECK(length(cast(`value_json` as blob)) <= 16384),
  CONSTRAINT `manual_assertions_retraction_check` CHECK(`retracted_at` is null or `retracted_at` >= `created_at`)
);
--> statement-breakpoint
CREATE INDEX `manual_assertions_owner_entity_field_time_idx` ON `manual_assertions` (`owner_id`,`entity_kind`,`entity_id`,`field_name`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `manual_assertions_owner_source_idx` ON `manual_assertions` (`owner_id`,`source_reference_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `manual_assertions_supersedes_uq` ON `manual_assertions` (`supersedes_assertion_id`) WHERE `supersedes_assertion_id` is not null;
