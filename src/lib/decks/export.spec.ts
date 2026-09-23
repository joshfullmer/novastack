/**
 * `deckToSimFormat`'s shape was verified live against cyberpunk-tcg-sim.online (see export.ts's
 * own doc comment) — these tests pin that shape, not re-derive it.
 */
import { describe, expect, it } from 'vitest';
import { makeCard, makePrinting } from '#lib/cards/fixtures.js';
import type { DeckEntryGroup } from './grouping.js';
import { deckToJson, deckToSimFormat } from './export.js';

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

const mainGroups: DeckEntryGroup[] = [
	{
		cardType: 'Unit',
		label: 'Units',
		entries: [{ card: chromeFang, quantity: 3 }],
		quantity: 3
	}
];

describe('deckToSimFormat', () => {
	it("matches the sim's own export shape: bare Collector Number, name, # Legends / # Main Deck", () => {
		expect(deckToSimFormat('Custom Deck 1', [dexter], mainGroups)).toBe(
			[
				'# Name: Custom Deck 1',
				'',
				'# Legends',
				'1x 002 Dexter DeShawn — Off the Grid',
				'',
				'# Main Deck',
				'3x 008 Chrome Fang'
			].join('\n')
		);
	});

	it('uses card.printings[0], never a Category prefix — MS01-002 is what broke import upstream', () => {
		const text = deckToSimFormat('Deck', [dexter], []);
		expect(text).toContain('1x 002 Dexter DeShawn — Off the Grid');
		expect(text).not.toContain('MS01');
		expect(text).not.toContain('-002');
	});
});

describe('deckToJson', () => {
	it('carries the same bare import code as the sim format', () => {
		const json = JSON.parse(deckToJson('Custom Deck 1', [dexter], mainGroups));
		expect(json).toEqual({
			name: 'Custom Deck 1',
			legends: [{ name: 'Dexter DeShawn — Off the Grid', id: '002' }],
			main: [{ name: 'Chrome Fang', id: '008', quantity: 3 }]
		});
	});
});
