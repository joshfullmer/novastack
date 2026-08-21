/**
 * The field table for the query language — one row per `Predicate` leaf kind, keyed by the
 * keyword a reader types. This is the single source of truth for the parser *and* the `/syntax`
 * page's generated tables (spec §11): the page renders straight from `FIELDS`, so a new field or
 * alias can't be added to the parser without the page picking it up.
 *
 * Spec: `docs/spec/query-language.md` §3.
 */
import { CARD_TYPES, COLORS, KEYWORDS, RARITY_ORDER } from '#lib/cards/vocabulary.js';

export const FIELD_KINDS = [
	'color',
	'cardType',
	'keyword',
	'tag',
	'cost',
	'power',
	'ram',
	'eddiable',
	'set',
	'rarity',
	'name',
	'rules',
	'text',
	'legends'
] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

export type ValueKind = 'enum' | 'string' | 'numeric' | 'boolean' | 'text' | 'legends';

export type FieldSpec = {
	kind: FieldKind;
	/** The canonical keyword chips always emit — `null` for bare-word text search. */
	canonical: string | null;
	aliases: readonly string[];
	value: ValueKind;
	/** `> < >= <=` and the chained-interval sugar. */
	comparisons: boolean;
	/** Accepts `none`/`has`. */
	nullable: boolean;
	/** The known enum values, in display order, for `value: 'enum'` fields. */
	enum?: readonly string[];
};

export const FIELDS: readonly FieldSpec[] = [
	{
		kind: 'color',
		canonical: 'color',
		aliases: ['c'],
		value: 'enum',
		comparisons: false,
		nullable: false,
		enum: COLORS
	},
	{
		kind: 'cardType',
		canonical: 'type',
		aliases: ['t'],
		value: 'enum',
		comparisons: false,
		nullable: false,
		enum: CARD_TYPES
	},
	{
		kind: 'keyword',
		canonical: 'keyword',
		aliases: ['kw'],
		value: 'enum',
		comparisons: false,
		nullable: true,
		enum: KEYWORDS
	},
	{
		kind: 'tag',
		canonical: 'tag',
		aliases: [],
		value: 'string',
		comparisons: false,
		nullable: true
	},
	{
		kind: 'cost',
		canonical: 'cost',
		aliases: [],
		value: 'numeric',
		comparisons: true,
		nullable: true
	},
	{
		kind: 'power',
		canonical: 'power',
		aliases: ['pow'],
		value: 'numeric',
		comparisons: true,
		nullable: true
	},
	{
		kind: 'ram',
		canonical: 'ram',
		aliases: [],
		value: 'numeric',
		comparisons: true,
		nullable: true
	},
	{
		kind: 'eddiable',
		canonical: 'eddiable',
		aliases: ['ed'],
		value: 'boolean',
		comparisons: false,
		nullable: false
	},
	{
		kind: 'set',
		canonical: 'set',
		aliases: ['s'],
		value: 'string',
		comparisons: false,
		nullable: false
	},
	{
		kind: 'rarity',
		canonical: 'rarity',
		aliases: ['r'],
		value: 'enum',
		comparisons: true,
		nullable: false,
		enum: RARITY_ORDER
	},
	{
		kind: 'name',
		canonical: 'name',
		aliases: [],
		value: 'text',
		comparisons: false,
		nullable: true
	},
	{
		kind: 'rules',
		canonical: 'rules',
		aliases: [],
		value: 'text',
		comparisons: false,
		nullable: true
	},
	// Bare words carry no keyword at all — never looked up by name, only produced directly by
	// the parser when a clause has no `field:` prefix.
	{ kind: 'text', canonical: null, aliases: [], value: 'text', comparisons: false, nullable: true },
	{
		kind: 'legends',
		canonical: 'legends',
		aliases: [],
		value: 'legends',
		comparisons: false,
		nullable: false
	}
];

/** Every field kind eligible for `> < >= <=` and the chained-interval sugar (spec §3.2). */
export const COMPARABLE_FIELDS: readonly FieldKind[] = FIELDS.filter((f) => f.comparisons).map(
	(f) => f.kind
);

/** Case-insensitive keyword → field kind, built once. Bare text has no entry here. */
const KEYWORD_LOOKUP: ReadonlyMap<string, FieldKind> = new Map(
	FIELDS.flatMap((field) =>
		field.canonical === null
			? []
			: [field.canonical, ...field.aliases].map((k) => [k, field.kind] as const)
	)
);

export function lookupField(keyword: string): FieldKind | null {
	return KEYWORD_LOOKUP.get(keyword.toLowerCase()) ?? null;
}

export function fieldSpec(kind: FieldKind): FieldSpec {
	// FIELDS is exhaustive over FieldKind by construction, so this never actually returns
	// undefined — `find` just can't express that in its own type.
	const spec = FIELDS.find((f) => f.kind === kind);
	if (spec === undefined) throw new Error(`unreachable: no FieldSpec for ${kind}`);
	return spec;
}
