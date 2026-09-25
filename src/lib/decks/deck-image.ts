/**
 * Client-side canvas deck-image export (`docs/spec/deckbuilder.md` §6) — composited entirely in
 * the browser from the deck's already-mirrored, same-origin static card art. No new backend
 * surface: server-rendered images at a stable URL were considered and rejected in the spec (a
 * `satori` + `resvg-wasm` rendering pipeline for a capability client-side canvas already covers).
 *
 * Composition: a header (deck name + owner, novastack wordmark), a Legends strip, the Main Deck
 * as a thumbnail grid with quantity badges, a labelled Sideboard strip when the deck has one, and
 * a stacked QR code + URL watermark, over a
 * gradient background tinted from the deck's own Legend colors. The QR code is rendered
 * dark-on-light regardless of the site's own dark theme — scannability, not palette match, is
 * what matters for a code meant to be pointed a phone camera at.
 */
import QRCode from 'qrcode';
import { cardImageUrl } from '#lib/cards/schema.js';
import type { Card } from '#lib/cards/schema.js';
import type { Color } from '#lib/cards/vocabulary.js';
import type { DeckEntryGroup } from './grouping.js';
import type { DeckEntry } from './legality.js';

const CANVAS_WIDTH = 1200;
const PADDING = 32;
const GAP = 16;
/** Full-width columns, used when the deck has no sideboard and so no rail. */
const GRID_COLUMNS = 8;
/**
 * With a sideboard, the layout splits: the main deck keeps 6 columns on the left and the 7 run
 * down a 2-column rail on the right, behind a vertical rule.
 *
 * Both grids share one cell size (see `composeDeckImage`), which is what makes 6 + 2 add back up
 * to the 8 columns the full-width case uses — cards come out the same size either way (126px vs
 * 128px), so a deck's cards don't visibly shrink just because it gained a sideboard. What changes
 * is the main deck's row count, which is the cheap axis: a 40–50 card deck is 15–20 *distinct*
 * entries, so 6 columns is 3–4 rows.
 */
const MAIN_COLUMNS_WITH_RAIL = 6;
const RAIL_COLUMNS = 2;
/** Space between the main column and the rail; the rule is drawn down the middle of it. */
const RAIL_GUTTER = 32;
/** Every mirrored card image is this exact ratio — see `#lib/cards/vocabulary.js`. */
const CARD_ASPECT = 1024 / 733;
const LEGEND_WIDTH = 140;
const QR_SIZE = 84;
const RAIL_LABEL_HEIGHT = 24;

const COLOR_VAR: Record<Color, string> = {
	Red: 'card-red',
	Yellow: 'card-yellow',
	Green: 'card-green',
	Blue: 'card-blue'
};

/** Reads the live theme's own CSS custom properties, so the export matches the site's palette
 * without duplicating its color values here. */
function themeColor(name: string): string {
	return getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim();
}

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error(`Failed to load ${src}`));
		img.src = src;
	});
}

function roundedRectPath(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number
) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

/** Canvas has no `border-radius` primitive — this is the usual arc-based substitute. */
function roundedRectClip(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number
) {
	roundedRectPath(ctx, x, y, w, h, r);
	ctx.clip();
}

/**
 * A square, opposite corners (top-right, bottom-left) chamfered — the printed card's own
 * Eddiable badge shape (`eddie-badge` in `layout.css`), reused here for the quantity badge so
 * the deck image matches the website's chip rather than reading as a generic rounded square.
 */
function chamferedSquarePath(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	size: number,
	chop: number
) {
	ctx.beginPath();
	ctx.moveTo(x, y);
	ctx.lineTo(x + size - chop, y);
	ctx.lineTo(x + size, y + chop);
	ctx.lineTo(x + size, y + size);
	ctx.lineTo(x + chop, y + size);
	ctx.lineTo(x, y + size - chop);
	ctx.closePath();
}

/** The novastack mark (`#lib/components/Mark.svelte`) redrawn with canvas paths — a 3×3 grid of
 * rounded outlined squares rotated 45°, at `size`'s bounding box, centered on `(cx, cy)`. */
function drawMark(
	ctx: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	size: number,
	color: string
) {
	const scale = size / 32;
	ctx.save();
	ctx.translate(cx, cy);
	ctx.rotate(Math.PI / 4);
	ctx.strokeStyle = color;
	ctx.lineWidth = 1.3 * scale;
	ctx.lineJoin = 'round';
	const cell = 5.77 * scale;
	const positions = [-10.85, -2.88, 5.08].map((v) => v * scale);
	for (const px of positions) {
		for (const py of positions) {
			roundedRectPath(ctx, px, py, cell, cell, 0.4 * scale);
			ctx.stroke();
		}
	}
	ctx.restore();
}

/** Sandwiches the odd-colored-out Legend between the repeated color when 2 of 3 Legends share a
 * Color, so the gradient reads as "two of a color bracketing the third" rather than a random
 * left-to-right order. Falls through unchanged for any other split (including <3 Legends). */
function gradientColorOrder(legends: readonly Card[]): Color[] {
	const colors = legends.map((legend) => legend.color);
	if (colors.length === 3) {
		const counts = new Map<Color, number>();
		for (const color of colors) counts.set(color, (counts.get(color) ?? 0) + 1);
		const duplicate = [...counts.entries()].find(([, count]) => count === 2)?.[0];
		if (duplicate !== undefined) {
			const odd = colors.find((color) => color !== duplicate);
			if (odd !== undefined) return [duplicate, odd, duplicate];
		}
	}
	return colors;
}

function paintBackground(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	legends: readonly Card[]
) {
	const colorOrder = gradientColorOrder(legends);
	if (colorOrder.length === 0) {
		ctx.fillStyle = themeColor('void');
		ctx.fillRect(0, 0, width, height);
		return;
	}

	const stops = colorOrder.length === 1 ? [colorOrder[0], colorOrder[0]] : colorOrder;
	// Askew rather than a straight left-to-right or top-to-bottom sweep.
	const gradient = ctx.createLinearGradient(0, height * 0.1, width, height * 0.9);
	stops.forEach((color, index) => {
		gradient.addColorStop(index / (stops.length - 1), themeColor(COLOR_VAR[color]));
	});
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, width, height);

	// A dark scrim over the gradient keeps card art and light text legible against colors that
	// otherwise run too bright/saturated to sit behind them.
	ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
	ctx.fillRect(0, 0, width, height);
}

function drawWordmark(ctx: CanvasRenderingContext2D, rightEdge: number, centerY: number) {
	const markSize = 22;
	const gap = 8;
	ctx.font = 'bold 20px sans-serif';
	ctx.textBaseline = 'middle';
	ctx.textAlign = 'left';
	const novaWidth = ctx.measureText('nova').width;
	const stackWidth = ctx.measureText('stack').width;
	const totalWidth = markSize + gap + novaWidth + stackWidth;
	const startX = rightEdge - totalWidth;

	drawMark(ctx, startX + markSize / 2, centerY, markSize, themeColor('neon'));
	ctx.fillStyle = themeColor('bright');
	ctx.fillText('nova', startX + markSize + gap, centerY);
	ctx.fillStyle = themeColor('neon');
	ctx.fillText('stack', startX + markSize + gap + novaWidth, centerY);

	ctx.textBaseline = 'alphabetic';
	ctx.textAlign = 'left';
}

type GridLayout = {
	originX: number;
	originY: number;
	columns: number;
	cellWidth: number;
	cellHeight: number;
};

/** Rows a grid of `count` cells occupies — the one place the wrap arithmetic lives, so the
 * height reserved for a grid and the height it actually draws into can't disagree. */
function gridHeightOf(count: number, layout: { columns: number; cellHeight: number }): number {
	const rows = Math.ceil(count / layout.columns);
	return rows > 0 ? rows * layout.cellHeight + (rows - 1) * GAP : 0;
}

/**
 * One row-major grid of card thumbnails with quantity badges — the main deck and the sideboard
 * rail are the same drawing at different origins and column counts, so they share this rather
 * than each keeping their own copy of the badge geometry.
 */
async function drawEntryGrid(
	ctx: CanvasRenderingContext2D,
	entries: readonly DeckEntry[],
	layout: GridLayout
) {
	const { originX, originY, columns, cellWidth, cellHeight } = layout;
	const images = await Promise.all(
		entries.map((entry) => loadImage(cardImageUrl(entry.card.printings[0].id, 244)))
	);

	for (const [index, entry] of entries.entries()) {
		const col = index % columns;
		const row = Math.floor(index / columns);
		const x = originX + col * (cellWidth + GAP);
		const cardY = originY + row * (cellHeight + GAP);

		ctx.save();
		roundedRectClip(ctx, x, cardY, cellWidth, cellHeight, 6);
		ctx.drawImage(images[index], x, cardY, cellWidth, cellHeight);
		ctx.restore();

		if (entry.quantity > 1) {
			// Bottom-center, chamfered like the printed card's own Eddiable badge — matches the
			// website's quantity badge (see `eddie-badge` in layout.css). Bottom-right was tried
			// first and rejected: it sat right on top of a Unit's printed Power number.
			const badgeSize = 28;
			const badgeX = x + (cellWidth - badgeSize) / 2;
			const badgeY = cardY + cellHeight - badgeSize - 4;
			// A hollow `bright` outline over void, not a solid fill — matches the website's badge
			// (see the comment on its own markup, `decks/[id]/+page.svelte`). Plain white reads
			// clearly against any of the four card colours without picking a side among them,
			// which a tinted fill (tried first: `neon`, then a dedicated pink `flare`) kept doing.
			chamferedSquarePath(ctx, badgeX, badgeY, badgeSize, 10);
			ctx.fillStyle = themeColor('bright');
			ctx.fill();
			const ring = 3;
			chamferedSquarePath(ctx, badgeX + ring, badgeY + ring, badgeSize - ring * 2, 7);
			ctx.fillStyle = themeColor('void');
			ctx.fill();
			ctx.fillStyle = themeColor('bright');
			ctx.font = 'bold 15px sans-serif';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(`×${entry.quantity}`, badgeX + badgeSize / 2, badgeY + badgeSize / 2 + 1);
			ctx.textAlign = 'left';
			ctx.textBaseline = 'alphabetic';
		}
	}
}

export async function composeDeckImage(options: {
	deckName: string;
	ownerName: string;
	legends: readonly Card[];
	mainGroups: readonly DeckEntryGroup[];
	sideboard: readonly DeckEntry[];
	shareUrl: string;
}): Promise<Blob | null> {
	const { deckName, ownerName, legends, mainGroups, sideboard, shareUrl } = options;
	const entries = mainGroups.flatMap((group) => group.entries);
	const totalCards = entries.reduce((sum, entry) => sum + entry.quantity, 0);
	const sideboardCards = sideboard.reduce((sum, entry) => sum + entry.quantity, 0);

	const legendHeight = LEGEND_WIDTH * CARD_ASPECT;
	const legendStripHeight = legends.length > 0 ? legendHeight + GAP : 0;

	/**
	 * Two layouts, one geometry. With a sideboard the body splits into a main column and a rail;
	 * without one the main column takes the full width and nothing else changes — a sideboard-less
	 * deck exports exactly the image it always did.
	 */
	const hasRail = sideboard.length > 0;
	const innerWidth = CANVAS_WIDTH - PADDING * 2;
	const mainColumns = hasRail ? MAIN_COLUMNS_WITH_RAIL : GRID_COLUMNS;
	// Solved so the main columns and the rail columns share one cell width: for the rail case,
	// `innerWidth = 8·cell + 6·GAP + RAIL_GUTTER`.
	const cellWidth = hasRail
		? (innerWidth - GAP * (mainColumns - 1 + RAIL_COLUMNS - 1) - RAIL_GUTTER) /
			(mainColumns + RAIL_COLUMNS)
		: (innerWidth - GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
	const cellHeight = cellWidth * CARD_ASPECT;

	const mainWidth = mainColumns * cellWidth + (mainColumns - 1) * GAP;
	const railX = PADDING + mainWidth + RAIL_GUTTER;
	const ruleX = PADDING + mainWidth + RAIL_GUTTER / 2;

	const gridHeight = gridHeightOf(entries.length, { columns: mainColumns, cellHeight });
	const railGridHeight = gridHeightOf(sideboard.length, { columns: RAIL_COLUMNS, cellHeight });

	const headerHeight = 64;
	const watermarkHeight = QR_SIZE + 8 + 20;
	/**
	 * The band wraps the rail's own content and stops — `GAP` of padding above the label and below
	 * the last card row, rather than bleeding to the bottom edge. It marks the sideboard, so it
	 * ends where the sideboard does; running it to the bottom made it read as a page region that
	 * happened to contain the 7, and left a long empty tail under a two-row rail.
	 */
	const railBandHeight = hasRail ? GAP + RAIL_LABEL_HEIGHT + railGridHeight + GAP : 0;
	const mainColumnHeight = legendStripHeight + gridHeight;
	// The watermark sits below both columns, so whichever is taller sets the height.
	const railColumnHeight = hasRail ? RAIL_LABEL_HEIGHT + railGridHeight + GAP : 0;
	const bodyHeight = Math.max(mainColumnHeight, railColumnHeight) + GAP + watermarkHeight;
	const canvasHeight = PADDING * 2 + headerHeight + GAP + bodyHeight;

	const canvas = document.createElement('canvas');
	canvas.width = CANVAS_WIDTH;
	canvas.height = canvasHeight;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;

	paintBackground(ctx, canvas.width, canvas.height, legends);

	let y = PADDING;

	ctx.fillStyle = themeColor('bright');
	ctx.font = 'bold 28px sans-serif';
	ctx.fillText(deckName, PADDING, y + 26);
	ctx.fillStyle = themeColor('muted');
	ctx.font = '16px sans-serif';
	const subtitle =
		sideboardCards > 0
			? `by ${ownerName} · ${totalCards} cards · ${sideboardCards} sideboard`
			: `by ${ownerName} · ${totalCards} cards`;
	ctx.fillText(subtitle, PADDING, y + 50);
	drawWordmark(ctx, CANVAS_WIDTH - PADDING, y + headerHeight / 2);
	y += headerHeight + GAP;
	/** Where both columns start — the rail is positioned absolutely from here, not from `y`,
	 * since it doesn't follow the main column's flow. */
	const bodyTop = y;

	if (legends.length > 0) {
		const legendImages = await Promise.all(
			legends.map((legend) => loadImage(cardImageUrl(legend.printings[0].id, 244)))
		);
		for (const [index, img] of legendImages.entries()) {
			const x = PADDING + index * (LEGEND_WIDTH + GAP);
			ctx.save();
			roundedRectClip(ctx, x, y, LEGEND_WIDTH, legendHeight, 8);
			ctx.drawImage(img, x, y, LEGEND_WIDTH, legendHeight);
			ctx.restore();
		}
		y += legendStripHeight;
	}

	await drawEntryGrid(ctx, entries, {
		originX: PADDING,
		originY: y,
		columns: mainColumns,
		cellWidth,
		cellHeight
	});

	if (hasRail) {
		/**
		 * A darkened band around the rail's content, bled to the right edge, with a rule down its
		 * left side. Height comes from `railBandHeight` — it ends with the cards, not with the
		 * page.
		 *
		 * A 1px rule alone was tried first and was almost invisible: the background is a gradient
		 * tinted from the Legends' own colors, so a single `edge`-colored line has nothing
		 * reliable to contrast against. The band doesn't depend on the backdrop at all — it
		 * darkens whatever is behind it — which is the same reasoning behind the tinted panel the
		 * deck view uses for its own sideboard, so the two read as the same idea.
		 */
		const bandTop = bodyTop - GAP;
		ctx.save();
		ctx.globalAlpha = 0.35;
		ctx.fillStyle = themeColor('void');
		ctx.fillRect(ruleX, bandTop, CANVAS_WIDTH - ruleX, railBandHeight);
		ctx.restore();

		ctx.strokeStyle = themeColor('edge');
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(ruleX + 1, bandTop);
		ctx.lineTo(ruleX + 1, bandTop + railBandHeight);
		ctx.stroke();

		ctx.fillStyle = themeColor('muted');
		ctx.font = 'bold 13px sans-serif';
		ctx.fillText('SIDEBOARD', railX, bodyTop + 13);
		ctx.fillStyle = themeColor('neon');
		ctx.fillText(
			String(sideboardCards),
			railX + ctx.measureText('SIDEBOARD').width + 8,
			bodyTop + 13
		);

		await drawEntryGrid(ctx, sideboard, {
			originX: railX,
			originY: bodyTop + RAIL_LABEL_HEIGHT,
			columns: RAIL_COLUMNS,
			cellWidth,
			cellHeight
		});
	}

	// Bottom-right in both layouts, which is inside the rail's own column when there is one.
	// Derived from the bottom edge rather than from `y`, since with a rail the tallest column
	// isn't necessarily the one `y` has been tracking.
	y = canvasHeight - PADDING - watermarkHeight;

	const qrCanvas = document.createElement('canvas');
	await QRCode.toCanvas(qrCanvas, shareUrl, {
		width: QR_SIZE,
		margin: 1,
		color: { dark: '#000000', light: '#ffffff' }
	});
	const qrX = CANVAS_WIDTH - PADDING - QR_SIZE;
	ctx.drawImage(qrCanvas, qrX, y, QR_SIZE, QR_SIZE);

	ctx.fillStyle = themeColor('muted');
	ctx.font = '13px sans-serif';
	ctx.textAlign = 'right';
	ctx.fillText(shareUrl, CANVAS_WIDTH - PADDING, y + QR_SIZE + 18);
	ctx.textAlign = 'left';

	return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}
