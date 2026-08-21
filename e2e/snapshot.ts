/**
 * The committed snapshot, for end-to-end expectations.
 *
 * Read from disk rather than imported through `#lib/cards/index.js`: that module uses Vite's
 * `?raw` import, and Playwright's runner is esbuild, not Vite. Parsing it through the same schema
 * keeps the expectations typed — and means a snapshot that no longer matches its own schema fails
 * the e2e suite too, not just the unit suite.
 */
import { readFileSync } from 'node:fs';
import * as v from 'valibot';
import { normalizeForSearch } from '../src/lib/cards/dataset.ts';
import { plainText } from '../src/lib/cards/rules-text.ts';
import { SnapshotSchema } from '../src/lib/cards/schema.ts';

export const snapshot = v.parse(
	SnapshotSchema,
	JSON.parse(readFileSync(new URL('../src/lib/cards/cards.json', import.meta.url), 'utf8'))
);

export const TOTAL_CARDS = snapshot.stats.cards;

export const cardsOfColor = (color: string) =>
	snapshot.cards.filter((card) => card.color === color).length;

/**
 * A word that appears in some card's flavour text and in **no** card's searchable haystack.
 *
 * Derived rather than hardcoded: the point of the test is that flavour is excluded from search, and
 * a hand-picked word could quietly start appearing in rules text on the next ingest.
 */
export function flavourOnlyWord(): string {
	const haystack = new Set(
		snapshot.cards.flatMap((card) =>
			normalizeForSearch(`${card.name} ${plainText(card.rulesText)}`).split(' ')
		)
	);

	for (const card of snapshot.cards) {
		if (card.flavorText === null) continue;
		for (const word of normalizeForSearch(card.flavorText).split(' ')) {
			if (word.length > 4 && !haystack.has(word)) return word;
		}
	}

	throw new Error('no flavour-only word in the snapshot — the search test cannot be meaningful');
}

/**
 * Navigates to a grid URL and waits for hydration.
 *
 * The prerendered grid looks interactive before hydration — every chip is in the static HTML —
 * but no handler is attached and the query string has not been read yet. Clicking in that window
 * does nothing at all, which shows up as a flaky test rather than an obvious one, so every grid
 * test goes through here instead of racing the boundary.
 */
export async function gotoGrid(
	page: {
		goto: (url: string) => Promise<unknown>;
		locator: (selector: string) => { waitFor: () => Promise<void> };
	},
	url = '/cards'
): Promise<void> {
	await page.goto(url);
	await page.locator('[data-hydrated="true"]').waitFor();
}
