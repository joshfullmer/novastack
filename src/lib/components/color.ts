/**
 * Color identity → classes.
 *
 * Written as literal strings in a record rather than composed at runtime, because Tailwind
 * discovers classes by scanning source text: `bg-card-${color}` produces no CSS at all.
 *
 * **Color is never the only carrier of meaning.** These tint chips that are also labelled, and
 * paint the zero-byte tier-0 placeholder behind a card image — which is semantically right, the
 * color it flashes is the card's actual Color identity.
 */
import type { Color } from '#lib/cards/vocabulary.js';

export const COLOR_TINT: Record<Color, string> = {
	Red: 'bg-card-red',
	Yellow: 'bg-card-yellow',
	Green: 'bg-card-green',
	Blue: 'bg-card-blue'
};

/** Chip styling when the color is selected — tinted fill, dark text for contrast. */
export const COLOR_CHIP_ON: Record<Color, string> = {
	Red: 'bg-card-red text-void border-card-red',
	Yellow: 'bg-card-yellow text-void border-card-yellow',
	Green: 'bg-card-green text-void border-card-green',
	Blue: 'bg-card-blue text-void border-card-blue'
};

/** Chip styling when unselected — the tint survives as an edge and a dot. */
export const COLOR_CHIP_OFF: Record<Color, string> = {
	Red: 'border-card-red/40 text-body hover:border-card-red',
	Yellow: 'border-card-yellow/40 text-body hover:border-card-yellow',
	Green: 'border-card-green/40 text-body hover:border-card-green',
	Blue: 'border-card-blue/40 text-body hover:border-card-blue'
};

export const COLOR_DOT: Record<Color, string> = {
	Red: 'bg-card-red',
	Yellow: 'bg-card-yellow',
	Green: 'bg-card-green',
	Blue: 'bg-card-blue'
};

/** Plain text tinted to a card's Color identity — used to tint card names in dense list rows. */
export const COLOR_TEXT: Record<Color, string> = {
	Red: 'text-card-red',
	Yellow: 'text-card-yellow',
	Green: 'text-card-green',
	Blue: 'text-card-blue'
};

/**
 * Each Color's own cost-badge shape on the physical card art, as an SVG `<polygon>` — real
 * `stroke`/`fill`, not a `clip-path` div. `clip-path` clips a border independently at each
 * vertex (leaving disconnected fragments instead of a continuous outline) and can only
 * approximate a uniform-width outline via an inset second layer; an SVG polygon's stroke gets
 * correct mitered joins at every vertex for free, and needs only one element.
 *
 * Every shape's vertices sit exactly on its nominal 0–100 (or 0–75) bounds on all sides — and
 * `stroke` is centered on the path, so half of `stroke-width="5"` would render *outside* those
 * bounds. An `<svg>` clips to its `viewBox` by default, so without headroom that outer half gets
 * cut off. Each `viewBox` below is padded by 2.5 (half the stroke width) on every side to give
 * the stroke room; `points` stay in the original unpadded 0–100/0–75 coordinates.
 *
 * Un-padded height is 100 for every shape except Blue's (75, see below), so the same
 * `stroke-width` reads as the same visual thickness across all four when each is rendered at a
 * proportional height (pair with `COLOR_BADGE_SIZE` below, which is what actually fixes the
 * rendered height — the `viewBox` only fixes proportions, not pixels).
 *
 * - **Red** — a plain square.
 * - **Yellow** — an equilateral hexagon with edges resting on the top and bottom (so it's wider
 *   than tall: for a flat-top/bottom regular hexagon, width:height = 2:√3).
 * - **Green** — the same hexagon rotated 90° (edges resting on the left and right instead), but
 *   *not* equilateral: the left/right edges are half the length of the other 4 — and, unlike
 *   Yellow, fit to a square box rather than let that constraint set its own aspect ratio. Solving
 *   "corners at height h and 1−h, diagonal length = 2×(right-edge length)" for a 0–1-tall *and*
 *   0–1-wide box gives h = (16−√31)/30 ≈ 34.77%, landing corners at ~34.77%/65.23% of the height.
 * - **Blue** — a square rotated 45° (a diamond), sliced by a straight line between the midpoints
 *   of its bottom-left and bottom-right edges, discarding the sliver below that line — a
 *   pentagon, not a diamond, with an un-padded height of 75 (not 100) since the chop line sits
 *   at 75% down a 100-tall diamond — the shape's own bounds stop there, they don't just leave
 *   the discarded sliver empty inside a still-100-tall box.
 */
export const COLOR_BADGE_SHAPE: Record<Color, { viewBox: string; points: string }> = {
	Red: { viewBox: '-2.5 -2.5 105 105', points: '0,0 100,0 100,100 0,100' },
	Yellow: {
		viewBox: '-2.5 -2.5 120.47 105',
		points: '28.87,0 86.6,0 115.47,50 86.6,100 28.87,100 0,50'
	},
	Green: {
		viewBox: '-2.5 -2.5 105 105',
		points: '50,0 100,34.77 100,65.23 50,100 0,65.23 0,34.77'
	},
	Blue: { viewBox: '-2.5 -2.5 105 80', points: '50,0 100,50 75,75 25,75 0,50' }
};

/**
 * The rendered box each `COLOR_BADGE_SHAPE` sits in. Height is fixed at 40px (`h-10`) for every
 * color — these are meant to sit in a row and read as one size of badge, not four — so only
 * width varies, following from each shape's own (padded) `viewBox` aspect ratio: Yellow's
 * hexagon is ~15% wider than tall, Blue's pentagon (padded 105:80) wider still; Red and Green
 * are both square.
 */
export const COLOR_BADGE_SIZE: Record<Color, string> = {
	Red: 'h-10 w-10',
	Yellow: 'h-10 w-[46px]',
	Green: 'h-10 w-10',
	Blue: 'h-10 w-[53px]'
};
