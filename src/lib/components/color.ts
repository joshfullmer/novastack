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

import badgeRed from '#lib/assets/badge-red.png';
import badgeYellow from '#lib/assets/badge-yellow.png';
import badgeGreen from '#lib/assets/badge-green.png';
import badgeBlue from '#lib/assets/badge-blue.png';

/** Each Color's own cost-badge art from the physical card — official assets, not a redraw. */
export const COLOR_BADGE_IMAGE: Record<Color, string> = {
	Red: badgeRed,
	Yellow: badgeYellow,
	Green: badgeGreen,
	Blue: badgeBlue
};
