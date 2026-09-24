CREATE TABLE `collection_items` (
	`user_id` text NOT NULL,
	`printing_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`user_id`, `printing_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Hand-written: `deck_folders.visibility` renames its `unlisted` value to `shared`.
--
-- drizzle-kit cannot generate this. Drizzle's `text({ enum: [...] })` is a TypeScript-level
-- constraint only in SQLite — no CHECK is emitted — so changing the allowed values produces no
-- schema diff at all, and the column keeps whatever strings are already in it.
--
-- Migration 0004 is applied in production, so `unlisted` rows genuinely exist. Idempotent, and a
-- no-op on any database where nobody has shared a folder.
UPDATE `deck_folders` SET `visibility` = 'shared' WHERE `visibility` = 'unlisted';
