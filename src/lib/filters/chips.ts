/**
 * Chip representability (spec §9): the language is a superset of the chips, so a compiled
 * query sometimes has no chip rendering. This reads a `Predicate` back into a per-facet view —
 * each facet either **interactive** (its current value, editable) or **read-only** (present in
 * the query in a shape the chip can't reflect).
 *
 * Representability is checked **per facet, not per query**: a facet is interactive iff the tree
 * has exactly one top-level leaf of its kind, with no enclosing `or`/`not`, in a configuration
 * the facet's actual control can produce.
 */
import type { Dataset } from '#lib/cards/dataset.js';
import type { CardType, Color, Keyword, Rarity } from '#lib/cards/vocabulary.js';
import { isEmptyBudget, type ColorBudget } from './budget.js';
import type { Predicate } from './predicate.js';

export type NumericRange = { min: number | null; max: number | null; includeNull: boolean };
export const UNFILTERED_RANGE: NumericRange = { min: null, max: null, includeNull: true };

export type FacetView<T> = { interactive: true; value: T } | { interactive: false };

export type ChipView = {
	colors: FacetView<readonly Color[]>;
	cardTypes: FacetView<readonly CardType[]>;
	keywords: FacetView<readonly Keyword[]>;
	tags: FacetView<readonly string[]>;
	rarities: FacetView<readonly Rarity[]>;
	setIds: FacetView<readonly string[]>;
	eddiable: FacetView<boolean | null>;
	cost: FacetView<NumericRange>;
	power: FacetView<NumericRange>;
	ram: FacetView<NumericRange>;
	legendColors: FacetView<readonly Color[]>;
};

function topLevelChildren(predicate: Predicate): readonly Predicate[] {
	if (predicate.kind === 'all') return [];
	if (predicate.kind === 'and') return predicate.children;
	return [predicate];
}

/** `numeric` alone isn't a specific facet — cost/power/ram all share that `kind` — so blocking
 * has to track them separately, unlike every other leaf kind which names exactly one facet. */
type FacetKey = Predicate['kind'] | `numeric:cost` | `numeric:power` | `numeric:ram`;

function leafKey(predicate: Predicate): FacetKey {
	return predicate.kind === 'numeric' ? `numeric:${predicate.field}` : predicate.kind;
}

function collectLeafKinds(predicate: Predicate, into: Set<FacetKey>): void {
	if (predicate.kind === 'and' || predicate.kind === 'or') {
		for (const child of predicate.children) collectLeafKinds(child, into);
		return;
	}
	if (predicate.kind === 'not') {
		collectLeafKinds(predicate.child, into);
		return;
	}
	into.add(leafKey(predicate));
}

/** Every leaf kind that sits under an `or` or a `not` anywhere at the top level — the chips
 * can't reflect any of these, regardless of how many top-level children there are. */
function blockedKinds(children: readonly Predicate[]): Set<FacetKey> {
	const blocked = new Set<FacetKey>();
	for (const child of children) {
		if (child.kind === 'or' || child.kind === 'not') collectLeafKinds(child, blocked);
	}
	return blocked;
}

function isColor(p: Predicate): p is Extract<Predicate, { kind: 'color' }> {
	return p.kind === 'color';
}
function isCardType(p: Predicate): p is Extract<Predicate, { kind: 'cardType' }> {
	return p.kind === 'cardType';
}
function isKeyword(p: Predicate): p is Extract<Predicate, { kind: 'keyword' }> {
	return p.kind === 'keyword';
}
function isClassification(p: Predicate): p is Extract<Predicate, { kind: 'classification' }> {
	return p.kind === 'classification';
}
function isRarity(p: Predicate): p is Extract<Predicate, { kind: 'rarity' }> {
	return p.kind === 'rarity';
}
function isSet(p: Predicate): p is Extract<Predicate, { kind: 'set' }> {
	return p.kind === 'set';
}
function isEddiable(p: Predicate): p is Extract<Predicate, { kind: 'eddiable' }> {
	return p.kind === 'eddiable';
}
function isNumeric(
	field: 'cost' | 'power' | 'ram'
): (p: Predicate) => p is Extract<Predicate, { kind: 'numeric' }> {
	return (p: Predicate): p is Extract<Predicate, { kind: 'numeric' }> =>
		p.kind === 'numeric' && p.field === field;
}
function isRamBudget(p: Predicate): p is Extract<Predicate, { kind: 'ramBudget' }> {
	return p.kind === 'ramBudget';
}

/** A plain values list — always producible by ticking the matching chips, in any subset. */
function readValueList<K extends Predicate['kind'], T extends string>(
	children: readonly Predicate[],
	blocked: Set<FacetKey>,
	kind: K,
	guard: (p: Predicate) => p is Extract<Predicate, { kind: K; values: readonly T[] }>
): FacetView<readonly T[]> {
	if (blocked.has(kind)) return { interactive: false };
	const matches = children.filter(guard);
	if (matches.length === 0) return { interactive: true, value: [] };
	if (matches.length > 1) return { interactive: false };
	return { interactive: true, value: matches[0].values };
}

/** Tag and Keyword additionally use an `empty` flag (`tag:none`/`tag:has`) that no checkbox in
 * the list can express — "no tags at all" or "some tag, unspecified" isn't a tickable state.
 * Two concrete functions rather than one generic one: a generic discriminant extraction over
 * `Predicate` doesn't narrow cleanly at this K, and there are only ever two call sites. */
function readKeywords(
	children: readonly Predicate[],
	blocked: Set<FacetKey>
): FacetView<readonly Keyword[]> {
	if (blocked.has('keyword')) return { interactive: false };
	const matches = children.filter(isKeyword);
	if (matches.length === 0) return { interactive: true, value: [] };
	if (matches.length > 1) return { interactive: false };
	if (matches[0].empty !== undefined) return { interactive: false };
	return { interactive: true, value: matches[0].values };
}

function readTags(
	children: readonly Predicate[],
	blocked: Set<FacetKey>
): FacetView<readonly string[]> {
	if (blocked.has('classification')) return { interactive: false };
	const matches = children.filter(isClassification);
	if (matches.length === 0) return { interactive: true, value: [] };
	if (matches.length > 1) return { interactive: false };
	if (matches[0].empty !== undefined) return { interactive: false };
	return { interactive: true, value: matches[0].values };
}

function readNumeric(
	children: readonly Predicate[],
	blocked: Set<FacetKey>,
	field: 'cost' | 'power' | 'ram'
): FacetView<NumericRange> {
	if (blocked.has(`numeric:${field}`)) return { interactive: false };
	const matches = children.filter(isNumeric(field));
	if (matches.length === 0) return { interactive: true, value: UNFILTERED_RANGE };
	if (matches.length > 1) return { interactive: false };
	const { min, max, includeNull } = matches[0];
	// The dual-thumb slider clamps `min <= max`; it can never isolate the null bucket alone
	// (spec §3.5's `field:none`, `min > max` by construction) — that shape is a real, correct
	// predicate, just not one these two thumbs can produce.
	if (min !== null && max !== null && min > max) return { interactive: false };
	return { interactive: true, value: { min, max, includeNull } };
}

function readEddiable(
	children: readonly Predicate[],
	blocked: Set<FacetKey>
): FacetView<boolean | null> {
	if (blocked.has('eddiable')) return { interactive: false };
	const matches = children.filter(isEddiable);
	if (matches.length === 0) return { interactive: true, value: null };
	if (matches.length > 1) return { interactive: false };
	return { interactive: true, value: matches[0].value };
}

/** Reachable iff some combination of up to three Legend color slots at `ramPerLegend` each
 * produces this exact budget — every color's total a non-negative multiple of `ramPerLegend`,
 * summing to at most three slots (spec §3.3's own "0/2/4/6 per color" observation, generalized). */
function isSlotReachable(budget: ColorBudget, ramPerLegend: number): boolean {
	let slots = 0;
	for (const total of Object.values(budget)) {
		if (total < 0 || total % ramPerLegend !== 0) return false;
		slots += total / ramPerLegend;
	}
	return slots <= 3;
}

function readLegendColors(
	children: readonly Predicate[],
	blocked: Set<FacetKey>,
	dataset: Dataset
): FacetView<readonly Color[]> {
	if (blocked.has('ramBudget')) return { interactive: false };
	const matches = children.filter(isRamBudget);
	if (matches.length === 0) return { interactive: true, value: [] };
	if (matches.length > 1) return { interactive: false };

	const { budget } = matches[0];
	if (isEmptyBudget(budget)) return { interactive: true, value: [] };
	if (!isSlotReachable(budget, dataset.ramPerLegend)) return { interactive: false };

	const colors: Color[] = [];
	for (const color of dataset.colorOrder) {
		for (let i = 0; i < budget[color] / dataset.ramPerLegend; i += 1) colors.push(color);
	}
	return { interactive: true, value: colors };
}

export function readChipView(predicate: Predicate, dataset: Dataset): ChipView {
	const children = topLevelChildren(predicate);
	const blocked = blockedKinds(children);

	return {
		colors: readValueList(children, blocked, 'color', isColor),
		cardTypes: readValueList(children, blocked, 'cardType', isCardType),
		keywords: readKeywords(children, blocked),
		tags: readTags(children, blocked),
		rarities: readValueList(children, blocked, 'rarity', isRarity),
		setIds: readValueList(children, blocked, 'set', isSet),
		eddiable: readEddiable(children, blocked),
		cost: readNumeric(children, blocked, 'cost'),
		power: readNumeric(children, blocked, 'power'),
		ram: readNumeric(children, blocked, 'ram'),
		legendColors: readLegendColors(children, blocked, dataset)
	};
}
