/**
 * Assertions against the **real committed snapshot**.
 *
 * The unit tests elsewhere use synthetic data so a reader can see the whole dataset an
 * assertion runs against. This file is the complement: it checks the things whose value is
 * precisely that they are real — the two mandatory fixtures, and derived facets that only exist
 * once real data has run through them.
 *
 * Counts are asserted as *relationships and floors*, not exact figures, wherever the dataset
 * being unstable makes an exact figure a maintenance tax. The dataset moved 131 → 133 cards
 * within hours on 2026-08-20; a test that breaks on a new card is a test that gets deleted.
 */
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { HEROES } from './hero.js';
import { landing } from './landing.js';
import { dataset, snapshot } from './index.js';
import { plainText } from './rules-text.js';
import { IMAGE_WIDTHS } from './vocabulary.js';
import { evaluate } from '#lib/filters/predicate.js';

const card = (slug: string) => {
	const found = dataset.bySlug.get(slug);
	if (found === undefined) throw new Error(`fixture ${slug} is missing from the snapshot`);
	return found;
};

describe('the snapshot', () => {
	it('parses at module scope against its own schema', () => {
		expect(snapshot.cards.length).toBeGreaterThanOrEqual(133);
	});

	it('agrees with its own stats line, which the landing page shows', () => {
		expect(snapshot.stats.cards).toBe(snapshot.cards.length);
		expect(snapshot.stats.printings).toBe(
			snapshot.cards.reduce((total, entry) => total + entry.printings.length, 0)
		);
		// Genuine releases, not the eight printed Set Identifiers: seven of those are starter decks,
		// demo decks, box toppers, promos and a prerelease, and calling them sets would claim eight
		// releases for a game that has had one.
		expect(snapshot.stats.sets).toBe(snapshot.sets.filter((set) => set.kind === 'base').length);
		expect(snapshot.stats.sets).toBeLessThan(snapshot.sets.length);
	});

	it('collapses twelve API sets to eight printed Set Identifiers', () => {
		expect(snapshot.sets).toHaveLength(8);
		expect(snapshot.sets.filter((set) => set.kind === 'base')).toHaveLength(1);
	});

	it('carries the derived orderings rather than hardcoded ones', () => {
		expect(snapshot.colorOrder).toEqual(['Red', 'Yellow', 'Green', 'Blue']);
		expect(snapshot.cardTypeOrder).toEqual(['Legend', 'Unit', 'Gear', 'Program']);
		expect(snapshot.ramPerLegend).toBe(2);
	});
});

describe('Rebecca — Having a Moment, the mandatory fixture', () => {
	const rebecca = card('rebecca-having-a-moment');

	it('is null on every stat, and that survives normalization', () => {
		expect(rebecca.cost).toBeNull();
		expect(rebecca.power).toBeNull();
		expect(rebecca.ramRequired).toBeNull();
		expect(rebecca.ramProvided).toBeNull();
	});

	it('carries no classifications and no rules text', () => {
		expect(rebecca.classifications).toEqual([]);
		expect(rebecca.rulesText).toEqual([]);
		expect(rebecca.rawRulesText).toBeNull();
		expect(rebecca.keywords).toEqual([]);
	});

	it('still has a Default Printing, so the tuple guarantee holds', () => {
		expect(rebecca.printings[0].id).toBeTruthy();
		expect(rebecca.printings.length).toBeGreaterThanOrEqual(2);
	});

	it('flattens to an empty search haystack without throwing', () => {
		expect(plainText(rebecca.rulesText)).toBe('');
		expect(dataset.searchText.get(rebecca.slug)).toBe('rebecca having a moment');
	});

	it('appears in an unfiltered result set', () => {
		const slugs = evaluate(dataset, { kind: 'all' }).map((match) => match.card.slug);
		expect(slugs).toContain('rebecca-having-a-moment');
	});
});

describe('V — StreetKid, the variety fixture', () => {
	const v = card('v-streetkid');

	it('has five printings across two artists', () => {
		expect(v.printings).toHaveLength(5);
		expect(new Set(v.printings.map((printing) => printing.artist)).size).toBe(2);
	});

	it('keys printings the way the deep-link URL does', () => {
		const keys = v.printings.map((printing) => printing.key);
		expect(keys).toContain('MS01-WNC-005a');
		expect(keys).toContain('MS01-WNC-β144');
	});

	it('keeps the β prefix verbatim, because it is not reconstructable from the set code', () => {
		const beta = v.printings.filter((printing) => printing.collectorNumber.startsWith('β'));
		expect(beta.length).toBeGreaterThan(0);
	});

	it('reaches a rarity that only its non-default printing carries', () => {
		expect(v.printings[0].rarity).toBe('Rare');
		expect(v.printings.map((printing) => printing.rarity)).toContain('Iconic Legend');

		const matches = evaluate(dataset, { kind: 'rarity', values: ['Iconic Legend'] });
		const match = matches.find((entry) => entry.card.slug === 'v-streetkid');
		expect(match?.printing.collectorNumber).toBe('β144');
	});

	it('segments its rules text into keyword, classification and reminder', () => {
		const kinds = v.rulesText.flat().map((segment) => segment.kind);
		expect(kinds).toContain('keyword');
		expect(kinds).toContain('classification');
		expect(kinds).toContain('reminder');
		expect(v.keywords).toEqual(['Go Solo', 'Call']);
	});

	it('is reachable by typing across the em dash', () => {
		expect(dataset.searchText.get('v-streetkid')).toContain('v streetkid');
	});
});

describe('derived facets over the real data', () => {
	it('derives keywords the API never populates, on most of the dataset', () => {
		const withKeywords = snapshot.cards.filter((entry) => entry.keywords.length > 0);
		expect(withKeywords.length).toBeGreaterThan(snapshot.cards.length / 2);
	});

	it('extracts the flavour misfiled inside rules text', () => {
		const withFlavour = snapshot.cards.filter((entry) => entry.flavorText !== null);
		expect(withFlavour.length).toBeGreaterThan(0);
		// Every extracted flavour is still recoverable from the untouched original.
		for (const entry of withFlavour) expect(entry.rawRulesText).not.toBeNull();
	});

	it('leaves some cards with no rules text at all, which the renderer must handle', () => {
		// Rebecca is null at source; the others are flavour-only once the split has run.
		const empty = snapshot.cards.filter((entry) => entry.rulesText.length === 0);
		expect(empty.length).toBeGreaterThanOrEqual(1);
		expect(empty.map((entry) => entry.slug)).toContain('rebecca-having-a-moment');
	});

	it('resolves every card reference to a real slug', () => {
		for (const entry of snapshot.cards) {
			for (const segment of entry.rulesText.flat()) {
				if (segment.kind === 'cardRef') expect(dataset.bySlug.has(segment.slug)).toBe(true);
			}
		}
	});

	it('finds nine printing-level rarities, not the six visible on cards', () => {
		expect(dataset.rarities).toHaveLength(9);
		expect(dataset.rarities).toContain('Iconic Legend');
	});

	it('finds a long tail of classifications', () => {
		expect(dataset.classifications.length).toBeGreaterThanOrEqual(39);

		const [head] = dataset.classifications;
		const tail = dataset.classifications.at(-1);
		if (tail === undefined) throw new Error('no classifications in the snapshot');
		expect(head.count).toBeGreaterThan(tail.count);
	});

	it('reports the null counts the + none toggles are labelled with', () => {
		expect(dataset.domains.power.nullCount).toBeGreaterThan(0);
		expect(dataset.domains.cost.nullCount).toBeGreaterThan(0);
		// Every Legend falls in the RAM none bucket: a Legend provides RAM, it requires none.
		const legends = snapshot.cards.filter((entry) => entry.cardType === 'Legend');
		expect(dataset.domains.ram.nullCount).toBe(legends.length);
	});
});

describe('mirrored images', () => {
	it('has all three tiers on disk for every printing the data promises', () => {
		// The failure this catches: a snapshot that references art the site would 404.
		const missing: string[] = [];
		for (const entry of snapshot.cards) {
			for (const printing of entry.printings) {
				for (const width of IMAGE_WIDTHS) {
					const path = `static/card-art/${printing.id}/${width}.webp`;
					if (!existsSync(path)) missing.push(path);
				}
			}
		}
		expect(missing).toEqual([]);
	});

	it('carries a ThumbHash for every printing, so no tile blurs forever', () => {
		for (const entry of snapshot.cards) {
			for (const printing of entry.printings) expect(printing.thumbhash.length).toBeGreaterThan(10);
		}
	});
});

describe('the landing artifact', () => {
	/**
	 * The footgun this catches: `HERO_SLUGS` is hand-edited, but `landing.json` is *generated* from
	 * it by ingest. Edit the list and forget to re-run `pnpm ingest`, and the page keeps rendering
	 * the old seven cards with no error anywhere — the stale file is still valid.
	 */
	it('matches HEROES in order, or the snapshot needs regenerating', () => {
		expect(landing.heroes.map((hero) => hero.slug)).toEqual(HEROES.map((hero) => hero.slug));
	});

	it('resolves every hero to a real card and one of its own printings', () => {
		for (const hero of landing.heroes) {
			const card = dataset.bySlug.get(hero.slug);
			expect(card, hero.slug).toBeDefined();
			expect(hero.color).toBe(card?.color);
			expect(hero.name).toBe(card?.name);

			// Not necessarily the Default Printing: heroes are chosen for their art, and the Iconics
			// exist only as non-default printings.
			const printing = card?.printings.find((entry) => entry.id === hero.printingId);
			expect(printing, `${hero.slug} printing ${hero.printingId}`).toBeDefined();
			expect(hero.thumbhash).toBe(printing?.thumbhash);
		}
	});

	it("honours each hero's printing selector", () => {
		for (const [index, choice] of HEROES.entries()) {
			if (choice.printing === undefined) continue;
			const hero = landing.heroes[index];
			const printing = dataset.bySlug
				.get(hero.slug)
				?.printings.find((entry) => entry.id === hero.printingId);

			if (choice.printing.rarity !== undefined) {
				expect(printing?.rarity, hero.slug).toBe(choice.printing.rarity);
			}
			if (choice.printing.setId !== undefined) {
				expect(printing?.setId, hero.slug).toBe(choice.printing.setId);
			}
		}
	});

	it('carries the same stats the dataset reports', () => {
		expect(landing.stats).toEqual(snapshot.stats);
	});
});
