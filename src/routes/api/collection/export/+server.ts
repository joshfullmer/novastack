/**
 * CSV export of the whole Collection.
 *
 * A real endpoint rather than a client-side Blob, so the control can be an ordinary
 * `<a href download>` — it works without JavaScript, can be opened in a new tab, and the browser
 * names the file from `Content-Disposition` instead of us fabricating one.
 *
 * This exists mostly for trust. Asking someone to hand-enter hundreds of rows behind a sign-in
 * wall is a big ask, and "can I get my data out" should have an answer that isn't "email us".
 *
 * Columns are chosen so the file is re-importable *and* readable: the Printing id is the only
 * thing that identifies a row unambiguously (collector numbers repeat across Sets), but a human
 * opening this in a spreadsheet wants the card name and set, not a UUID.
 */
import { error } from '@sveltejs/kit';
import { dataset } from '#lib/cards/index.js';
import { printTreatment } from '#lib/cards/derive.js';
import { getCollection } from '#lib/server/db/collection.js';
import { collectorNumberSortKey } from '#lib/cards/derive.js';
import type { RequestHandler } from './$types';

export const prerender = false;

/** RFC 4180: quote everything, and double any embedded quote. Card names contain commas. */
function cell(value: string | number): string {
	return `"${String(value).replaceAll('"', '""')}"`;
}

export const GET: RequestHandler = async (event) => {
	if (!event.locals.user) return error(401, 'Not signed in');

	const owned = await getCollection(event.locals.db, event.locals.user.id);

	const rows = dataset.cards
		.flatMap((card) => card.printings.map((printing) => ({ card, printing })))
		.filter((row) => (owned[row.printing.id] ?? 0) > 0)
		// Set order then printed collector number — the order the shelf is in, so the file reads
		// like the checklist rather than like a database dump.
		.sort((a, b) => {
			const setDelta =
				dataset.sets.findIndex((set) => set.id === a.printing.setId) -
				dataset.sets.findIndex((set) => set.id === b.printing.setId);
			if (setDelta !== 0) return setDelta;
			const [aNumber, aText] = collectorNumberSortKey(a.printing.collectorNumber);
			const [bNumber, bText] = collectorNumberSortKey(b.printing.collectorNumber);
			return aNumber - bNumber || aText.localeCompare(bText);
		});

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

	const body = rows.map((row) => {
		const set = dataset.sets.find((entry) => entry.id === row.printing.setId);
		return [
			owned[row.printing.id],
			row.card.name,
			set?.name ?? row.printing.setId,
			set?.printed ?? row.printing.setId,
			row.printing.collectorNumber,
			printTreatment(row.printing),
			row.printing.locale,
			row.printing.rarity,
			row.printing.id
		]
			.map(cell)
			.join(',');
	});

	// CRLF and a UTF-8 BOM: Excel misreads a bare LF file as one column, and mangles accented
	// artist and card names without the BOM. Both are the difference between a file that opens
	// correctly by double-clicking and one that needs an import wizard.
	// `\uFEFF` as an escape rather than a literal BOM: an invisible character in source is the
	// kind of thing that survives one edit and vanishes in the next.
	const csv = `\uFEFF${[header.map(cell).join(','), ...body].join('\r\n')}\r\n`;
	const today = new Date().toISOString().slice(0, 10);

	return new Response(csv, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="novastack-collection-${today}.csv"`,
			'cache-control': 'private, no-store'
		}
	});
};
