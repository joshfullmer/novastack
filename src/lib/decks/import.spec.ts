/**
 * Real strings from the three text formats this has to read — the sim's own export (checked live
 * 2026-10-06), the official deck builder's `cyberpunk-text`, and Melee's. The official and Melee
 * shapes were read out of cyberpunktcg.com's bundle rather than a live export, so these strings
 * are the contract, not a recording.
 */
import { describe, expect, it } from 'vitest';
import { dataset } from '#lib/cards/index.js';
import { normalizeForSearch } from '#lib/cards/dataset.js';
import { importDeck } from './import.js';

const cards = dataset.cards;
const run = (text: string) => importDeck(text, cards);
const names = (entries: readonly { card: { name: string }; quantity: number }[]) =>
	entries.map((entry) => `${entry.quantity} ${entry.card.name}`);

describe('the three formats', () => {
	it("reads the sim's own export: # Name, # Legends, # Main Deck, # Sideboard, a code before the name", () => {
		const result = run(
			[
				'# Name: Custom Deck 1',
				'',
				'# Legends',
				'1x 002 Dexter DeShawn — Off the Grid',
				'1x 112 V — Streetkid',
				'',
				'# Main Deck',
				'3x 008 Chrome Fang',
				'1x 070 Mantis Blades',
				'',
				'# Sideboard',
				'2x 061 Kiroshi Optics',
				'1x 062 Mandibular Upgrade'
			].join('\n')
		);
		expect(result.unresolved).toEqual([]);
		expect(result.warnings).toEqual([]);
		expect(result.name).toBe('Custom Deck 1');
		expect(result.legends.map((legend) => legend.name)).toEqual([
			'Dexter DeShawn: Off the Grid',
			'V: Streetkid'
		]);
		expect(names(result.entries)).toEqual(['3 Chrome Fang', '1 Mantis Blades']);
		expect(names(result.sideboard)).toEqual(['2 Kiroshi Optics', '1 Mandibular Upgrade']);
	});

	it("reads the official builder's export: // headers with counts, no x, hyphenated Legends", () => {
		const result = run(
			[
				'# My Official Deck',
				'',
				'// Legends (2)',
				'1 V - Streetkid',
				'1 Dexter DeShawn - Off the Grid',
				'',
				'// Units (1)',
				'3 Chrome Fang',
				'',
				'// Gears (1)',
				'2 Mantis Blades',
				'',
				'// Sideboard (1)',
				'1 Kiroshi Optics'
			].join('\n')
		);
		expect(result.unresolved).toEqual([]);
		expect(result.name).toBe('My Official Deck');
		expect(result.legends.map((legend) => legend.name)).toEqual([
			'V: Streetkid',
			'Dexter DeShawn: Off the Grid'
		]);
		expect(names(result.entries)).toEqual(['3 Chrome Fang', '2 Mantis Blades']);
		expect(names(result.sideboard)).toEqual(['1 Kiroshi Optics']);
	});

	it("reads Melee's: bare headers, em-dash Legends, no deck name", () => {
		const result = run(
			[
				'MainDeck',
				'3 Chrome Fang',
				'',
				'Legends',
				'1 V — Streetkid',
				'',
				'Sideboard',
				'2 Kiroshi Optics'
			].join('\n')
		);
		expect(result.unresolved).toEqual([]);
		expect(result.name).toBeNull();
		expect(result.legends.map((legend) => legend.name)).toEqual(['V: Streetkid']);
		expect(names(result.entries)).toEqual(['3 Chrome Fang']);
		expect(names(result.sideboard)).toEqual(['2 Kiroshi Optics']);
	});
});

describe('section headers', () => {
	it.each([
		'// Sideboard (7)',
		'// Sideboard',
		'# Sideboard',
		'Sideboard',
		'SIDEBOARD',
		'Side Deck:',
		'// side deck (2)'
	])('treats %j as the sideboard', (header) => {
		const result = run(`${header}\n1 Kiroshi Optics`);
		expect(names(result.sideboard)).toEqual(['1 Kiroshi Optics']);
		expect(result.entries).toEqual([]);
	});

	it.each(['// Main Deck', 'MainDeck', '# Main Deck', '// Units (24)', 'Gears:', '// Programs'])(
		'treats %j as the main deck',
		(header) => {
			const result = run(`// Sideboard\n// note\n${header}\n1 Kiroshi Optics`);
			expect(names(result.entries)).toEqual(['1 Kiroshi Optics']);
		}
	);

	it('puts a list with no header at all in the main deck', () => {
		const result = run('3 Chrome Fang\n1 V: Streetkid');
		expect(names(result.entries)).toEqual(['3 Chrome Fang']);
		expect(result.legends.map((legend) => legend.name)).toEqual(['V: Streetkid']);
	});

	it('ignores comments and a ## Format line', () => {
		const result = run('## Format: Constructed\n// just a note\n3 Chrome Fang');
		expect(result.unresolved).toEqual([]);
		expect(names(result.entries)).toEqual(['3 Chrome Fang']);
	});

	it('takes a # line that is not a section as the deck name, with or without Name:', () => {
		expect(run('# Name: Hello\n1 Chrome Fang').name).toBe('Hello');
		expect(run('# Hello there\n1 Chrome Fang').name).toBe('Hello there');
	});
});

describe('line shapes', () => {
	it.each([
		'3 Chrome Fang',
		'3x Chrome Fang',
		'3X Chrome Fang',
		'Chrome Fang x3',
		'Chrome Fang X3'
	])('reads %j as three copies', (line) => {
		expect(names(run(line).entries)).toEqual(['3 Chrome Fang']);
	});

	it('adds up a card listed on several lines of the same pile', () => {
		expect(names(run('1 Chrome Fang\n2 Chrome Fang').entries)).toEqual(['3 Chrome Fang']);
	});

	it('reports a line with no quantity, offering the card it looks like', () => {
		const { unresolved, entries } = run('Chrome Fang');
		expect(entries).toEqual([]);
		expect(unresolved).toMatchObject([
			{
				line: 1,
				text: 'Chrome Fang',
				reason: 'unparsed',
				quantity: null,
				suggestions: [{ name: 'Chrome Fang' }]
			}
		]);
	});

	it('reports a zero quantity rather than importing nothing silently', () => {
		expect(run('0 Chrome Fang').unresolved).toMatchObject([{ reason: 'unparsed' }]);
	});
});

describe('the name key', () => {
	it('is unique across the whole dataset — the premise strict matching rests on', () => {
		const keys = cards.map((card) => normalizeForSearch(card.name));
		expect(new Set(keys).size).toBe(keys.length);
	});

	it.each(['V: Streetkid', 'V - Streetkid', 'V – Streetkid', 'V — Streetkid', 'v   streetkid'])(
		'finds a Legend written %j',
		(written) => {
			expect(run(`1 ${written}`).legends.map((legend) => legend.name)).toEqual(['V: Streetkid']);
		}
	);

	it('folds diacritics', () => {
		expect(run('1 Judy Alvarez - Braindance Maestro').legends.map((l) => l.name)).toEqual([
			'Judy Álvarez: Braindance Maestro'
		]);
	});

	it.each([
		['1x A027 Chrome Fang', 'Chrome Fang'],
		['1x MS01-131A Chrome Fang', 'Chrome Fang'],
		['1x 008 Chrome Fang', 'Chrome Fang']
	])('strips a leading collector code: %j', (line, name) => {
		expect(names(run(line).entries)).toEqual([`1 ${name}`]);
	});

	it('leaves a card whose own name starts with a digit alone', () => {
		expect(names(run('2 6th Street Recruits').entries)).toEqual(['2 6th Street Recruits']);
		expect(names(run('2 MT0D12 Flathead').entries)).toEqual(['2 MT0D12 Flathead']);
	});
});

describe('unresolved lines', () => {
	it('reports the line number and the raw text, and keeps going', () => {
		const result = run('// Main Deck\n\n3 Chrome Fnag\n1 Kiroshi Optics');
		expect(names(result.entries)).toEqual(['1 Kiroshi Optics']);
		expect(result.unresolved).toMatchObject([
			{ line: 3, text: '3 Chrome Fnag', reason: 'unknown', quantity: 3 }
		]);
	});

	it('suggests the card a typo was after, never resolving it on its own', () => {
		const [line] = run('3 Chrome Fnag').unresolved;
		expect(line.suggestions.map((card) => card.name)).toContain('Chrome Fang');
	});

	it('offers the candidates for a bare name shared by more than one card', () => {
		// Derived rather than listed: new Legends land with every card-data sync.
		const vs = cards.filter((card) => card.name.startsWith('V: '));
		expect(vs.length).toBeGreaterThan(1);

		const result = run('1 V');
		expect(result.legends).toEqual([]);
		const offered = result.unresolved[0].suggestions;
		expect(offered.length).toBe(Math.min(vs.length, 3));
		expect(offered.every((card) => vs.includes(card))).toBe(true);

		expect(run('1 Jackie Welles').unresolved[0].suggestions.length).toBeGreaterThan(1);
	});

	it('does not guess a bare Legend name even when only one Legend carries it', () => {
		const result = run('1 Dum Dum');
		expect(result.legends).toEqual([]);
		expect(result.unresolved[0].suggestions.map((card) => card.name)).toEqual([
			'Dum Dum: Maelstrom Triggerman'
		]);
	});

	it('offers nothing for a line that resembles no card, and at most three otherwise', () => {
		expect(run('1 Zzzzzzzzzzzz').unresolved[0].suggestions).toEqual([]);
		expect(run('1 Chrome').unresolved[0].suggestions.length).toBeLessThanOrEqual(3);
	});

	it('finds suggestions behind a leading collector code', () => {
		const [line] = run('1x 061 Kiroshi Optic').unresolved;
		expect(line.suggestions.map((card) => card.name)).toContain('Kiroshi Optics');
	});
});

describe('the two hard limits', () => {
	it('clamps a 4th copy and says so', () => {
		const result = run('4 Chrome Fang');
		expect(names(result.entries)).toEqual(['3 Chrome Fang']);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toMatchObject({ kind: 'copies' });
		expect(result.warnings[0].message).toContain('Chrome Fang: 4 → 3');
	});

	it('counts copies across both piles, so the later line loses', () => {
		const result = run('3 Chrome Fang\n// Sideboard\n1 Chrome Fang');
		expect(names(result.entries)).toEqual(['3 Chrome Fang']);
		expect(result.sideboard).toEqual([]);
		expect(result.warnings[0].message).toContain('Chrome Fang: 4 → 3');
	});

	it('keeps the copies that fit when the sideboard shares a card with the main deck', () => {
		const result = run('2 Chrome Fang\n// Sideboard\n3 Chrome Fang');
		expect(names(result.entries)).toEqual(['2 Chrome Fang']);
		expect(names(result.sideboard)).toEqual(['1 Chrome Fang']);
	});

	it('stops the sideboard at seven cards, dropping the later lines', () => {
		const pool = cards.filter((card) => card.cardType !== 'Legend').slice(0, 9);
		const lines = pool.map((card) => `1 ${card.name}`);
		const result = run(['// Sideboard', ...lines].join('\n'));
		expect(result.sideboard.map((entry) => entry.card.name)).toEqual(
			pool.slice(0, 7).map((card) => card.name)
		);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toMatchObject({ kind: 'sideboard-full' });
		expect(result.warnings[0].message).toContain(pool[7].name);
		expect(result.warnings[0].message).toContain(pool[8].name);
	});

	it('keeps part of a line that straddles the seventh card', () => {
		const pool = cards.filter((card) => card.cardType !== 'Legend').slice(0, 3);
		const result = run(`// Sideboard\n3 ${pool[0].name}\n3 ${pool[1].name}\n3 ${pool[2].name}`);
		expect(result.sideboard.map((entry) => entry.quantity)).toEqual([3, 3, 1]);
	});

	it('imports everything else as it comes — a short deck is the issues banner’s business', () => {
		const result = run('1 Chrome Fang');
		expect(result.warnings).toEqual([]);
		expect(result.entries).toHaveLength(1);
	});
});

describe('Legends', () => {
	it('goes by card type, not by the header it sits under', () => {
		const result = run('// Main Deck\n1 V - Streetkid\n2 Chrome Fang');
		expect(result.legends.map((legend) => legend.name)).toEqual(['V: Streetkid']);
		expect(names(result.entries)).toEqual(['2 Chrome Fang']);
	});

	it('reports a Legend under the sideboard instead of moving it or dropping it quietly', () => {
		const result = run('// Sideboard\n1 V - Streetkid\n1 Kiroshi Optics');
		expect(result.legends).toEqual([]);
		expect(names(result.sideboard)).toEqual(['1 Kiroshi Optics']);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toMatchObject({ kind: 'legend-in-sideboard' });
		expect(result.warnings[0].message).toContain('V: Streetkid');
	});

	it('keeps the first three and reports the rest', () => {
		const legends = cards.filter((card) => card.cardType === 'Legend').slice(0, 4);
		const result = run(legends.map((legend) => `1 ${legend.name}`).join('\n'));
		expect(result.legends).toHaveLength(3);
		expect(result.warnings).toMatchObject([{ kind: 'legends-full' }]);
		expect(result.warnings[0].message).toContain(legends[3].name);
	});

	it('names a Legend once, however many copies the list asks for', () => {
		const result = run('2 V - Streetkid\n1 V: Streetkid');
		expect(result.legends).toHaveLength(1);
		expect(result.warnings.every((warning) => warning.kind === 'legend-duplicate')).toBe(true);
		expect(result.warnings.length).toBeGreaterThan(0);
	});
});

describe('degenerate input', () => {
	it.each(['', '   ', '\n\n', '# Name: Empty'])('is an empty import for %j', (text) => {
		const result = run(text);
		expect(result.entries).toEqual([]);
		expect(result.sideboard).toEqual([]);
		expect(result.legends).toEqual([]);
		expect(result.unresolved).toEqual([]);
	});

	it('copes with CRLF line endings', () => {
		const result = run('# Main Deck\r\n3 Chrome Fang\r\n');
		expect(names(result.entries)).toEqual(['3 Chrome Fang']);
	});
});
