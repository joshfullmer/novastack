/**
 * Drawing primitives shared by the deck image's two layouts (`deck-image-spread.ts`,
 * `deck-image-list.ts`): the dark base, section labels, card tiles, the cost histogram and the
 * footer. Everything draws onto a plain 2D canvas and reads colors from the live theme's own CSS
 * custom properties, so the image matches the site's palette without copying its values here.
 */
import QRCode from 'qrcode';
import { cardImageUrl } from '#lib/cards/schema.js';
import type { Card } from '#lib/cards/schema.js';
import type { Color } from '#lib/cards/vocabulary.js';
import type { DeckEntryGroup } from './grouping.js';
import type { DeckEntry } from './legality.js';
import { deckPrinting } from './printing.js';
import type { CostBucket } from './stats.js';

/**
 * A Legend as the composers need it: the Card, and which Printing of it the deck chose. A pair
 * rather than a bare `Card`, because the exported image is the one artifact people *share* — it
 * would be the worst place to quietly fall back to the default art.
 */
export type LegendArt = { card: Card; printingId?: string };

export type DeckImageLayout = 'spread' | 'list';

export type DeckImageOptions = {
	layout: DeckImageLayout;
	/** Type counts, cost curve and Eddiable share. Off leaves just the title block. */
	showStats: boolean;
	deckName: string;
	ownerName: string;
	legends: readonly LegendArt[];
	mainGroups: readonly DeckEntryGroup[];
	sideboard: readonly DeckEntry[];
	shareUrl: string;
};

/** Both layouts are 16:10 and grow taller only when the cards can't fit at a legible size. */
export const WIDTH = 1600;
export const HEIGHT = 1000;
export const PAD = 56;
/** Every mirrored card image is this exact ratio, height over width — see `#lib/cards/vocabulary.js`. */
export const ASPECT = 1024 / 733;

const FAMILY = "'Monaspace Krypton', ui-monospace, monospace";

/**
 * Every size in the layouts was set against a condensed face; Krypton's 0.6em advance is much wider,
 * so each is scaled to keep line lengths (and the title, stats and labels) from colliding.
 */
const SCALE = 0.78;

/** A font shorthand in the image's one face — the same Monaspace Krypton the site's mono text uses. */
export const fontOf = (weight: 500 | 600 | 700, size: number) =>
	`${weight} ${size * SCALE}px ${FAMILY}`;

const QR_SIZE = 64;
/** Where a layout's body must stop: above the footer's hairline, with room to breathe. */
export const FOOTER_TOP = HEIGHT - PAD - QR_SIZE - 30;

const COLOR_VAR: Record<Color, string> = {
	Red: 'card-red',
	Yellow: 'card-yellow',
	Green: 'card-green',
	Blue: 'card-blue'
};

export function themeColor(name: string): string {
	return getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim();
}

export const colorOf = (color: Color) => themeColor(COLOR_VAR[color]);

/**
 * The face is the site's own (`layout.css` declares it), so this only makes sure the weights the
 * canvas draws with are fetched before the first `fillText` — canvas never triggers a font load.
 */
export const loadFonts = () =>
	Promise.all(([500, 600, 700] as const).map((weight) => document.fonts.load(fontOf(weight, 16))));

const imageCache = new Map<string, Promise<HTMLImageElement>>();
function loadImage(src: string): Promise<HTMLImageElement> {
	let cached = imageCache.get(src);
	if (!cached) {
		cached = new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve(img);
			img.onerror = () => {
				imageCache.delete(src);
				reject(new Error(`Failed to load ${src}`));
			};
			img.src = src;
		});
		imageCache.set(src, cached);
	}
	return cached;
}

/** The art for a deck entry's chosen Printing at the 488px derivative, crisp at any tile size here. */
export const artOf = (card: Card, printingId?: string) =>
	loadImage(cardImageUrl(deckPrinting(card, printingId).id, 488));

export function makeCanvas(width: number, height: number) {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;
	return { canvas, ctx };
}

/** Canvas has no `border-radius` primitive — this is the usual arc-based substitute. */
export function roundedRect(
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

/**
 * A square, opposite corners (top-right, bottom-left) chamfered — the printed card's own
 * Eddiable badge shape (`eddie-badge` in `layout.css`), reused for the quantity badge so the image
 * matches the website's chip rather than reading as a generic rounded square.
 */
function chamferedSquare(
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

type TextStyle = {
	font: string;
	color: string;
	align?: CanvasTextAlign;
	baseline?: CanvasTextBaseline;
	/** CSS `letter-spacing`, e.g. `'1.5px'`. */
	spacing?: string;
	maxWidth?: number;
};

/** `fillText` with its state set and then put back, so one call's alignment can't leak into the next. */
export function text(
	ctx: CanvasRenderingContext2D,
	value: string,
	x: number,
	y: number,
	style: TextStyle
) {
	ctx.font = style.font;
	ctx.fillStyle = style.color;
	ctx.textAlign = style.align ?? 'left';
	ctx.textBaseline = style.baseline ?? 'alphabetic';
	ctx.letterSpacing = style.spacing ?? '0px';
	ctx.fillText(value, x, y, style.maxWidth);
	ctx.letterSpacing = '0px';
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';
}

/** `value` shortened with an ellipsis until it fits `maxWidth` in the context's current font. */
export function fitText(ctx: CanvasRenderingContext2D, value: string, maxWidth: number) {
	if (ctx.measureText(value).width <= maxWidth) return value;
	let out = value;
	while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
	return `${out}…`;
}

/**
 * The deck's identity, painted behind everything: a near-black base, a faint grid, and a soft glow
 * per Legend color. The colors are accents on a dark ground rather than a gradient under a scrim —
 * the scrim version came out muddy, and a dark ground is what lets the cards' own colors carry.
 */
export function paintBase(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	legends: readonly LegendArt[]
) {
	ctx.fillStyle = themeColor('void');
	ctx.fillRect(0, 0, width, height);

	ctx.strokeStyle = 'rgba(255,255,255,0.028)';
	ctx.lineWidth = 1;
	for (let x = 0; x <= width; x += 40) {
		ctx.beginPath();
		ctx.moveTo(x + 0.5, 0);
		ctx.lineTo(x + 0.5, height);
		ctx.stroke();
	}
	for (let y = 0; y <= height; y += 40) {
		ctx.beginPath();
		ctx.moveTo(0, y + 0.5);
		ctx.lineTo(width, y + 0.5);
		ctx.stroke();
	}

	const anchors = [
		[0, 0],
		[width, height * 0.35],
		[width * 0.45, height]
	] as const;
	for (const [index, legend] of legends.slice(0, anchors.length).entries()) {
		const [ax, ay] = anchors[index];
		const glow = ctx.createRadialGradient(ax, ay, 0, ax, ay, Math.max(width, height) * 0.62);
		glow.addColorStop(0, colorOf(legend.card.color));
		glow.addColorStop(1, 'transparent');
		ctx.save();
		ctx.globalAlpha = 0.16;
		ctx.fillStyle = glow;
		ctx.fillRect(0, 0, width, height);
		ctx.restore();
	}

	const vignette = ctx.createRadialGradient(
		width / 2,
		height / 2,
		height * 0.45,
		width / 2,
		height / 2,
		width * 0.8
	);
	vignette.addColorStop(0, 'transparent');
	vignette.addColorStop(1, 'rgba(0,0,0,0.5)');
	ctx.fillStyle = vignette;
	ctx.fillRect(0, 0, width, height);
}

/** Little color squares, one per Legend — the deck's colors at a glance. Returns their width. */
export function drawPips(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	legends: readonly LegendArt[],
	size: number
) {
	for (const [index, legend] of legends.entries()) {
		ctx.fillStyle = colorOf(legend.card.color);
		ctx.fillRect(x + index * size * 1.3, y, size, size);
	}
	return legends.length === 0 ? 0 : (legends.length - 1) * size * 1.3 + size;
}

/** The novastack mark (`#lib/components/Mark.svelte`) redrawn with canvas paths. */
function drawMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
	const scale = size / 32;
	ctx.save();
	ctx.translate(cx, cy);
	ctx.rotate(Math.PI / 4);
	ctx.strokeStyle = themeColor('neon');
	ctx.lineWidth = 1.3 * scale;
	ctx.lineJoin = 'round';
	const cell = 5.77 * scale;
	const positions = [-10.85, -2.88, 5.08].map((v) => v * scale);
	for (const px of positions) {
		for (const py of positions) {
			roundedRect(ctx, px, py, cell, cell, 0.4 * scale);
			ctx.stroke();
		}
	}
	ctx.restore();
}

/** The `nova`+`stack` wordmark with its mark, left edge at `x`, vertically centered on `centerY`. */
function drawWordmark(ctx: CanvasRenderingContext2D, x: number, centerY: number) {
	const markSize = 26;
	const gap = 9;
	drawMark(ctx, x + markSize / 2, centerY, markSize);
	ctx.font = fontOf(700, 24);
	ctx.letterSpacing = '1px';
	ctx.textBaseline = 'middle';
	const nova = ctx.measureText('nova').width;
	ctx.fillStyle = themeColor('bright');
	ctx.fillText('nova', x + markSize + gap, centerY + 1);
	ctx.fillStyle = themeColor('neon');
	ctx.fillText('stack', x + markSize + gap + nova, centerY + 1);
	ctx.letterSpacing = '0px';
	ctx.textBaseline = 'alphabetic';
}

/**
 * A slim strip along the bottom: a hairline, the wordmark on the left and a small QR on the right.
 * No URL text — nobody types a link off an image, and the QR is the one link-back that works from
 * one. The QR is dark-on-light regardless of the site's dark theme: scannability, not palette
 * match, is what matters for a code meant to be pointed a phone camera at.
 */
export async function drawFooter(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	shareUrl: string
) {
	const top = height - PAD - QR_SIZE;

	ctx.fillStyle = themeColor('edge');
	ctx.fillRect(PAD, top - 15, width - PAD * 2, 1);
	drawWordmark(ctx, PAD, top + QR_SIZE / 2);

	const qr = document.createElement('canvas');
	await QRCode.toCanvas(qr, shareUrl, {
		width: QR_SIZE,
		margin: 1,
		color: { dark: '#0b0b10', light: '#ffffff' }
	});
	const qrX = width - PAD - QR_SIZE;
	ctx.save();
	roundedRect(ctx, qrX, top, QR_SIZE, QR_SIZE, 6);
	ctx.clip();
	ctx.drawImage(qr, qrX, top, QR_SIZE, QR_SIZE);
	ctx.restore();
	text(ctx, 'SCAN TO OPEN', qrX - 14, top + QR_SIZE / 2 + 1, {
		font: fontOf(600, 14),
		color: themeColor('muted'),
		align: 'right',
		baseline: 'middle',
		spacing: '2px'
	});
}

/** The accent-ruled heading over a column or list — `UNITS  16`. Returns the height it takes. */
export function drawSectionLabel(
	ctx: CanvasRenderingContext2D,
	label: string,
	count: number,
	x: number,
	y: number,
	width: number,
	size = 30
) {
	ctx.fillStyle = themeColor('neon');
	ctx.fillRect(x, y, 36, 3);
	ctx.fillStyle = themeColor('edge');
	ctx.fillRect(x + 36, y + 1, Math.max(0, width - 36), 1);

	const baseline = y + 8 + size * 0.82;
	const heading = label.toUpperCase();
	const font = fontOf(700, size);
	ctx.font = font;
	ctx.letterSpacing = '1.5px';
	const headingWidth = ctx.measureText(heading).width;
	ctx.letterSpacing = '0px';
	text(ctx, heading, x, baseline, { font, color: themeColor('bright'), spacing: '1.5px' });
	text(ctx, String(count), x + headingWidth + 12, baseline, { font, color: themeColor('neon') });
	return 8 + size;
}

/**
 * One card tile: its art, a 2px border in the card's own color with a soft glow, and a `×N` badge
 * bottom-left when there is more than one copy.
 */
export function drawCardTile(
	ctx: CanvasRenderingContext2D,
	img: HTMLImageElement,
	card: Card,
	x: number,
	y: number,
	w: number,
	quantity: number
) {
	const h = w * ASPECT;
	const color = colorOf(card.color);
	const radius = Math.max(4, w * 0.045);

	ctx.save();
	ctx.shadowColor = color;
	ctx.shadowBlur = 10;
	ctx.fillStyle = themeColor('void');
	roundedRect(ctx, x, y, w, h, radius);
	ctx.fill();
	ctx.restore();

	ctx.save();
	roundedRect(ctx, x, y, w, h, radius);
	ctx.clip();
	ctx.drawImage(img, x, y, w, h);
	ctx.restore();

	ctx.save();
	ctx.globalAlpha = 0.9;
	ctx.strokeStyle = color;
	ctx.lineWidth = 2;
	roundedRect(ctx, x + 1, y + 1, w - 2, h - 2, radius);
	ctx.stroke();
	ctx.restore();

	if (quantity > 1) drawQuantityBadge(ctx, x + 6, y + h - 6, w, quantity);
}

/**
 * A hollow `bright` outline over `void`, not a solid fill — it matches the website's badge (see
 * `decks/[id]/+page.svelte`), and plain white reads against any of the four card colors without
 * picking a side among them, which a tinted fill kept doing. Bottom-left because the printed
 * card's Power number sits bottom-right. `(x, bottom)` is its bottom-left corner.
 */
function drawQuantityBadge(
	ctx: CanvasRenderingContext2D,
	x: number,
	bottom: number,
	tileWidth: number,
	quantity: number
) {
	const size = Math.max(24, Math.min(40, tileWidth * 0.26));
	const y = bottom - size;
	chamferedSquare(ctx, x, y, size, size * 0.3);
	ctx.fillStyle = themeColor('void');
	ctx.fill();
	ctx.strokeStyle = themeColor('bright');
	ctx.lineWidth = 2;
	chamferedSquare(ctx, x + 1, y + 1, size - 2, size * 0.3);
	ctx.stroke();
	text(ctx, `×${quantity}`, x + size / 2, y + size / 2 + 1, {
		font: fontOf(700, Math.round(size * 0.58)),
		color: themeColor('bright'),
		align: 'center',
		baseline: 'middle'
	});
}

/**
 * The largest size in `[min, max]` (step 2) whose `heightFor` fits `avail`. If nothing fits it
 * returns `min` and the overflow, which is how a fixed-ratio canvas grows only when it has to.
 */
export function fitSize(
	max: number,
	min: number,
	avail: number,
	heightFor: (size: number) => number
) {
	for (let size = max; size >= min; size -= 2) {
		if (heightFor(size) <= avail) return { size, overflow: 0 };
	}
	return { size: min, overflow: Math.max(0, heightFor(min) - avail) };
}

/** Total copies across a list of entries. */
export const copiesOf = (entries: readonly DeckEntry[]) =>
	entries.reduce((sum, entry) => sum + entry.quantity, 0);

/** A mini cost histogram; the tallest bar is picked out in `neon`. */
export function drawCurve(
	ctx: CanvasRenderingContext2D,
	buckets: readonly CostBucket[],
	x: number,
	y: number,
	w: number,
	h: number,
	labelSize = 16
) {
	if (buckets.length === 0) return;
	const max = Math.max(1, ...buckets.map((bucket) => bucket.quantity));
	const slot = w / buckets.length;
	const barWidth = Math.min(36, slot * 0.62);
	const chartHeight = h - labelSize - 14;
	for (const [index, bucket] of buckets.entries()) {
		const cx = x + slot * index + slot / 2;
		const barHeight = Math.max(3, (bucket.quantity / max) * (chartHeight - labelSize));
		ctx.fillStyle = bucket.quantity === max ? themeColor('neon') : themeColor('neon-dim');
		ctx.fillRect(cx - barWidth / 2, y + chartHeight - barHeight, barWidth, barHeight);
		text(ctx, String(bucket.quantity), cx, y + chartHeight - barHeight - 6, {
			font: fontOf(600, labelSize),
			color: themeColor('body'),
			align: 'center'
		});
		text(ctx, bucket.cost === null ? '—' : String(bucket.cost), cx, y + h - 2, {
			font: fontOf(600, labelSize - 2),
			color: themeColor('muted'),
			align: 'center'
		});
	}
	ctx.fillStyle = themeColor('edge');
	ctx.fillRect(x, y + chartHeight + 4, w, 1);
}
