import { describe, expect, it } from 'vitest';
import {
	extractKeywords,
	plainText,
	segmentLine,
	splitRulesText,
	type SegmentContext
} from './rules-text.ts';

/**
 * A deliberately small context. The real one is built from the whole dataset in
 * `normalize.ts`; these entries are the ones the corpus actually exercises.
 */
const ctx: SegmentContext = {
	slugByUpperName: new Map([
		['DEADMAN TRANSMITTER', 'deadman-transmitter'],
		['V — STREETKID', 'v-streetkid']
	]),
	classificationByUpper: new Map([
		['ARASAKA', 'Arasaka'],
		['BRAINDANCE', 'Braindance'],
		['AI', 'AI'],
		['TYGER CLAWS', 'Tyger Claws']
	])
};

describe('extractKeywords', () => {
	it('finds the brace tokens in vocabulary order, not text order', () => {
		expect(extractKeywords('{Defeated} then {Play} something')).toEqual({
			keywords: ['Play', 'Defeated'],
			unknown: []
		});
	});

	it('deduplicates a keyword repeated in one rules text', () => {
		expect(extractKeywords('{Blocker} … {Blocker}')).toEqual({
			keywords: ['Blocker'],
			unknown: []
		});
	});

	it('reports an unrecognised token rather than silently dropping it', () => {
		expect(extractKeywords('{Play} and {Overclock}')).toEqual({
			keywords: ['Play'],
			unknown: ['Overclock']
		});
	});

	it('treats null rules text as no keywords', () => {
		expect(extractKeywords(null)).toEqual({ keywords: [], unknown: [] });
	});
});

describe('segmentLine', () => {
	it('emits a keyword segment mid-sentence, not only at the start', () => {
		expect(segmentLine('Give a unit {Quick} this turn.', ctx)).toEqual([
			{ kind: 'text', text: 'Give a unit ' },
			{ kind: 'keyword', text: '{Quick}', keyword: 'Quick' },
			{ kind: 'text', text: ' this turn.' }
		]);
	});

	it('emits a multi-word keyword', () => {
		expect(segmentLine('{Go Solo}', ctx)).toEqual([
			{ kind: 'keyword', text: '{Go Solo}', keyword: 'Go Solo' }
		]);
	});

	it('emits a parenthetical as reminder text', () => {
		expect(segmentLine('{Adrenaline} (A Unit with Adrenaline can attack.)', ctx)).toEqual([
			{ kind: 'keyword', text: '{Adrenaline}', keyword: 'Adrenaline' },
			{ kind: 'text', text: ' ' },
			{ kind: 'reminder', text: '(A Unit with Adrenaline can attack.)' }
		]);
	});

	it('emits both currency symbols', () => {
		expect(segmentLine('Pay 2 €$ if your ☆ is higher.', ctx)).toEqual([
			{ kind: 'text', text: 'Pay 2 ' },
			{ kind: 'symbol', text: '€$', symbol: 'eurodollars' },
			{ kind: 'text', text: ' if your ' },
			{ kind: 'symbol', text: '☆', symbol: 'streetCred' },
			{ kind: 'text', text: ' is higher.' }
		]);
	});

	it('links a quoted ALL-CAPS run that matches a real card name', () => {
		expect(segmentLine('defeat its "DEADMAN TRANSMITTER" instead.', ctx)).toEqual([
			{ kind: 'text', text: 'defeat its ' },
			{ kind: 'cardRef', text: '"DEADMAN TRANSMITTER"', slug: 'deadman-transmitter' },
			{ kind: 'text', text: ' instead.' }
		]);
	});

	it('styles but does not link a quoted ALL-CAPS run matching no card', () => {
		expect(segmentLine('if this Unit is named "V", ready 2 Eddies.', ctx)).toEqual([
			{ kind: 'text', text: 'if this Unit is named ' },
			{ kind: 'nameFragment', text: '"V"' },
			{ kind: 'text', text: ', ready 2 Eddies.' }
		]);
	});

	it('handles curly quotes as well as straight ones', () => {
		expect(segmentLine('defeat its “DEADMAN TRANSMITTER” now.', ctx)).toEqual([
			{ kind: 'text', text: 'defeat its ' },
			{ kind: 'cardRef', text: '“DEADMAN TRANSMITTER”', slug: 'deadman-transmitter' },
			{ kind: 'text', text: ' now.' }
		]);
	});

	it('links an unquoted ALL-CAPS run matching a known classification', () => {
		expect(segmentLine('add 1 BRAINDANCE Program to your hand.', ctx)).toEqual([
			{ kind: 'text', text: 'add 1 ' },
			{ kind: 'classification', text: 'BRAINDANCE', classification: 'Braindance' },
			{ kind: 'text', text: ' Program to your hand.' }
		]);
	});

	it('links a two-word classification', () => {
		expect(segmentLine('each TYGER CLAWS unit', ctx)).toEqual([
			{ kind: 'text', text: 'each ' },
			{ kind: 'classification', text: 'TYGER CLAWS', classification: 'Tyger Claws' },
			{ kind: 'text', text: ' unit' }
		]);
	});

	it('links a two-letter classification', () => {
		expect(segmentLine('an AI unit', ctx)).toEqual([
			{ kind: 'text', text: 'an ' },
			{ kind: 'classification', text: 'AI', classification: 'AI' },
			{ kind: 'text', text: ' unit' }
		]);
	});

	it('leaves an unmatched ALL-CAPS run as plain text', () => {
		// The rule that stops a classification added next month being mis-styled today.
		expect(segmentLine('a NETRUNNER unit', ctx)).toEqual([
			{ kind: 'text', text: 'a NETRUNNER unit' }
		]);
	});

	it('splits a caps phrase so a known classification is not swallowed by its neighbour', () => {
		expect(segmentLine('ARASAKA NETRUNNER', ctx)).toEqual([
			{ kind: 'classification', text: 'ARASAKA', classification: 'Arasaka' },
			{ kind: 'text', text: ' NETRUNNER' }
		]);
	});

	it('does not treat a sentence-initial single capital as a caps run', () => {
		expect(segmentLine('A unit gets 1 power.', ctx)).toEqual([
			{ kind: 'text', text: 'A unit gets 1 power.' }
		]);
	});

	it('does not treat a bare number as a caps run', () => {
		expect(segmentLine('less than 20 ☆ total', ctx)).toEqual([
			{ kind: 'text', text: 'less than 20 ' },
			{ kind: 'symbol', text: '☆', symbol: 'streetCred' },
			{ kind: 'text', text: ' total' }
		]);
	});
});

describe('splitRulesText', () => {
	it('turns newlines into separate paragraphs', () => {
		const { rulesText, flavorText } = splitRulesText('{Call} Trash 3.\n{Quick} Draw 1.', ctx);
		expect(rulesText).toEqual([
			[
				{ kind: 'keyword', text: '{Call}', keyword: 'Call' },
				{ kind: 'text', text: ' Trash 3.' }
			],
			[
				{ kind: 'keyword', text: '{Quick}', keyword: 'Quick' },
				{ kind: 'text', text: ' Draw 1.' }
			]
		]);
		expect(flavorText).toBeNull();
	});

	it.each([
		['[Flavour]', '[Flavour] Their protocol stops at “shoot first.”'],
		['[Flavor]', '[Flavor] Scream your throat raw for something. Anything.'],
		['[Flavour Text]', '[Flavour Text] Takes a lot of juice to break bones like they do.']
	])('extracts a %s tagged line, tag stripped', (_label, raw) => {
		const { rulesText, flavorText } = splitRulesText(raw, ctx);
		expect(rulesText).toEqual([]);
		expect(flavorText).toBe(raw.slice(raw.indexOf(']') + 2));
	});

	it('extracts a trailing wholly-quoted sentence-case line as flavour', () => {
		const { rulesText, flavorText } = splitRulesText(
			'(Equip to a friendly Unit or face-up Legend.)\n"One cut, one kill."',
			ctx
		);
		expect(rulesText).toEqual([
			[{ kind: 'reminder', text: '(Equip to a friendly Unit or face-up Legend.)' }]
		]);
		expect(flavorText).toBe('"One cut, one kill."');
	});

	it('handles a card whose rules text is nothing but flavour', () => {
		const { rulesText, flavorText } = splitRulesText(
			'"Grab the policyholder, leave the rest for the city meatwagon."',
			ctx
		);
		expect(rulesText).toEqual([]);
		expect(flavorText).toBe('"Grab the policyholder, leave the rest for the city meatwagon."');
	});

	it('keeps a quoted ALL-CAPS card reference in the rules, not the flavour', () => {
		const { rulesText, flavorText } = splitRulesText('"DEADMAN TRANSMITTER"', ctx);
		expect(rulesText).toEqual([
			[{ kind: 'cardRef', text: '"DEADMAN TRANSMITTER"', slug: 'deadman-transmitter' }]
		]);
		expect(flavorText).toBeNull();
	});

	it('survives the mandatory fixture: null rules text', () => {
		expect(splitRulesText(null, ctx)).toEqual({ rulesText: [], flavorText: null });
	});

	it('drops blank lines rather than emitting empty paragraphs', () => {
		const { rulesText } = splitRulesText('Draw 1.\n\n\nDraw 2.', ctx);
		expect(rulesText).toHaveLength(2);
	});
});

describe('plainText', () => {
	it('flattens segments back to a searchable string without markup', () => {
		const { rulesText } = splitRulesText(
			'{Call} Trash 3. Then add 1 BRAINDANCE Program.\nPay 2 €$.',
			ctx
		);
		expect(plainText(rulesText)).toBe('Call Trash 3. Then add 1 BRAINDANCE Program. Pay 2 €$.');
	});

	it('is empty for a card with no rules text', () => {
		expect(plainText([])).toBe('');
	});
});
