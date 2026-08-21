/**
 * The runtime view of the snapshot.
 *
 * `evaluate` takes a `Dataset` rather than reaching for a module-scope import, which is what
 * lets a stage-2 deck view instantiate its own filter state over its own dataset scope — and
 * what lets a filter test construct a five-card dataset the reader can hold in their head.
 *
 * Everything here is computed once, at construction. That is not memoization of the filter
 * pipeline (§12 rules that out until someone measures it); it is the difference between
 * building a search haystack once per load and once per keystroke.
 */
import type { Card, SetSummary, Snapshot, Stats } from './schema.ts';
import { plainText } from './rules-text.ts';
import { RARITY_ORDER, type CardType, type Color, type Rarity } from './vocabulary.ts';

/**
 * The searchable form of a string: case-, accent- and punctuation-insensitive. Em dashes are
 * the reason this exists — `V — StreetKid` must be reachable by typing `v streetkid`.
 */
export function normalizeForSearch(text: string): string {
	return text
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
		.trim();
}

/** A numeric facet's real extent, plus the count its `+ none` toggle admits. */
export type NumericDomain = { min: number; max: number; nullCount: number };

export type FacetCount = { value: string; count: number };

export type Dataset = {
	cards: readonly Card[];
	colorOrder: readonly Color[];
	cardTypeOrder: readonly CardType[];
	ramPerLegend: number;
	sets: readonly SetSummary[];
	stats: Stats;
	bySlug: ReadonlyMap<string, Card>;
	/** slug → the normalized haystack text search matches against. */
	searchText: ReadonlyMap<string, string>;
	colorRank: ReadonlyMap<Color, number>;
	cardTypeRank: ReadonlyMap<CardType, number>;
	/** Classifications present in the data, commonest first — a 39-value long tail. */
	classifications: readonly FacetCount[];
	/** Rarities present on printings, in curated order. Nine, not the six on the cards. */
	rarities: readonly Rarity[];
	domains: { cost: NumericDomain; power: NumericDomain; ram: NumericDomain };
};

function domainOf(values: readonly (number | null)[]): NumericDomain {
	const present = values.filter((value): value is number => value !== null);
	return {
		min: present.length === 0 ? 0 : Math.min(...present),
		max: present.length === 0 ? 0 : Math.max(...present),
		nullCount: values.length - present.length
	};
}

/**
 * Text search covers name and rules text — **rules only, never `rawRulesText`**. Searching
 * "night" against the raw string would match flavour prose as though it were a game effect,
 * and flavour is exactly what the ingest split pulled out of there.
 */
function searchHaystack(card: Card): string {
	return normalizeForSearch(`${card.name} ${plainText(card.rulesText)}`);
}

export function createDataset(snapshot: Snapshot): Dataset {
	const { cards } = snapshot;

	const classificationCounts = new Map<string, number>();
	for (const card of cards) {
		for (const classification of card.classifications) {
			classificationCounts.set(classification, (classificationCounts.get(classification) ?? 0) + 1);
		}
	}

	const raritiesPresent = new Set(
		cards.flatMap((card) => card.printings.map((printing) => printing.rarity))
	);

	return {
		cards,
		colorOrder: snapshot.colorOrder,
		cardTypeOrder: snapshot.cardTypeOrder,
		ramPerLegend: snapshot.ramPerLegend,
		sets: snapshot.sets,
		stats: snapshot.stats,
		bySlug: new Map(cards.map((card) => [card.slug, card])),
		searchText: new Map(cards.map((card) => [card.slug, searchHaystack(card)])),
		colorRank: new Map(snapshot.colorOrder.map((color, index) => [color, index])),
		cardTypeRank: new Map(snapshot.cardTypeOrder.map((cardType, index) => [cardType, index])),
		classifications: [...classificationCounts.entries()]
			.map(([value, count]) => ({ value, count }))
			.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
		rarities: RARITY_ORDER.filter((rarity) => raritiesPresent.has(rarity)),
		domains: {
			cost: domainOf(cards.map((card) => card.cost)),
			power: domainOf(cards.map((card) => card.power)),
			ram: domainOf(cards.map((card) => card.ramRequired))
		}
	};
}
