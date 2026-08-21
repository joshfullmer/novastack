/**
 * The landing page's seven hero cards.
 *
 * **Seven, not eight** — an odd count gives the fan a focal centre card.
 *
 * **Colors are interleaved.** Naive selection picks from dataset order, which begins with a long
 * run of one color and yields a monochrome spread.
 *
 * A fixed curated list rather than a per-build rotation: the landing page is the one screen whose
 * composition was designed rather than derived, and a rotation would silently change it on an
 * unrelated ingest.
 *
 * Each entry may name a **printing** as well as a card, because the alternate-art printings are the
 * ones worth putting on a landing page — the Iconics in particular exist *only* as non-default
 * printings, which is the same reason the filter evaluator returns a witness rather than a boolean.
 *
 * Editing this list is only half the job: `landing.json` is *generated* from it by `pnpm ingest`.
 * A unit test asserts the two agree, so a forgotten re-run fails the suite rather than silently
 * rendering the previous seven cards.
 */
import type { Rarity } from './vocabulary.ts';

export type HeroChoice = {
	slug: string;
	/**
	 * Which printing to show. Omit for the Default Printing. Criteria are ANDed, and ingest fails
	 * the build when nothing matches — so a renumbered or withdrawn printing is loud, not silent.
	 *
	 * Where several printings still match, ingest prefers the retail one. A retail/beta pair is the
	 * common case: same art, same rarity, distinguished only by a `β` on the collector number.
	 */
	printing?: { rarity?: Rarity; setId?: string };
};

export const HEROES: readonly HeroChoice[] = [
	// Blue — the box-topper art rather than the starter-deck default.
	{ slug: 'v-corporate-exile', printing: { setId: 'PRM-WNC' } },
	// Yellow
	{ slug: 'jackie-welles-ride-or-die-choom' },
	// Blue
	{ slug: 'judy-a-lvarez-braindance-maestro', printing: { rarity: 'Iconic Legend' } },
	// Red — the centre card
	{ slug: 'johnny-silverhand-rocking-renegade', printing: { rarity: 'Iconic Secret' } },
	// Green
	{ slug: 'sandayu-oda-hanako-s-guardian', printing: { rarity: 'Iconic Other' } },
	// Green
	{ slug: 'panam-palmer-nomad-cavalry', printing: { rarity: 'Iconic Legend' } },
	// Yellow
	{ slug: 'adam-smasher-metal-over-meat', printing: { rarity: 'Iconic Other' } }
];
