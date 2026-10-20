/**
 * The human-readable "what changed" report shared by `pnpm ingest` and `pnpm ingest:check`.
 *
 * Compared on the *serialised* form, so a change anywhere in the model counts — a reworded rules
 * text, a new classification, a re-rendered art URL.
 */
import type { Card, Printing, Snapshot } from '../../src/lib/cards/schema.ts';
import type { Color } from '../../src/lib/cards/vocabulary.ts';
import { stableStringify } from './stable-json.ts';
import { styleText } from 'node:util';
import { paint } from './ui.ts';

/** Per group. A set release adds a hundred cards at once; the report is a summary, not a manifest. */
const MAX_SHOWN = 12;

type Entry = readonly [field: string, before: unknown, after: unknown];

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;
const same = (a: unknown, b: unknown) => stableStringify(a) === stableStringify(b);

function changedFields(before: object, after: object): Entry[] {
	const [old, next] = [before, after] as Record<string, unknown>[];
	const fields = new Set([...Object.keys(old), ...Object.keys(next)]);
	return [...fields]
		.filter((field) => !same(old[field], next[field]))
		.map((field) => [field, old[field], next[field]]);
}

const isScalar = (value: unknown) =>
	value === null || ['string', 'number', 'boolean'].includes(typeof value);

function shown(value: unknown): string {
	const text = value === null ? 'none' : String(value);
	return text.length > 32 ? `${text.slice(0, 31)}…` : text;
}

/** `cost 2 → 3` for a scalar; the bare field name for anything structured (rules text, keywords). */
function describeField([field, before, after]: Entry): string {
	return isScalar(before) && isScalar(after)
		? `${field} ${paint.dim(`${shown(before)} → ${shown(after)}`)}`
		: field;
}

/** Art is one change to a reader, however many fields it touches: the URL and the ThumbHash. */
function describePrintingChange(before: Printing, after: Printing): string[] {
	const entries = changedFields(before, after);
	const art = entries.some(([field]) => field === 'sourceImageUrl' || field === 'thumbhash');
	const rest = entries.filter(([field]) => field !== 'sourceImageUrl' && field !== 'thumbhash');
	return [...(art ? ['art updated'] : []), ...rest.map(describeField)];
}

/** Detail lines for one card that exists on both sides, or none if it is unchanged. */
function describeCard(before: Card, after: Card): string[] {
	const { printings: oldPrintings, ...oldFields } = before;
	const { printings: newPrintings, ...newFields } = after;
	const lines: string[] = [];

	const fields = changedFields(oldFields, newFields).map(describeField);
	if (fields.length > 0) lines.push(`${paint.change('~')} ${fields.join(', ')}`);

	const width = Math.max(
		...[...oldPrintings, ...newPrintings].map((printing) => printing.key.length)
	);
	const pad = (key: string) => key.padEnd(width);
	const oldByKey = new Map(oldPrintings.map((printing) => [printing.key, printing]));
	const newKeys = new Set(newPrintings.map((printing) => printing.key));

	for (const printing of newPrintings) {
		const old = oldByKey.get(printing.key);
		if (old === undefined) {
			lines.push(
				`${paint.add('+')} ${pad(printing.key)}  ${paint.dim(`${printing.rarity} · ${printing.artist}`)}`
			);
			continue;
		}
		const diffs = describePrintingChange(old, printing);
		if (diffs.length > 0)
			lines.push(`${paint.change('~')} ${pad(printing.key)}  ${diffs.join(', ')}`);
	}
	for (const printing of oldPrintings)
		if (!newKeys.has(printing.key))
			lines.push(`${paint.remove('-')} ${pad(printing.key)}  ${paint.dim(printing.rarity)}`);

	return lines;
}

/** `printings 742 → 744 (+2)`, or just `cards 421` when nothing moved. */
function stat(label: string, before: number, after: number): string {
	if (before === after) return paint.dim(`${label} ${after}`);
	const delta = after - before;
	const signed = `${delta > 0 ? '+' : ''}${delta}`;
	return `${label} ${before} → ${after} ${(delta > 0 ? paint.add : paint.remove)(`(${signed})`)}`;
}

function capped<T>(items: readonly T[], render: (item: T) => string[]): string[] {
	const lines = items.slice(0, MAX_SHOWN).flatMap(render);
	if (items.length > MAX_SHOWN) lines.push(paint.dim(`    … and ${items.length - MAX_SHOWN} more`));
	return lines;
}

const heading = (title: string, count: number) =>
	`  ${paint.bold(title)} ${paint.dim(`(${count})`)}`;

/** The report as lines, ready to print. Callers only ask once they know the snapshots differ. */
export function renderChanges(previous: Snapshot, next: Snapshot): string[] {
	const before = new Map(previous.cards.map((card) => [card.slug, card]));
	const after = new Set(next.cards.map((card) => card.slug));

	const added = next.cards.filter((card) => !before.has(card.slug));
	const removed = previous.cards.filter((card) => !after.has(card.slug));
	const updated = next.cards.flatMap((card) => {
		const old = before.get(card.slug);
		const details = old === undefined ? [] : describeCard(old, card);
		return details.length > 0 ? [{ card, details }] : [];
	});

	const sections: string[][] = [];
	const section = (title: string, count: number, body: string[]) => {
		if (count > 0) sections.push([heading(title, count), ...body]);
	};

	section(
		'New cards',
		added.length,
		capped(added, (card) => [
			`    ${paint.add('+')} ${card.name} ${paint.dim(plural(card.printings.length, 'printing'))}`
		])
	);
	section(
		'Updated cards',
		updated.length,
		capped(updated, ({ card, details }) => [
			`    ${paint.change('~')} ${card.name}`,
			...details.map((line) => `        ${line}`)
		])
	);
	section(
		'Removed cards',
		removed.length,
		capped(removed, (card) => [`    ${paint.remove('-')} ${card.name}`])
	);

	const setIds = (snapshot: Snapshot) => new Set(snapshot.sets.map((set) => set.id));
	const [oldSets, newSets] = [setIds(previous), setIds(next)];
	const otherwise = [
		...[...newSets].filter((id) => !oldSets.has(id)).map((id) => `${paint.add('+')} set ${id}`),
		...[...oldSets].filter((id) => !newSets.has(id)).map((id) => `${paint.remove('-')} set ${id}`),
		...(previous.generalFaqs.length !== next.generalFaqs.length
			? [`general FAQs ${previous.generalFaqs.length} → ${next.generalFaqs.length}`]
			: []),
		...(previous.ramPerLegend !== next.ramPerLegend
			? [`RAM per Legend ${previous.ramPerLegend} → ${next.ramPerLegend}`]
			: [])
	];
	section(
		'Other',
		otherwise.length,
		otherwise.map((line) => `    ${line}`)
	);

	// Nothing above covers colour/card-type ordering or the landing hero picks; say so rather than
	// print a header over an empty report.
	if (sections.length === 0)
		sections.push([`  ${paint.dim('derived data only (orderings, stats)')}`]);

	const totals = [
		stat('cards', previous.stats.cards, next.stats.cards),
		stat('printings', previous.stats.printings, next.stats.printings),
		stat('sets', previous.stats.sets, next.stats.sets)
	].join(paint.dim(' · '));

	return [
		`${paint.bold('Card data changed')} ${paint.dim(`since ${previous.generatedAt.slice(0, 10)}`)}`,
		`  ${totals}`,
		...sections.flatMap((lines) => ['', ...lines])
	];
}

const COLOR_STYLE = {
	Blue: 'blue',
	Green: 'green',
	Red: 'red',
	Yellow: 'yellow'
} as const satisfies Record<Color, Parameters<typeof styleText>[0]>;

/** A Color name in its own colour, so `Red` reads red. */
export const tintColor = (color: Color) => styleText(COLOR_STYLE[color], color);

/**
 * The deck's colour split as one proportional bar plus a legend — `████▓▓▓ Red 38 · Yellow 31 …`.
 * Boundaries are cumulative roundings, so the segments always sum to exactly `width` cells.
 */
export function renderComposition(
	cards: readonly Card[],
	order: readonly Color[],
	width = 16
): string {
	const counts = order.map((color) => cards.filter((card) => card.color === color).length);
	const total = counts.reduce((sum, count) => sum + count, 0);

	let seen = 0;
	let drawn = 0;
	const segments = order.map((color, index) => {
		seen += counts[index];
		const edge = Math.round((seen / total) * width);
		const cells = edge - drawn;
		drawn = edge;
		return styleText(COLOR_STYLE[color], '█'.repeat(cells));
	});

	const legend = order.map((color, index) => `${tintColor(color)} ${counts[index]}`);
	return `${segments.join('')}  ${legend.join(paint.dim(' · '))}`;
}
