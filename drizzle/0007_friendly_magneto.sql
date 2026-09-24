CREATE TABLE `binder_pockets` (
	`list_id` text NOT NULL,
	`page` integer NOT NULL,
	`pocket` integer NOT NULL,
	`printing_id` text NOT NULL,
	PRIMARY KEY(`list_id`, `page`, `pocket`),
	FOREIGN KEY (`list_id`) REFERENCES `printing_lists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `printing_lists` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `printing_lists_owner_kind_idx` ON `printing_lists` (`owner_id`,`kind`);