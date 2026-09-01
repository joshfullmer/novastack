CREATE TABLE `deck_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`parent_folder_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_folder_id`) REFERENCES `deck_folders`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `deck_folders_owner_idx` ON `deck_folders` (`owner_id`);--> statement-breakpoint
ALTER TABLE `decks` ADD `folder_id` text REFERENCES deck_folders(id);--> statement-breakpoint
CREATE INDEX `decks_folder_idx` ON `decks` (`folder_id`);