/**
 * Rules-text segmentation.
 *
 * `rules_text` carries five markup systems and a *misfiled flavour line*. All of it is
 * resolved here, at ingest time, into structured segments — so the renderer becomes a mapping
 * from segment kind to component, holding no game knowledge and no regexes.
 *
 * Two rules are load-bearing:
 *
 * - **A keyword can appear mid-sentence.** 19 of 102 occurrences do, so this cannot be a
 *   "starts-with" check.
 * - **Unmatched ALL-CAPS stays plain text.** A classification added to the game next month
 *   must not be silently mis-styled as something we recognise today; it renders unremarkably
 *   until the vocabulary catches up.
 *
 * A `cardRef` or `classification` segment can only be *constructed* from a successful lookup,
 * so the spec's "every ref resolves" assertion is structural here rather than a check.
 */
import * as v from 'valibot';
import { KEYWORDS, KeywordSchema, SymbolNameSchema, type Keyword } from './vocabulary.ts';

export const SegmentSchema = v.variant(
	'kind',
	[
		v.object({ kind: v.literal('text'), text: v.string() }),
		v.object({ kind: v.literal('keyword'), text: v.string(), keyword: KeywordSchema }),
		v.object({
			kind: v.literal('classification'),
			text: v.string(),
			classification: v.pipe(v.string(), v.nonEmpty())
		}),
		v.object({
			kind: v.literal('cardRef'),
			text: v.string(),
			slug: v.pipe(v.string(), v.nonEmpty())
		}),
		v.object({ kind: v.literal('nameFragment'), text: v.string() }),
		v.object({ kind: v.literal('symbol'), text: v.string(), symbol: SymbolNameSchema }),
		v.object({ kind: v.literal('reminder'), text: v.string() }),
		// A "Choose one effect." line's " // "-separated options — a sentinel splitting one
		// paragraph into the list `splitChoiceOptions` renders, never a segment rendered on its
		// own. Its own segment kind rather than a special character in `text`, so a real card
		// that happens to print a literal "//" some day isn't misread as a choice.
		v.object({ kind: v.literal('choiceBreak'), text: v.string() }),
		// The printed card bolds this exact phrase.
		v.object({ kind: v.literal('choicePrompt'), text: v.string() }),
		// The printed card bolds a called-out die size ("d4", "d6", "d20") wherever one names a
		// specific Gig, e.g. "if a friendly d4 is a min Gig". No closed vocabulary to validate
		// against here — unlike `Keyword`, any die size is legitimate game data.
		v.object({ kind: v.literal('dieSize'), text: v.string() })
	],
	'not a known rules-text segment'
);
export type Segment = v.InferOutput<typeof SegmentSchema>;

/** One rendered `<p>`. Rules text is paragraph-shaped: 60 of 132 cards contain newlines. */
export const ParagraphSchema = v.array(SegmentSchema);
export type Paragraph = v.InferOutput<typeof ParagraphSchema>;

/** The lookups segmentation needs. Keys are upper-cased; values are canonical. */
export type SegmentContext = {
	/** Upper-cased card name → slug. Decides `cardRef` vs `nameFragment`. */
	slugByUpperName: ReadonlyMap<string, string>;
	/** Upper-cased classification → canonical casing. Decides `classification` vs text. */
	classificationByUpper: ReadonlyMap<string, string>;
};

export type SplitRulesText = {
	rulesText: Paragraph[];
	flavorText: string | null;
};

/**
 * `[Flavour]`, `[Flavor]`, `[Flavour Text]` — all three spellings occur, one card each.
 */
const FLAVOUR_TAG = /^\[flavou?r(?:\s+text)?\]\s*/i;

const WHOLLY_QUOTED = /^["“]([^"”]*)["”]$/;

/**
 * Ordered alternation. `quoted` precedes `caps` positionally rather than by precedence: the
 * opening quote is scanned first, so a quoted ALL-CAPS run can never be claimed by `caps`.
 * Neither `choicePrompt` nor `dieSize` is mixed- or lower-case enough for `caps` to ever compete
 * for the same text anyway; they're ordered ahead of it here only for readability, grouped with
 * the other single-purpose literal matches.
 */
const TOKEN =
	/\{(?<keyword>[^}]*)\}|\((?<reminder>[^)]*)\)|(?<symbol>€\$?|☆)|(?<choiceBreak>\s*\/\/\s*)|(?<choicePrompt>Choose one effect\.)|\b(?<dieSize>d\d+)\b|["“](?<quoted>[^"”]*)["”]|(?<caps>[A-Z0-9][A-Z0-9'’]+(?: [A-Z0-9][A-Z0-9'’]*)*)/gu;

const isUpperCased = (text: string) => /[A-Z]/.test(text) && !/[a-z]/.test(text);

/** Appends to the trailing text segment when there is one, so text never fragments. */
function pushText(into: Segment[], text: string): void {
	if (text === '') return;
	const last = into.at(-1);
	if (last !== undefined && last.kind === 'text')
		into[into.length - 1] = { ...last, text: last.text + text };
	else into.push({ kind: 'text', text });
}

/**
 * Resolves an ALL-CAPS phrase by longest known prefix, so `ARASAKA NETRUNNER` yields the
 * classification we know plus plain text, rather than one unrecognised blob.
 */
function pushCapsPhrase(into: Segment[], phrase: string, ctx: SegmentContext): void {
	if (!/[A-Z]/.test(phrase)) {
		pushText(into, phrase);
		return;
	}

	const words = phrase.split(' ');
	let at = 0;
	while (at < words.length) {
		if (at > 0) pushText(into, ' ');

		let taken = 0;
		for (let end = words.length; end > at; end--) {
			const candidate = words.slice(at, end).join(' ');
			const classification = ctx.classificationByUpper.get(candidate);
			if (classification !== undefined) {
				into.push({ kind: 'classification', text: candidate, classification });
				taken = end - at;
				break;
			}
		}

		if (taken === 0) {
			pushText(into, words[at]);
			taken = 1;
		}
		at += taken;
	}
}

/** Segments one paragraph. Flavour must already have been removed — see `splitRulesText`. */
export function segmentLine(line: string, ctx: SegmentContext): Paragraph {
	const segments: Segment[] = [];
	let cursor = 0;

	for (const match of line.matchAll(TOKEN)) {
		const groups = match.groups;
		if (groups === undefined) continue;
		pushText(segments, line.slice(cursor, match.index));
		cursor = match.index + match[0].length;

		if (groups.keyword !== undefined) {
			const keyword = v.safeParse(KeywordSchema, groups.keyword);
			// An unknown token fails the build in `assertions.ts`; here it degrades to text so
			// a single new keyword can never make a card unrenderable.
			if (keyword.success)
				segments.push({ kind: 'keyword', text: match[0], keyword: keyword.output });
			else pushText(segments, match[0]);
		} else if (groups.reminder !== undefined) {
			segments.push({ kind: 'reminder', text: match[0] });
		} else if (groups.choiceBreak !== undefined) {
			segments.push({ kind: 'choiceBreak', text: match[0] });
		} else if (groups.choicePrompt !== undefined) {
			segments.push({ kind: 'choicePrompt', text: match[0] });
		} else if (groups.dieSize !== undefined) {
			segments.push({ kind: 'dieSize', text: match[0] });
		} else if (groups.symbol !== undefined) {
			segments.push({
				kind: 'symbol',
				text: match[0],
				symbol: groups.symbol.startsWith('€') ? 'eurodollars' : 'streetCred'
			});
		} else if (groups.quoted !== undefined) {
			const slug = ctx.slugByUpperName.get(groups.quoted);
			if (!isUpperCased(groups.quoted)) pushText(segments, match[0]);
			else if (slug !== undefined) segments.push({ kind: 'cardRef', text: match[0], slug });
			else segments.push({ kind: 'nameFragment', text: match[0] });
		} else if (groups.caps !== undefined) {
			pushCapsPhrase(segments, groups.caps, ctx);
		}
	}

	pushText(segments, line.slice(cursor));
	return segments;
}

/**
 * Splits `rules_text` into rules paragraphs and the flavour line misfiled inside it.
 *
 * The heuristic is fragile by nature, which is why ingest also keeps `rawRulesText`: a
 * misclassification has to be recoverable and re-splittable offline without re-fetching.
 */
export function splitRulesText(raw: string | null, ctx: SegmentContext): SplitRulesText {
	if (raw === null) return { rulesText: [], flavorText: null };

	const ruleLines: string[] = [];
	const flavourLines: string[] = [];

	for (const rawLine of raw.split('\n')) {
		const line = rawLine.trim();
		if (line === '') continue;

		const tag = line.match(FLAVOUR_TAG);
		if (tag !== null) {
			flavourLines.push(line.slice(tag[0].length));
			continue;
		}

		// A wholly-quoted *sentence-case* line is flavour. A wholly-quoted ALL-CAPS line is a
		// card reference — `"DEADMAN TRANSMITTER"` — and belongs to the rules.
		const quoted = line.match(WHOLLY_QUOTED);
		if (quoted !== null && !isUpperCased(quoted[1])) {
			flavourLines.push(line);
			continue;
		}

		ruleLines.push(line);
	}

	return {
		rulesText: ruleLines.map((line) => segmentLine(line, ctx)),
		flavorText: flavourLines.length === 0 ? null : flavourLines.join('\n')
	};
}

/**
 * Splits a paragraph containing `choiceBreak` segments — a "Choose one effect" line's
 * " // "-separated options — into one segment array per option. `null` when there's nothing to
 * split, which is the common case and what tells `RulesText` to render an ordinary paragraph
 * instead of a list.
 */
export function splitChoiceOptions(paragraph: Paragraph): Segment[][] | null {
	if (!paragraph.some((segment) => segment.kind === 'choiceBreak')) return null;

	const options: Segment[][] = [[]];
	for (const segment of paragraph) {
		if (segment.kind === 'choiceBreak') options.push([]);
		else options.at(-1)!.push(segment);
	}
	return options;
}

/** The text a segment renders, with its markup delimiters removed. */
function displayText(segment: Segment): string {
	switch (segment.kind) {
		case 'keyword':
			return segment.keyword;
		case 'cardRef':
		case 'nameFragment':
			return segment.text.slice(1, -1);
		default:
			return segment.text;
	}
}

/** Flattens segments to the string text search matches against. Markup is not searchable. */
export function plainText(paragraphs: readonly Paragraph[]): string {
	return paragraphs.map((p) => p.map(displayText).join('')).join(' ');
}

/**
 * Derives the keyword facet from `{Brace}` markup. `unknown` is what fails the build — the
 * closed set of nine is a measurement, so a tenth arriving is news, not noise.
 */
export function extractKeywords(raw: string | null): { keywords: Keyword[]; unknown: string[] } {
	if (raw === null) return { keywords: [], unknown: [] };

	const found = new Set<string>();
	for (const match of raw.matchAll(/\{([^}]*)\}/g)) found.add(match[1]);

	const keywords = KEYWORDS.filter((keyword) => found.has(keyword));
	const unknown = [...found].filter((token) => !v.is(KeywordSchema, token)).sort();
	return { keywords, unknown };
}
