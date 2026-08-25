/**
 * Client-side canvas deck-image export (`docs/spec/deckbuilder.md` §6) — composited entirely in
 * the browser from the deck's already-mirrored, same-origin static card art. No new backend
 * surface: server-rendered images at a stable URL were considered and rejected in the spec (a
 * `satori` + `resvg-wasm` rendering pipeline for a capability client-side canvas already covers).
 *
 * Composition matches swudb.com's own "Deck image" feature: a header, a Legends strip, the Main
 * Deck as a thumbnail grid with quantity badges, and a URL + QR-code watermark. The QR code is
 * rendered dark-on-light regardless of the site's own dark theme — scannability, not palette
 * match, is what matters for a code meant to be pointed a phone camera at.
 */
import QRCode from 'qrcode';
import { cardImageUrl } from '#lib/cards/schema.js';
import type { Card } from '#lib/cards/schema.js';
import type { DeckEntryGroup } from './grouping.js';

const CANVAS_WIDTH = 1200;
const PADDING = 32;
const GAP = 16;
const GRID_COLUMNS = 8;
/** Every mirrored card image is this exact ratio — see `#lib/cards/vocabulary.js`. */
const CARD_ASPECT = 1024 / 733;
const LEGEND_WIDTH = 140;

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

/** Canvas has no `border-radius` primitive — this is the usual arc-based substitute. */
function roundedRectClip(
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
	ctx.clip();
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
	const watermarkHeight = 64;
	const canvasHeight =
		PADDING * 2 + headerHeight + GAP + legendStripHeight + gridHeight + GAP + watermarkHeight;

	const canvas = document.createElement('canvas');
	canvas.width = CANVAS_WIDTH;
	canvas.height = canvasHeight;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;

	ctx.fillStyle = themeColor('void');
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	let y = PADDING;

	ctx.fillStyle = themeColor('bright');
	ctx.font = 'bold 28px sans-serif';
	ctx.fillText(deckName, PADDING, y + 26);
	ctx.fillStyle = themeColor('muted');
	ctx.font = '16px sans-serif';
	ctx.fillText(`by ${ownerName} · ${totalCards} cards`, PADDING, y + 50);
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
		width: watermarkHeight,
		margin: 1,
		color: { dark: '#000000', light: '#ffffff' }
	});
	ctx.drawImage(qrCanvas, PADDING, y, watermarkHeight, watermarkHeight);

	ctx.fillStyle = themeColor('muted');
	ctx.font = '13px sans-serif';
	ctx.textBaseline = 'middle';
	ctx.fillText(shareUrl, PADDING + watermarkHeight + 12, y + watermarkHeight / 2);
	ctx.textBaseline = 'alphabetic';

	return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}
