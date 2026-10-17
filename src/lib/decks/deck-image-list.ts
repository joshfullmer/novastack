/**
 * The List layout: the deck as a decklist. A big title and the Legends on the left, a two-column
 * list on the right — one row per distinct card, with a cost chip in the card's color, its name
 * over a dim crop of its own art, and the copy count. The image to post when you want people to
 * read the list, not admire the cards. 1600×1000, growing taller only if the rows can't fit at
 * `MIN_ROW`.
 */
import { splitCardName } from '#lib/cards/derive.js';
import type { DeckEntry } from './legality.js';
import { costCurve, eddiableStat } from './stats.js';
import {
	ASPECT,
	DISPLAY,
	FOOTER_TOP,
	HEIGHT,
	PAD,
	WIDTH,
	artOf,
	colorOf,
	copiesOf,
	drawCardTile,
	drawCurve,
	drawFooter,
	drawPips,
	drawSectionLabel,
	fitSize,
	fitText,
	makeCanvas,
	paintBase,
	text,
	themeColor,
	type DeckImageOptions
} from './deck-image-canvas.js';

const LEFT_WIDTH = 640;
const LIST_LEFT = PAD + LEFT_WIDTH + 56;
const LIST_WIDTH = WIDTH - PAD - LIST_LEFT;
const COLUMN_GAP = 16;
const ROW_GAP = 6;
const SECTION_GAP = 22;
const LABEL = 46;
const MAX_ROW = 46;
const MIN_ROW = 32;
const LEGEND_GAP = 18;
/** A fixed three-up width, so a deck with fewer Legends doesn't get giant tiles. */
const LEGEND_WIDTH = (LEFT_WIDTH - LEGEND_GAP * 2) / 3;

export async function composeList(options: DeckImageOptions) {
	const { deckName, ownerName, legends, mainGroups, sideboard, shareUrl, showStats } = options;
	const sections: { label: string; entries: readonly DeckEntry[] }[] = mainGroups
		.filter((group) => group.entries.length > 0)
		.map((group) => ({ label: group.label, entries: group.entries }));
	const mainEntries = sections.flatMap((section) => section.entries);
	const totalCards = copiesOf(mainEntries);
	if (sideboard.length > 0) sections.push({ label: 'Sideboard', entries: sideboard });

	function listHeight(row: number) {
		const heights = sections.map(
			(section) => LABEL + Math.ceil(section.entries.length / 2) * (row + ROW_GAP) - ROW_GAP
		);
		return heights.reduce((sum, h) => sum + h, 0) + Math.max(0, sections.length - 1) * SECTION_GAP;
	}
	const { size: rowHeight, overflow } = fitSize(MAX_ROW, MIN_ROW, FOOTER_TOP - PAD, listHeight);
	const height = HEIGHT + overflow;

	const surface = makeCanvas(WIDTH, height);
	if (!surface) return null;
	const { canvas, ctx } = surface;
	paintBase(ctx, WIDTH, height, legends);

	// Left: title, Legends, and (if on) stats.
	ctx.font = `700 150px ${DISPLAY}`;
	const titleSize = Math.min(
		150,
		(150 * LEFT_WIDTH) / Math.max(1, ctx.measureText(deckName).width)
	);
	text(ctx, deckName, PAD, PAD + titleSize * 0.8, {
		font: `700 ${titleSize}px ${DISPLAY}`,
		color: themeColor('bright'),
		spacing: '1px'
	});
	const metaY = PAD + titleSize * 0.8 + 38;
	const pipsWidth = drawPips(ctx, PAD + 2, metaY - 18, legends, 18);
	text(ctx, `by ${ownerName}  ·  ${totalCards} cards`, PAD + pipsWidth + 18, metaY, {
		font: `600 24px ${DISPLAY}`,
		color: themeColor('muted'),
		spacing: '0.5px'
	});

	const legendTop = metaY + 40;
	const legendHeight = LEGEND_WIDTH * ASPECT;
	const legendImages = await Promise.all(legends.map((l) => artOf(l.card, l.printingId)));
	for (const [index, legend] of legends.entries()) {
		const x = PAD + index * (LEGEND_WIDTH + LEGEND_GAP);
		drawCardTile(ctx, legendImages[index], legend.card, x, legendTop, LEGEND_WIDTH, 1);

		const { name, subtitle } = splitCardName(legend.card);
		const center = x + LEGEND_WIDTH / 2;
		const nameFont = `700 24px ${DISPLAY}`;
		ctx.font = nameFont;
		text(ctx, fitText(ctx, name, LEGEND_WIDTH), center, legendTop + legendHeight + 32, {
			font: nameFont,
			color: themeColor('bright'),
			align: 'center'
		});
		if (subtitle) {
			const subtitleFont = `600 17px ${DISPLAY}`;
			ctx.font = subtitleFont;
			text(ctx, fitText(ctx, subtitle, LEGEND_WIDTH), center, legendTop + legendHeight + 54, {
				font: subtitleFont,
				color: themeColor('muted'),
				align: 'center'
			});
		}
	}

	if (showStats) {
		const statsTop = legendTop + legendHeight + 90;
		const eddiable = eddiableStat(mainEntries);
		const percent = Math.round(
			eddiable.totalQuantity === 0 ? 0 : (eddiable.eddiableQuantity / eddiable.totalQuantity) * 100
		);
		const typeLine = mainGroups
			.filter((group) => group.entries.length > 0)
			.map((group) => `${group.quantity} ${group.label}`)
			.join('  ·  ');
		text(ctx, typeLine, PAD, statsTop, {
			font: `600 32px ${DISPLAY}`,
			color: themeColor('body')
		});
		text(ctx, `${percent}% EDDIABLE`, PAD + LEFT_WIDTH, statsTop, {
			font: `600 20px ${DISPLAY}`,
			color: themeColor('neon'),
			align: 'right',
			spacing: '1.5px'
		});
		// The curve takes whatever height is left above the footer, and is skipped if that's too little.
		const room = FOOTER_TOP - (statsTop + 20) - 20;
		if (room > 90) {
			drawCurve(ctx, costCurve(mainEntries), PAD, statsTop + 20, LEFT_WIDTH, Math.min(130, room));
		}
	}

	// Right: the list, two rows-major columns per section.
	const columnWidth = (LIST_WIDTH - COLUMN_GAP) / 2;
	let y = PAD;
	for (const section of sections) {
		drawSectionLabel(ctx, section.label, copiesOf(section.entries), LIST_LEFT, y, LIST_WIDTH);
		y += LABEL;
		const images = await Promise.all(section.entries.map((e) => artOf(e.card, e.printingId)));
		for (const [index, entry] of section.entries.entries()) {
			const x = LIST_LEFT + (index % 2) * (columnWidth + COLUMN_GAP);
			const rowY = y + Math.floor(index / 2) * (rowHeight + ROW_GAP);
			drawRow(ctx, images[index], entry, x, rowY, columnWidth, rowHeight);
		}
		y += Math.ceil(section.entries.length / 2) * (rowHeight + ROW_GAP) - ROW_GAP + SECTION_GAP;
	}

	await drawFooter(ctx, WIDTH, height, shareUrl);
	return canvas;
}

function drawRow(
	ctx: CanvasRenderingContext2D,
	img: HTMLImageElement,
	entry: DeckEntry,
	x: number,
	y: number,
	w: number,
	h: number
) {
	// A dim crop of the card's own art, darkened toward the name so the text always reads.
	ctx.save();
	ctx.beginPath();
	ctx.rect(x, y, w, h);
	ctx.clip();
	ctx.fillStyle = themeColor('shell');
	ctx.fillRect(x, y, w, h);
	ctx.globalAlpha = 0.6;
	ctx.drawImage(
		img,
		0,
		img.naturalHeight * 0.14,
		img.naturalWidth,
		(img.naturalWidth * h) / w,
		x,
		y,
		w,
		h
	);
	ctx.globalAlpha = 1;
	const shade = ctx.createLinearGradient(x, 0, x + w, 0);
	shade.addColorStop(0, 'rgba(10,10,14,0.92)');
	shade.addColorStop(0.7, 'rgba(10,10,14,0.55)');
	shade.addColorStop(1, 'rgba(10,10,14,0.3)');
	ctx.fillStyle = shade;
	ctx.fillRect(x, y, w, h);
	ctx.restore();

	// The cost chip, in the card's own color. Red is the one color too dark for `void` text.
	ctx.fillStyle = colorOf(entry.card.color);
	ctx.fillRect(x, y, h, h);
	const { cost } = entry.card;
	text(ctx, cost === null ? '–' : String(cost), x + h / 2, y + h / 2 + 1, {
		font: `700 ${Math.round(h * 0.6)}px ${DISPLAY}`,
		color: entry.card.color === 'Red' ? themeColor('bright') : themeColor('void'),
		align: 'center',
		baseline: 'middle'
	});

	const quantityText = `${entry.quantity}×`;
	const quantityFont = `700 ${Math.round(h * 0.56)}px ${DISPLAY}`;
	ctx.font = quantityFont;
	const quantityWidth = ctx.measureText(quantityText).width;
	text(ctx, quantityText, x + w - 12, y + h / 2 + 1, {
		font: quantityFont,
		color: entry.quantity > 1 ? themeColor('bright') : themeColor('muted'),
		align: 'right',
		baseline: 'middle'
	});

	const nameFont = `600 ${Math.round(h * 0.46)}px ${DISPLAY}`;
	ctx.font = nameFont;
	const name = fitText(ctx, entry.card.name, w - h - 12 - quantityWidth - 28);
	text(ctx, name, x + h + 12, y + h / 2 + 1, {
		font: nameFont,
		color: themeColor('bright'),
		baseline: 'middle'
	});
}
