/**
 * Builders for synthetic Cards, used by unit tests.
 *
 * Synthetic data keeps a filter test readable — the reader can see the whole dataset the
 * assertion runs against. The two fixtures the spec makes mandatory are exercised against the
 * *real* committed snapshot instead, in `dataset.spec.ts`, because their value is precisely
 * that they are real: `Rebecca: Having a Moment` is null on cost, power, RAM and rules text,
 * and `V: Streetkid` carries five printings across two artists.
 */
import type { Card, NetdeckCard, NetdeckPrinting, Printing, Snapshot } from './schema.ts';
import { SET_IDENTIFIERS } from './sets.ts';
import type { CardType, Color } from './vocabulary.ts';

let sequence = 0;

export function makePrinting(overrides: Partial<Printing> = {}): Printing {
	sequence += 1;
	const id = overrides.id ?? `printing-${sequence}`;
	const setId = overrides.setId ?? 'MS01-WNC';
	const collectorNumber = overrides.collectorNumber ?? String(sequence).padStart(3, '0');

	return {
		id,
		collectorNumber,
		setId,
		key: `${setId}-${collectorNumber}`,
		rarity: 'Common',
		artist: 'Test Artist',
		sourceImageUrl: `https://example.invalid/${id}.webp`,
		thumbhash: 'AAAAAAAA',
		...overrides
	};
}

type CardOverrides = Partial<Omit<Card, 'printings'>> & {
	printings?: [Printing, ...Printing[]];
};

export function makeCard(overrides: CardOverrides = {}): Card {
	sequence += 1;
	const slug = overrides.slug ?? `card-${sequence}`;
	const cardType: CardType = overrides.cardType ?? 'Unit';

	return {
		slug,
		name: `Card ${sequence}`,
		subtitle: null,
		color: 'Red',
		cardType,
		cost: 3,
		power: 4,
		ramRequired: cardType === 'Legend' ? null : 2,
		ramProvided: cardType === 'Legend' ? 2 : null,
		eddiable: false,
		classifications: [],
		keywords: [],
		rulesText: [],
		flavorText: null,
		rawRulesText: null,
		printings: [makePrinting()],
		...overrides
	};
}

/** A Card of a given color and type, which is what most filter tests actually vary. */
export function makeCards(
	specs: readonly (CardOverrides & { color: Color; cardType: CardType })[]
): Card[] {
	return specs.map((spec) => makeCard(spec));
}

export function makeNetdeckPrinting(overrides: Partial<NetdeckPrinting> = {}): NetdeckPrinting {
	sequence += 1;
	const id = overrides.id ?? `printing-${sequence}`;

	return {
		id,
		collector_number: String(sequence).padStart(3, '0'),
		set: { code: 'welcometonightcityretail', name: 'Welcome to Night City — Retail' },
		rarity: 'Common',
		artist: 'Test Artist',
		finish: null,
		image_url: `https://example.invalid/${id}.webp?Signature=x`,
		source_image_url: `https://example.invalid/${id}.webp`,
		...overrides
	};
}

export function makeNetdeckCard(overrides: Partial<NetdeckCard> = {}): NetdeckCard {
	sequence += 1;
	const slug = overrides.slug ?? `card-${sequence}`;
	const name = overrides.name ?? `Card ${sequence}`;
	const printings = overrides.printings ?? [makeNetdeckPrinting()];

	return {
		id: `card-uuid-${sequence}`,
		external_id: `cb-${slug}`,
		slug,
		name,
		subname: null,
		display_name: name,
		rules_text: null,
		flavor_text: null,
		color: 'Red',
		card_type: 'Unit',
		cost: 3,
		power: 4,
		ram: 2,
		classifications: [],
		keywords: [],
		is_eddiable: false,
		legality: 'legal',
		selected_printing_id: printings[0]?.id ?? null,
		...overrides,
		printings
	};
}

/** Every printing in a raw fixture, mapped to a placeholder ThumbHash. */
export function thumbhashesFor(cards: readonly NetdeckCard[]): Map<string, string> {
	return new Map(cards.flatMap((card) => card.printings.map((p) => [p.id, 'AAAAAAAA'])));
}

export function makeSnapshot(cards: readonly Card[], overrides: Partial<Snapshot> = {}): Snapshot {
	return {
		generatedAt: '2026-08-20T00:00:00.000Z',
		colorOrder: ['Red', 'Yellow', 'Green', 'Blue'],
		cardTypeOrder: ['Legend', 'Unit', 'Gear', 'Program'],
		ramPerLegend: 2,
		sets: SET_IDENTIFIERS.map((set) => ({ ...set, cardCount: 0, printingCount: 0 })),
		stats: { cards: cards.length, printings: 0, sets: SET_IDENTIFIERS.length },
		cards: [...cards],
		...overrides
	};
}
