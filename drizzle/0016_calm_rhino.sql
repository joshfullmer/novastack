-- `tournament_deck_cards` gains `tournament_id`, a copy of its deck's Tournament, so period aggregates
-- filter and group on this table alone. SQLite cannot add a NOT NULL, foreign-keyed column in place,
-- so the table is rebuilt; every existing row takes its deck's Tournament. Nothing references this
-- table, and its rows are derived from `tournament_decks.text`, so a rebuild loses nothing.
CREATE TABLE `__new_tournament_deck_cards` (
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
INSERT INTO `__new_tournament_deck_cards` (`deck_guid`, `tournament_id`, `card_slug`, `board`, `quantity`)
SELECT c.`deck_guid`, d.`tournament_id`, c.`card_slug`, c.`board`, c.`quantity`
FROM `tournament_deck_cards` c
JOIN `tournament_decks` d ON d.`guid` = c.`deck_guid`;
--> statement-breakpoint
DROP TABLE `tournament_deck_cards`;
--> statement-breakpoint
ALTER TABLE `__new_tournament_deck_cards` RENAME TO `tournament_deck_cards`;
--> statement-breakpoint
CREATE INDEX `tournament_deck_cards_card_idx` ON `tournament_deck_cards` (`card_slug`);
--> statement-breakpoint
CREATE INDEX `tournament_deck_cards_board_idx` ON `tournament_deck_cards` (`board`,`tournament_id`,`card_slug`);
