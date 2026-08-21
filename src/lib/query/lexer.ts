/**
 * The query language's tokenizer (spec §2.1).
 *
 * Purely functional: `nextToken` takes a position and returns the token plus the next position,
 * rather than owning a mutable cursor. That's what makes multi-token lookahead in the parser
 * (the chained-range production, §3.2) cheap to try and cheap to abandon — a speculative parse
 * just calls `nextToken` forward from a local position and never touches the real one unless it
 * commits.
 *
 * **Negation vs. a literal hyphen.** `-` is only ever a `minus` token at an atom boundary — the
 * start of input, or right after whitespace or `(`. Anywhere else (mid-word, as in
 * `tyger-claws`, or right after an operator, as in the degenerate `cost:-3`) it's just an
 * ordinary word character. This needs no threaded parser state: the boundary is entirely a
 * property of the character immediately before it in `source`, checked locally.
 */
export type Op = ':' | '=' | '<' | '<=' | '>' | '>=';

export type Span = readonly [start: number, end: number];

export type Token =
	| { kind: 'lparen' | 'rparen' | 'minus'; span: Span }
	| { kind: 'op'; value: Op; span: Span }
	| { kind: 'word'; text: string; span: Span }
	| { kind: 'string'; text: string; span: Span }
	| { kind: 'regex'; pattern: string; span: Span }
	| { kind: 'eof'; span: Span };

const WORD_STOP = new Set([' ', '\t', '\n', '\r', '(', ')', '"', '/', ':', '=', '<', '>']);

function isAtomBoundary(source: string, at: number): boolean {
	return at === 0 || /\s/.test(source[at - 1]) || source[at - 1] === '(';
}

/** Consumes a quoted string or regex literal, unescaping `\X` to its literal character. */
function readDelimited(
	source: string,
	openAt: number,
	close: string
): { text: string; end: number } {
	let i = openAt + 1;
	let text = '';
	while (i < source.length && source[i] !== close) {
		if (source[i] === '\\' && i + 1 < source.length) {
			text += source[i + 1];
			i += 2;
		} else {
			text += source[i];
			i += 1;
		}
	}
	return { text, end: Math.min(i + 1, source.length) };
}

export function nextToken(source: string, pos: number): { token: Token; next: number } {
	let i = pos;
	while (i < source.length && /\s/.test(source[i])) i += 1;

	if (i >= source.length) return { token: { kind: 'eof', span: [i, i] }, next: i };

	const ch = source[i];

	if (ch === '(') return { token: { kind: 'lparen', span: [i, i + 1] }, next: i + 1 };
	if (ch === ')') return { token: { kind: 'rparen', span: [i, i + 1] }, next: i + 1 };

	if (ch === '-' && isAtomBoundary(source, i)) {
		return { token: { kind: 'minus', span: [i, i + 1] }, next: i + 1 };
	}

	if (ch === '"') {
		const { text, end } = readDelimited(source, i, '"');
		return { token: { kind: 'string', text, span: [i, end] }, next: end };
	}

	if (ch === '/') {
		const { text, end } = readDelimited(source, i, '/');
		return { token: { kind: 'regex', pattern: text, span: [i, end] }, next: end };
	}

	if (ch === '>') {
		if (source[i + 1] === '=')
			return { token: { kind: 'op', value: '>=', span: [i, i + 2] }, next: i + 2 };
		return { token: { kind: 'op', value: '>', span: [i, i + 1] }, next: i + 1 };
	}
	if (ch === '<') {
		if (source[i + 1] === '=')
			return { token: { kind: 'op', value: '<=', span: [i, i + 2] }, next: i + 2 };
		return { token: { kind: 'op', value: '<', span: [i, i + 1] }, next: i + 1 };
	}
	if (ch === ':' || ch === '=') {
		return { token: { kind: 'op', value: ch, span: [i, i + 1] }, next: i + 1 };
	}

	let j = i;
	while (j < source.length && !WORD_STOP.has(source[j])) j += 1;
	return { token: { kind: 'word', text: source.slice(i, j), span: [i, j] }, next: j };
}
