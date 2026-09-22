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
import type { PrintTreatment } from './derive.ts';
import type { Rarity } from './vocabulary.ts';

export type HeroChoice = {
	slug: string;
	/**
	 * Which printing to show. Omit for the Default Printing. Criteria are ANDed, and ingest fails
	 * the build when nothing matches — so a renumbered or withdrawn printing is loud, not silent.
	 *
	 * Where several printings still match and `treatment` is unset, ingest prefers the retail one.
	 * A retail/beta pair is the common case: same art, same rarity, distinguished only by a `β` on
	 * the collector number — `treatment` is the escape hatch for the handful of Iconics picked for
	 * the beta art specifically.
	 */
	printing?: { rarity?: Rarity; setId?: string; treatment?: PrintTreatment };
};

export const HEROES: readonly HeroChoice[] = [
	// Red — the non-Legend Johnny, at his only Iconic tier.
	{ slug: 'johnny-silverhand-never-stop-fighting', printing: { rarity: 'Iconic Other' } },
	// Blue — the box-topper art rather than the Legend's mainline printing.
	{ slug: 'jackie-welles-pour-one-out-for-me', printing: { setId: 'PRM-WNC' } },
	// Green
	{ slug: 'hanako-arasaka-daughter-of-the-emperor', printing: { rarity: 'Iconic Legend' } },
	// Red — the centre card
	{ slug: 'v-streetkid', printing: { rarity: 'Iconic Legend', treatment: 'beta' } },
	// Blue
	{
		slug: 'alt-cunningham-soulkiller-architect',
		printing: { rarity: 'Iconic Legend', treatment: 'beta' }
	},
	// Yellow
	{
		slug: 'river-ward-detective-on-the-hunt',
		printing: { rarity: 'Iconic Legend', treatment: 'beta' }
	},
	// Blue
	{ slug: 'judy-a-lvarez-braindance-maestro', printing: { rarity: 'Iconic Legend' } }
];
