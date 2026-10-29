/**
 * The curated Set Identifier map.
 *
 * The source API does not expose the identifier printed on a card at all — its `set.code` is
 * a slugified set *name*. So the mapping from API set to printed Set Identifier is curated
 * here, and ingest asserts that every API set code it sees has an entry (`assertions.ts`).
 *
 * Twenty-four API sets collapse to **thirteen** printed identifiers: the API models retail and beta
 * as separate sets, which is its own invention, and mirrors retail sets in French under a `-fr`
 * code (see `API_SET_CODE_TO_LOCALE`). On the cards they carry the identical printed
 * identifier and differ only by a `β` prefix on the Collector Number — see CONTEXT.md,
 * "Print Treatment". A fourteenth, `MS02-BBR`, is a Main Set that is Announced: curated here
 * ahead of any API set or card, which is the one thing ingest lets a Set do.
 *
 * Whether a Set is a Main, Derivative or Misc Set is **not curated** — it is derived from what
 * the Set contains (`deriveSets`), except that a printed `MS` Category is what makes a Set Main.
 *
 * `prereleaseretail` looked like `prereleasebeta`'s retail twin by the same naming pattern, but
 * isn't: unlike every real retail/beta pair, the two don't share collector numbers 1:1 (Royce is
 * `002` in one and `003` in the other) and neither is prefixed with `β`. Checked against the
 * actual card art rather than assumed — it's printed `PRR02 - WNC`, a second, distinct
 * Prerelease Set, not a Print Treatment of `PRR01-WNC`. `unique-printing-keys`
 * (`assertions.ts`) is what would have caught it here had it shipped mapped to `PRR01-WNC`.
 *
 * Neither component identifies a Set alone: `WNC` spans three categories and `PRM` spans
 * three sets. The pair is the identity, which is why `id` is `<Category>-<Set Code>`.
 */
import * as v from 'valibot';
import { DEFAULT_LOCALE, type Locale } from './vocabulary.ts';

/**
 * What a Set *is*, derived from its contents at ingest rather than curated (`derive.ts`,
 * `deriveSets`): a Main Set by its printed Category, a Derivative Set by overlapping one Main
 * Set, a Misc Set by spanning several. See CONTEXT.md.
 */
export const SetKindSchema = v.picklist(['main', 'derivative', 'misc'], 'not a known set kind');
export type SetKind = v.InferOutput<typeof SetKindSchema>;

/** `MS01`, `MS02` — the Category that marks a Set as a Main Set. */
export function isMainSetCategory(category: string): boolean {
	return /^MS\d+$/.test(category);
}

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
	/**
	 * Curated, free text, and only ever for a Main Set that is Announced — a season, not a date,
	 * because that is all anyone has said. Ignored once the Set has printings.
	 */
	releaseWindow: v.nullable(v.pipe(v.string(), v.nonEmpty())),
	/** Where the Set was announced; shown beside `releaseWindow` for the same reason. */
	announcement: v.nullable(v.pipe(v.string(), v.url()))
});
export type SetIdentifier = v.InferOutput<typeof SetIdentifierSchema>;

type CuratedSet = Omit<SetIdentifier, 'printed' | 'releaseWindow' | 'announcement'> &
	Partial<Pick<SetIdentifier, 'releaseWindow' | 'announcement'>>;

const CURATED: readonly CuratedSet[] = [
	{
		id: 'MS01-WNC',
		category: 'MS01',
		setCode: 'WNC',
		cycle: 'A',
		name: 'Welcome to Night City'
	},
	{
		id: 'MS02-BBR',
		category: 'MS02',
		setCode: 'BBR',
		// Unknown — WNC is `[A]` but the source exposes no cycle data, so nothing is guessed.
		cycle: null,
		name: 'Edgerunners: Burn Bright',
		releaseWindow: 'Spring 2027',
		announcement: 'https://cyberpunktcg.com/blog/set-2-announcement'
	},
	{
		id: 'SD01-HEI',
		category: 'SD01',
		setCode: 'HEI',
		cycle: 'A',
		name: 'The Heist'
	},
	{
		id: 'SD02-EBP',
		category: 'SD02',
		setCode: 'EBP',
		cycle: 'A',
		name: 'Embracing Power'
	},
	{
		id: 'PRM-DD1',
		category: 'PRM',
		setCode: 'DD1',
		cycle: 'A',
		name: 'Merc Demo Deck'
	},
	{
		id: 'PRM-DD2',
		category: 'PRM',
		setCode: 'DD2',
		cycle: 'A',
		name: 'Arasaka Demo Deck'
	},
	{
		id: 'PRM-WNC',
		category: 'PRM',
		setCode: 'WNC',
		cycle: 'A',
		name: 'Box Toppers'
	},
	{
		id: 'PRR01-WNC',
		category: 'PRR01',
		setCode: 'WNC',
		cycle: null,
		name: 'Prerelease (Beta)'
	},
	{
		id: 'PRR02-WNC',
		category: 'PRR02',
		setCode: 'WNC',
		cycle: null,
		name: 'Prerelease (Retail)'
	},
	{
		id: 'EOR01-WNC',
		category: 'EOR01',
		setCode: 'WNC',
		cycle: null,
		name: 'Edgerunner Open Season 1'
	},
	{
		id: 'PRM01',
		category: 'PRM01',
		setCode: null,
		cycle: null,
		name: 'Set 1 Promos'
	},
	{
		id: 'NCB01-WNC',
		category: 'NCB01',
		setCode: 'WNC',
		cycle: null,
		name: 'Night City Brawl Season 1'
	},
	{
		id: 'NCS01-WNC',
		category: 'NCS01',
		setCode: 'WNC',
		cycle: null,
		name: 'Night City Showdown Season 1'
	},
	{
		id: 'JDG-WNC',
		category: 'JDG',
		setCode: 'WNC',
		cycle: null,
		name: 'Judge Promos'
	}
];

/** `<Category> - <Set Code> [<Cycle>]`, skipping absent components. */
function printedForm(set: CuratedSet): string {
	const head = set.setCode === null ? set.category : `${set.category} - ${set.setCode}`;
	return set.cycle === null ? head : `${head} [${set.cycle}]`;
}

export const SET_IDENTIFIERS: readonly SetIdentifier[] = CURATED.map((set) => ({
	...set,
	releaseWindow: set.releaseWindow ?? null,
	announcement: set.announcement ?? null,
	printed: printedForm(set)
}));

/** API `set.code` → printed Set Identifier id. Retail and beta share one entry. */
export const API_SET_CODE_TO_SET_ID: Readonly<Record<string, string>> = {
	welcometonightcityretail: 'MS01-WNC',
	welcometonightcitybeta: 'MS01-WNC',
	'welcometonightcityretail-fr': 'MS01-WNC',
	theheistretailstarterdeck: 'SD01-HEI',
	'theheistretailstarterdeck-fr': 'SD01-HEI',
	theheistbetastarterdeck: 'SD01-HEI',
	embracingpowerretailstarterdeck: 'SD02-EBP',
	'embracingpowerretailstarterde-fr': 'SD02-EBP',
	embracingpowerbetastarterdeck: 'SD02-EBP',
	mercdemodeck: 'PRM-DD1',
	arasakademodeck: 'PRM-DD2',
	boxtoppersretail: 'PRM-WNC',
	'boxtoppersretail-fr': 'PRM-WNC',
	boxtoppersbeta: 'PRM-WNC',
	prereleasebeta: 'PRR01-WNC',
	prereleaseretail: 'PRR02-WNC',
	// Sic: the upper-case locale suffix on these three; `embracingpower…de-fr` is truncated.
	'prereleaseretail-FR': 'PRR02-WNC',
	edgerunneropens1: 'EOR01-WNC',
	PRM01: 'PRM01',
	nightcitybrawls1: 'NCB01-WNC',
	'nightcitybrawls1-FR': 'NCB01-WNC',
	nightcityshowdowns1: 'NCS01-WNC',
	'nightcityshowdowns1-FR': 'NCS01-WNC',
	judgepromos: 'JDG-WNC'
};

/**
 * API `set.code` → Locale, curated for the handful of codes that aren't `DEFAULT_LOCALE`. A
 * code absent here is assumed English rather than requiring every existing entry to be listed.
 */
export const API_SET_CODE_TO_LOCALE: Readonly<Record<string, Locale>> = {
	'welcometonightcityretail-fr': 'fr',
	'theheistretailstarterdeck-fr': 'fr',
	'embracingpowerretailstarterde-fr': 'fr',
	'boxtoppersretail-fr': 'fr',
	'prereleaseretail-FR': 'fr',
	'nightcitybrawls1-FR': 'fr',
	'nightcityshowdowns1-FR': 'fr'
};

export function localeForApiSetCode(code: string): Locale {
	return API_SET_CODE_TO_LOCALE[code] ?? DEFAULT_LOCALE;
}

/**
 * The one API set code that is the ordering reference: Welcome to Night City's retail printing
 * run. Ingest derives Color and Card Type display order from this run's collector-number
 * sequence — the sequence has to come from a single unduplicated run, not from the Set, or beta
 * reprints interleave. Pinned to this run for good rather than to "the newest Main Set": the
 * order is a game-wide fact, and re-deriving it from a later release would re-sort every deck.
 */
export const ORDERING_API_SET_CODE = 'welcometonightcityretail';

const BY_ID = new Map(SET_IDENTIFIERS.map((set) => [set.id, set]));

export function findSetIdentifier(id: string): SetIdentifier | undefined {
	return BY_ID.get(id);
}
