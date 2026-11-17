ALTER TABLE `tournaments` ADD `kind` text DEFAULT 'Other' NOT NULL;--> statement-breakpoint
CREATE INDEX `tournaments_kind_idx` ON `tournaments` (`kind`,`starts_at`);