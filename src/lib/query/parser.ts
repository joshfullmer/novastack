/**
 * The recursive-descent parser (spec §2). Turns source text into a syntax tree plus warnings —
 * never throws, per the inherited "malformed input degrades" constraint (spec §1.3).
 *
 * Field semantics (does this field accept this value, what does `none`/`has` mean for it, regex
 * safety) are deliberately **not** checked here — that's `compile.ts`'s job. This layer only
 * resolves the field *keyword* to a `FieldKind` (so it knows how many tokens a clause consumes)
 * and captures values as raw tokens.
 *
 * Recovery unit is the smallest self-contained broken thing (spec §6): a bad field clause drops
 * itself; an unclosed group drops everything from its `(` to the end of input. Both leave
 * whatever parsed successfully before them standing.
 */
import { nextToken, type Op, type Span, type Token } from './lexer.ts';
import { fieldSpec, lookupField, type FieldKind } from './vocabulary.ts';

export type CompareOp = '<' | '<=' | '>' | '>=';
export type Operator = ':' | '=' | CompareOp;

export type ValueNode =
	| { type: 'word'; text: string; span: Span }
	| { type: 'string'; text: string; span: Span }
	| { type: 'regex'; pattern: string; span: Span };

export type FieldNode = {
	type: 'field';
	span: Span;
	field: FieldKind;
	operator: Operator;
	value: ValueNode;
	chain?: { operator: CompareOp; value: ValueNode };
};

export type Node =
	| { type: 'and'; span: Span; children: Node[] }
	| { type: 'or'; span: Span; children: Node[] }
	| { type: 'not'; span: Span; child: Node }
	| FieldNode;

export type ParseWarningReason =
	'unknown-field' | 'malformed-value' | 'unclosed-group' | 'invalid-regex' | 'inapplicable-field';

export type ParseWarning = { text: string; span: Span; reason: ParseWarningReason };

export type ParseResult = { node: Node | null; warnings: ParseWarning[] };

/** A type guard, not a `Set.has()` check, deliberately: narrowing `Op` down to `CompareOp` at
 * the call site is what lets the chained-range production avoid asserting it below. */
function isCompareOp(op: Op): op is CompareOp {
	return op === '<' || op === '<=' || op === '>' || op === '>=';
}

const MIRROR: Readonly<Record<CompareOp, CompareOp>> = {
	'<': '>',
	'<=': '>=',
	'>': '<',
	'>=': '<='
};
const isLowerBound = (op: CompareOp) => op === '>' || op === '>=';

export function parse(source: string): ParseResult {
	const warnings: ParseWarning[] = [];
	let pos = 0;

	function peek(): Token {
		return nextToken(source, pos).token;
	}
	function advance(): Token {
		const { token, next } = nextToken(source, pos);
		pos = next;
		return token;
	}
	function warn(span: Span, reason: ParseWarningReason): void {
		warnings.push({ text: source.slice(span[0], span[1]), span, reason });
	}
	/** Peeks up to `n` tokens ahead without consuming, stopping early at EOF. */
	function peekTokens(n: number): Token[] {
		const tokens: Token[] = [];
		let p = pos;
		for (let k = 0; k < n; k++) {
			const { token, next } = nextToken(source, p);
			tokens.push(token);
			if (token.kind === 'eof') break;
			p = next;
		}
		return tokens;
	}

	function parseValue(): ValueNode | null {
		const tok = peek();
		if (tok.kind === 'word') {
			advance();
			return { type: 'word', text: tok.text, span: tok.span };
		}
		if (tok.kind === 'string') {
			advance();
			return { type: 'string', text: tok.text, span: tok.span };
		}
		if (tok.kind === 'regex') {
			advance();
			return { type: 'regex', pattern: tok.pattern, span: tok.span };
		}
		return null;
	}

	/**
	 * The chained-interval sugar, `1<=ram<=3` (spec §3.2): value, compare-op, field, compare-op,
	 * value. Tried speculatively before anything else, since it's the only shape with a value in
	 * front of a field name. Returns `undefined` — not `null` — when the upcoming tokens simply
	 * aren't this shape, so the caller knows not to treat it as a (dropped) match.
	 */
	function tryChainedRange(): Node | null | undefined {
		const [v1, op1, fieldTok, op2, v2] = peekTokens(5);
		if (v1?.kind !== 'word') return undefined;
		if (op1?.kind !== 'op' || !isCompareOp(op1.value)) return undefined;
		if (fieldTok?.kind !== 'word') return undefined;
		const field = lookupField(fieldTok.text);
		if (field === null || !fieldSpec(field).comparisons) return undefined;
		if (op2?.kind !== 'op' || !isCompareOp(op2.value)) return undefined;
		if (v2?.kind !== 'word') return undefined;

		for (let k = 0; k < 5; k++) pos = nextToken(source, pos).next;
		const span: Span = [v1.span[0], pos];

		const primaryOp = MIRROR[op1.value];
		const chainOp = op2.value;
		if (isLowerBound(primaryOp) === isLowerBound(chainOp)) {
			warn(span, 'malformed-value');
			return null;
		}

		return {
			type: 'field',
			span,
			field,
			operator: primaryOp,
			value: { type: 'word', text: v1.text, span: v1.span },
			chain: { operator: chainOp, value: { type: 'word', text: v2.text, span: v2.span } }
		};
	}

	function parseFieldClause(): Node | null {
		const wordTok = advance();
		const opTok = advance();
		if (wordTok.kind !== 'word' || opTok.kind !== 'op') throw new Error('unreachable');

		const field = lookupField(wordTok.text);
		if (field === null) {
			const valueTok = advance();
			warn([wordTok.span[0], valueTok.span[1]], 'unknown-field');
			return null;
		}

		const value = parseValue();
		if (value === null) {
			warn([wordTok.span[0], opTok.span[1]], 'malformed-value');
			return null;
		}
		return {
			type: 'field',
			span: [wordTok.span[0], value.span[1]],
			field,
			operator: opTok.value,
			value
		};
	}

	function parseBareText(): Node {
		const value = parseValue();
		if (value === null) throw new Error('unreachable');
		return { type: 'field', span: value.span, field: 'text', operator: ':', value };
	}

	function parseClause(): Node | null {
		const chained = tryChainedRange();
		if (chained !== undefined) return chained;

		const head = peek();
		if (head.kind === 'word') {
			const wordEnd = nextToken(source, pos).next;
			const following = nextToken(source, wordEnd).token;
			return following.kind === 'op' ? parseFieldClause() : parseBareText();
		}
		if (head.kind === 'string' || head.kind === 'regex') return parseBareText();
		return null;
	}

	function parseAtom(): Node | null {
		const tok = peek();
		if (tok.kind === 'lparen') {
			const openSpan = tok.span;
			advance();
			const inner = parseOr();
			if (peek().kind === 'rparen') {
				advance();
				// Widened to include the parens themselves: parens are transparent to *meaning*,
				// but a caller doing span-based text surgery (the chip-write-back path, spec §9)
				// needs to excise the whole `(...)`, not just its content.
				return inner === null ? null : { ...inner, span: [openSpan[0], pos] };
			}
			warn([openSpan[0], source.length], 'unclosed-group');
			pos = source.length;
			return null;
		}
		return parseClause();
	}

	function parseNot(): Node | null {
		const start = pos;
		if (peek().kind === 'minus') {
			advance();
			const child = parseAtom();
			return child === null ? null : { type: 'not', span: [start, pos], child };
		}
		return parseAtom();
	}

	function isKeyword(tok: Token, word: string): boolean {
		return tok.kind === 'word' && tok.text.toLowerCase() === word;
	}

	function parseAnd(): Node | null {
		const start = pos;
		const children: Node[] = [];
		for (;;) {
			const save = pos;
			const tok = peek();
			if (isKeyword(tok, 'or') || tok.kind === 'rparen' || tok.kind === 'eof') {
				pos = save;
				break;
			}
			if (isKeyword(tok, 'and')) {
				advance(); // a documented no-op synonym for juxtaposition
				continue;
			}
			const atom = parseNot();
			if (atom === null) {
				if (pos === save) advance(); // no progress at all — skip the stray token
				continue;
			}
			children.push(atom);
		}
		if (children.length === 0) return null;
		if (children.length === 1) return children[0];
		return { type: 'and', span: [start, pos], children };
	}

	function parseOr(): Node | null {
		const start = pos;
		const first = parseAnd();
		const children: Node[] = first === null ? [] : [first];
		for (;;) {
			const save = pos;
			if (isKeyword(peek(), 'or')) {
				advance();
				const next = parseAnd();
				if (next !== null) children.push(next);
				continue;
			}
			pos = save;
			break;
		}
		if (children.length === 0) return null;
		if (children.length === 1) return children[0];
		return { type: 'or', span: [start, pos], children };
	}

	const node = parseOr();
	return { node, warnings };
}
