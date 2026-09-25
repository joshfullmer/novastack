/**
 * Deck legality — see `docs/spec/deckbuilder.md` §2 and §4.
 *
 * `admits` from `#lib/filters/budget.js` is reused unchanged; everything here is about building
 * the budget from the *chosen* Legends and reporting what a budget doesn't cover, not about
 * re-deriving the admission rule itself.
 */
import { legendBaseName } from '#lib/cards/derive.js';
import type { Card } from '#lib/cards/schema.js';
import type { Color } from '#lib/cards/vocabulary.js';
import { admits, EMPTY_BUDGET, type ColorBudget } from '#lib/filters/budget.js';

export const LEGEND_SLOTS = 3;
export const MIN_DECK_SIZE = 40;
export const MAX_DECK_SIZE = 50;
export const MAX_COPIES = 3;
/** Tournament rules §D.1: "A sideboard of exactly 7 cards." */
export const SIDEBOARD_SIZE = 7;

export type SizeStatus = 'under' | 'legal' | 'over';
export type DeckEntry = { card: Card; quantity: number; printingId?: string };

/**
 * Main deck and sideboard as one list, quantities summed per card.
 *
 * Three separate rules are deck-wide rather than per-pile — the ≤3-copy cap (`copiesOf`), the RAM
 * budget, and tournament legality — because the sideboard's cards get swapped *into* the main deck
 * mid-match (tournament rules §3.4.4), so a card the Legends can't power is just as unplayable
 * sitting in the 7. Merging once here is what keeps those three from each growing their own
 * two-argument variant.
 *
 * `printingId` is dropped: a merged entry can't honestly carry one when the two piles disagree,
 * and no rule this feeds depends on printing choice.
 */
export function combinedEntries(
	entries: readonly DeckEntry[],
	sideboard: readonly DeckEntry[]
): DeckEntry[] {
	const bySlug = new Map<string, DeckEntry>();
	for (const entry of [...entries, ...sideboard]) {
		const merged = bySlug.get(entry.card.slug);
		if (merged) merged.quantity += entry.quantity;
		else bySlug.set(entry.card.slug, { card: entry.card, quantity: entry.quantity });
	}
	return [...bySlug.values()];
}

/**
 * Copies across the main deck *and* the sideboard — what the ≤3-copy cap counts.
 *
 * The tournament rules don't say so outright: §D.1 lists "No more than 3 copies of any unique card
 * name" as a flat deckbuilding rule, while §4.1 has judges verify each section "independently of
 * the other." Combined is the genre-standard reading, it's what the official site's own builder
 * enforces ("Maximum 3 copies allowed (deck + sideboard)"), and it's the conservative direction —
 * a combined cap never admits a list a per-pile cap would reject. See
 * `docs/research/sideboards.md` §2; this function is the only place to change if a ruling says
 * otherwise.
 */
export function copiesOf(
	card: Card,
	entries: readonly DeckEntry[],
	sideboard: readonly DeckEntry[]
): number {
	return [...entries, ...sideboard]
		.filter((entry) => entry.card.slug === card.slug)
		.reduce((sum, entry) => sum + entry.quantity, 0);
}

/**
 * Sums the *chosen* Legends' own `ramProvided` per Color — not a slot count multiplied by the
 * dataset's `ramPerLegend` constant. Deliberately forward-compatible with Legends ever providing
 * non-uniform RAM; deck construction still fixes exactly 3 Legends regardless of how many are
 * passed here.
 */
export function budgetFromLegends(legends: readonly Card[]): ColorBudget {
	const budget: Record<Color, number> = { ...EMPTY_BUDGET };
	for (const legend of legends) budget[legend.color] += legend.ramProvided ?? 0;
	return budget;
}

/** Never blocks — a deck under construction is supposed to sit outside 40–50 most of the time. */
export function deckSizeStatus(totalCards: number): SizeStatus {
	if (totalCards < MIN_DECK_SIZE) return 'under';
	if (totalCards > MAX_DECK_SIZE) return 'over';
	return 'legal';
}

export type SideboardStatus = 'empty' | 'incomplete' | 'legal' | 'over';

/**
 * **Zero is legal, not unfinished.** Tournament rules §C.2.2 names a real configuration — "quick"
 * best-of-1, played with "a constructed format legal best-of-1 deck with no sideboard" — so an
 * empty sideboard is a legal casual/LGS list rather than a deck with a hole in it. That's what
 * lets this rule land on a database full of sideboard-less decks (including the hand-flagged
 * starter decks) without turning every one of them illegal overnight.
 *
 * `'over'` is unreachable through the editor, which blocks the 8th add the same way it blocks a
 * 4th copy — but a hand-edited payload can still arrive here, so it's reported rather than
 * assumed away.
 */
export function sideboardStatus(totalCards: number): SideboardStatus {
	if (totalCards === 0) return 'empty';
	if (totalCards > SIDEBOARD_SIZE) return 'over';
	if (totalCards < SIDEBOARD_SIZE) return 'incomplete';
	return 'legal';
}

/**
 * Entries the current budget doesn't cover — the authoritative RAM-legality signal, independent
 * of *when* the mismatch arose (a card added before any Legend existed reports identically to
 * one that became illegal after a Legend was swapped out).
 *
 * Callers pass `combinedEntries(...)`, not the main deck alone: sideboard cards are bound by the
 * same budget (tournament rules §D.1), and a merged list reports a card that's over budget in both
 * piles once rather than twice.
 */
export function ramViolations(
	entries: readonly DeckEntry[],
	budget: ColorBudget
): readonly DeckEntry[] {
	return entries.filter((entry) => !admits(budget, entry.card));
}

export type LegendNameConflict = { baseName: string; legends: readonly Card[] };

/**
 * Comprehensive rules, "Card Data > Name": two Legends sharing a base name can't be in the same
 * deck — e.g. "V — Streetkid" and "V — Corporate Exile" are both "V". Grouped rather than
 * pairwise, so a future increase past `LEGEND_SLOTS` still reports correctly if three Legends
 * ever collide on one name at once.
 */
export function legendNameConflicts(legends: readonly Card[]): readonly LegendNameConflict[] {
	const groups = new Map<string, Card[]>();
	for (const legend of legends) {
		const baseName = legendBaseName(legend);
		const group = groups.get(baseName);
		if (group) group.push(legend);
		else groups.set(baseName, [legend]);
	}

	return [...groups.entries()]
		.filter(([, group]) => group.length > 1)
		.map(([baseName, group]) => ({ baseName, legends: group }));
}

export type DeckIssue = {
	kind: 'size' | 'sideboard' | 'ram' | 'legend-names' | 'not-legal';
	message: string;
};

/**
 * Legends and main-deck cards the source API itself marks `"not-legal"` (`Card.tournamentLegal`
 * — `#lib/cards/schema.ts`), e.g. a promo stub with no cost/power/RAM/rules text yet. Reported the
 * same way as a RAM mismatch: never blocks adding or saving, just shows up as a `DeckIssue`.
 *
 * Fed `combinedEntries(...)` for the same reason as `ramViolations`: §D.1's "All cards must be
 * 'constructed legal'" covers the 7 too.
 */
export function notLegalCards(legends: readonly Card[], entries: readonly DeckEntry[]): Card[] {
	return [...legends, ...entries.map((entry) => entry.card)].filter(
		(card) => !card.tournamentLegal
	);
}

/**
 * Every persistent, non-blocking legality signal combined into one list — RAM, deck size,
 * sideboard size and contents, Legend-name conflicts, and not-tournament-legal cards today. None
 * of these ever block editing
 * (§4); this is what lets a single "deck is invalid, and here's why" banner exist without each
 * screen assembling its own wording, and lets a future rule show up everywhere this is rendered
 * just by pushing another `DeckIssue`.
 */
export function deckIssues(args: {
	totalCards: number;
	sizeStatus: SizeStatus;
	sideboardCards: number;
	sideboardStatus: SideboardStatus;
	sideboardLegends: readonly Card[];
	violations: readonly DeckEntry[];
	nameConflicts: readonly LegendNameConflict[];
	notLegal: readonly Card[];
}): readonly DeckIssue[] {
	const issues: DeckIssue[] = [];

	if (args.sizeStatus === 'under')
		issues.push({
			kind: 'size',
			message: `Deck has ${args.totalCards} card${args.totalCards === 1 ? '' : 's'} — the legal minimum is ${MIN_DECK_SIZE}.`
		});
	else if (args.sizeStatus === 'over')
		issues.push({
			kind: 'size',
			message: `Deck has ${args.totalCards} cards — the legal maximum is ${MAX_DECK_SIZE}.`
		});

	// `'empty'` is deliberately silent — see `sideboardStatus`.
	if (args.sideboardStatus === 'incomplete')
		issues.push({
			kind: 'sideboard',
			message: `Sideboard has ${args.sideboardCards} card${args.sideboardCards === 1 ? '' : 's'} — a constructed sideboard is exactly ${SIDEBOARD_SIZE}.`
		});
	else if (args.sideboardStatus === 'over')
		issues.push({
			kind: 'sideboard',
			message: `Sideboard has ${args.sideboardCards} cards — the maximum is ${SIDEBOARD_SIZE}.`
		});

	// Tournament rules §3.4.4: "Players may not sideboard Legend cards." The editor never offers
	// it, so this only catches a hand-edited payload — but it's a rule, and this list is where
	// rules are reported.
	if (args.sideboardLegends.length > 0)
		issues.push({
			kind: 'sideboard',
			message: `Legends can't go in the sideboard: ${args.sideboardLegends.map((legend) => legend.name).join(', ')}.`
		});

	if (args.violations.length > 0)
		issues.push({
			kind: 'ram',
			message: `${args.violations.length} ${args.violations.length === 1 ? 'card exceeds' : 'cards exceed'} this deck's Legends' RAM: ${args.violations.map((entry) => entry.card.name).join(', ')}.`
		});

	for (const conflict of args.nameConflicts)
		issues.push({
			kind: 'legend-names',
			message: `Legends can't share a name: ${conflict.legends.map((legend) => legend.name).join(' and ')} are both "${conflict.baseName}".`
		});

	if (args.notLegal.length > 0)
		issues.push({
			kind: 'not-legal',
			message: `${args.notLegal.length} ${args.notLegal.length === 1 ? "card isn't" : "cards aren't"} tournament legal: ${args.notLegal.map((card) => card.name).join(', ')}.`
		});

	return issues;
}
