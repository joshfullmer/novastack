/**
 * Derived data. Ingest computes and writes these rather than the app hardcoding them.
 *
 * Every one is *current data, not a rule*, so each derivation returns the evidence its
 * assertion needs alongside the answer — see `assertions.ts`. Color order that happens to be
 * `Red, Yellow, Green, Blue` today is an observation about one printing run, and the moment
 * that run stops being contiguous the derivation is meaningless rather than merely stale.
 */
import type { Card, SetSummary } from './schema.ts';
import { BASE_SET_API_CODE, API_SET_CODE_TO_SET_ID, SET_IDENTIFIERS } from './sets.ts';
import type { CardType, Color } from './vocabulary.ts';

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
 * ordering depends on.
 */
export function baseSetSequence(
	cards: readonly Card[]
): { color: Color; cardType: CardType; collectorNumber: string }[] {
	return cards
		.flatMap((card) =>
			card.printings
				.filter(
					(printing) => printing.setId === BASE_SET_ID && !printing.collectorNumber.startsWith('β')
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
 * A printed name is one string, `"<Name> — <Subtitle>"` for a Legend (e.g. `"V — Streetkid"`),
 * just `"<Name>"` for everything else — there is no structured subtitle field anywhere in the
 * model (see `schema.ts`'s note on `subname`). This is the one parse of it, so a rename or a
 * punctuation change only has one call site to fix. No corpus-wide context is needed (unlike
 * `rulesText`'s `cardRef`/`classification` tokens, which cross-reference every other card), so
 * this stays a plain runtime function rather than a field baked into `cards.json` at ingest.
 */
export function splitCardName(card: Card): CardNameParts {
	const [name, subtitle] = card.name.split(' — ');
	return { name, subtitle: subtitle ?? null };
}

/**
 * A Legend's base name, for grouping same-named Legends — `checkModelInvariants`
 * (`assertions.ts`) fails the build if a Legend's name ever stops matching the
 * `"<Name> — <Subtitle>"` shape `splitCardName` assumes, since deck legality
 * (`#lib/decks/legality.ts`) depends on grouping Legends by this.
 */
export function legendBaseName(legend: Card): string {
	return splitCardName(legend).name;
}
