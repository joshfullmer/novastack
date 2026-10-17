/**
 * The Spread layout: the deck as art. A title block, a full-height Legends column, then Units /
 * Gear / Programs as labelled columns that share one cell size, with the sideboard dropped under
 * whichever column leaves it the most room. The image to post when you want people to see the
 * cards. 1600×1000, growing taller only when the cards can't fit at a legible size.
 *
 * Cell size is solved rather than fixed: it is the largest the columns can have while every
 * group still fits the height, so a 15-entry deck gets big cards and a 25-entry one gets smaller
 * ones instead of overflowing.
 */
import type { DeckEntry } from './legality.js';
import { costCurve, eddiableStat } from './stats.js';
import {
	ASPECT,
	FOOTER_TOP,
	HEIGHT,
	PAD,
	WIDTH,
	artOf,
	copiesOf,
	drawCardTile,
	drawCurve,
	drawFooter,
	drawPips,
	drawSectionLabel,
	fontOf,
	fitSize,
	makeCanvas,
	paintBase,
	text,
	themeColor,
	type DeckImageOptions
} from './deck-image-canvas.js';

const GAP = 12;
const GROUP_GAP = 44;
const LABEL = 46;
const MAX_CELL = 190;
const MIN_CELL = 84;
const SIDEBOARD_SCALE = 0.64;
const SIDEBOARD_GAP = 10;
/** Space above the sideboard's own label, and that label's height. */
const SIDEBOARD_LEAD = 30;
const SIDEBOARD_LABEL = 38;

type Column = { label: string; quantity: number; entries: readonly DeckEntry[] };

/**
 * Spreads `columns` over the groups — one each, then every spare to whichever group is currently
 * tallest and would actually get shorter. `null` when there aren't enough for one each.
 */
function allocateColumns(counts: readonly number[], columns: number): number[] | null {
	const allocation = counts.map(() => 1);
	let spare = columns - counts.length;
	if (spare < 0) return null;
	while (spare > 0) {
		let best = -1;
		let bestRows = 0;
		for (const [index, k] of allocation.entries()) {
			const rows = Math.ceil(counts[index] / k);
			if (rows > bestRows && Math.ceil(counts[index] / (k + 1)) < rows) {
				best = index;
				bestRows = rows;
			}
		}
		if (best < 0) break;
		allocation[best]++;
		spare--;
	}
	return allocation;
}

export async function composeSpread(options: DeckImageOptions) {
	const { deckName, ownerName, legends, mainGroups, shareUrl, showStats } = options;
	const mainEntries = mainGroups.flatMap((group) => group.entries);
	const totalCards = copiesOf(mainEntries);
	const sideboardCards = copiesOf(options.sideboard);

	// A deck with no main cards shows its sideboard as the one column rather than dropping it.
	const filled = mainGroups.filter((group) => group.entries.length > 0);
	const sideboardIsColumn = filled.length === 0 && options.sideboard.length > 0;
	const groups: readonly Column[] = sideboardIsColumn
		? [{ label: 'Sideboard', quantity: sideboardCards, entries: options.sideboard }]
		: filled;
	const sideboard = sideboardIsColumn ? [] : options.sideboard;

	const bodyTop = PAD + 132 + 24;
	const avail = FOOTER_TOP - bodyTop;

	// The Legends column's width comes from the vertical room its tiles have to share.
	const legendWidth =
		legends.length === 0
			? 0
			: Math.min(190, (avail - LABEL - (legends.length - 1) * GAP) / (legends.length * ASPECT));
	const typesLeft = PAD + (legends.length === 0 ? 0 : legendWidth + GROUP_GAP);
	const typesWidth = WIDTH - PAD - typesLeft;

	function layout(cell: number) {
		const counts = groups.map((group) => group.entries.length);
		const columns = Math.floor(
			(typesWidth + groups.length * GAP - (groups.length - 1) * GROUP_GAP) / (cell + GAP)
		);
		const columnsPerGroup = allocateColumns(counts, columns);
		if (!columnsPerGroup) return null;

		const heights = groups.map((_, index) => {
			const rows = Math.ceil(counts[index] / columnsPerGroup[index]);
			return LABEL + rows * cell * ASPECT + (rows - 1) * GAP;
		});
		if (sideboard.length === 0) {
			return { height: Math.max(0, ...heights), columnsPerGroup, sideUnder: -1, sideCell: 0 };
		}

		const sideCell = cell * SIDEBOARD_SCALE;
		let sideUnder = 0;
		let bestHeight = Infinity;
		for (const [index] of groups.entries()) {
			const perRow = sideboardPerRow(columnsPerGroup[index] * (cell + GAP) - GAP, sideCell);
			const rows = Math.ceil(sideboard.length / perRow);
			const extra =
				SIDEBOARD_LEAD + SIDEBOARD_LABEL + rows * sideCell * ASPECT + (rows - 1) * SIDEBOARD_GAP;
			const height = Math.max(...heights.map((h, i) => (i === index ? h + extra : h)));
			if (height < bestHeight) {
				bestHeight = height;
				sideUnder = index;
			}
		}
		return { height: bestHeight, columnsPerGroup, sideUnder, sideCell };
	}

	const { size: cell, overflow } = fitSize(
		MAX_CELL,
		MIN_CELL,
		avail,
		(size) => layout(size)?.height ?? Infinity
	);
	const solved = layout(cell);
	if (!solved) return null;
	const { columnsPerGroup, sideUnder, sideCell } = solved;
	const height = HEIGHT + overflow;

	const surface = makeCanvas(WIDTH, height);
	if (!surface) return null;
	const { canvas, ctx } = surface;
	paintBase(ctx, WIDTH, height, legends);

	// Header: the title block on the left, stats (if on) on the right.
	let titleRight = WIDTH - PAD;
	if (showStats) {
		const curve = costCurve(mainEntries);
		const eddiable = eddiableStat(mainEntries);
		const percent = Math.round(
			eddiable.totalQuantity === 0 ? 0 : (eddiable.eddiableQuantity / eddiable.totalQuantity) * 100
		);
		const curveWidth = Math.min(260, curve.length * 36);
		drawCurve(ctx, curve, WIDTH - PAD - curveWidth, PAD - 6, curveWidth, 116);

		const eddiableX = WIDTH - PAD - curveWidth - 56;
		text(ctx, `${percent}%`, eddiableX, PAD + 52, {
			font: fontOf(700, 60),
			color: themeColor('bright'),
			align: 'right'
		});
		text(ctx, `EDDIABLE · ${eddiable.eddiableQuantity} cards`, eddiableX, PAD + 80, {
			font: fontOf(600, 16),
			color: themeColor('muted'),
			align: 'right',
			spacing: '1.5px'
		});
		ctx.fillStyle = themeColor('edge');
		ctx.fillRect(eddiableX - 230, PAD, 1, 100);

		const typeLine = filled.map((group) => `${group.quantity} ${group.label}`).join('   ·   ');
		const typeRight = eddiableX - 262;
		text(ctx, typeLine, typeRight, PAD + 62, {
			font: fontOf(600, 34),
			color: themeColor('body'),
			align: 'right'
		});
		titleRight = typeRight - ctx.measureText(typeLine).width - 40;
	}

	ctx.font = fontOf(700, 92);
	const titleSize = Math.min(
		92,
		(92 * (titleRight - PAD)) / Math.max(1, ctx.measureText(deckName).width)
	);
	text(ctx, deckName, PAD, PAD + 70, {
		font: fontOf(700, titleSize),
		color: themeColor('bright'),
		spacing: '1px'
	});
	const pipsWidth = drawPips(ctx, PAD + 2, PAD + 98, legends, 18);
	const subtitle = [`by ${ownerName}`, `${totalCards} cards`, `${legends.length} Legends`];
	if (sideboardCards > 0) subtitle.push(`${sideboardCards} sideboard`);
	text(ctx, subtitle.join('  ·  '), PAD + pipsWidth + 18, PAD + 114, {
		font: fontOf(600, 22),
		color: themeColor('muted'),
		spacing: '0.5px'
	});

	// Legends column.
	if (legends.length > 0) {
		drawSectionLabel(ctx, 'Legends', legends.length, PAD, bodyTop, legendWidth);
		const images = await Promise.all(
			legends.map((legend) => artOf(legend.card, legend.printingId))
		);
		for (const [index, legend] of legends.entries()) {
			const y = bodyTop + LABEL + index * (legendWidth * ASPECT + GAP);
			drawCardTile(ctx, images[index], legend.card, PAD, y, legendWidth, 1);
		}
	}

	// Type columns; any slack width becomes extra gutter so the last column meets the right edge.
	const used = columnsPerGroup.reduce((sum, k) => sum + k * (cell + GAP) - GAP, 0);
	const gutter = groups.length > 1 ? (typesWidth - used) / (groups.length - 1) : 0;
	let x = typesLeft;
	for (const [index, group] of groups.entries()) {
		const k = columnsPerGroup[index];
		const columnWidth = k * (cell + GAP) - GAP;
		drawSectionLabel(ctx, group.label, group.quantity, x, bodyTop, columnWidth);

		const images = await Promise.all(group.entries.map((e) => artOf(e.card, e.printingId)));
		for (const [i, entry] of group.entries.entries()) {
			drawCardTile(
				ctx,
				images[i],
				entry.card,
				x + (i % k) * (cell + GAP),
				bodyTop + LABEL + Math.floor(i / k) * (cell * ASPECT + GAP),
				cell,
				entry.quantity
			);
		}

		if (index === sideUnder && sideboard.length > 0) {
			const rows = Math.ceil(group.entries.length / k);
			const top = bodyTop + LABEL + rows * cell * ASPECT + (rows - 1) * GAP + SIDEBOARD_LEAD;
			drawSectionLabel(ctx, 'Sideboard', sideboardCards, x, top, columnWidth, 24);

			const perRow = sideboardPerRow(columnWidth, sideCell);
			const sideImages = await Promise.all(sideboard.map((e) => artOf(e.card, e.printingId)));
			for (const [i, entry] of sideboard.entries()) {
				drawCardTile(
					ctx,
					sideImages[i],
					entry.card,
					x + (i % perRow) * (sideCell + SIDEBOARD_GAP),
					top + SIDEBOARD_LABEL + Math.floor(i / perRow) * (sideCell * ASPECT + SIDEBOARD_GAP),
					sideCell,
					entry.quantity
				);
			}
		}
		x += columnWidth + gutter;
	}

	await drawFooter(ctx, WIDTH, height, shareUrl);
	return canvas;
}

/** How many sideboard tiles fit across a column `columnWidth` wide. */
function sideboardPerRow(columnWidth: number, sideCell: number) {
	return Math.max(1, Math.floor((columnWidth + SIDEBOARD_GAP) / (sideCell + SIDEBOARD_GAP)));
}
