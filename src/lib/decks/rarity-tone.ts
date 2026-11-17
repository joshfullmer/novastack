/**
 * Rarity composition bar tint — a fixed 9-step opacity ramp on the single accent hue (chroma
 * stays reserved for the four Colors; rarity is not one). The ramp is spread across however many
 * *distinct* rarities are actually present in the deck being viewed, not fixed per Rarity tier —
 * a deck with only two rarities present should read as clearly light/dark as a deck with nine,
 * rather than having both crowded into the ramp's dim end just because their absolute tiers (say,
 * Common and Uncommon) both sit low in the full 9-tier vocabulary.
 *
 * Written as a literal array, not composed — Tailwind discovers classes by scanning source text.
 */
import { cn } from '#lib/cn.js';

const RARITY_GRADIENT = [
	cn('bg-neon/25'),
	cn('bg-neon/35'),
	cn('bg-neon/45'),
	cn('bg-neon/55'),
	cn('bg-neon/65'),
	cn('bg-neon/75'),
	cn('bg-neon/85'),
	cn('bg-neon/95'),
	cn('bg-neon')
] as const;

/**
 * `rank` is a rarity's 0-indexed position among the `count` distinct rarities present in *this*
 * deck (both already sorted by `RARITY_ORDER`) — not its absolute position in the full 9-tier
 * vocabulary. A deck with one rarity present reads at full intensity; there's no spread to show.
 */
export function rarityTint(rank: number, count: number): string {
	if (count <= 1) return RARITY_GRADIENT[RARITY_GRADIENT.length - 1];
	const index = Math.round((rank * (RARITY_GRADIENT.length - 1)) / (count - 1));
	return RARITY_GRADIENT[index];
}
