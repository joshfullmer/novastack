/**
 * Client-side canvas deck-image export (`docs/spec/deckbuilder.md` §6) — composited entirely in
 * the browser from the deck's already-mirrored, same-origin static card art. No new backend
 * surface: server-rendered images at a stable URL were considered and rejected in the spec (a
 * `satori` + `resvg-wasm` rendering pipeline for a capability client-side canvas already covers).
 *
 * Composition: a header (deck name + owner, novastack wordmark), a Legends strip, the Main Deck
 * as a thumbnail grid with quantity badges, and a stacked QR code + URL watermark, over a
 * gradient background tinted from the deck's own Legend colors. The QR code is rendered
 * dark-on-light regardless of the site's own dark theme — scannability, not palette match, is
 * what matters for a code meant to be pointed a phone camera at.
 */
import QRCode from 'qrcode';
import { cardImageUrl } from '#lib/cards/schema.js';
import type { Card } from '#lib/cards/schema.js';
import type { Color } from '#lib/cards/vocabulary.js';
import type { DeckEntryGroup } from './grouping.js';

const CANVAS_WIDTH = 1200;
const PADDING = 32;
const GAP = 16;
const GRID_COLUMNS = 8;
/** Every mirrored card image is this exact ratio — see `#lib/cards/vocabulary.js`. */
const CARD_ASPECT = 1024 / 733;
const LEGEND_WIDTH = 140;
const QR_SIZE = 84;

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

export async function composeDeckImage(options: {
	deckName: string;
	ownerName: string;
	legends: readonly Card[];
	mainGroups: readonly DeckEntryGroup[];
	shareUrl: string;
}): Promise<Blob | null> {
	const { deckName, ownerName, legends, mainGroups, shareUrl } = options;
	const entries = mainGroups.flatMap((group) => group.entries);
	const totalCards = entries.reduce((sum, entry) => sum + entry.quantity, 0);

	const legendHeight = LEGEND_WIDTH * CARD_ASPECT;
	const legendStripHeight = legends.length > 0 ? legendHeight + GAP : 0;

	const cellWidth = (CANVAS_WIDTH - PADDING * 2 - GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
	const cellHeight = cellWidth * CARD_ASPECT;
	const rows = Math.ceil(entries.length / GRID_COLUMNS);
	const gridHeight = rows > 0 ? rows * cellHeight + (rows - 1) * GAP : 0;

	const headerHeight = 64;
	const watermarkHeight = QR_SIZE + 8 + 20;
	const canvasHeight =
		PADDING * 2 + headerHeight + GAP + legendStripHeight + gridHeight + GAP + watermarkHeight;

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
	ctx.fillText(`by ${ownerName} · ${totalCards} cards`, PADDING, y + 50);
	drawWordmark(ctx, CANVAS_WIDTH - PADDING, y + headerHeight / 2);
	y += headerHeight + GAP;

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

	const cardImages = await Promise.all(
		entries.map((entry) => loadImage(cardImageUrl(entry.card.printings[0].id, 244)))
	);
	for (const [index, entry] of entries.entries()) {
		const col = index % GRID_COLUMNS;
		const row = Math.floor(index / GRID_COLUMNS);
		const x = PADDING + col * (cellWidth + GAP);
		const cardY = y + row * (cellHeight + GAP);

		ctx.save();
		roundedRectClip(ctx, x, cardY, cellWidth, cellHeight, 6);
		ctx.drawImage(cardImages[index], x, cardY, cellWidth, cellHeight);
		ctx.restore();

		if (entry.quantity > 1) {
			const badgeRadius = 12;
			const badgeX = x + cellWidth - badgeRadius - 4;
			const badgeY = cardY + badgeRadius + 4;
			ctx.beginPath();
			ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
			ctx.fillStyle = themeColor('neon');
			ctx.fill();
			ctx.fillStyle = themeColor('void');
			ctx.font = 'bold 14px sans-serif';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(String(entry.quantity), badgeX, badgeY + 1);
			ctx.textAlign = 'left';
			ctx.textBaseline = 'alphabetic';
		}
	}
	y += gridHeight + GAP;

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
