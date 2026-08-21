/**
 * The curated Set Identifier map.
 *
 * The source API does not expose the identifier printed on a card at all — its `set.code` is
 * a slugified set *name*. So the mapping from API set to printed Set Identifier is curated
 * here, and ingest asserts that every API set code it sees has an entry (`assertions.ts`).
 *
 * Twelve API sets collapse to **eight** printed identifiers: the API models retail and beta
 * as separate sets, which is its own invention. On the cards they carry the identical printed
 * identifier and differ only by a `β` prefix on the Collector Number — see CONTEXT.md,
 * "Print Treatment".
 *
 * Neither component identifies a Set alone: `WNC` spans three categories and `PRM` spans
 * three sets. The pair is the identity, which is why `id` is `<Category>-<Set Code>`.
 */
import * as v from 'valibot';

export const SetKindSchema = v.picklist(['base', 'derivative'], 'not a known set kind');
export type SetKind = v.InferOutput<typeof SetKindSchema>;

export const SetIdentifierSchema = v.object({
	/** `<Category>-<Set Code>`, or just the Category where there is no Set Code. */
	id: v.pipe(v.string(), v.nonEmpty()),
	category: v.pipe(v.string(), v.nonEmpty()),
	/** Absent on `PRM01`, which prints only a Category. */
	setCode: v.nullable(v.pipe(v.string(), v.nonEmpty())),
	/** Absent on the prerelease run. Believed to govern format rotation; no source data. */
	cycle: v.nullable(v.pipe(v.string(), v.nonEmpty())),
	/** The identifier as printed: `MS01 - WNC [A]`. */
	printed: v.pipe(v.string(), v.nonEmpty()),
	/** Human-readable set name, for grouped controls and the printings gallery. */
	name: v.pipe(v.string(), v.nonEmpty()),
	kind: SetKindSchema
});
export type SetIdentifier = v.InferOutput<typeof SetIdentifierSchema>;

type CuratedSet = Omit<SetIdentifier, 'printed'>;

const CURATED: readonly CuratedSet[] = [
	{
		id: 'MS01-WNC',
		category: 'MS01',
		setCode: 'WNC',
		cycle: 'A',
		name: 'Welcome to Night City',
		kind: 'base'
	},
	{
		id: 'SD01-HEI',
		category: 'SD01',
		setCode: 'HEI',
		cycle: 'A',
		name: 'The Heist',
		kind: 'derivative'
	},
	{
		id: 'SD02-EBP',
		category: 'SD02',
		setCode: 'EBP',
		cycle: 'A',
		name: 'Embracing Power',
		kind: 'derivative'
	},
	{
		id: 'PRM-DD1',
		category: 'PRM',
		setCode: 'DD1',
		cycle: 'A',
		name: 'Merc Demo Deck',
		kind: 'derivative'
	},
	{
		id: 'PRM-DD2',
		category: 'PRM',
		setCode: 'DD2',
		cycle: 'A',
		name: 'Arasaka Demo Deck',
		kind: 'derivative'
	},
	{
		id: 'PRM-WNC',
		category: 'PRM',
		setCode: 'WNC',
		cycle: 'A',
		name: 'Box Toppers',
		kind: 'derivative'
	},
	{
		id: 'PRR01-WNC',
		category: 'PRR01',
		setCode: 'WNC',
		cycle: null,
		name: 'Prerelease',
		kind: 'derivative'
	},
	{
		id: 'PRM01',
		category: 'PRM01',
		setCode: null,
		cycle: null,
		name: 'Set 1 Promos',
		kind: 'derivative'
	}
];

/** `<Category> - <Set Code> [<Cycle>]`, skipping absent components. */
function printedForm(set: CuratedSet): string {
	const head = set.setCode === null ? set.category : `${set.category} - ${set.setCode}`;
	return set.cycle === null ? head : `${head} [${set.cycle}]`;
}

export const SET_IDENTIFIERS: readonly SetIdentifier[] = CURATED.map((set) => ({
	...set,
	printed: printedForm(set)
}));

/** API `set.code` → printed Set Identifier id. Retail and beta share one entry. */
export const API_SET_CODE_TO_SET_ID: Readonly<Record<string, string>> = {
	welcometonightcityretail: 'MS01-WNC',
	welcometonightcitybeta: 'MS01-WNC',
	theheistretailstarterdeck: 'SD01-HEI',
	theheistbetastarterdeck: 'SD01-HEI',
	embracingpowerretailstarterdeck: 'SD02-EBP',
	embracingpowerbetastarterdeck: 'SD02-EBP',
	mercdemodeck: 'PRM-DD1',
	arasakademodeck: 'PRM-DD2',
	boxtoppersretail: 'PRM-WNC',
	boxtoppersbeta: 'PRM-WNC',
	prereleasebeta: 'PRR01-WNC',
	PRM01: 'PRM01'
};

/**
 * The one API set code that is the Base Set's retail printing run. Ingest derives Color and
 * Card Type display order from this run's collector-number sequence — the sequence has to
 * come from a single unduplicated run, not from the Set, or beta reprints interleave.
 */
export const BASE_SET_API_CODE = 'welcometonightcityretail';

const BY_ID = new Map(SET_IDENTIFIERS.map((set) => [set.id, set]));

export function findSetIdentifier(id: string): SetIdentifier | undefined {
	return BY_ID.get(id);
}
