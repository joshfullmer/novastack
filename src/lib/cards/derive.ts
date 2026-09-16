/**
 * Derived data. Ingest computes and writes these rather than the app hardcoding them.
 *
 * Every one is *current data, not a rule*, so each derivation returns the evidence its
 * assertion needs alongside the answer — see `assertions.ts`. Color order that happens to be
 * `Red, Yellow, Green, Blue` today is an observation about one printing run, and the moment
 * that run stops being contiguous the derivation is meaningless rather than merely stale.
 */
import type { Card, Printing, SetSummary } from './schema.ts';
import { BASE_SET_API_CODE, API_SET_CODE_TO_SET_ID, SET_IDENTIFIERS } from './sets.ts';
import { ICONIC_RARITIES, type CardType, type Color } from './vocabulary.ts';

/** The Base Set's retail printing run, which is what carries the collector-number sequence. */
export const BASE_SET_ID = API_SET_CODE_TO_SET_ID[BASE_SET_API_CODE];

/**
 * Collector numbers are printed strings — `005a`, `β144`, `121`. Sort on the numeric part
 * first so `9` precedes `10`, then on the verbatim string so `005a` precedes `005b`.
 */
export function collectorNumberSortKey(collectorNumber: string): [number, string] {
	const digits = collectorNumber.replace(/\D/g, '');
	return [digits === '' ? Number.MAX_SAFE_INTEGER : Number(digits), collectorNumber];
}

function byCollectorNumber(a: string, b: string): number {
	const [aNum, aText] = collectorNumberSortKey(a);
	const [bNum, bText] = collectorNumberSortKey(b);
	return aNum - bNum || aText.localeCompare(bText);
}

/**
 * The Base Set's retail sequence, in printed collector-number order.
 *
 * Beta printings are excluded by their `β` prefix rather than by API set code: the printed
 * card is the authority, and interleaving a reprint run would destroy the contiguity the
 * ordering depends on. Iconic-rarity printings are excluded for the same reason — they are a
 * bonus alt-art treatment numbered well past the main run, not a second data point about it
 * (see `ICONIC_RARITIES` in vocabulary.ts).
 */
export function baseSetSequence(
	cards: readonly Card[]
): { color: Color; cardType: CardType; collectorNumber: string }[] {
	return cards
		.flatMap((card) =>
			card.printings
				.filter(
					(printing) =>
						printing.setId === BASE_SET_ID &&
						!printing.collectorNumber.startsWith('β') &&
						!(ICONIC_RARITIES as readonly string[]).includes(printing.rarity)
				)
				.map((printing) => ({
					color: card.color,
					cardType: card.cardType,
					collectorNumber: printing.collectorNumber
				}))
		)
		.sort((a, b) => byCollectorNumber(a.collectorNumber, b.collectorNumber));
}

export type RunOrder<T> = {
	/** The values in order of first appearance. */
	order: T[];
	/** How many contiguous runs the values form. Equal to `order.length` iff perfectly grouped. */
	runs: number;
};

/** Order of first appearance, plus the run count that proves the grouping is real. */
export function runOrder<T>(values: readonly T[]): RunOrder<T> {
	const order: T[] = [];
	let runs = 0;
	let previous: T | undefined;

	for (const value of values) {
		if (!order.includes(value)) order.push(value);
		if (runs === 0 || value !== previous) runs += 1;
		previous = value;
	}

	return { order, runs };
}

/**
 * Card-type runs are counted *within* each color block, which is the only way the "4 per
 * color" claim means anything — counting globally would pass on a sequence that had lost its
 * color grouping entirely.
 */
export function cardTypeRunsWithinColors(
	sequence: readonly { color: Color; cardType: CardType }[]
): RunOrder<CardType> {
	const order: CardType[] = [];
	let runs = 0;
	let previous: { color: Color; cardType: CardType } | undefined;

	for (const entry of sequence) {
		if (!order.includes(entry.cardType)) order.push(entry.cardType);
		if (
			previous === undefined ||
			previous.color !== entry.color ||
			previous.cardType !== entry.cardType
		)
			runs += 1;
		previous = entry;
	}

	return { order, runs };
}

/**
 * Every Legend provides the same RAM of its own color today, which is what lets the colored
 * RAM budget be expressed as three color slots instead of three chosen Legends. `distinct`
 * is the evidence: more than one value and the budget model is wrong, not just imprecise.
 */
export function deriveRamPerLegend(cards: readonly Card[]): { value: number; distinct: number[] } {
	const distinct = [
		...new Set(
			cards
				.filter((card) => card.cardType === 'Legend')
				.map((card) => card.ramProvided)
				.filter((ram): ram is number => ram !== null)
		)
	].sort((a, b) => a - b);

	return { value: distinct.at(-1) ?? 0, distinct };
}

/** Per-Set card and printing counts, in curated order. A zero count is drift, not an empty set. */
export function deriveSets(cards: readonly Card[]): SetSummary[] {
	const cardCounts = new Map<string, Set<string>>();
	const printingCounts = new Map<string, number>();

	for (const card of cards) {
		for (const printing of card.printings) {
			const slugs = cardCounts.get(printing.setId) ?? new Set<string>();
			slugs.add(card.slug);
			cardCounts.set(printing.setId, slugs);
			printingCounts.set(printing.setId, (printingCounts.get(printing.setId) ?? 0) + 1);
		}
	}

	return SET_IDENTIFIERS.map((set) => ({
		...set,
		cardCount: cardCounts.get(set.id)?.size ?? 0,
		printingCount: printingCounts.get(set.id) ?? 0
	}));
}

/**
 * Every Printing belonging to `setId`, one entry per Printing rather than per Card.
 *
 * A Set's detail page is a checklist, not the `/cards` grid: `evaluate`'s "one Match per Card"
 * (`filters/predicate.ts`) is right for a browsing grid, where a card matching a filter through
 * one printing should not appear as several identical-looking tiles — but it's exactly wrong
 * here, where a card with two printings in the set (a retail/beta pair, a tournament-prize
 * variant) belongs on the checklist twice, and the count needs to agree with `deriveSets`'
 * `printingCount` rather than its `cardCount`.
 */
export function printingsInSet(
	cards: readonly Card[],
	setId: string
): { card: Card; printing: Printing }[] {
	const results: { card: Card; printing: Printing }[] = [];
	for (const card of cards) {
		for (const printing of card.printings) {
			if (printing.setId === setId) results.push({ card, printing });
		}
	}
	return results;
}

export type PrintTreatment = 'retail' | 'beta';

/**
 * A Printing's Print Treatment (`CONTEXT.md`) — retail or the Kickstarter-only beta run. The `β`
 * Collector Number prefix is the only signal for this; it is not tied to any particular Set, so
 * a Set that never had a beta run (everything after Set 1) simply never produces `'beta'` here.
 */
export function printTreatment(printing: Printing): PrintTreatment {
	return printing.collectorNumber.startsWith('β') ? 'beta' : 'retail';
}

/**
 * Reduces a Printing list to one entry per Card, keeping the first occurrence.
 *
 * "First" only means something useful because callers sort by Collector Number before calling
 * this — so it's the lowest-numbered Printing in whatever's already been filtered (a Set, and
 * possibly a Print Treatment within it), not an arbitrary pick.
 */
export function collapseToUniqueCards<T extends { card: Card }>(entries: readonly T[]): T[] {
	const seen = new Set<string>();
	const unique: T[] = [];
	for (const entry of entries) {
		if (seen.has(entry.card.slug)) continue;
		seen.add(entry.card.slug);
		unique.push(entry);
	}
	return unique;
}

/**
 * Cards that exist only in Derivative Sets — "show me the Base Set" legitimately excludes
 * these, which is worth surfacing rather than hiding.
 */
export function setExclusiveSlugs(cards: readonly Card[]): string[] {
	return cards
		.filter((card) => card.printings.every((printing) => printing.setId !== BASE_SET_ID))
		.map((card) => card.slug);
}

export type CardNameParts = { name: string; subtitle: string | null };

/**
 * `card.name` is the full printed identity (e.g. `"Royce: Psycho on the Edge"`); `card.subtitle`
 * (straight from the API's `subname`) says whether one exists and what it is. The base name is
 * `name` with that known suffix — and whatever separator precedes it — stripped, rather than
 * `name` split on a hardcoded separator: the separator itself has already changed once (an em
 * dash, then a colon) within a week, and stripping a known suffix survives it changing again.
 */
export function splitCardName(card: Card): CardNameParts {
	if (card.subtitle === null) return { name: card.name, subtitle: null };
	const base = card.name.slice(0, card.name.length - card.subtitle.length).replace(/[\s:—-]+$/, '');
	return { name: base, subtitle: card.subtitle };
}

/**
 * A Legend's base name, for grouping same-named Legends — `checkModelInvariants`
 * (`assertions.ts`) fails the build if a Legend's `subtitle` is ever `null`, since deck legality
 * (`#lib/decks/legality.ts`) depends on grouping Legends by this.
 */
export function legendBaseName(legend: Card): string {
	return splitCardName(legend).name;
}
