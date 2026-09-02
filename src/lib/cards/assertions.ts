/**
 * The checks that fail the build.
 *
 * The source API is undocumented, silently ignores unknown query params, and has been observed
 * changing within hours. So every assumption this project makes about it is asserted here, and
 * a violation stops the build rather than producing a plausible-looking wrong dataset.
 *
 * Violations are *returned*, not thrown, for two reasons: one run reports every problem
 * instead of the first, and each rule becomes independently testable — which is the point,
 * since an assertion nobody has seen fail is an assertion nobody has verified.
 *
 * The most important group is the always-empty fields. `keywords[]`, `flavor_text`, `finish`
 * and a constant `legality` are empty *today*; we derive substitutes for two of them. If one
 * starts carrying values, our derivation has become a competing source of truth and the
 * decision has to be revisited — silently preferring ours would be the wrong default.
 *
 * `subname` is not in that group: it *has* been observed carrying a value (2026-09, alongside
 * netdeck.gg's own deckbuilder launch, rolled back within hours) and that shape is legitimate
 * rather than a violation — see `display-name-reconstructs` below.
 */
import {
	runOrder,
	baseSetSequence,
	cardTypeRunsWithinColors,
	deriveRamPerLegend,
	deriveSets
} from './derive.ts';
import { extractKeywords } from './rules-text.ts';
import type { Card, NetdeckCard } from './schema.ts';
import { API_SET_CODE_TO_SET_ID } from './sets.ts';
import { CARD_TYPES, COLORS } from './vocabulary.ts';

export type Violation = {
	/** Stable identifier for the rule, so a test can name the rule it is breaking. */
	check: string;
	detail: string;
};

function duplicates<T>(values: readonly T[]): T[] {
	const seen = new Set<T>();
	const repeated = new Set<T>();
	for (const value of values) {
		if (seen.has(value)) repeated.add(value);
		seen.add(value);
	}
	return [...repeated];
}

/** Checks that only make sense against the API's own shape, before normalization. */
export function checkRawInvariants(cards: readonly NetdeckCard[]): Violation[] {
	const violations: Violation[] = [];
	const add = (check: string, detail: string) => violations.push({ check, detail });

	const repeatedSlugs = duplicates(cards.map((card) => card.slug));
	if (repeatedSlugs.length > 0) add('unique-slugs', `repeated slugs: ${repeatedSlugs.join(', ')}`);

	// Checked on `display_name`, not `name` — `name` alone stopped being unique the one time the
	// API split a Legend's subtitle into `subname` (see `display-name-reconstructs` below).
	// `display_name` stayed the full, unique form across both shapes.
	const repeatedNames = duplicates(cards.map((card) => card.display_name));
	if (repeatedNames.length > 0)
		add(
			'unique-names',
			`repeated display names: ${repeatedNames.join(', ')} — a Card is a mechanical identity, ` +
				`so two cards sharing a full name means the model no longer holds`
		);

	// The relationship, not `display_name === name`: a 2026-09 rollout (rolled back within hours)
	// briefly populated `subname` and split it out of `name`, while `display_name` kept the full
	// form. That shape is legitimate, not a violation — only a `display_name` that reconstructs
	// from neither form is. `normalize.ts` sources `Card.name` from `display_name` precisely
	// because it is the field that held across both.
	const misreconstructed = cards.filter(
		(card) =>
			card.display_name !== (card.subname === null ? card.name : `${card.name} — ${card.subname}`)
	);
	if (misreconstructed.length > 0)
		add(
			'display-name-reconstructs',
			`${misreconstructed.length} card(s) where display_name isn't name (plus " — " + subname ` +
				`when subname is set), first: ${misreconstructed[0].slug}`
		);

	const misidentified = cards.filter((card) => card.external_id !== `cb-${card.slug}`);
	if (misidentified.length > 0)
		add(
			'external-id-derives-from-slug',
			`${misidentified.length} card(s), first: ${misidentified[0].slug}`
		);

	const printless = cards.filter((card) => card.printings.length === 0);
	if (printless.length > 0)
		add('printings-non-empty', `${printless.length} card(s), first: ${printless[0].slug}`);

	const misdefaulted = cards.filter(
		(card) => card.printings.length > 0 && card.printings[0].id !== card.selected_printing_id
	);
	if (misdefaulted.length > 0)
		add(
			'default-printing-is-first',
			`${misdefaulted.length} card(s), first: ${misdefaulted[0].slug}`
		);

	const withKeywords = cards.filter((card) => card.keywords.length > 0);
	if (withKeywords.length > 0)
		add(
			'always-empty-keywords',
			`${withKeywords.length} card(s) now populate keywords[] — we derive keywords from ` +
				`rules_text, so this is now a competing source of truth`
		);

	const withFlavor = cards.filter((card) => card.flavor_text !== null);
	if (withFlavor.length > 0)
		add(
			'always-empty-flavor-text',
			`${withFlavor.length} card(s) now populate flavor_text — we extract flavour out of ` +
				`rules_text, so the split heuristic must be revisited`
		);

	const legalities = [...new Set(cards.map((card) => card.legality))];
	if (legalities.length > 1 || (legalities.length === 1 && legalities[0] !== 'legal'))
		add(
			'constant-legality',
			`legality now takes ${legalities.length} value(s): ${legalities.join(', ')}`
		);

	const withFinish = cards.flatMap((card) =>
		card.printings.filter((printing) => printing.finish !== null)
	);
	if (withFinish.length > 0)
		add('always-empty-finish', `${withFinish.length} printing(s), first: ${withFinish[0].id}`);

	const unknownKeywords = [
		...new Set(cards.flatMap((card) => extractKeywords(card.rules_text).unknown))
	].sort();
	if (unknownKeywords.length > 0)
		add(
			'known-keywords',
			`unrecognised brace tokens: ${unknownKeywords.map((k) => `{${k}}`).join(', ')}`
		);

	const unmappedSetCodes = [
		...new Set(
			cards
				.flatMap((card) => card.printings.map((printing) => printing.set.code))
				.filter((code) => API_SET_CODE_TO_SET_ID[code] === undefined)
		)
	].sort();
	if (unmappedSetCodes.length > 0)
		add(
			'set-code-is-mapped',
			`no curated Set Identifier for: ${unmappedSetCodes.join(', ')} — the printed identifier ` +
				`is not exposed by the API, so it has to be added to sets.ts by hand`
		);

	return violations;
}

/** Checks on our own model, including the derived orderings from the spec's §2.5. */
export function checkModelInvariants(cards: readonly Card[]): Violation[] {
	const violations: Violation[] = [];
	const add = (check: string, detail: string) => violations.push({ check, detail });

	const sequence = baseSetSequence(cards);
	const colors = runOrder(sequence.map((entry) => entry.color));
	if (colors.runs !== COLORS.length || colors.order.length !== COLORS.length)
		add(
			'color-forms-four-runs',
			`color forms ${colors.runs} run(s) over ${colors.order.length} value(s) in the Base Set ` +
				`sequence; the derived order is only meaningful at exactly ${COLORS.length}`
		);

	const cardTypes = cardTypeRunsWithinColors(sequence);
	const expectedRuns = COLORS.length * CARD_TYPES.length;
	if (cardTypes.runs !== expectedRuns || cardTypes.order.length !== CARD_TYPES.length)
		add(
			'card-type-forms-sixteen-runs',
			`card type forms ${cardTypes.runs} run(s) over ${cardTypes.order.length} value(s); ` +
				`expected ${expectedRuns} runs (${CARD_TYPES.length} per color)`
		);

	const ram = deriveRamPerLegend(cards);
	if (ram.distinct.length > 1)
		add(
			'ram-per-legend-is-uniform',
			`Legends now provide ${ram.distinct.join(', ')} RAM — the colored budget assumes one ` +
				`value, so three color slots no longer determine a budget`
		);

	const printings = cards.flatMap((card) => card.printings);

	const repeatedKeys = duplicates(printings.map((printing) => printing.key));
	if (repeatedKeys.length > 0)
		add('unique-printing-keys', `repeated printing keys: ${repeatedKeys.join(', ')}`);

	const repeatedIds = duplicates(printings.map((printing) => printing.id));
	if (repeatedIds.length > 0)
		add('unique-printing-ids', `repeated printing ids: ${repeatedIds.join(', ')}`);

	const emptySets = deriveSets(cards).filter((set) => set.printingCount === 0);
	if (emptySets.length > 0)
		add(
			'every-set-has-printings',
			`curated Set(s) with no printings: ${emptySets.map((set) => set.id).join(', ')}`
		);

	const legendsWithoutSubtitle = cards.filter(
		(card) => card.cardType === 'Legend' && card.name.split(' — ').length !== 2
	);
	if (legendsWithoutSubtitle.length > 0)
		add(
			'legend-name-has-subtitle',
			`${legendsWithoutSubtitle.length} Legend(s) don't split into exactly one "Name — Subtitle" ` +
				`pair on " — ", first: ${legendsWithoutSubtitle[0].slug} — legendBaseName() assumes this ` +
				`shape to catch same-base-name Legend conflicts (comprehensive rules, "Card Data > Name")`
		);

	return violations;
}

/**
 * Slugs are the Card Id — they are in every URL and will be in every decklist. A slug
 * disappearing breaks links permanently, so it fails the build; a slug appearing is just the
 * dataset growing.
 */
export function checkSlugStability(
	previous: readonly string[],
	next: readonly string[]
): Violation[] {
	const present = new Set(next);
	const missing = previous.filter((slug) => !present.has(slug));
	if (missing.length === 0) return [];

	return [
		{
			check: 'slug-stability',
			detail: `slug(s) present in the previous snapshot and gone from this one: ${missing.join(', ')}`
		}
	];
}

/** Formats violations for a build log, newest concern first. */
export function formatViolations(violations: readonly Violation[]): string {
	return violations.map((violation) => `  ✗ ${violation.check}: ${violation.detail}`).join('\n');
}
