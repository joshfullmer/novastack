/**
 * Collection import — the other half of `/api/collection/export`.
 *
 * Pure, and in three steps so each is testable without a browser: `parseTable` (text → a header and
 * rows), `resolveRows` (rows → Printings, plus the rows that couldn't be), `planImport` (what
 * applying that would do to a Collection). The page composes them; none of them writes anything.
 *
 * **An import sets, it never adds and never deletes.** Each row *sets* its Printing's Owned Count
 * to the file's quantity; a Printing the file doesn't mention is untouched. Re-importing the same
 * file therefore changes nothing — the property that makes "export, edit in a spreadsheet, import"
 * safe to repeat — and a wrongly-shaped file can lower counts but never wipe the Collection. Rows
 * that *lower* a count are the only destructive thing here, which is why the plan separates them.
 *
 * **How a row finds its Printing.** `printing_id` first: our own export carries it, and it's the
 * only unambiguous key. Without one — a hand-built spreadsheet, another tool's file — the printed
 * Set Identifier + Collector Number + locale, which is unique across every Printing (a Collector
 * Number alone is not: the French run reuses the English numbers). Name, rarity and treatment
 * columns are ignored for resolution on purpose: they're derivable, a stale one must not override
 * the key, and a Card name can't pick among a Card's two to fourteen Printings anyway.
 */
import { dataset } from '#lib/cards/index.js';
import { DEFAULT_LOCALE } from '#lib/cards/vocabulary.js';

/**
 * Mirrors `MAX_QUANTITY` in `routes/api/collection/+server.ts`, which can't export it (a
 * `+server.ts` may only export handlers). A row over it would be a 400 on commit, so it's refused
 * here, at the row that caused it.
 */
export const MAX_QUANTITY = 999;

/**
 * Far more rows than there are Printings (720). The commit endpoint accepts 1000 *distinct*
 * Printings, which can't be exceeded — a duplicate row collapses onto its Printing — so the guard
 * that's actually reachable is on the input: a file this long isn't a Collection export.
 */
export const MAX_ROWS = 5000;

export type TableRow = {
	/** 1-based physical line the record starts on; the header is line 1. What a spreadsheet shows. */
	line: number;
	cells: string[];
};

export type Table = { header: string[]; rows: TableRow[]; delimiter: ',' | '\t' };

export type ParseResult = { ok: true; table: Table } | { ok: false; error: string };

/**
 * RFC 4180 with a configurable delimiter: quoted fields, `""` as an escaped quote, and a quoted
 * field may contain the delimiter or a line break. Accepts CRLF, LF and bare CR record endings,
 * and a leading BOM (the export writes one for Excel).
 */
export function parseDelimited(text: string, delimiter: string): TableRow[] {
	const rows: TableRow[] = [];
	let cells: string[] = [];
	let field = '';
	let quoted = false;
	let line = 1;
	let rowLine = 1;
	let rowStarted = false;

	const endField = () => {
		cells.push(field);
		field = '';
	};
	const endRow = () => {
		endField();
		rows.push({ line: rowLine, cells });
		cells = [];
		rowStarted = false;
	};

	const source = text.startsWith('\uFEFF') ? text.slice(1) : text;
	for (let index = 0; index < source.length; index += 1) {
		const char = source[index];

		if (quoted) {
			if (char === '"') {
				if (source[index + 1] === '"') {
					field += '"';
					index += 1;
				} else quoted = false;
			} else {
				if (char === '\n') line += 1;
				field += char;
			}
			continue;
		}

		if (!rowStarted) {
			rowLine = line;
			rowStarted = true;
		}

		if (char === '"' && field === '') quoted = true;
		else if (char === delimiter) endField();
		else if (char === '\n' || char === '\r') {
			if (char === '\r' && source[index + 1] === '\n') index += 1;
			endRow();
			line += 1;
		} else field += char;
	}
	if (rowStarted || field !== '' || cells.length > 0) endRow();

	return rows;
}

/** Tab if the header line has one, else comma: a spreadsheet paste is TSV, a file is CSV. */
function sniffDelimiter(text: string): ',' | '\t' {
	const firstLine = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/, 1)[0];
	return firstLine.includes('\t') ? '\t' : ',';
}

const isBlank = (row: TableRow) => row.cells.every((cell) => cell.trim() === '');

/**
 * The first non-blank record is the header; blank records anywhere are dropped silently, since a
 * trailing newline or a gap in a spreadsheet isn't a mistake worth reporting.
 */
export function parseTable(text: string): ParseResult {
	const delimiter = sniffDelimiter(text);
	const records = parseDelimited(text, delimiter).filter((row) => !isBlank(row));
	if (records.length === 0) return { ok: false, error: 'Nothing to import — the file is empty.' };

	const [head, ...rows] = records;
	if (rows.length > MAX_ROWS)
		return {
			ok: false,
			error: `That's ${rows.length.toLocaleString()} rows — more than any Collection export has. Is it the right file?`
		};

	return {
		ok: true,
		table: { header: head.cells.map((cell) => cell.trim()), rows, delimiter }
	};
}

// -- Columns ----------------------------------------------------------------------------------

/** Lowercase, with every run of non-alphanumerics gone: `Set Identifier` ≡ `set_identifier`. */
const squash = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

type Column = 'quantity' | 'printingId' | 'set' | 'collectorNumber' | 'locale';

/** Accepted header spellings, squashed. Our export's own names first, plain-English ones after. */
const ALIASES: Record<Column, readonly string[]> = {
	quantity: ['quantity', 'qty', 'count', 'owned', 'ownedcount'],
	printingId: ['printingid', 'printing'],
	set: ['setidentifier', 'setcode', 'set'],
	collectorNumber: ['collectornumber', 'number', 'cardnumber', 'collectorno'],
	locale: ['locale', 'language', 'lang']
};

/** Header → column index, picking the earliest-listed alias that's present. */
function findColumns(header: readonly string[]): Partial<Record<Column, number>> {
	const squashed = header.map(squash);
	const found: Partial<Record<Column, number>> = {};
	for (const column of Object.keys(ALIASES) as Column[]) {
		for (const alias of ALIASES[column]) {
			const index = squashed.indexOf(alias);
			if (index !== -1) {
				found[column] = index;
				break;
			}
		}
	}
	return found;
}

// -- Resolving --------------------------------------------------------------------------------

const printingById = new Map(
	dataset.cards.flatMap((card) =>
		card.printings.map((printing) => [printing.id.toLowerCase(), printing.id] as const)
	)
);

/**
 * A Set, by anything a spreadsheet might hold for it: the printed identifier (`MS01 - WNC [A]`),
 * the id (`MS01-WNC`), or either without its punctuation. A key two Sets share is dropped rather
 * than guessed — today none do, and this keeps that true when one does.
 */
const setByKey = (() => {
	const keys = new Map<string, string | null>();
	for (const set of dataset.sets) {
		for (const key of new Set([squash(set.printed), squash(set.id)])) {
			keys.set(key, keys.has(key) && keys.get(key) !== set.id ? null : set.id);
		}
	}
	return keys;
})();

const slot = (setId: string, collectorNumber: string, locale: string) =>
	`${setId}\u0000${collectorNumber.toLowerCase()}\u0000${locale}`;

const printingBySlot = new Map(
	dataset.cards.flatMap((card) =>
		card.printings.map(
			(printing) =>
				[slot(printing.setId, printing.collectorNumber, printing.locale), printing.id] as const
		)
	)
);

/**
 * What a locale cell can say. A blank cell is English, the way most rows are; anything else we
 * can't place is reported rather than quietly read as English.
 */
const LOCALES: Record<string, string> = {
	en: 'en',
	english: 'en',
	fr: 'fr',
	french: 'fr',
	francais: 'fr',
	français: 'fr'
};

/**
 * Collector Numbers a spreadsheet will have mangled: Excel turns `001` into `1` on save. Exact
 * first, then zero-padded to the printed widths. Never *strips* zeros the file did write.
 */
function collectorNumberCandidates(value: string): string[] {
	if (!/^\d+$/.test(value)) return [value];
	return [...new Set([value, value.padStart(3, '0'), value.padStart(2, '0')])];
}

export type ResolvedEntry = {
	line: number;
	printingId: string;
	quantity: number;
};

export type UnresolvedRow = {
	line: number;
	/** The row's non-empty cells, for the human to recognise it by. */
	raw: string;
	reason: string;
};

export type Resolution = {
	/** One per Printing — a repeated Printing keeps its last row, as the commit endpoint would. */
	entries: ResolvedEntry[];
	unresolved: UnresolvedRow[];
	warnings: string[];
};

function parseQuantity(value: string): number | string {
	const trimmed = value.trim();
	if (trimmed === '') return 'quantity is blank';
	if (!/^\d+$/.test(trimmed)) return `quantity “${trimmed}” isn’t a whole number`;
	const quantity = Number(trimmed);
	if (quantity > MAX_QUANTITY) return `quantity ${quantity} is over the ${MAX_QUANTITY} maximum`;
	return quantity;
}

/** A Printing id, a Set, a number and a locale → the Printing, or the reason there isn't one. */
function resolveBySlot(
	setValue: string,
	numberValue: string,
	localeValue: string
): string | { reason: string } {
	const setId = setByKey.get(squash(setValue));
	if (setId === undefined || setId === null)
		return { reason: setValue === '' ? 'no set given' : `unknown set “${setValue}”` };

	const locale = localeValue === '' ? DEFAULT_LOCALE : LOCALES[localeValue.toLowerCase()];
	if (locale === undefined) return { reason: `unknown locale “${localeValue}”` };

	if (numberValue === '') return { reason: 'no collector number given' };
	for (const candidate of collectorNumberCandidates(numberValue)) {
		const found = printingBySlot.get(slot(setId, candidate, locale));
		if (found) return found;
	}
	return { reason: `no ${locale} printing numbered “${numberValue}” in ${setValue}` };
}

export function resolveRows(table: Table): Resolution | { error: string } {
	const columns = findColumns(table.header);
	if (columns.quantity === undefined)
		return { error: 'No quantity column — the header row needs one called “quantity”.' };
	if (
		columns.printingId === undefined &&
		(columns.set === undefined || columns.collectorNumber === undefined)
	)
		return {
			error:
				'No way to tell which printing each row is — the header row needs “printing_id”, ' +
				'or both “set_identifier” and “collector_number”.'
		};

	const cell = (row: TableRow, column: Column) => {
		const index = columns[column];
		return index === undefined ? '' : (row.cells[index] ?? '').trim();
	};

	const byPrinting = new Map<string, ResolvedEntry>();
	const unresolved: UnresolvedRow[] = [];
	const warnings: string[] = [];

	for (const row of table.rows) {
		const reject = (reason: string) =>
			unresolved.push({
				line: row.line,
				raw: row.cells.filter((value) => value.trim() !== '').join(' · '),
				reason
			});

		const quantity = parseQuantity(cell(row, 'quantity'));
		if (typeof quantity === 'string') {
			reject(quantity);
			continue;
		}

		const givenId = cell(row, 'printingId');
		let printingId = givenId === '' ? undefined : printingById.get(givenId.toLowerCase());
		let failure = givenId === '' ? undefined : `unknown printing_id “${givenId}”`;

		// A stale or absent id isn't fatal while the row also says which printing it means.
		if (
			printingId === undefined &&
			columns.set !== undefined &&
			columns.collectorNumber !== undefined
		) {
			const bySlot = resolveBySlot(
				cell(row, 'set'),
				cell(row, 'collectorNumber'),
				cell(row, 'locale')
			);
			if (typeof bySlot === 'string') printingId = bySlot;
			else failure ??= bySlot.reason;
		}

		if (printingId === undefined) {
			reject(failure ?? 'no printing_id on the row');
			continue;
		}

		const earlier = byPrinting.get(printingId);
		if (earlier)
			warnings.push(
				`Row ${earlier.line} and row ${row.line} are the same printing — using row ${row.line}.`
			);
		byPrinting.set(printingId, { line: row.line, printingId, quantity });
	}

	return { entries: [...byPrinting.values()], unresolved, warnings };
}

// -- Planning ---------------------------------------------------------------------------------

export type ChangeKind = 'new' | 'increase' | 'decrease' | 'unchanged';

export type PlanRow = ResolvedEntry & {
	/** The Owned Count now. */
	from: number;
	kind: ChangeKind;
};

export type ImportPlan = {
	rows: PlanRow[];
	/** Rows that would write: everything but `unchanged`. */
	changes: PlanRow[];
	counts: Record<ChangeKind, number>;
};

/** What setting each entry would do against the Owned Counts held now. */
export function planImport(
	entries: readonly ResolvedEntry[],
	owned: Readonly<Record<string, number>>
): ImportPlan {
	const counts: Record<ChangeKind, number> = { new: 0, increase: 0, decrease: 0, unchanged: 0 };
	const rows = entries.map((entry): PlanRow => {
		const from = owned[entry.printingId] ?? 0;
		const kind: ChangeKind =
			entry.quantity === from
				? 'unchanged'
				: from === 0
					? 'new'
					: entry.quantity > from
						? 'increase'
						: 'decrease';
		counts[kind] += 1;
		return { ...entry, from, kind };
	});

	return { rows, changes: rows.filter((row) => row.kind !== 'unchanged'), counts };
}
