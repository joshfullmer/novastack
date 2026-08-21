/**
 * The source API's shape → our model.
 *
 * Three normalizations carry real weight:
 *
 * 1. **The flattened printing fields are discarded.** `rarity`, `artist`, `set`,
 *    `print_number` and `image_url` are copies of one printing pushed onto the card. They are
 *    faithful copies of `printings[0]`, but *unrepresentative* — one card in four has a
 *    printing that contradicts them — so a rarity filter reading the card copy is silently
 *    wrong. See `docs/adr/0002-discard-the-flattened-printing-fields.md`.
 * 2. **RAM is split by card type.** One API field means opposite things: a Legend *provides*
 *    RAM, everything else *requires* it. A shared `ram` field makes the colored budget
 *    unwritable without a type check at every use site.
 * 3. **Keywords and flavour are derived from `rules_text`**, because the fields that should
 *    carry them are empty on every card.
 */
import { extractKeywords, splitRulesText, type SegmentContext } from './rules-text.ts';
import type { Card, NetdeckCard, NetdeckPrinting, Printing } from './schema.ts';
import { API_SET_CODE_TO_SET_ID } from './sets.ts';

/**
 * Artist strings need whitespace folding before anything can render or sort them — one artist
 * is recorded with an embedded newline. Case variants and apparent typos are deliberately
 * *not* merged: those are judgement calls about identity, and artist is display-and-search
 * only, so a wrong merge costs more than a duplicate entry.
 */
export function normalizeArtist(artist: string): string {
	return artist.replace(/\s+/g, ' ').trim();
}

/**
 * Builds the lookups rules-text segmentation needs from the whole dataset — a card reference
 * can point at any card, so this cannot be done one card at a time.
 */
export function buildSegmentContext(cards: readonly NetdeckCard[]): SegmentContext {
	const slugByUpperName = new Map<string, string>();
	const classificationByUpper = new Map<string, string>();

	for (const card of cards) {
		slugByUpperName.set(card.name.toUpperCase(), card.slug);
		for (const classification of card.classifications) {
			classificationByUpper.set(classification.toUpperCase(), classification);
		}
	}

	return { slugByUpperName, classificationByUpper };
}

function normalizePrinting(
	raw: NetdeckPrinting,
	thumbhashes: ReadonlyMap<string, string>
): Printing {
	const setId = API_SET_CODE_TO_SET_ID[raw.set.code];
	if (setId === undefined) {
		throw new Error(
			`Unmapped API set code "${raw.set.code}" on printing ${raw.id}. ` +
				`Add it to API_SET_CODE_TO_SET_ID in src/lib/cards/sets.ts.`
		);
	}

	const thumbhash = thumbhashes.get(raw.id);
	if (thumbhash === undefined) {
		throw new Error(`No ThumbHash mirrored for printing ${raw.id} (${raw.collector_number}).`);
	}

	return {
		id: raw.id,
		collectorNumber: raw.collector_number,
		setId,
		key: `${setId}-${raw.collector_number}`,
		rarity: raw.rarity,
		artist: normalizeArtist(raw.artist),
		sourceImageUrl: raw.source_image_url,
		thumbhash
	};
}

export function normalizeCard(
	raw: NetdeckCard,
	ctx: SegmentContext,
	thumbhashes: ReadonlyMap<string, string>
): Card {
	const isLegend = raw.card_type === 'Legend';
	const { rulesText, flavorText } = splitRulesText(raw.rules_text, ctx);
	const printings = raw.printings.map((printing) => normalizePrinting(printing, thumbhashes));

	const [defaultPrinting, ...rest] = printings;
	if (defaultPrinting === undefined) {
		throw new Error(
			`Card ${raw.slug} has no printings; the Default Printing cannot be guaranteed.`
		);
	}

	return {
		slug: raw.slug,
		name: raw.name,
		color: raw.color,
		cardType: raw.card_type,
		cost: raw.cost,
		power: raw.power,
		ramRequired: isLegend ? null : raw.ram,
		ramProvided: isLegend ? raw.ram : null,
		eddiable: raw.is_eddiable,
		classifications: raw.classifications,
		keywords: extractKeywords(raw.rules_text).keywords,
		rulesText,
		flavorText,
		rawRulesText: raw.rules_text,
		printings: [defaultPrinting, ...rest]
	};
}

export function normalizeCards(
	raw: readonly NetdeckCard[],
	thumbhashes: ReadonlyMap<string, string>
): Card[] {
	const ctx = buildSegmentContext(raw);
	return raw
		.map((card) => normalizeCard(card, ctx, thumbhashes))
		.sort((a, b) => a.slug.localeCompare(b.slug));
}
