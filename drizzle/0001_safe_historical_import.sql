CREATE TABLE `attachment_inventory` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`source_message_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`filename_display` text,
	`media_type` text NOT NULL,
	`disposition` text,
	`decoded_size_bytes` integer NOT NULL,
	`content_sha256` text NOT NULL,
	`oversized` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_message_id`) REFERENCES `import_source_messages`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "attachment_inventory_values_check" CHECK("attachment_inventory"."ordinal" >= 0 and "attachment_inventory"."decoded_size_bytes" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attachment_inventory_source_ordinal_uq` ON `attachment_inventory` (`source_message_id`,`ordinal`);--> statement-breakpoint
CREATE INDEX `attachment_inventory_owner_source_idx` ON `attachment_inventory` (`owner_id`,`source_message_id`);--> statement-breakpoint
CREATE TABLE `historical_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`source_fingerprint` text,
	`original_name_display` text NOT NULL,
	`source_size_bytes` integer DEFAULT 0 NOT NULL,
	`staged_expires_at` text,
	`staged_source_deleted` integer DEFAULT false NOT NULL,
	`status` text NOT NULL,
	`discovered_count` integer DEFAULT 0 NOT NULL,
	`parsed_count` integer DEFAULT 0 NOT NULL,
	`skipped_count` integer DEFAULT 0 NOT NULL,
	`duplicate_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`imported_count` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`created_at` text NOT NULL,
	`started_at` text,
	`updated_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "historical_imports_status_check" CHECK("historical_imports"."status" in ('uploading', 'preview_ready', 'processing', 'paused_user', 'paused_interrupted', 'completed', 'failed', 'cancelled')),
	CONSTRAINT "historical_imports_counts_check" CHECK("historical_imports"."source_size_bytes" >= 0 and "historical_imports"."discovered_count" >= 0 and "historical_imports"."parsed_count" >= 0 and "historical_imports"."skipped_count" >= 0 and "historical_imports"."duplicate_count" >= 0 and "historical_imports"."failed_count" >= 0 and "historical_imports"."imported_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `historical_imports_owner_fingerprint_uq` ON `historical_imports` (`owner_id`,`source_fingerprint`);--> statement-breakpoint
CREATE INDEX `historical_imports_owner_status_time_idx` ON `historical_imports` (`owner_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `import_checkpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`historical_import_id` text NOT NULL,
	`source_fingerprint` text NOT NULL,
	`committed_byte_offset` integer DEFAULT 0 NOT NULL,
	`message_ordinal` integer DEFAULT 0 NOT NULL,
	`discovered_count` integer DEFAULT 0 NOT NULL,
	`parsed_count` integer DEFAULT 0 NOT NULL,
	`skipped_count` integer DEFAULT 0 NOT NULL,
	`duplicate_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`imported_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`historical_import_id`) REFERENCES `historical_imports`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "import_checkpoints_values_check" CHECK("import_checkpoints"."committed_byte_offset" >= 0 and "import_checkpoints"."message_ordinal" >= 0 and "import_checkpoints"."discovered_count" >= 0 and "import_checkpoints"."parsed_count" >= 0 and "import_checkpoints"."skipped_count" >= 0 and "import_checkpoints"."duplicate_count" >= 0 and "import_checkpoints"."failed_count" >= 0 and "import_checkpoints"."imported_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_checkpoints_import_uq` ON `import_checkpoints` (`historical_import_id`);--> statement-breakpoint
CREATE INDEX `import_checkpoints_owner_idx` ON `import_checkpoints` (`owner_id`,`historical_import_id`);--> statement-breakpoint
CREATE TABLE `import_errors` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`historical_import_id` text NOT NULL,
	`source_message_id` text,
	`stage` text NOT NULL,
	`code` text NOT NULL,
	`recoverable` integer NOT NULL,
	`message_ordinal` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`historical_import_id`) REFERENCES `historical_imports`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_message_id`) REFERENCES `import_source_messages`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "import_errors_ordinal_check" CHECK("import_errors"."message_ordinal" is null or "import_errors"."message_ordinal" > 0)
);
--> statement-breakpoint
CREATE INDEX `import_errors_owner_import_idx` ON `import_errors` (`owner_id`,`historical_import_id`);--> statement-breakpoint
CREATE TABLE `import_source_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`historical_import_id` text NOT NULL,
	`message_ordinal` integer NOT NULL,
	`byte_offset` integer NOT NULL,
	`byte_length` integer NOT NULL,
	`raw_sha256` text NOT NULL,
	`canonical_sha256` text,
	`normalized_message_id` text,
	`parse_status` text NOT NULL,
	`warning_codes_json` text DEFAULT '[]' NOT NULL,
	`error_code` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`historical_import_id`) REFERENCES `historical_imports`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "import_source_messages_status_check" CHECK("import_source_messages"."parse_status" in ('imported', 'conflict', 'failed', 'skipped')),
	CONSTRAINT "import_source_messages_offsets_check" CHECK("import_source_messages"."message_ordinal" > 0 and "import_source_messages"."byte_offset" >= 0 and "import_source_messages"."byte_length" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_source_messages_import_ordinal_uq` ON `import_source_messages` (`historical_import_id`,`message_ordinal`);--> statement-breakpoint
CREATE INDEX `import_source_messages_owner_raw_hash_idx` ON `import_source_messages` (`owner_id`,`raw_sha256`);--> statement-breakpoint
CREATE INDEX `import_source_messages_owner_canonical_hash_idx` ON `import_source_messages` (`owner_id`,`canonical_sha256`);--> statement-breakpoint
CREATE INDEX `import_source_messages_owner_message_id_idx` ON `import_source_messages` (`owner_id`,`normalized_message_id`);--> statement-breakpoint
CREATE TABLE `normalized_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`source_message_id` text NOT NULL,
	`sent_at` text,
	`subject` text NOT NULL,
	`sender_json` text NOT NULL,
	`recipients_json` text NOT NULL,
	`reply_to_json` text NOT NULL,
	`normalized_message_id` text,
	`references_json` text NOT NULL,
	`safe_text` text NOT NULL,
	`text_truncated` integer DEFAULT false NOT NULL,
	`warning_codes_json` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_message_id`) REFERENCES `import_source_messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `normalized_messages_source_uq` ON `normalized_messages` (`source_message_id`);--> statement-breakpoint
CREATE INDEX `normalized_messages_owner_date_idx` ON `normalized_messages` (`owner_id`,`sent_at`);--> statement-breakpoint
CREATE INDEX `normalized_messages_owner_message_id_idx` ON `normalized_messages` (`owner_id`,`normalized_message_id`);