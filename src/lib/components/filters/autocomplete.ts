/**
 * Autocomplete suggestions for the query box (ticket 04,
 * `.scratch/editor-affordances/map.md`): field names/aliases while typing a bare word not
 * preceded by an operator, and — once a recognized enum field's operator has already been typed
 * — that field's fixed-enum values. Dataset-derived values (tags, set codes) are out of scope,
 * per the map's own Not-yet-specified section; only fields `vocabulary.ts` enumerates as a
 * closed set (`value: 'enum'`) get value suggestions.
 *
 * Deliberately not built from `parser.ts`'s AST: the word being completed is, almost by
 * definition, an *in-progress* prefix — not yet a valid clause, which the parser has no reason
 * to represent, and which a dropped-clause warning would only confuse further. This walks
 * `lexer.ts`'s raw token stream instead. The classification rule is the same local, positional
 * check the parser itself uses to tell a field keyword from bare text (a word immediately
 * followed by an operator token) — just read in the other direction: what precedes the word
 * being typed determines whether it's a field-name attempt or an enum-value attempt.
 *
 * Bare-word typing only, and only the two shapes above — completing a field name in the middle
 * of the chained-interval sugar (`1<=ram<=3`) isn't handled (the word there is preceded by an
 * operator, so it reads as a value attempt against whatever "field" the *first* operand looks
 * like, which is never a real field keyword; the net effect is just no suggestions, not a wrong
 * one) — a disclosed simplification, not an oversight, since that shape is rare enough not to
 * warrant its own branch in a first pass.
 */
import { quoteQueryValue, slugifyValue } from '#lib/cards/dataset.js';
import { nextToken, type Span, type Token } from '#lib/query/lexer.js';
import { FIELDS, fieldSpec, lookupField } from '#lib/query/vocabulary.js';

export type Suggestion = { keyword: string; hint?: string; insertText: string };

export type AutocompleteState = {
	kind: 'field' | 'value';
	span: Span;
	suggestions: readonly Suggestion[];
};

/** Every typable keyword (canonical + aliases) paired with its field's canonical form, built
 * once — `vocabulary.ts`'s own `KEYWORD_LOOKUP` is keyed the other way (keyword → `FieldKind`)
 * and isn't exported, so this is a small, separate flattening for autocomplete's own purposes. */
const FIELD_KEYWORDS: readonly { keyword: string; canonical: string }[] = FIELDS.flatMap((field) =>
	field.canonical === null
		? []
		: [
				{ keyword: field.canonical, canonical: field.canonical },
				...field.aliases.map((alias) => ({ keyword: alias, canonical: field.canonical as string }))
			]
);

/** Aliases sort ahead of canonical forms — a deliberate order, not alphabetical happenstance
 * (Josh's call): once someone's typed a query or two, the short alias is what they actually want
 * to reach for, and seeing it land first is what teaches that it exists at all. Alphabetical
 * within each group otherwise, so the order stays predictable rather than tied to `FIELDS`'
 * declaration order. */
function fieldSuggestions(prefix: string): Suggestion[] {
	const lower = prefix.toLowerCase();
	return FIELD_KEYWORDS.filter((k) => k.keyword.toLowerCase().startsWith(lower))
		.map((k) => ({
			keyword: k.keyword,
			hint: k.keyword === k.canonical ? undefined : k.canonical,
			insertText: k.keyword
		}))
		.sort((a, b) => {
			const aIsAlias = a.hint !== undefined;
			const bIsAlias = b.hint !== undefined;
			if (aIsAlias !== bIsAlias) return aIsAlias ? -1 : 1;
			return a.keyword.localeCompare(b.keyword);
		});
}

/** Slug-prefix matching, not literal-prefix: a multi-word enum value's bare/unquoted spelling in
 * the language is its slug (`Nova Rare` → `nova-rare`, spec's own canonical-alias rule from
 * ticket 02 of the closed Query Language map), which is what a bare word being typed actually
 * looks like — matching the raw display text would never fire while typing that form.
 *
 * Suggested and inserted lowercase (`red`, `"go solo"`), not in `vocabulary.ts`'s own display
 * casing (`Red`, `Go Solo`) — Josh's call, thematic: field names/aliases are already all
 * lowercase, and the query language is case-insensitive throughout, so lowercase values read as
 * one consistent typed register rather than switching case mid-suggestion. Chips still write the
 * display-cased form (`query-edit.ts`) — a different mechanism, not something typed by hand, so
 * this doesn't need to match it. */
function valueSuggestions(fieldTok: Token | undefined, prefix: string): Suggestion[] {
	const field = fieldTok?.kind === 'word' ? lookupField(fieldTok.text) : null;
	if (field === null) return [];
	const spec = fieldSpec(field);
	if (spec.value !== 'enum' || spec.enum === undefined) return [];

	const prefixSlug = slugifyValue(prefix);
	return spec.enum
		.filter((value) => slugifyValue(value).startsWith(prefixSlug))
		.map((value) => {
			const lower = value.toLowerCase();
			return { keyword: lower, insertText: quoteQueryValue(lower) };
		});
}

/** Every token in `source`, stopping at EOF — for finding the word the caret sits in and
 * inspecting what precedes it, neither of which survives into the parser's AST once a clause
 * fails, or hasn't finished being typed yet at all. */
function tokenize(source: string): Token[] {
	const tokens: Token[] = [];
	let pos = 0;
	for (;;) {
		const { token, next } = nextToken(source, pos);
		if (token.kind === 'eof') break;
		tokens.push(token);
		pos = next;
	}
	return tokens;
}

/** The autocomplete state for `source` with the caret at `caretPos`, or `null` when there's
 * nothing to suggest — no word under the caret, an empty prefix (nothing typed yet to match
 * against), or a value position on a field with no closed enum. */
export function autocompleteFor(source: string, caretPos: number): AutocompleteState | null {
	const tokens = tokenize(source);
	const index = tokens.findIndex(
		(t) => t.kind === 'word' && t.span[0] <= caretPos && caretPos <= t.span[1]
	);
	if (index === -1) return null;

	const wordTok = tokens[index];
	if (wordTok.kind !== 'word') return null;
	const prefix = source.slice(wordTok.span[0], caretPos);
	if (prefix === '') return null;

	const prevTok = tokens[index - 1];
	const kind: AutocompleteState['kind'] = prevTok?.kind === 'op' ? 'value' : 'field';
	const suggestions =
		kind === 'value' ? valueSuggestions(tokens[index - 2], prefix) : fieldSuggestions(prefix);

	return suggestions.length === 0 ? null : { kind, span: wordTok.span, suggestions };
}
