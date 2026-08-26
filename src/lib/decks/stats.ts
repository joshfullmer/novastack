/**
 * Deck statistics for the read-only view — resolves `docs/spec/deckbuilder.md`'s Open Question
 * #1 ("does deck analysis live on the builder or the viewer?"). All three inspiration sites
 * (moxfield.com, piltoverarchive.com, swudb.com) put a cost/energy curve and a color composition
 * readout on the *view* page specifically, not the editor — the editor's job is curation, the
 * viewer's is understanding what you're looking at. Main-deck cards only; Legends are tracked
 * separately and have no `cost`.
 */
import { COLORS, RARITY_ORDER, type Color, type Rarity } from '#lib/cards/vocabulary.js';
import type { DeckEntry } from './legality.js';

export type CostBucket = { cost: number | null; quantity: number };
export type ColorSlice = { color: Color; quantity: number };
export type EddiableStat = { eddiableQuantity: number; totalQuantity: number };
export type RaritySlice = { rarity: Rarity; quantity: number };

/**
 * Buckets by `cost`, null last — same nulls-last convention as `#lib/filters/sort.js`. Every
 * integer between the lowest and highest cost present gets a bucket, even at zero quantity — a
 * curve with a silent gap at 7 (because nothing happens to cost 7) reads as missing data, not as
 * "zero cards cost 7."
 */
export function costCurve(entries: readonly DeckEntry[]): CostBucket[] {
	const byCost = new Map<number | null, number>();
	for (const entry of entries) {
		const cost = entry.card.cost;
		byCost.set(cost, (byCost.get(cost) ?? 0) + entry.quantity);
	}

	const numericCosts = [...byCost.keys()].filter((cost): cost is number => cost !== null);
	const buckets: CostBucket[] = [];
	if (numericCosts.length > 0) {
		const min = Math.min(...numericCosts);
		const max = Math.max(...numericCosts);
		for (let cost = min; cost <= max; cost++)
			buckets.push({ cost, quantity: byCost.get(cost) ?? 0 });
	}

	const nullQuantity = byCost.get(null);
	if (nullQuantity) buckets.push({ cost: null, quantity: nullQuantity });
	return buckets;
}

/**
 * Quantity-weighted color composition — every Color is present, even at zero, so a mono-color
 * deck's legend row isn't silently missing its other three colors.
 */
export function colorComposition(entries: readonly DeckEntry[]): ColorSlice[] {
	const byColor = new Map<Color, number>(COLORS.map((color) => [color, 0]));
	for (const entry of entries) {
		byColor.set(entry.card.color, (byColor.get(entry.card.color) ?? 0) + entry.quantity);
	}
	return COLORS.map((color) => ({ color, quantity: byColor.get(color) ?? 0 }));
}

/**
 * Quantity-weighted rarity composition — a rough real-money affordability signal, so it counts
 * each card's **base printing** rarity (`card.printings[0]`, the same "Default Printing" every
 * other card-art lookup on this page falls back to) rather than whatever printing is actually in
 * the deck entry. A deck's printing choice is cosmetic (see `version-diff.ts`); its baseline
 * cost to acquire isn't. Every Rarity is present, even at zero, matching `colorComposition`.
 */
export function rarityComposition(entries: readonly DeckEntry[]): RaritySlice[] {
	const byRarity = new Map<Rarity, number>(RARITY_ORDER.map((rarity) => [rarity, 0]));
	for (const entry of entries) {
		const rarity = entry.card.printings[0].rarity;
		byRarity.set(rarity, (byRarity.get(rarity) ?? 0) + entry.quantity);
	}
	return RARITY_ORDER.map((rarity) => ({ rarity, quantity: byRarity.get(rarity) ?? 0 }));
}

/**
 * Quantity-weighted **Eddiable** count — `CONTEXT.md`'s term for a Card that can be sold for
 * resources ("sellable"/"pitchable" are the terms it explicitly says to avoid).
 */
export function eddiableStat(entries: readonly DeckEntry[]): EddiableStat {
	let eddiableQuantity = 0;
	let totalQuantity = 0;
	for (const entry of entries) {
		totalQuantity += entry.quantity;
		if (entry.card.eddiable) eddiableQuantity += entry.quantity;
	}
	return { eddiableQuantity, totalQuantity };
}
