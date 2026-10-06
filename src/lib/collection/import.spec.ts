import { describe, expect, it } from 'vitest';
import { dataset } from '#lib/cards/index.js';
import { printTreatment } from '#lib/cards/derive.js';
import {
	MAX_QUANTITY,
	MAX_ROWS,
	parseDelimited,
	parseTable,
	planImport,
	resolveRows,
	type Resolution,
	type Table
} from './import.js';

const printings = dataset.cards.flatMap((card) =>
	card.printings.map((printing) => ({ card, printing }))
);
const setOf = (setId: string) => dataset.sets.find((set) => set.id === setId)!;

/** A table straight from text, failing the test if it doesn't parse. */
function table(text: string): Table {
	const result = parseTable(text);
	if (!result.ok) throw new Error(result.error);
	return result.table;
}

function resolve(text: string): Resolution {
	const result = resolveRows(table(text));
	if ('error' in result) throw new Error(result.error);
	return result;
}

describe('parseDelimited', () => {
	it('reads quoted fields: embedded delimiters, doubled quotes, and line breaks', () => {
		const rows = parseDelimited('a,"b,c","say ""hi""","one\ntwo"\r\nd,e,f,g', ',');
		expect(rows.map((row) => row.cells)).toEqual([
			['a', 'b,c', 'say "hi"', 'one\ntwo'],
			['d', 'e', 'f', 'g']
		]);
	});

	it('numbers records by the physical line they start on, quoted breaks included', () => {
		const rows = parseDelimited('h\n"a\nb"\nc', ',');
		expect(rows.map((row) => row.line)).toEqual([1, 2, 4]);
	});

	it('takes CRLF, LF, bare CR and a BOM alike, and keeps a final record without a newline', () => {
		expect(parseDelimited('\uFEFFa,b\r\nc,d\re,f\ng,h', ',').map((row) => row.cells)).toEqual([
			['a', 'b'],
			['c', 'd'],
			['e', 'f'],
			['g', 'h']
		]);
	});

	it('keeps empty fields, including a trailing one', () => {
		expect(parseDelimited('a,,c,\n', ',')[0].cells).toEqual(['a', '', 'c', '']);
	});
});

describe('parseTable', () => {
	it('sniffs tab-separated text from the header line — what a spreadsheet paste is', () => {
		const parsed = table('quantity\tprinting_id\n2\tabc');
		expect(parsed.delimiter).toBe('\t');
		expect(parsed.header).toEqual(['quantity', 'printing_id']);
	});

	it('does not read commas inside a tab-separated field as separators', () => {
		const parsed = table('quantity\tcard\n1\tHello, World');
		expect(parsed.rows[0].cells).toEqual(['1', 'Hello, World']);
	});

	it('drops blank records without renumbering the rest', () => {
		const parsed = table('quantity,printing_id\n\n,\n1,a\n');
		expect(parsed.rows).toEqual([{ line: 4, cells: ['1', 'a'] }]);
	});

	it('refuses an empty file, and one far longer than any Collection', () => {
		expect(parseTable('  \n\n')).toMatchObject({ ok: false });
		const long = ['quantity', ...Array.from({ length: MAX_ROWS + 1 }, () => '1')].join('\n');
		expect(parseTable(long)).toMatchObject({ ok: false });
	});
});

describe('resolveRows', () => {
	const sample = printings[0];

	it('resolves by printing_id, whatever its case, ignoring the other columns', () => {
		const { entries, unresolved } = resolve(
			`quantity,card,printing_id,rarity\n2,Wrong Name,${sample.printing.id.toUpperCase()},Nonsense`
		);
		expect(unresolved).toEqual([]);
		expect(entries).toEqual([{ line: 2, printingId: sample.printing.id, quantity: 2 }]);
	});

	it('tolerates column order, extra columns, and header spelling', () => {
		const { entries } = resolve(`Extra,Printing ID,QTY\nx,${sample.printing.id},4`);
		expect(entries[0]).toMatchObject({ printingId: sample.printing.id, quantity: 4 });
	});

	it('falls back to set identifier + collector number when there is no printing_id', () => {
		const target = printings.find((row) => row.printing.locale === 'en')!;
		const printed = setOf(target.printing.setId).printed;
		const { entries, unresolved } = resolve(
			`set_identifier,collector_number,quantity\n${printed},${target.printing.collectorNumber},3`
		);
		expect(unresolved).toEqual([]);
		expect(entries).toEqual([{ line: 2, printingId: target.printing.id, quantity: 3 }]);
	});

	it('tells the French run from the English one by locale — the number alone is not enough', () => {
		const french = printings.find((row) => row.printing.locale === 'fr')!;
		const english = printings.find(
			(row) =>
				row.printing.locale === 'en' &&
				row.printing.setId === french.printing.setId &&
				row.printing.collectorNumber === french.printing.collectorNumber
		)!;
		const printed = setOf(french.printing.setId).printed;
		const base = `set_identifier,collector_number,locale,quantity\n`;
		const number = french.printing.collectorNumber;

		expect(resolve(`${base}${printed},${number},fr,1`).entries[0].printingId).toBe(
			french.printing.id
		);
		expect(resolve(`${base}${printed},${number},en,1`).entries[0].printingId).toBe(
			english.printing.id
		);
		// Blank means English, which is what most rows are.
		expect(resolve(`${base}${printed},${number},,1`).entries[0].printingId).toBe(
			english.printing.id
		);
	});

	it('accepts the set id, or the identifier without its punctuation', () => {
		const target = printings.find((row) => row.printing.locale === 'en')!;
		const set = setOf(target.printing.setId);
		const number = target.printing.collectorNumber;
		for (const spelling of [
			set.id,
			set.printed.toLowerCase(),
			set.printed.replace(/[\s[\]-]/g, '')
		])
			expect(
				resolve(`set,number,quantity\n${spelling},${number},1`).entries[0].printingId,
				spelling
			).toBe(target.printing.id);
	});

	it('restores the leading zeros a spreadsheet strips from 001', () => {
		const target = printings.find(
			(row) => row.printing.locale === 'en' && /^\d{3}$/.test(row.printing.collectorNumber)
		)!;
		const printed = setOf(target.printing.setId).printed;
		const stripped = String(Number(target.printing.collectorNumber));
		expect(
			resolve(`set_identifier,collector_number,quantity\n${printed},${stripped},1`).entries[0]
				.printingId
		).toBe(target.printing.id);
	});

	it('falls back to the slot when a printing_id is stale but the row says what it means', () => {
		const target = printings.find((row) => row.printing.locale === 'en')!;
		const printed = setOf(target.printing.setId).printed;
		const { entries } = resolve(
			`printing_id,set_identifier,collector_number,quantity\n` +
				`00000000-0000-0000-0000-000000000000,${printed},${target.printing.collectorNumber},1`
		);
		expect(entries[0].printingId).toBe(target.printing.id);
	});

	it('reports a row it cannot place, with its line and a reason, and still imports the rest', () => {
		const { entries, unresolved } = resolve(
			[
				'quantity,printing_id,card',
				`1,${sample.printing.id},ok`,
				'1,not-a-printing,Mystery Card',
				`abc,${sample.printing.id},bad quantity`,
				`,${sample.printing.id},blank quantity`,
				`-1,${sample.printing.id},negative`,
				`${MAX_QUANTITY + 1},${sample.printing.id},too many`,
				'2,,nothing to go on'
			].join('\n')
		);
		expect(entries).toHaveLength(1);
		expect(unresolved.map((row) => [row.line, row.reason])).toEqual([
			[3, 'unknown printing_id “not-a-printing”'],
			[4, 'quantity “abc” isn’t a whole number'],
			[5, 'quantity is blank'],
			[6, 'quantity “-1” isn’t a whole number'],
			[7, `quantity ${MAX_QUANTITY + 1} is over the ${MAX_QUANTITY} maximum`],
			[8, 'no printing_id on the row']
		]);
		expect(unresolved[0].raw).toBe('1 · not-a-printing · Mystery Card');
	});

	it('names what is wrong with a set or locale rather than just failing', () => {
		const target = printings.find((row) => row.printing.locale === 'en')!;
		const printed = setOf(target.printing.setId).printed;
		const { unresolved } = resolve(
			[
				'set_identifier,collector_number,locale,quantity',
				`Nowhere,001,,1`,
				`${printed},${target.printing.collectorNumber},de,1`,
				`${printed},9999,,1`
			].join('\n')
		);
		expect(unresolved.map((row) => row.reason)).toEqual([
			'unknown set “Nowhere”',
			'unknown locale “de”',
			`no en printing numbered “9999” in ${printed}`
		]);
	});

	it('keeps the last of a repeated printing, as the commit endpoint would, and says so', () => {
		const { entries, warnings } = resolve(
			`quantity,printing_id\n1,${sample.printing.id}\n3,${sample.printing.id}`
		);
		expect(entries).toEqual([{ line: 3, printingId: sample.printing.id, quantity: 3 }]);
		expect(warnings).toEqual(['Row 2 and row 3 are the same printing — using row 3.']);
	});

	it('accepts 0 — that is a real answer — and says plainly when the header is unusable', () => {
		expect(resolve(`quantity,printing_id\n0,${sample.printing.id}`).entries[0].quantity).toBe(0);
		expect(resolveRows(table('printing_id\nabc'))).toMatchObject({
			error: expect.stringContaining('quantity')
		});
		expect(resolveRows(table('quantity,card\n1,Chrome Fang'))).toMatchObject({
			error: expect.stringContaining('printing_id')
		});
	});
});

describe('planImport', () => {
	const [a, b, c, d] = printings.map((row) => row.printing.id);

	it('sorts every row into new, increase, decrease or unchanged against what is owned', () => {
		const plan = planImport(
			[
				{ line: 2, printingId: a, quantity: 2 },
				{ line: 3, printingId: b, quantity: 3 },
				{ line: 4, printingId: c, quantity: 1 },
				{ line: 5, printingId: d, quantity: 4 }
			],
			{ [b]: 1, [c]: 5, [d]: 4 }
		);
		expect(plan.rows.map((row) => [row.kind, row.from, row.quantity])).toEqual([
			['new', 0, 2],
			['increase', 1, 3],
			['decrease', 5, 1],
			['unchanged', 4, 4]
		]);
		expect(plan.counts).toEqual({ new: 1, increase: 1, decrease: 1, unchanged: 1 });
		expect(plan.changes.map((row) => row.printingId)).toEqual([a, b, c]);
	});

	it('treats 0 against nothing as no change, and 0 against a copy as a decrease', () => {
		const plan = planImport(
			[
				{ line: 2, printingId: a, quantity: 0 },
				{ line: 3, printingId: b, quantity: 0 }
			],
			{ [b]: 2 }
		);
		expect(plan.rows.map((row) => row.kind)).toEqual(['unchanged', 'decrease']);
	});

	it('is idempotent: the plan for what you already own is empty', () => {
		const owned = { [a]: 2, [b]: 1 };
		const plan = planImport(
			[
				{ line: 2, printingId: a, quantity: 2 },
				{ line: 3, printingId: b, quantity: 1 }
			],
			owned
		);
		expect(plan.changes).toEqual([]);
	});

	it('never touches a printing the file does not mention', () => {
		const plan = planImport([{ line: 2, printingId: a, quantity: 1 }], { [b]: 9 });
		expect(plan.rows.map((row) => row.printingId)).toEqual([a]);
	});
});

describe('the export round trip', () => {
	/**
	 * The format `routes/api/collection/export/+server.ts` writes — same columns, same quoting
	 * (everything quoted, `""` for a quote), same CRLF and BOM. Duplicated here because that
	 * handler can't export a helper, and extracting one just to share a six-line `map` isn't
	 * clearly right. If the export's columns change, this is the test that should be told.
	 */
	function exportCsv(owned: Record<string, number>): string {
		const cell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
		const header = [
			'quantity',
			'card',
			'set',
			'set_identifier',
			'collector_number',
			'treatment',
			'locale',
			'rarity',
			'printing_id'
		];
		const body = printings
			.filter((row) => (owned[row.printing.id] ?? 0) > 0)
			.map((row) => {
				const set = setOf(row.printing.setId);
				return [
					owned[row.printing.id],
					row.card.name,
					set.name,
					set.printed,
					row.printing.collectorNumber,
					printTreatment(row.printing),
					row.printing.locale,
					row.printing.rarity,
					row.printing.id
				]
					.map(cell)
					.join(',');
			});
		return `\uFEFF${[header.map(cell).join(','), ...body].join('\r\n')}\r\n`;
	}

	// One of everything: every Set, both locales, beta and retail, lettered variants, and a
	// card name with a comma or a quote in it — spread across quantities.
	const owned = Object.fromEntries(
		printings.map((row, index) => [row.printing.id, (index % 4) + 1])
	);

	it('hands every printing back with the quantity it was exported with', () => {
		const { entries, unresolved, warnings } = resolve(exportCsv(owned));
		expect(unresolved).toEqual([]);
		expect(warnings).toEqual([]);
		expect(Object.fromEntries(entries.map((entry) => [entry.printingId, entry.quantity]))).toEqual(
			owned
		);
	});

	it('still resolves every printing when the id column is deleted', () => {
		const text = exportCsv(owned);
		const parsed = table(text);
		const drop = parsed.header.indexOf('printing_id');
		const withoutId: Table = {
			...parsed,
			header: parsed.header.filter((_, index) => index !== drop),
			rows: parsed.rows.map((row) => ({
				...row,
				cells: row.cells.filter((_, index) => index !== drop)
			}))
		};
		const result = resolveRows(withoutId);
		if ('error' in result) throw new Error(result.error);
		expect(result.unresolved).toEqual([]);
		expect(
			Object.fromEntries(result.entries.map((entry) => [entry.printingId, entry.quantity]))
		).toEqual(owned);
	});

	it('is a no-op when imported back over the Collection it came from', () => {
		const { entries } = resolve(exportCsv(owned));
		expect(planImport(entries, owned).changes).toEqual([]);
	});
});
