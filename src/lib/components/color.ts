/**
 * Colour identity → classes.
 *
 * Written as literal strings in a record rather than composed at runtime, because Tailwind
 * discovers classes by scanning source text: `bg-card-${color}` produces no CSS at all.
 *
 * **Colour is never the only carrier of meaning.** These tint chips that are also labelled, and
 * paint the zero-byte tier-0 placeholder behind a card image — which is semantically right, the
 * colour it flashes is the card's actual Colour identity.
 */
import type { Color } from '#lib/cards/vocabulary.js';

export const COLOR_TINT: Record<Color, string> = {
	Red: 'bg-card-red',
	Yellow: 'bg-card-yellow',
	Green: 'bg-card-green',
	Blue: 'bg-card-blue'
};

/** Chip styling when the colour is selected — tinted fill, dark text for contrast. */
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
