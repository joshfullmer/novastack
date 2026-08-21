/**
 * The landing page's seven hero cards.
 *
 * **Seven, not eight** — an odd count gives the fan a focal centre card.
 *
 * **Colours are interleaved, Yellow centred** (`R B G Y R B G`). Naive selection picks from
 * dataset order, which begins with all the Red cards and yields a monochrome spread.
 *
 * **All seven are Legends.** Character portraits read at a glance where Gear and Programs
 * don't — a Program's art is an interface, and it says nothing from behind a wordmark.
 *
 * A fixed curated list rather than a per-build rotation: the landing page is the one screen
 * whose composition was designed rather than derived, and a rotation would silently change it
 * on an unrelated ingest.
 */
export const HERO_SLUGS = [
	'v-streetkid',
	'alt-cunningham-soulkiller-architect',
	'goro-takemura-vengeful-bodyguard',
	'rogue-amendiares-preem-solo',
	'adam-smasher-ender-of-legends',
	'judy-a-lvarez-braindance-maestro',
	'panam-palmer-nomad-cavalry'
] as const;
