/**
 * `deckToOfficialFormat`'s shape was taken from a real export from the official deckbuilder;
 * `deckToMeleeFormat`'s was confirmed against live Melee submissions — these tests pin those shapes,
 * not re-derive them.
 */
import { describe, expect, it } from 'vitest';
import { makeCard, makePrinting } from '#lib/cards/fixtures.js';
import type { DeckEntryGroup } from './grouping.js';
import { deckToJson, deckToMeleeFormat, deckToOfficialFormat } from './export.js';

const dexter = makeCard({
	name: 'Dexter DeShawn — Off the Grid',
	cardType: 'Legend',
	printings: [makePrinting({ collectorNumber: '002' })]
});

const chromeFang = makeCard({
	name: 'Chrome Fang',
	cardType: 'Unit',
	printings: [makePrinting({ collectorNumber: '008' })]
});

const dexterColon = makeCard({
	name: 'Dexter DeShawn: Off the Grid',
	subtitle: 'Off the Grid',
	cardType: 'Legend'
});

const kiroshi = makeCard({
	name: 'Kiroshi Optics',
	cardType: 'Gear',
	printings: [makePrinting({ collectorNumber: '061' })]
});

const mainGroups: DeckEntryGroup[] = [
	{
		cardType: 'Unit',
		label: 'Units',
		entries: [{ card: chromeFang, quantity: 3 }],
		quantity: 3
	}
];

describe('deckToJson', () => {
	it('identifies cards by the bare Collector Number of their Default Printing', () => {
		const json = JSON.parse(deckToJson('Custom Deck 1', [dexter], mainGroups, []));
		expect(json).toEqual({
			name: 'Custom Deck 1',
			legends: [{ name: 'Dexter DeShawn — Off the Grid', id: '002' }],
			main: [{ name: 'Chrome Fang', id: '008', quantity: 3 }],
			sideboard: []
		});
	});

	it('never prefixes the id with a Category — MS01-002 is what broke import upstream', () => {
		const text = deckToJson('Deck', [dexter], [], []);
		expect(text).not.toContain('MS01');
		expect(text).not.toContain('-002');
	});

	it('carries the sideboard as its own section', () => {
		const json = JSON.parse(
			deckToJson('Custom Deck 1', [dexter], mainGroups, [{ card: chromeFang, quantity: 1 }])
		);
		expect(json.sideboard).toEqual([{ name: 'Chrome Fang', id: '008', quantity: 1 }]);
	});
});

describe('deckToOfficialFormat', () => {
	const unit = (name: string, subtitle: string | null = null) =>
		makeCard({ name, subtitle, cardType: 'Unit' });
	const vStreetkid = makeCard({ name: 'V - Streetkid', subtitle: 'Streetkid', cardType: 'Legend' });
	const groups: DeckEntryGroup[] = [
		{
			cardType: 'Unit',
			label: 'Units',
			entries: [
				{ card: chromeFang, quantity: 3 },
				{ card: unit('Royce: Don’t Call Me Simon', 'Don’t Call Me Simon'), quantity: 3 }
			],
			quantity: 6
		},
		{
			cardType: 'Gear',
			label: 'Gear',
			entries: [{ card: kiroshi, quantity: 3 }],
			quantity: 3
		}
	];

	it("matches the official builder's own export: counted `// Type (n)` sections, `Name: Subtitle`", () => {
		expect(
			deckToOfficialFormat('New Deck', [dexterColon, vStreetkid], groups, [
				{ card: kiroshi, quantity: 1 },
				{ card: chromeFang, quantity: 2 }
			])
		).toBe(
			[
				'# New Deck',
				'',
				'// Legends (2)',
				'1 Dexter DeShawn: Off the Grid',
				'1 V: Streetkid',
				'',
				'// Units (6)',
				'3 Chrome Fang',
				'3 Royce: Don’t Call Me Simon',
				'',
				'// Gears (3)',
				'3 Kiroshi Optics',
				'',
				'// Sideboard (3)',
				'1 Kiroshi Optics',
				'2 Chrome Fang'
			].join('\n')
		);
	});

	it('omits Legends and Sideboard when empty', () => {
		expect(deckToOfficialFormat('Deck', [], mainGroups, [])).toBe(
			'# Deck\n\n// Units (3)\n3 Chrome Fang'
		);
	});
});

describe('deckToMeleeFormat', () => {
	it('is bare headers and `{quantity} {name}` lines, MainDeck first', () => {
		expect(deckToMeleeFormat([dexterColon], mainGroups, [{ card: kiroshi, quantity: 2 }])).toBe(
			[
				'MainDeck',
				'3 Chrome Fang',
				'',
				'Legends',
				'1 Dexter DeShawn | Off the Grid',
				'',
				'Sideboard',
				'2 Kiroshi Optics'
			].join('\n')
		);
	});

	it('writes subtitled names with a pipe, whatever separator card.name uses', () => {
		const hyphenated = makeCard({
			name: 'V - Streetkid',
			subtitle: 'Streetkid',
			cardType: 'Legend'
		});
		expect(deckToMeleeFormat([dexterColon, hyphenated], [], [])).toContain(
			'1 Dexter DeShawn | Off the Grid\n1 V | Streetkid'
		);
	});

	it('omits Legends and Sideboard when empty, but never MainDeck', () => {
		expect(deckToMeleeFormat([], mainGroups, [])).toBe('MainDeck\n3 Chrome Fang');
		expect(deckToMeleeFormat([], [], [])).toBe('MainDeck');
	});
});
