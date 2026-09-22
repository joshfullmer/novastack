/**
 * Closed vocabularies — the value sets the source API is allowed to use.
 *
 * These are *sets*, deliberately not orders: display order for Color and Card Type is
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

/**
 * Curated: rarity carries no orderable signal in the source data.
 *
 * `Nova Rare` sits last, not between `Epic` and `Secret` — it isn't a power tier, it's the tag
 * for a tournament/promo print run (Box Toppers, Edgerunner Open Season 1), so it doesn't
 * belong in the mainline progression at all. This order also drives the query language's
 * `rarity>=`/`rarity<`/etc. comparisons (`compile.ts`), not just display — a query that ranges
 * up to or from `Nova Rare` specifically changes meaning with this move, though none of the
 * mainline `Epic`/`Secret`/`Iconic` boundaries do.
 */
export const RARITY_ORDER = [
	'Common',
	'Uncommon',
	'Rare',
	'Epic',
	'Secret',
	'Iconic Other',
	'Iconic Legend',
	'Iconic Secret',
	'Nova Rare'
] as const;
export const RaritySchema = v.picklist(RARITY_ORDER, 'not a known Rarity');
export type Rarity = v.InferOutput<typeof RaritySchema>;

/**
 * Alt-art showcase treatments of an already-numbered card, printed with a collector number
 * well past the Base Set's main run rather than in sequence with it (e.g. Alt Cunningham is
 * both `106`, a normal Rare, and `155`, an Iconic Legend of the same card). `baseSetSequence`
 * (derive.ts) excludes these for the same reason it excludes `β`-prefixed reprints: a bonus
 * treatment carries no ordering information, and including one breaks the contiguous-run
 * assumption the derived Color/Card Type order depends on.
 */
export const ICONIC_RARITIES = ['Iconic Other', 'Iconic Legend', 'Iconic Secret'] as const;

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

/**
 * A Printing's language, curated per API set code in `sets.ts` — the API carries no locale
 * field of its own, only a second `set.code` per language (e.g. `welcometonightcityretail-fr`).
 * `en` is the absent default: unmapped codes are assumed English rather than requiring every
 * existing entry to be listed by hand.
 */
export const LOCALES = ['en', 'fr'] as const;
export const LocaleSchema = v.picklist(LOCALES, 'not a known Locale');
export type Locale = v.InferOutput<typeof LocaleSchema>;
export const DEFAULT_LOCALE: Locale = 'en';
