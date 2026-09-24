CREATE TABLE `wantlist_entries` (
	`list_id` text NOT NULL,
	`printing_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`note` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`list_id`, `printing_id`),
	FOREIGN KEY (`list_id`) REFERENCES `printing_lists`(`id`) ON UPDATE no action ON DELETE cascade
);
