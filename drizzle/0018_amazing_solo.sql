ALTER TABLE `tournament_decks` ADD `ram` text;--> statement-breakpoint
CREATE INDEX `tournament_decks_ram_idx` ON `tournament_decks` (`ram`);