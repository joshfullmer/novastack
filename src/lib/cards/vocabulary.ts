/**
 * Closed vocabularies — the value sets the source API is allowed to use.
 *
 * These are *sets*, deliberately not orders: display order for Colour and Card Type is
 * derived from the Base Set's collector-number sequence at ingest time and travels in the
 * snapshot (see `derive.ts`). The arrays here are alphabetical so nothing reads order into
 * them by accident.
 *
 * Rarity is the exception. It has no orderable signal anywhere in the source data, so its
 * order is curated here and ingest asserts that every observed rarity has an entry.
 */
import * as v from 'valibot';

export const COLORS = ['Blue', 'Green', 'Red', 'Yellow'] as const;
export const ColorSchema = v.picklist(COLORS, 'not a known Color');
export type Color = v.InferOutput<typeof ColorSchema>;

export const CARD_TYPES = ['Gear', 'Legend', 'Program', 'Unit'] as const;
export const CardTypeSchema = v.picklist(CARD_TYPES, 'not a known card type');
export type CardType = v.InferOutput<typeof CardTypeSchema>;

/**
 * The nine `{Brace}` tokens in `rules_text`. The API's own `keywords[]` field is empty on
 * every card — see `docs/research/facet-cardinality.md` §5. Ordered by frequency, which is
 * also the order the chips read best in.
 */
export const KEYWORDS = [
	'Play',
	'Blocker',
	'Spend',
	'Attack',
	'Quick',
	'Go Solo',
	'Defeated',
	'Call',
	'Adrenaline'
] as const;
export const KeywordSchema = v.picklist(KEYWORDS, 'not a known Keyword');
export type Keyword = v.InferOutput<typeof KeywordSchema>;

/** Curated: rarity carries no orderable signal in the source data. */
export const RARITY_ORDER = [
	'Common',
	'Uncommon',
	'Rare',
	'Epic',
	'Nova Rare',
	'Secret',
	'Iconic Other',
	'Iconic Legend',
	'Iconic Secret'
] as const;
export const RaritySchema = v.picklist(RARITY_ORDER, 'not a known Rarity');
export type Rarity = v.InferOutput<typeof RaritySchema>;

/** Inline glyphs in rules text. Styled, never filterable. */
export const SYMBOLS = {
	'€$': 'eurodollars',
	'☆': 'streetCred'
} as const;
export const SymbolNameSchema = v.picklist(['eurodollars', 'streetCred'], 'not a known symbol');
export type SymbolName = v.InferOutput<typeof SymbolNameSchema>;

/** The three image tiers mirrored to `static/cards/{printingId}/{width}.webp`. */
export const IMAGE_WIDTHS = [244, 488, 733] as const;
export type ImageWidth = (typeof IMAGE_WIDTHS)[number];

/** Uniform across all 389 printings — hardcoded so the grid never shifts. See notes §3. */
export const CARD_ASPECT_RATIO = '733 / 1024';
