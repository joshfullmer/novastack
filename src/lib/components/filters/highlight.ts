/**
 * Syntax-highlighting spans for the query box's overlay (ticket 02,
 * `.scratch/editor-affordances/map.md`).
 *
 * Deliberately *not* built from `lexer.ts`'s raw token stream alone: field-name recognition,
 * bare-text vs. `field:value` disambiguation, and the chained-interval sugar's unusual
 * value-op-field-op-value token order all require the parsed `Node` tree (`parser.ts`) to
 * classify correctly. The AST, though, throws away exactly the tokens this needs most —
 * `or`/`and`/parens are consumed as separators and never stored — so this walks the tree for
 * structure and re-tokenizes narrow windows (via `nextToken`) to recover those spans precisely.
 *
 * Palette: `layout.css`'s own theme comment reserves saturated colour for card art and the four
 * Colour identities — "everything here is dark and low-chroma... except the four colour
 * identities, which are the one place chroma carries meaning." Introducing a new hue per token
 * category would break that rule, so categories are distinguished within the existing grayscale
 * ramp plus the single `neon` accent (reserved here for the single most scannable thing: a
 * recognized field name), not by adding colors — `QueryEditor` owns the actual class per
 * category, this module only hands it a `field`. Tinting a `color:red`/`legends:` value with its
 * actual Colour identity was tried and reverted (Josh's call): it read as clever in isolation, but
 * he didn't want the query box borrowing the four Colour identities' chroma at all.
 */
import { nextToken, type Span, type Token } from '#lib/query/lexer.js';
import { parse, type Node, type ValueNode } from '#lib/query/parser.js';

export type HighlightCategory = 'field' | 'operator' | 'keyword' | 'value' | 'regex';

export type HighlightSpan = { span: Span; category: HighlightCategory };

/** Re-tokenizes exactly `count` tokens starting at `pos`, for recovering spans the AST doesn't
 * keep (a field clause's own keyword/operator tokens, a chain's five-token sequence). */
function retokenize(source: string, pos: number, count: number): Token[] {
	const tokens: Token[] = [];
	let p = pos;
	for (let i = 0; i < count; i++) {
		const { token, next } = nextToken(source, p);
		tokens.push(token);
		p = next;
	}
	return tokens;
}

/** Peels off however many layers of literal `(...)` wrap `span` in `source`, pushing a `paren`
 * category span for each opening/closing character removed. Redundant double-parens
 * (`((color:red))`) peel one layer at a time, cheaply, since each layer is just two characters. */
function peelParens(source: string, span: Span, out: HighlightSpan[]): Span {
	let [start, end] = span;
	while (source[start] === '(' && source[end - 1] === ')') {
		out.push({ span: [start, start + 1], category: 'operator' });
		out.push({ span: [end - 1, end], category: 'operator' });
		start += 1;
		end -= 1;
	}
	return [start, end];
}

function valueCategory(value: ValueNode): HighlightCategory {
	return value.type === 'regex' ? 'regex' : 'value';
}

/** Scans the gap between two sibling clauses for the connective keyword that must (`or`) or may
 * (`and`, silently) live there — the AST records neither, only the children around them. */
function highlightGapKeyword(source: string, from: number, to: number, out: HighlightSpan[]): void {
	let pos = from;
	while (pos < to) {
		const { token, next } = nextToken(source, pos);
		if (token.kind === 'word') {
			const lower = token.text.toLowerCase();
			if (lower === 'or' || lower === 'and') out.push({ span: token.span, category: 'keyword' });
		}
		pos = next;
	}
}

function walk(source: string, node: Node, out: HighlightSpan[]): void {
	const [start] = peelParens(source, node.span, out);

	switch (node.type) {
		case 'and':
		case 'or': {
			node.children.forEach((child, i) => {
				walk(source, child, out);
				const next = node.children[i + 1];
				if (next !== undefined) highlightGapKeyword(source, child.span[1], next.span[0], out);
			});
			return;
		}
		case 'not': {
			const [minusTok] = retokenize(source, start, 1);
			out.push({ span: minusTok.span, category: 'keyword' });
			walk(source, node.child, out);
			return;
		}
		case 'field': {
			if (node.chain !== undefined) {
				const [, op1, fieldTok, op2] = retokenize(source, start, 5);
				out.push({ span: node.value.span, category: valueCategory(node.value) });
				out.push({ span: op1.span, category: 'operator' });
				out.push({ span: fieldTok.span, category: 'field' });
				out.push({ span: op2.span, category: 'operator' });
				out.push({ span: node.chain.value.span, category: valueCategory(node.chain.value) });
				return;
			}
			const isBareText = start === node.value.span[0];
			if (isBareText) {
				out.push({ span: node.value.span, category: valueCategory(node.value) });
				return;
			}
			// `fieldTok` is always a recognized keyword here, never a guess: `parseFieldClause`
			// (parser.ts) drops the whole clause — no `FieldNode` at all — the moment `lookupField`
			// comes back null, so an unrecognized field-position word never reaches this branch. An
			// unrecognized field therefore renders as plain, unhighlighted text, but as a
			// consequence of the parser dropping it, not a choice made here.
			const [fieldTok, opTok] = retokenize(source, start, 2);
			out.push({ span: fieldTok.span, category: 'field' });
			out.push({ span: opTok.span, category: 'operator' });
			out.push({ span: node.value.span, category: valueCategory(node.value) });
			return;
		}
	}
}

/** Highlight spans for `source`, sorted by start position. Spans never overlap — anything not
 * covered (whitespace, and any stretch a malformed clause caused to drop entirely) is left for
 * the caller to render as plain text. */
export function highlightQuery(source: string): readonly HighlightSpan[] {
	const { node } = parse(source);
	if (node === null) return [];
	const out: HighlightSpan[] = [];
	walk(source, node, out);
	return out.sort((a, b) => a.span[0] - b.span[0]);
}
