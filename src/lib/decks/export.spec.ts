/**
 * `deckToSimFormat`'s shape was verified live against cyberpunk-tcg-sim.online (see export.ts's
 * own doc comment) — these tests pin that shape, not re-derive it. `deckToMeleeFormat`'s was read
 * out of the official site's bundle.
 */
import { describe, expect, it } from 'vitest';
import { makeCard, makePrinting } from '#lib/cards/fixtures.js';
import type { DeckEntryGroup } from './grouping.js';
import { deckToJson, deckToMeleeFormat, deckToSimFormat } from './export.js';

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

describe('deckToSimFormat', () => {
	it("matches the sim's own export shape: bare Collector Number, name, # Legends / # Main Deck", () => {
		expect(deckToSimFormat('Custom Deck 1', [dexter], mainGroups, [])).toBe(
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
		const text = deckToSimFormat('Deck', [dexter], [], []);
		expect(text).toContain('1x 002 Dexter DeShawn — Off the Grid');
		expect(text).not.toContain('MS01');
		expect(text).not.toContain('-002');
	});
});

describe('deckToJson', () => {
	it('carries the same bare import code as the sim format', () => {
		const json = JSON.parse(deckToJson('Custom Deck 1', [dexter], mainGroups, []));
		expect(json).toEqual({
			name: 'Custom Deck 1',
			legends: [{ name: 'Dexter DeShawn — Off the Grid', id: '002' }],
			main: [{ name: 'Chrome Fang', id: '008', quantity: 3 }],
			sideboard: []
		});
	});

	it('carries the sideboard as its own section', () => {
		const json = JSON.parse(
			deckToJson('Custom Deck 1', [dexter], mainGroups, [{ card: chromeFang, quantity: 1 }])
		);
		expect(json.sideboard).toEqual([{ name: 'Chrome Fang', id: '008', quantity: 1 }]);
	});
});

describe('the sim format and the sideboard', () => {
	it("appends a # Sideboard section, as the sim's own export does", () => {
		// Checked live against the sim on 2026-10-06: `# Name`, a blank line, `# Sideboard`, then
		// the same `{quantity}x {number} {name}` lines.
		expect(
			deckToSimFormat('Deck', [dexter], mainGroups, [
				{ card: kiroshi, quantity: 2 },
				{ card: chromeFang, quantity: 1 }
			])
		).toBe(
			[
				'# Name: Deck',
				'',
				'# Legends',
				'1x 002 Dexter DeShawn — Off the Grid',
				'',
				'# Main Deck',
				'3x 008 Chrome Fang',
				'',
				'# Sideboard',
				'2x 061 Kiroshi Optics',
				'1x 008 Chrome Fang'
			].join('\n')
		);
	});

	it('leaves no trace of a sideboard when there is none', () => {
		expect(deckToSimFormat('Deck', [dexter], mainGroups, [])).not.toContain('Sideboard');
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
				'1 Dexter DeShawn — Off the Grid',
				'',
				'Sideboard',
				'2 Kiroshi Optics'
			].join('\n')
		);
	});

	it('writes subtitled names with an em dash, whatever separator card.name uses', () => {
		const hyphenated = makeCard({
			name: 'V - Streetkid',
			subtitle: 'Streetkid',
			cardType: 'Legend'
		});
		expect(deckToMeleeFormat([dexterColon, hyphenated], [], [])).toContain(
			'1 Dexter DeShawn — Off the Grid\n1 V — Streetkid'
		);
	});

	it('omits Legends and Sideboard when empty, but never MainDeck', () => {
		expect(deckToMeleeFormat([], mainGroups, [])).toBe('MainDeck\n3 Chrome Fang');
		expect(deckToMeleeFormat([], [], [])).toBe('MainDeck');
	});
});
