/**
 * AST → `Predicate` compilation (spec §3, §4, §6), tested end to end through `parse` +
 * `compileQuery` — the shape real usage takes — rather than by hand-constructing AST nodes.
 */
import { describe, expect, it } from 'vitest';
import { createDataset } from '#lib/cards/dataset.js';
import { makeCard, makePrinting, makeSnapshot } from '#lib/cards/fixtures.js';
import { evaluate, type Predicate } from '#lib/filters/predicate.js';
import { readChipView } from '#lib/filters/chips.js';
import { compileQuery } from './compile.ts';
import { parse } from './parser.ts';

const dataset = createDataset(
	makeSnapshot([
		makeCard({
			slug: 'red-unit',
			name: 'Red Unit',
			color: 'Red',
			cardType: 'Unit',
			cost: 3,
			power: 4,
			ramRequired: 2,
			classifications: ['Arasaka', 'Tyger Claws'],
			keywords: ['Blocker'],
			printings: [makePrinting({ setId: 'MS01-WNC', rarity: 'Common' })]
		}),
		makeCard({
			slug: 'blue-program',
			name: 'Blue Program',
			color: 'Blue',
			cardType: 'Program',
			cost: 1,
			power: null,
			ramRequired: 1,
			classifications: ['Quickhack'],
			keywords: [],
			printings: [makePrinting({ setId: 'SD01-HEI', rarity: 'Iconic Legend' })]
		}),
		makeCard({
			slug: 'red-legend',
			name: 'Red Legend',
			color: 'Red',
			cardType: 'Legend',
			cost: null,
			power: null,
			ramRequired: null,
			ramProvided: 2,
			classifications: [],
			keywords: [],
			printings: [makePrinting({ setId: 'MS01-WNC', rarity: 'Epic' })]
		})
	])
);

function run(source: string): {
	slugs: string[];
	predicate: Predicate;
	warnings: readonly { reason: string }[];
} {
	const { node, warnings: parseWarnings } = parse(source);
	const { predicate, warnings: compileWarnings } = compileQuery(node, { dataset });
	const slugs = evaluate(dataset, predicate).map((match) => match.card.slug);
	return { slugs, predicate, warnings: [...parseWarnings, ...compileWarnings] };
}

describe('enumerated fields', () => {
	it('matches color by alias', () => {
		expect(run('c:red').slugs).toEqual(['red-unit', 'red-legend']);
	});

	it('is case-insensitive for the value', () => {
		expect(run('type:LEGEND').slugs).toEqual(['red-legend']);
	});

	it('ORs within a facet via the connective', () => {
		expect(run('c:red or c:blue').slugs).toHaveLength(3);
	});

	it('merges an OR of the same facet into one leaf, not a nested or node', () => {
		const { predicate } = run('c:red or c:blue');
		expect(predicate).toMatchObject({
			kind: 'color',
			values: expect.arrayContaining(['Red', 'Blue'])
		});
	});

	it('drops an unknown enum value as malformed', () => {
		const { slugs, warnings } = run('c:chartreuse');
		expect(slugs).toHaveLength(3); // degrades to no filter
		expect(warnings).toMatchObject([{ reason: 'malformed-value' }]);
	});

	it('drops an unknown field as unknown-field', () => {
		const { warnings } = run('nonsense:3');
		expect(warnings).toMatchObject([{ reason: 'unknown-field' }]);
	});

	it('ANDs across facets', () => {
		expect(run('c:red type:legend').slugs).toEqual(['red-legend']);
	});

	it('drops color:none and type:none as inapplicable — never null, not malformed', () => {
		const colorNone = run('color:none');
		expect(colorNone.warnings).toMatchObject([{ reason: 'inapplicable-field' }]);
		expect(colorNone.slugs).toHaveLength(3);

		const typeHas = run('type:has');
		expect(typeHas.warnings).toMatchObject([{ reason: 'inapplicable-field' }]);
		expect(typeHas.slugs).toHaveLength(3);
	});
});

describe('numeric fields', () => {
	it('reads a plain comparison', () => {
		expect(run('cost>=3').slugs).toEqual(['red-unit']);
	});

	it('reads equality via : and =', () => {
		expect(run('cost:1').slugs).toEqual(['blue-program']);
		expect(run('cost=1').slugs).toEqual(['blue-program']);
	});

	it('excludes null from every bound, including an unbounded one', () => {
		expect(run('cost>=0').slugs).toEqual(['red-unit', 'blue-program']);
	});

	it('reads the chained-interval sugar, field in the middle', () => {
		const { predicate } = run('1<=cost<=3');
		expect(predicate).toEqual({
			kind: 'numeric',
			field: 'cost',
			min: 1,
			max: 3,
			includeNull: false
		});
		expect(run('1<=cost<=3').slugs).toEqual(['red-unit', 'blue-program']);
	});

	it('rejects a direction mismatch in the chain as malformed', () => {
		const { warnings, slugs } = run('1<=cost>=3');
		expect(warnings).toMatchObject([{ reason: 'malformed-value' }]);
		expect(slugs).toHaveLength(3);
	});

	it('isolates the null bucket with field:none', () => {
		expect(run('cost:none').slugs).toEqual(['red-legend']);
	});

	it('excludes null with field:has', () => {
		expect(run('cost:has').slugs).toEqual(['red-unit', 'blue-program']);
	});

	it('composes a bound with the null bucket via or, with no dedicated syntax', () => {
		expect(run('(cost>=2 cost<=4) or cost:none').slugs).toEqual(['red-unit', 'red-legend']);
	});

	it('inverts a comparison on negation, mirroring the operator', () => {
		expect(run('-cost>=3').slugs).toEqual(['blue-program']); // cost<3, null still excluded
	});

	it('splits negated equality into an or of two open bounds', () => {
		const { predicate } = run('-cost:1');
		expect(predicate).toMatchObject({ kind: 'or' });
		expect(run('-cost:1').slugs).toEqual(['red-unit']); // cost 3; null-cost legend still excluded
	});

	it('negates cost:none into cost:has via the generic not node', () => {
		expect(run('-cost:none').slugs).toEqual(['red-unit', 'blue-program']);
	});

	it('negates a chained range into an or of two half-bounds', () => {
		// cost<1 or cost>3 — excludes 3 (red-unit) and 1 (blue-program), keeps nothing but is a
		// real, correctly-shaped query rather than a crash.
		const { predicate } = run('-(1<=cost<=3)');
		expect(predicate).toMatchObject({ kind: 'or' });
		expect(run('-(1<=cost<=3)').slugs).toEqual([]);
	});

	it('drops a non-numeric value as malformed', () => {
		const { warnings, slugs } = run('cost:banana');
		expect(warnings).toMatchObject([{ reason: 'malformed-value' }]);
		expect(slugs).toHaveLength(3);
	});
});

describe('rarity — ordered comparisons', () => {
	it('reads a >= comparison as an enumerated slice', () => {
		// Both cards are Epic-or-above in the curated order: red-legend is Epic, blue-program is
		// Iconic Legend.
		expect(run('rarity>=epic').slugs).toEqual(['blue-program', 'red-legend']);
	});

	it('reads a <= comparison', () => {
		expect(run('rarity<=common').slugs).toEqual(['red-unit']);
	});

	it('negates into the complement, staying a single leaf', () => {
		const { predicate } = run('-rarity:common');
		expect(predicate).toMatchObject({ kind: 'rarity' });
		expect(run('-rarity:common').slugs).toEqual(['blue-program', 'red-legend']);
	});

	it('accepts a slugified multi-word rarity value', () => {
		expect(run('rarity:iconic-legend').slugs).toEqual(['blue-program']);
	});
});

describe('legends: the colored RAM budget', () => {
	it('parses a tally value into a ramBudget leaf', () => {
		const { predicate } = run('legends:rr');
		expect(predicate).toEqual({
			kind: 'ramBudget',
			budget: { Red: 2, Yellow: 0, Green: 0, Blue: 0 }
		});
	});

	it('admits on-color cards clearing the threshold, Legends included', () => {
		expect(run('legends:rr').slugs).toEqual(['red-unit', 'red-legend']);
	});

	it('negates via the generic not node', () => {
		expect(run('-legends:rr').slugs).toEqual(['blue-program']);
	});

	it('drops a malformed legends value', () => {
		const { warnings } = run('legends:x2');
		expect(warnings).toMatchObject([{ reason: 'malformed-value' }]);
	});
});

describe('tag and set — dataset-sourced vocabulary', () => {
	it('matches a known tag by slug', () => {
		expect(run('tag:tyger-claws').slugs).toEqual(['red-unit']);
	});

	it('accepts a quoted display value', () => {
		expect(run('tag:"Tyger Claws"').slugs).toEqual(['red-unit']);
	});

	it('drops an unknown tag as malformed', () => {
		const { warnings } = run('tag:nonesuch');
		expect(warnings).toMatchObject([{ reason: 'malformed-value' }]);
	});

	it('reads tag:none as array emptiness', () => {
		expect(run('tag:none').slugs).toEqual(['red-legend']);
	});

	it('treats a quoted "none" as a literal value, not the presence test', () => {
		// Quoting escapes it, same as it escapes "or" and "and" elsewhere in the grammar.
		const { warnings } = run('tag:"none"');
		expect(warnings).toMatchObject([{ reason: 'malformed-value' }]); // no tag literally named "none"
	});

	it('reads tag:has as non-empty', () => {
		expect(run('tag:has').slugs).toEqual(['red-unit', 'blue-program']);
	});

	it('matches a known set by id', () => {
		expect(run('set:ms01-wnc').slugs).toEqual(['red-unit', 'red-legend']);
	});

	it('drops set:none as inapplicable — no card is ever set-less', () => {
		const { warnings, slugs } = run('set:none');
		expect(warnings).toMatchObject([{ reason: 'inapplicable-field' }]);
		expect(slugs).toHaveLength(3);
	});

	it('drops set:has as inapplicable too — never a silent always-true predicate', () => {
		const { warnings, slugs } = run('set:has');
		expect(warnings).toMatchObject([{ reason: 'inapplicable-field' }]);
		expect(slugs).toHaveLength(3);
	});
});

describe('keyword — array emptiness', () => {
	it('reads keyword:none', () => {
		expect(run('keyword:none').slugs).toEqual(['blue-program', 'red-legend']);
	});

	it('reads keyword:has', () => {
		expect(run('keyword:has').slugs).toEqual(['red-unit']);
	});
});

describe('text — bare words, name:, rules:', () => {
	it('matches a bare word against the combined haystack', () => {
		expect(run('unit').slugs).toEqual(['red-unit']);
	});

	it('scopes name: to the name field only', () => {
		expect(run('name:legend').slugs).toEqual(['red-legend']);
	});

	it('drops name:none as inapplicable — no card has an empty name', () => {
		const { warnings } = run('name:none');
		expect(warnings).toMatchObject([{ reason: 'inapplicable-field' }]);
	});

	it('treats a bare word "none" as a literal search term, not a presence test', () => {
		const { warnings, predicate } = run('none');
		expect(warnings).toEqual([]);
		expect(predicate).toMatchObject({ kind: 'text', query: 'none' });
	});

	it('reads rules:none as the rules-haystack-empty check', () => {
		expect(run('rules:none').predicate).toMatchObject({ kind: 'text', scope: 'rules', empty: true });
	});

	it('treats rules:"none" as a literal quoted value, not the presence test', () => {
		// Quoting escapes it, same as it escapes "or" and "and" elsewhere in the grammar.
		const { predicate, warnings } = run('rules:"none"');
		expect(warnings).toEqual([]);
		expect(predicate).toMatchObject({ kind: 'text', scope: 'rules', query: 'none' });
		expect(predicate).not.toMatchObject({ empty: true });
	});

	it('accepts a regex pattern scoped to text', () => {
		expect(run('/^Red/').slugs).toEqual(['red-unit', 'red-legend']);
	});

	it('rejects an unsafe regex pattern as invalid-regex', () => {
		const { warnings, slugs } = run('/(a+)+/');
		expect(warnings).toMatchObject([{ reason: 'invalid-regex' }]);
		expect(slugs).toHaveLength(3);
	});
});

describe('eddiable', () => {
	it('reads true and false', () => {
		expect(run('eddiable:true').slugs).toEqual([]);
		expect(run('eddiable:false').slugs).toHaveLength(3);
	});

	it('drops eddiable:none as inapplicable — never null', () => {
		const { warnings } = run('eddiable:none');
		expect(warnings).toMatchObject([{ reason: 'inapplicable-field' }]);
	});
});

describe('flattening a redundant parenthesised AND, for chip representability', () => {
	it('does not hide a facet behind nesting someone did not need to type', () => {
		const { predicate } = run('(c:red type:legend) tag:tyger-claws');
		expect(predicate).toMatchObject({ kind: 'and', children: [{}, {}, {}] });
		const view = readChipView(predicate, dataset);
		expect(view.colors).toEqual({ interactive: true, value: ['Red'] });
		expect(view.cardTypes).toEqual({ interactive: true, value: ['Legend'] });
		expect(view.tags).toEqual({ interactive: true, value: ['Tyger Claws'] });
	});
});

describe('degrading to no filter', () => {
	it('degrades a query with only bad clauses to matching everything, with a warning', () => {
		const { slugs, warnings } = run('color:chartreuse cost:banana');
		expect(slugs).toHaveLength(3);
		expect(warnings.length).toBeGreaterThan(0);
	});

	it('degrades an empty source to the all predicate', () => {
		expect(run('').predicate).toEqual({ kind: 'all' });
	});
});
