/**
 * Printing Runs and the Collecting Goal — what "Complete" means to a given user.
 *
 * See `CONTEXT.md`'s **Printing Run**, **Collecting Goal**, **In Goal** / **Off Goal** and
 * **Complete**. A Printing Run is one Set in one Print Treatment and one Locale — the unit that
 * was physically manufactured as a batch, and so the unit a collector decides about. A Collecting
 * Goal is a set of Runs.
 *
 * Every function here is pure and takes the data it needs, so a test can build a five-printing
 * world rather than reasoning about all 700. `PRINTING_RUNS` and `DEFAULT_GOAL` are the
 * real-dataset instances, derived once.
 *
 * **Storage is deliberately absent.** This slice ships the default Goal only; persisting and
 * editing one is the next piece of work. Keeping the maths pure now means that lands as a source
 * of Goals rather than a rewrite of how completion is computed.
 */
import { printTreatment, type PrintTreatment } from '#lib/cards/derive.js';
import { dataset } from '#lib/cards/index.js';
import type { Card, Printing } from '#lib/cards/schema.js';
import { DEFAULT_LOCALE, type Locale } from '#lib/cards/vocabulary.js';
import type { OwnedLookup } from '#lib/filters/predicate.js';

export type PrintingRun = {
	/** `<setId>|<treatment>|<locale>` — stable, and what a stored Goal holds. */
	key: string;
	setId: string;
	treatment: PrintTreatment;
	locale: Locale;
	/** How many Printings this Run contains. The number that makes a Goal's cost legible. */
	printings: number;
};

export type CollectingGoal = ReadonlySet<string>;

export function runKey(setId: string, treatment: PrintTreatment, locale: Locale): string {
	return `${setId}|${treatment}|${locale}`;
}

export function runOf(printing: Printing): string {
	return runKey(printing.setId, printTreatment(printing), printing.locale);
}

/**
 * Every Run the data actually contains, in set order then treatment then locale.
 *
 * Derived rather than curated, so a combination that was never printed is never offered: there is
 * no French beta run, and nothing here invents one. Seventeen exist today, unevenly — the Base Set
 * has three and eight Sets have one apiece, which is why the editor can show most Sets as a single
 * choice rather than a grid of toggles.
 */
export function printingRunsOf(cards: readonly Card[], setOrder: readonly string[]): PrintingRun[] {
	const runs = new Map<string, PrintingRun>();

	for (const card of cards) {
		for (const printing of card.printings) {
			const key = runOf(printing);
			const existing = runs.get(key);
			if (existing) {
				existing.printings += 1;
				continue;
			}
			runs.set(key, {
				key,
				setId: printing.setId,
				treatment: printTreatment(printing),
				locale: printing.locale,
				printings: 1
			});
		}
	}

	return [...runs.values()].sort(
		(a, b) =>
			setOrder.indexOf(a.setId) - setOrder.indexOf(b.setId) ||
			a.treatment.localeCompare(b.treatment) ||
			a.locale.localeCompare(b.locale)
	);
}

export const PRINTING_RUNS: readonly PrintingRun[] = printingRunsOf(
	dataset.cards,
	dataset.sets.map((set) => set.id)
);

/**
 * Retail, in the default locale, across every Set — a denominator of 332 rather than 700.
 *
 * The alternative default is "everything", and it is actively discouraging: 218 of 700 Printings
 * are Kickstarter-only beta and 150 are French reprints, so a collector after English retail cards
 * would open the page at a permanent ceiling of 47% for cards they never wanted and in many cases
 * cannot buy. Defaulting Sets *off* presumes more than we know, so every Set is included.
 */
export const DEFAULT_GOAL: CollectingGoal = new Set(
	PRINTING_RUNS.filter((run) => run.treatment === 'retail' && run.locale === DEFAULT_LOCALE).map(
		(run) => run.key
	)
);

/** Does this Printing count toward Completion? */
export function inGoal(printing: Printing, goal: CollectingGoal): boolean {
	return goal.has(runOf(printing));
}

export type Progress = { owned: number; total: number; percent: number };

function progress(owned: number, total: number): Progress {
	return { owned, total, percent: total === 0 ? 0 : Math.round((owned / total) * 100) };
}

/** Every Printing In Goal — the denominator behind every figure below. */
export function goalPrintings(
	cards: readonly Card[],
	goal: CollectingGoal
): { card: Card; printing: Printing }[] {
	return cards.flatMap((card) =>
		card.printings
			.filter((printing) => inGoal(printing, goal))
			.map((printing) => ({ card, printing }))
	);
}

/**
 * **Complete** — the share of In-Goal Printings held at least one copy of.
 *
 * Counted per Printing, not per Card: the Goal is expressed in Printing Runs, so a collector who
 * has chosen the French run is chasing those Printings specifically. (The `owned:` query field
 * rolls up to the Card instead, for a different and equally deliberate reason — see
 * `predicate.ts`.)
 */
export function completion(
	cards: readonly Card[],
	goal: CollectingGoal,
	ownedOf: OwnedLookup
): Progress {
	const scoped = goalPrintings(cards, goal);
	const owned = scoped.filter((entry) => ownedOf(entry.printing.id) > 0).length;
	return progress(owned, scoped.length);
}

/** Per-Set progress, counting only In-Goal Printings — so a retail-only collector sees a Set's
 * retail total rather than its retail-plus-beta total. `total: 0` means the Set is entirely Off
 * Goal, which reads as "not collecting" rather than as 0%. */
export function setProgress(
	cards: readonly Card[],
	setId: string,
	goal: CollectingGoal,
	ownedOf: OwnedLookup
): Progress {
	const scoped = goalPrintings(cards, goal).filter((entry) => entry.printing.setId === setId);
	return progress(scoped.filter((entry) => ownedOf(entry.printing.id) > 0).length, scoped.length);
}

/**
 * Per-Rarity progress. Borrowed from the digital CCG collection screens, because it is the axis
 * that says how far off "done" really is — 234 Commons and 30 Iconic Legends are not the same
 * kind of gap, and a single percentage hides that completely.
 */
export function rarityProgress(
	cards: readonly Card[],
	rarities: readonly string[],
	goal: CollectingGoal,
	ownedOf: OwnedLookup
): { rarity: string; owned: number; total: number; percent: number }[] {
	const scoped = goalPrintings(cards, goal);

	return rarities
		.map((rarity) => {
			const inRarity = scoped.filter((entry) => entry.printing.rarity === rarity);
			return {
				rarity,
				...progress(
					inRarity.filter((entry) => ownedOf(entry.printing.id) > 0).length,
					inRarity.length
				)
			};
		})
		.filter((row) => row.total > 0);
}

/** Total copies held, across every Printing — In Goal or not. What you own is what you own. */
export function totalCopies(cards: readonly Card[], ownedOf: OwnedLookup): number {
	return cards.reduce(
		(sum, card) => sum + card.printings.reduce((cardSum, p) => cardSum + ownedOf(p.id), 0),
		0
	);
}
