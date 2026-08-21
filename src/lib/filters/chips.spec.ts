/**
 * Chip representability (spec §9): per-facet, not per-query; read-only rather than rewritten or
 * hidden; representability tracks what the actual control can produce, not just the tree shape.
 */
import { describe, expect, it } from 'vitest';
import { createDataset } from '#lib/cards/dataset.js';
import { makeCard, makeSnapshot } from '#lib/cards/fixtures.js';
import { and, type Predicate } from './predicate.js';
import { readChipView } from './chips.js';

const dataset = createDataset(makeSnapshot([makeCard()]));

describe('an absent facet', () => {
	it('is interactive, empty', () => {
		const view = readChipView({ kind: 'all' }, dataset);
		expect(view.colors).toEqual({ interactive: true, value: [] });
		expect(view.cost).toEqual({
			interactive: true,
			value: { min: null, max: null, includeNull: true }
		});
	});
});

describe('a single top-level leaf', () => {
	it('is interactive with its value', () => {
		const view = readChipView({ kind: 'color', values: ['Red', 'Blue'] }, dataset);
		expect(view.colors).toEqual({ interactive: true, value: ['Red', 'Blue'] });
	});

	it('holds for each facet independently across a real AND', () => {
		const tree = and([
			{ kind: 'color', values: ['Red'] },
			{ kind: 'cardType', values: ['Legend'] },
			{ kind: 'numeric', field: 'cost', min: 2, max: 4, includeNull: false }
		]);
		const view = readChipView(tree, dataset);
		expect(view.colors).toEqual({ interactive: true, value: ['Red'] });
		expect(view.cardTypes).toEqual({ interactive: true, value: ['Legend'] });
		expect(view.cost).toEqual({ interactive: true, value: { min: 2, max: 4, includeNull: false } });
		expect(view.power).toEqual({
			interactive: true,
			value: { min: null, max: null, includeNull: true }
		});
	});
});

describe('a negated facet', () => {
	it('goes read-only', () => {
		const view = readChipView(
			{ kind: 'not', child: { kind: 'cardType', values: ['Legend'] } },
			dataset
		);
		expect(view.cardTypes).toEqual({ interactive: false });
	});
});

describe("ticket 09's own worked example", () => {
	it('(t:legend or c:red) -k:blocker leaves Type, Color and Keyword all read-only', () => {
		const tree: Predicate = and([
			{
				kind: 'or',
				children: [
					{ kind: 'cardType', values: ['Legend'] },
					{ kind: 'color', values: ['Red'] }
				]
			},
			{ kind: 'not', child: { kind: 'keyword', values: ['Blocker'] } }
		]);
		const view = readChipView(tree, dataset);
		expect(view.cardTypes).toEqual({ interactive: false });
		expect(view.colors).toEqual({ interactive: false });
		expect(view.keywords).toEqual({ interactive: false });
	});
});

describe('an OR merged at compile time', () => {
	it('is interactive — the merge is exactly what keeps multi-select representable', () => {
		// `c:red or c:blue` compiles to one leaf (compile.ts's OR-merge), not an `or` node — this
		// is what a real query built from clicking two color chips would produce.
		const view = readChipView({ kind: 'color', values: ['Red', 'Blue'] }, dataset);
		expect(view.colors).toEqual({ interactive: true, value: ['Red', 'Blue'] });
	});

	it('an or that mixes facet kinds blocks every kind it touches, not just one', () => {
		const tree: Predicate = {
			kind: 'or',
			children: [
				{ kind: 'color', values: ['Red'] },
				{ kind: 'cardType', values: ['Legend'] }
			]
		};
		const view = readChipView(tree, dataset);
		expect(view.colors).toEqual({ interactive: false });
		expect(view.cardTypes).toEqual({ interactive: false });
	});
});

describe('duplicate top-level leaves of the same facet', () => {
	it('is not representable — the chip control can only ever produce one', () => {
		const tree: Predicate = {
			kind: 'and',
			children: [
				{ kind: 'cardType', values: ['Legend'] },
				{ kind: 'cardType', values: ['Unit'] }
			]
		};
		expect(readChipView(tree, dataset).cardTypes).toEqual({ interactive: false });
	});
});

describe('numeric fields', () => {
	it('is read-only when isolating the null bucket alone — the thumbs can never produce min > max', () => {
		const view = readChipView(
			{ kind: 'numeric', field: 'cost', min: 1, max: 0, includeNull: true },
			dataset
		);
		expect(view.cost).toEqual({ interactive: false });
	});

	it('keeps cost, power and ram independently blocked', () => {
		const tree = and([
			{ kind: 'not', child: { kind: 'numeric', field: 'cost', min: 1, max: 0, includeNull: true } },
			{ kind: 'numeric', field: 'power', min: 0, max: 15, includeNull: false }
		]);
		const view = readChipView(tree, dataset);
		expect(view.cost).toEqual({ interactive: false });
		expect(view.power).toEqual({
			interactive: true,
			value: { min: 0, max: 15, includeNull: false }
		});
	});
});

describe('tag and keyword emptiness', () => {
	it('is read-only for tag:none/tag:has — no checkbox expresses array emptiness', () => {
		expect(readChipView({ kind: 'classification', values: [], empty: true }, dataset).tags).toEqual(
			{
				interactive: false
			}
		);
		expect(readChipView({ kind: 'keyword', values: [], empty: false }, dataset).keywords).toEqual({
			interactive: false
		});
	});
});

describe('legends: the colored RAM budget', () => {
	it('reads a reachable budget back into legend colors', () => {
		const view = readChipView(
			{ kind: 'ramBudget', budget: { Red: 4, Blue: 2, Green: 0, Yellow: 0 } },
			dataset
		);
		expect(view.legendColors).toEqual({ interactive: true, value: ['Red', 'Red', 'Blue'] });
	});

	it('is read-only for a budget no three-slot control can produce', () => {
		const view = readChipView(
			{ kind: 'ramBudget', budget: { Red: 3, Blue: 0, Green: 0, Yellow: 0 } },
			dataset
		);
		expect(view.legendColors).toEqual({ interactive: false });
	});

	it('is read-only when a budget needs more than three slots', () => {
		const view = readChipView(
			{ kind: 'ramBudget', budget: { Red: 8, Blue: 0, Green: 0, Yellow: 0 } },
			dataset
		);
		expect(view.legendColors).toEqual({ interactive: false });
	});
});

describe('eddiable', () => {
	it('is interactive for true, false, and absent', () => {
		expect(readChipView({ kind: 'eddiable', value: true }, dataset).eddiable).toEqual({
			interactive: true,
			value: true
		});
		expect(readChipView({ kind: 'all' }, dataset).eddiable).toEqual({
			interactive: true,
			value: null
		});
	});
});
