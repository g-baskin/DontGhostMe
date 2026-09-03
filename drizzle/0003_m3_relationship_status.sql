CREATE TABLE `identity_exclusions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`identity_id` text,
	`domain` text,
	`reason` text,
	`excluded_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`identity_id`) REFERENCES `recruiter_identities`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "identity_exclusions_target_check" CHECK(("identity_exclusions"."identity_id" is null and "identity_exclusions"."domain" is not null) or ("identity_exclusions"."identity_id" is not null and "identity_exclusions"."domain" is null)),
	CONSTRAINT "identity_exclusions_reason_check" CHECK("identity_exclusions"."reason" is null or length("identity_exclusions"."reason") <= 280)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `identity_exclusions_identity_uq` ON `identity_exclusions` (`owner_id`,`identity_id`) WHERE "identity_exclusions"."identity_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `identity_exclusions_domain_uq` ON `identity_exclusions` (`owner_id`,`domain`) WHERE "identity_exclusions"."domain" is not null;--> statement-breakpoint
CREATE TABLE `recruiter_deletions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`recruiter_id` text NOT NULL,
	`canonical_name_hash` text NOT NULL,
	`scope` text NOT NULL,
	`deleted_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "recruiter_deletions_scope_check" CHECK("recruiter_deletions"."scope" = 'recruiter_derived_data')
);
--> statement-breakpoint
CREATE INDEX `recruiter_deletions_owner_idx` ON `recruiter_deletions` (`owner_id`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `recruiter_relationship_statuses` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`recruiter_id` text NOT NULL,
	`status` text,
	`excluded_at` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`recruiter_id`) REFERENCES `recruiters`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "recruiter_relationship_statuses_status_check" CHECK("recruiter_relationship_statuses"."status" in ('active', 'dormant', 'do_not_contact') or "recruiter_relationship_statuses"."status" is null),
	CONSTRAINT "recruiter_relationship_statuses_timing_check" CHECK("recruiter_relationship_statuses"."excluded_at" is null or "recruiter_relationship_statuses"."updated_at" >= "recruiter_relationship_statuses"."excluded_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recruiter_relationship_statuses_recruiter_uq` ON `recruiter_relationship_statuses` (`recruiter_id`);--> statement-breakpoint
CREATE INDEX `recruiter_relationship_statuses_owner_idx` ON `recruiter_relationship_statuses` (`owner_id`,`status`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_opportunities` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`recruiter_id` text NOT NULL,
	`staffing_organization_id` text NOT NULL,
	`end_client_organization_id` text,
	`title` text NOT NULL,
	`source_key` text NOT NULL,
	`introduced_at` text NOT NULL,
	`outcome_state` text DEFAULT 'unknown' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`recruiter_id`) REFERENCES `recruiters`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`staffing_organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`end_client_organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "opportunities_outcome_check" CHECK("__new_opportunities"."outcome_state" in ('unknown', 'rejected', 'offer', 'candidate_withdrew', 'closed_without_outcome'))
);
--> statement-breakpoint
INSERT INTO `__new_opportunities`("id", "owner_id", "recruiter_id", "staffing_organization_id", "end_client_organization_id", "title", "source_key", "introduced_at", "outcome_state", "created_at") SELECT "id", "owner_id", "recruiter_id", "staffing_organization_id", "end_client_organization_id", "title", "source_key", "introduced_at", "outcome_state", "created_at" FROM `opportunities`;--> statement-breakpoint
DROP TABLE `opportunities`;--> statement-breakpoint
ALTER TABLE `__new_opportunities` RENAME TO `opportunities`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `opportunities_owner_source_key_uq` ON `opportunities` (`owner_id`,`source_key`);--> statement-breakpoint
CREATE INDEX `opportunities_owner_recruiter_date_idx` ON `opportunities` (`owner_id`,`recruiter_id`,`introduced_at`);--> statement-breakpoint
CREATE INDEX `opportunities_owner_date_idx` ON `opportunities` (`owner_id`,`introduced_at`);