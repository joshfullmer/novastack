CREATE TABLE `user_entitlements` (
	`user_id` text PRIMARY KEY NOT NULL,
	`features` text NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `deck_folders` ADD `share_code` text;--> statement-breakpoint
CREATE UNIQUE INDEX `deck_folders_share_code_idx` ON `deck_folders` (`share_code`);--> statement-breakpoint
ALTER TABLE `decks` ADD `share_code` text;--> statement-breakpoint
CREATE UNIQUE INDEX `decks_share_code_idx` ON `decks` (`share_code`);--> statement-breakpoint
ALTER TABLE `printing_lists` ADD `share_code` text;--> statement-breakpoint
CREATE UNIQUE INDEX `printing_lists_share_code_idx` ON `printing_lists` (`share_code`);--> statement-breakpoint
--
-- Backfill, hand-written (drizzle-kit generates schema, not data).
--
-- Ten draws from lowercase Crockford base32, matching `randomShareCode` in `#lib/short-id.ts`.
-- `random() & 31` rather than `abs(random()) % 32`: the mask is uniform because 32 divides the
-- byte range exactly, it is always non-negative, and it avoids `abs(-2^63)` — which is an
-- `integer overflow` error in SQLite, not a number.
--
-- Safe to re-run: `WHERE share_code IS NULL` means a second pass only touches rows still missing
-- one. An UPDATE is atomic, so in the (astronomically unlikely) event a draw collides with an
-- existing code, the whole statement rolls back and re-running draws again — no half-filled table.
-- `ensureShareCode` also fills lazily on read, so nothing is unshareable even if this never runs.
UPDATE `decks` SET `share_code` = (
	substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + (random() & 31), 1) ||
	substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + (random() & 31), 1) ||
	substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + (random() & 31), 1) ||
	substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + (random() & 31), 1) ||
	substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + (random() & 31), 1) ||
	substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + (random() & 31), 1) ||
	substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + (random() & 31), 1) ||
	substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + (random() & 31), 1) ||
	substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + (random() & 31), 1) ||
	substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + (random() & 31), 1)
) WHERE `share_code` IS NULL;--> statement-breakpoint
UPDATE `deck_folders` SET `share_code` = (
	substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + (random() & 31), 1) ||
	substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + (random() & 31), 1) ||
	substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + (random() & 31), 1) ||
	substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + (random() & 31), 1) ||
	substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + (random() & 31), 1) ||
	substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + (random() & 31), 1) ||
	substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + (random() & 31), 1) ||
	substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + (random() & 31), 1) ||
	substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + (random() & 31), 1) ||
	substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + (random() & 31), 1)
) WHERE `share_code` IS NULL;--> statement-breakpoint
UPDATE `printing_lists` SET `share_code` = (
	substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + (random() & 31), 1) ||
	substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + (random() & 31), 1) ||
	substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + (random() & 31), 1) ||
	substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + (random() & 31), 1) ||
	substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + (random() & 31), 1) ||
	substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + (random() & 31), 1) ||
	substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + (random() & 31), 1) ||
	substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + (random() & 31), 1) ||
	substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + (random() & 31), 1) ||
	substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + (random() & 31), 1)
) WHERE `share_code` IS NULL;