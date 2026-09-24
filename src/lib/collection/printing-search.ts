/**
 * Finding a Printing by what's printed on the card in your hand.
 *
 * Extracted from `/collection/add` once the Binder editor needed the same thing: both ask "which
 * of the ~700 printings is this?", and both answer it from a collector number first and a name
 * second. Two copies of this ranking would drift, and the ranking is the part that took measuring
 * to get right.
 *
 * Not part of the query language. That pipeline (`#lib/query/*`) answers *set-shaped* questions —
 * `rarity>=epic owned:0` — and returns Cards. This answers a single-answer question about one
 * Printing, where tiering and a result cap are the whole point.
 */
import { dataset } from '#lib/cards/index.js';
import { normalizeForSearch } from '#lib/cards/dataset.js';
import { collectorNumberSortKey, printTreatment } from '#lib/cards/derive.js';
import { DEFAULT_LOCALE } from '#lib/cards/vocabulary.js';
import type { Card, Printing } from '#lib/cards/schema.js';

export type PrintingRow = { card: Card; printing: Printing };

/** Every (Card, Printing) pair, flattened once at module scope — the dataset is immutable. */
export const PRINTING_ROWS: readonly PrintingRow[] = dataset.cards.flatMap((card) =>
	card.printings.map((printing) => ({ card, printing }))
);

const SET_ORDER = dataset.sets.map((set) => set.id);

/**
 * The same rows in the order a physical collection is in: by Set, then by printed Collector Number.
 *
 * `PRINTING_ROWS` is in dataset order, which groups a Card's printings together across Sets —
 * right for matching, wrong for browsing. Anything that shows a *list* of printings to pick from
 * wants this one.
 */
export const PRINTING_ROWS_IN_SET_ORDER: readonly PrintingRow[] = [...PRINTING_ROWS].sort(
	(a, b) => {
		const bySet = SET_ORDER.indexOf(a.printing.setId) - SET_ORDER.indexOf(b.printing.setId);
		if (bySet !== 0) return bySet;

		const [aNumber, aText] = collectorNumberSortKey(a.printing.collectorNumber);
		const [bNumber, bText] = collectorNumberSortKey(b.printing.collectorNumber);
		return aNumber - bNumber || aText.localeCompare(bText);
	}
);

/** Retail before beta. Not `localeCompare`, which sorts "beta" first — backwards, since retail is
 * the common case and the default everywhere else. */
const treatmentRank = (printing: Printing) => (printTreatment(printing) === 'retail' ? 0 : 1);

/**
 * A collector number without its Print Treatment marker — `β001` and `001` are the same position
 * in the sequence, printed on two different copies of the same card.
 */
function bareNumber(value: string): string {
	return value.replace(/^β/i, '');
}

function bySetThenTreatment(tier: PrintingRow[]): PrintingRow[] {
	return [...tier].sort(
		(a, b) =>
			SET_ORDER.indexOf(a.printing.setId) - SET_ORDER.indexOf(b.printing.setId) ||
			treatmentRank(a.printing) - treatmentRank(b.printing) ||
			Number(a.printing.locale !== DEFAULT_LOCALE) - Number(b.printing.locale !== DEFAULT_LOCALE)
	);
}

/**
 * Exact collector number, then **containing** it, then name. Within a tier, rows are ordered by
 * Set, then retail before beta, then default locale first.
 *
 * Ordering by Set rather than by "what you're collecting" is deliberate, and a correction: an
 * In-Goal-first order sounds helpful and hides the answer. Roughly seventeen printings share the
 * number `001`, about twelve of them English retail — so putting those first filled the result cap
 * and made every beta `001` unreachable, which is precisely the case this exists for. By Set, a
 * Set's retail and beta rows sit next to each other, and the Set is printed on the card in your
 * hand.
 *
 * Two things make beta printings reachable, and both are needed:
 *
 * - **`β` is stripped before the exact comparison.** It is a Print Treatment marker, not part of
 *   the number sequence (`CONTEXT.md`), and it is not on anyone's keyboard — so typing `001`
 *   counts as an exact hit on `β001` too. Without this, beta lands in the containment tier and is
 *   then cut by the result cap, because a number like `001` has an exact match in nearly every Set.
 * - **Containment rather than prefix** for the remaining tier, so a partial like `5a` still finds
 *   `005a` and `β005a`.
 */
export function searchPrintings(term: string, limit = 12): PrintingRow[] {
	if (term.length === 0) return [];

	const lower = term.toLowerCase();
	const needle = normalizeForSearch(term);

	const exact: PrintingRow[] = [];
	const contains: PrintingRow[] = [];
	const byName: PrintingRow[] = [];

	for (const row of PRINTING_ROWS) {
		const number = row.printing.collectorNumber.toLowerCase();
		if (bareNumber(number) === bareNumber(lower)) exact.push(row);
		else if (number.includes(lower)) contains.push(row);
		else if (needle && normalizeForSearch(row.card.name).includes(needle)) byName.push(row);
	}

	return [
		...bySetThenTreatment(exact),
		...bySetThenTreatment(contains),
		...bySetThenTreatment(byName)
	].slice(0, limit);
}

/** The printed Set code, for telling two printings of the same card apart at a glance. */
export function setLabel(setId: string): string {
	return dataset.sets.find((set) => set.id === setId)?.printed ?? setId;
}

/** A Printing by id — the Binder stores ids, and every view needs the art and the name back. */
const rowsById = new Map(PRINTING_ROWS.map((row) => [row.printing.id, row]));

export function printingRow(printingId: string): PrintingRow | undefined {
	return rowsById.get(printingId);
}
