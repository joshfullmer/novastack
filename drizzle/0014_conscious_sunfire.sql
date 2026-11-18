CREATE TABLE `metas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`starts_on` integer NOT NULL,
	`ends_on` integer
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` integer PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`username` text
);
--> statement-breakpoint
CREATE TABLE `standings` (
	`tournament_id` integer NOT NULL,
	`player_id` integer NOT NULL,
	`rank` integer NOT NULL,
	`points` integer NOT NULL,
	`match_wins` integer NOT NULL,
	`match_losses` integer NOT NULL,
	`match_draws` integer NOT NULL,
	`game_wins` integer NOT NULL,
	`game_losses` integer NOT NULL,
	`game_draws` integer NOT NULL,
	`deck_guid` text,
	PRIMARY KEY(`tournament_id`, `player_id`),
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deck_guid`) REFERENCES `tournament_decks`(`guid`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `standings_rank_idx` ON `standings` (`tournament_id`,`rank`);--> statement-breakpoint
CREATE INDEX `standings_deck_idx` ON `standings` (`deck_guid`);--> statement-breakpoint
CREATE TABLE `tournament_deck_cards` (
	`deck_guid` text NOT NULL,
	`tournament_id` integer NOT NULL,
	`card_slug` text NOT NULL,
	`board` text NOT NULL,
	`quantity` integer NOT NULL,
	PRIMARY KEY(`deck_guid`, `card_slug`, `board`),
	FOREIGN KEY (`deck_guid`) REFERENCES `tournament_decks`(`guid`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tournament_deck_cards_card_idx` ON `tournament_deck_cards` (`card_slug`);--> statement-breakpoint
CREATE INDEX `tournament_deck_cards_board_idx` ON `tournament_deck_cards` (`board`,`tournament_id`,`card_slug`);--> statement-breakpoint
CREATE TABLE `tournament_decks` (
	`guid` text PRIMARY KEY NOT NULL,
	`tournament_id` integer NOT NULL,
	`player_id` integer NOT NULL,
	`name` text NOT NULL,
	`text` text NOT NULL,
	`legend_line` text,
	`ram` text,
	`unresolved` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tournament_decks_tournament_idx` ON `tournament_decks` (`tournament_id`);--> statement-breakpoint
CREATE INDEX `tournament_decks_legend_line_idx` ON `tournament_decks` (`legend_line`);--> statement-breakpoint
CREATE INDEX `tournament_decks_ram_idx` ON `tournament_decks` (`ram`);--> statement-breakpoint
CREATE TABLE `tournament_matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tournament_id` integer NOT NULL,
	`round` integer NOT NULL,
	`table_number` integer,
	`player_a` integer NOT NULL,
	`player_b` integer,
	`games_a` integer NOT NULL,
	`games_b` integer NOT NULL,
	`draws` integer NOT NULL,
	`kind` text NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_a`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_b`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tournament_matches_round_idx` ON `tournament_matches` (`tournament_id`,`round`);--> statement-breakpoint
CREATE INDEX `tournament_matches_player_a_idx` ON `tournament_matches` (`player_a`);--> statement-breakpoint
CREATE INDEX `tournament_matches_player_b_idx` ON `tournament_matches` (`player_b`);--> statement-breakpoint
CREATE TABLE `tournament_rounds` (
	`tournament_id` integer NOT NULL,
	`number` integer NOT NULL,
	`melee_round_id` integer NOT NULL,
	`name` text NOT NULL,
	PRIMARY KEY(`tournament_id`, `number`),
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tournaments` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`starts_at` integer NOT NULL,
	`organizer_id` integer NOT NULL,
	`organizer_name` text NOT NULL,
	`kind` text DEFAULT 'Other' NOT NULL,
	`format` text NOT NULL,
	`format_id` text NOT NULL,
	`player_count` integer NOT NULL,
	`venue` text,
	`tournament_type` text,
	`entry_fee` text,
	`registration` text,
	`capacity` integer,
	`ingested_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tournaments_starts_at_idx` ON `tournaments` (`starts_at`);--> statement-breakpoint
CREATE INDEX `tournaments_kind_idx` ON `tournaments` (`kind`,`starts_at`);