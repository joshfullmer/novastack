/**
 * Regex safety for the `text` predicate's `/pattern/` mode (spec §8).
 *
 * The threat model is narrow: one person, in their own tab, matching against a corpus of 133
 * cards whose rules-text strings run roughly 100–250 characters each — not a server evaluating
 * untrusted input from many people. That's why the mitigation is a static shape check plus
 * ordinary error handling, not a linear-time engine or a Worker.
 *
 * The check is a heuristic, not a proof: it rejects the classic nested-quantifier shape
 * (`(a+)+`, `(a*)*`, …) at any depth, and a repeating group whose alternatives can match the
 * same text (`(a|a)+`) — the two catastrophic-backtracking shapes actually named in spec §8.
 * Detecting every possible exponential-blowup shape, or every semantic overlap between
 * alternatives that aren't textually identical, is undecidable in general and disproportionate
 * effort for this threat model — this catches the shapes that name, not every pattern that could
 * theoretically misbehave.
 */

export type RegexCheck =
	{ ok: true; regex: RegExp } | { ok: false; reason: 'invalid-syntax' | 'unsafe-pattern' };

export function compileSafeRegex(pattern: string): RegexCheck {
	if (hasNestedQuantifier(pattern)) return { ok: false, reason: 'unsafe-pattern' };

	try {
		return { ok: true, regex: new RegExp(pattern, 'iu') };
	} catch {
		return { ok: false, reason: 'invalid-syntax' };
	}
}

/** The end index (exclusive) of a `[...]` character class starting at `text[at]`. */
function findClassEnd(text: string, at: number): number {
	let i = at + 1;
	if (text[i] === '^') i += 1;
	if (text[i] === ']') i += 1; // a leading `]` is literal
	while (i < text.length && text[i] !== ']') {
		i += text[i] === '\\' ? 2 : 1;
	}
	return Math.min(i + 1, text.length);
}

/** The end index (exclusive) of a `(...)` group starting at `text[at]`, respecting nesting. */
function findGroupEnd(text: string, at: number): number {
	let depth = 1;
	let i = at + 1;
	while (i < text.length && depth > 0) {
		if (text[i] === '\\') {
			i += 2;
			continue;
		}
		if (text[i] === '[') {
			i = findClassEnd(text, i);
			continue;
		}
		if (text[i] === '(') depth += 1;
		else if (text[i] === ')') depth -= 1;
		i += 1;
	}
	return i - 1; // index of the matching `)`, or text.length if unclosed
}

/**
 * If a quantifier starts at `text[at]`, returns its end index and whether it allows more than
 * one repetition (the shape a nested quantifier needs to be dangerous). `?` and an exact
 * `{n}`/`{n,n}` count are bounded, not risky, even though `?` and `{...}` are still consumed so
 * the scan advances past them correctly.
 */
function matchQuantifier(text: string, at: number): { end: number; repeats: boolean } | null {
	const ch = text[at];
	let end: number;
	let repeats: boolean;

	if (ch === '+' || ch === '*') {
		end = at + 1;
		repeats = true;
	} else if (ch === '?') {
		end = at + 1;
		repeats = false;
	} else if (ch === '{') {
		const close = text.indexOf('}', at);
		if (close === -1) return null;
		const body = text.slice(at + 1, close);
		const match = body.match(/^(\d+)(,(\d*))?$/);
		if (match === null) return null;
		end = close + 1;
		const min = Number(match[1]);
		const hasComma = match[2] !== undefined;
		const max = match[3] === undefined || match[3] === '' ? null : Number(match[3]);
		repeats = hasComma && (max === null || max > min);
	} else {
		return null;
	}

	// A lazy suffix (`+?`, `*?`, `{2,}?`) doesn't change the repetition count, only the search
	// order — still consume it so the scan lands on the next real atom.
	if (text[end] === '?' && ch !== '?') end += 1;
	return { end, repeats };
}

/**
 * Does `text`, read at its own top level (treating any nested group or class as one opaque
 * atom), contain an atom followed by a repeating quantifier? Used to test a group's *interior*
 * for the inner half of the nested-quantifier shape.
 */
function hasTopLevelRepeatingAtom(text: string): boolean {
	let i = 0;
	while (i < text.length) {
		const ch = text[i];
		if (ch === '|') {
			i += 1;
			continue;
		}
		if (ch === '\\') {
			const quant = matchQuantifier(text, i + 2);
			if (quant !== null && quant.repeats) return true;
			i = quant?.end ?? i + 2;
			continue;
		}
		if (ch === '[') {
			const end = findClassEnd(text, i);
			const quant = matchQuantifier(text, end);
			if (quant !== null && quant.repeats) return true;
			i = quant?.end ?? end;
			continue;
		}
		if (ch === '(') {
			const end = findGroupEnd(text, i) + 1;
			const quant = matchQuantifier(text, end);
			if (quant !== null && quant.repeats) return true;
			i = quant?.end ?? end;
			continue;
		}
		const quant = matchQuantifier(text, i + 1);
		if (quant !== null && quant.repeats) return true;
		i = quant?.end ?? i + 1;
	}
	return false;
}

/**
 * Splits `text` on `|` at its own top level only — a nested group's alternatives are its own
 * concern, skipped whole via `findGroupEnd` rather than recursed into here.
 */
function splitTopLevelAlternatives(text: string): string[] {
	const parts: string[] = [];
	let start = 0;
	let i = 0;
	while (i < text.length) {
		const ch = text[i];
		if (ch === '\\') {
			i += 2;
			continue;
		}
		if (ch === '[') {
			i = findClassEnd(text, i);
			continue;
		}
		if (ch === '(') {
			i = findGroupEnd(text, i) + 1;
			continue;
		}
		if (ch === '|') {
			parts.push(text.slice(start, i));
			start = i + 1;
		}
		i += 1;
	}
	parts.push(text.slice(start));
	return parts;
}

/** `(a|a)+` — two alternatives that can match the same text, so a repeating engine has to try
 * both at every position. Only textually-identical branches are caught; a semantic overlap
 * between differently-written alternatives (`(a|aa)+`) is the undecidable case this doesn't
 * attempt. */
function hasOverlappingAlternation(text: string): boolean {
	const alternatives = splitTopLevelAlternatives(text);
	if (alternatives.length < 2) return false;
	const seen = new Set<string>();
	for (const alternative of alternatives) {
		if (seen.has(alternative)) return true;
		seen.add(alternative);
	}
	return false;
}

/**
 * Recursively scans for a group that both repeats *and* whose own interior already repeats or
 * offers overlapping alternatives — `(a+)+`, `(a*)*`, `(a|a)+`, and every variant, at any depth.
 * This is the actual detector; `hasTopLevelRepeatingAtom` and `hasOverlappingAlternation` answer
 * the two narrower "does this interior already misbehave" questions it depends on.
 */
function hasNestedQuantifier(text: string): boolean {
	let i = 0;
	while (i < text.length) {
		const ch = text[i];
		if (ch === '\\') {
			i += 2;
			continue;
		}
		if (ch === '[') {
			const end = findClassEnd(text, i);
			const quant = matchQuantifier(text, end);
			i = quant?.end ?? end;
			continue;
		}
		if (ch === '(') {
			const closeAt = findGroupEnd(text, i);
			const inner = text.slice(i + 1, closeAt);
			if (hasNestedQuantifier(inner)) return true;

			const end = closeAt + 1;
			const quant = matchQuantifier(text, end);
			if (
				quant !== null &&
				quant.repeats &&
				(hasTopLevelRepeatingAtom(inner) || hasOverlappingAlternation(inner))
			) {
				return true;
			}
			i = quant?.end ?? end;
			continue;
		}
		const quant = matchQuantifier(text, i + 1);
		i = quant?.end ?? i + 1;
	}
	return false;
}
