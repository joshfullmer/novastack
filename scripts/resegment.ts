/**
 * `pnpm resegment` — re-derives `rulesText`, `flavorText`, and `keywords` for every card from its
 * already-committed `rawRulesText`. No network.
 *
 * `rules-text.ts`'s own doc comment promises this: "a misclassification has to be recoverable
 * and re-splittable offline without re-fetching." This is that path — run it after changing
 * `splitRulesText`/`segmentLine`'s heuristics, instead of a full `pnpm ingest` (which would also
 * re-fetch every card and re-mirror every image just to pick up a parsing fix).
 *
 * Mirrors `normalizeCard`'s own derivation (`normalize.ts`) exactly, just sourced from the
 * committed snapshot's `rawRulesText` instead of a fresh API response's `rules_text`.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as v from 'valibot';
import { extractKeywords, splitRulesText, type SegmentContext } from '../src/lib/cards/rules-text.ts';
import { SnapshotSchema, type Card, type Snapshot } from '../src/lib/cards/schema.ts';
import { stableStringify } from './lib/stable-json.ts';

const CARDS_PATH = path.join('src', 'lib', 'cards', 'cards.json');

/** Same construction as `buildSegmentContext` in `normalize.ts`, sourced from normalized Cards
 * rather than raw API records — the two fields it reads (`name`, `classifications`) carry
 * through normalization unchanged, so the lookups are identical either way. */
function buildContext(cards: readonly Card[]): SegmentContext {
	const slugByUpperName = new Map<string, string>();
	const classificationByUpper = new Map<string, string>();

	for (const card of cards) {
		slugByUpperName.set(card.name.toUpperCase(), card.slug);
		for (const classification of card.classifications)
			classificationByUpper.set(classification.toUpperCase(), classification);
	}

	return { slugByUpperName, classificationByUpper };
}

async function main(): Promise<void> {
	const snapshot: Snapshot = v.parse(SnapshotSchema, JSON.parse(await readFile(CARDS_PATH, 'utf8')));
	const ctx = buildContext(snapshot.cards);

	let changed = 0;
	const cards = snapshot.cards.map((card): Card => {
		const { rulesText, flavorText } = splitRulesText(card.rawRulesText, ctx);
		const keywords = extractKeywords(card.rawRulesText).keywords;
		const next: Card = { ...card, rulesText, flavorText, keywords };
		if (stableStringify(next) !== stableStringify(card)) changed++;
		return next;
	});

	if (changed === 0) {
		console.log('✓ no change — every card already matches the current segmentation');
		return;
	}

	const next: Snapshot = { ...snapshot, generatedAt: new Date().toISOString(), cards };
	await writeFile(CARDS_PATH, stableStringify(next));
	console.log(`✓ resegmented ${changed} card(s)`);
}

await main();
