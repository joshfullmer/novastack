import { Action, DIE_LETTERS } from './notation.ts';
import type { Die, DieLetter, Owner } from './notation.ts';

export type ParsedMove = {
	action: Action;
	die: Die;
	/** Absent on a steal, where it is an optional checksum, and on a swap, which has none. */
	value?: number;
	/** A swap's second die. The pair is unordered: which is the actor's is read off the board. */
	with?: Die;
	raw: string;
};

export type Entry = { move: ParsedMove; reaction: boolean };

/** A turn with no entries is a pass. */
export type RawTurn = { number: number; raw: string; entries: Entry[] };

export type SyntaxError = { turn: number; raw: string; reason: string };

export type ParsedDocument = { first: Owner; turns: RawTurn[]; errors: SyntaxError[] };

const MOVE = /^(?<action>[+\-=~x])?(?<die>[A-F])(?<theirs>')?(?<value>[0-9]{1,2})?$/;
/**
 * `A<>B'`. Two dice, no value (a swap keeps both) and no order that matters. `<->` and `↔` are
 * accepted as the same thing — what people reach for when typing — but `<>` is the one written.
 */
const SWAP = /^(?<first>[A-F]'?)(?:<>|<->|↔)(?<second>[A-F]'?)$/;
const HEADER = /^first:\s*(we|they)$/i;
const TURN_PREFIX = /^(\d+)[|.]?\s*/;
const TOKEN = /\(|\)|[^\s()]+/g;

const dieOf = (written: string): Die => ({
	sides: DIE_LETTERS[written[0] as DieLetter],
	owner: written.endsWith("'") ? 't' : 'w'
});

export function parseMove(raw: string): ParsedMove | null {
	const swap = SWAP.exec(raw);
	if (swap) {
		const { first, second } = swap.groups!;
		return { action: Action.Swap, die: dieOf(first), with: dieOf(second), raw };
	}
	const match = MOVE.exec(raw);
	if (!match) return null;
	// The named groups all exist whenever the pattern matched; only their captures are optional.
	const { action, die, theirs, value } = match.groups!;
	const move: ParsedMove = {
		action: (action ?? Action.Roll) as Action,
		die: { sides: DIE_LETTERS[die as DieLetter], owner: theirs ? 't' : 'w' },
		raw
	};
	if (value !== undefined) move.value = parseInt(value, 10);
	return move;
}

/**
 * One comment-stripped line cut into the pieces the parser and the renderers both walk: the
 * optional turn number (`3|`, `3.`, `3`), what follows it, and that remainder's tokens — a
 * parenthesis, or a run of anything else. Shared so the page that *shows* a line splits it exactly
 * where the parser that *reads* it does.
 */
export function splitTurn(raw: string): {
	prefix: { digits: string; text: string } | null;
	body: string;
	tokens: string[];
} {
	const match = TURN_PREFIX.exec(raw);
	const body = match ? raw.slice(match[0].length) : raw;
	return {
		prefix: match ? { digits: match[1], text: match[0].trimEnd() } : null,
		body,
		tokens: body.match(TOKEN) ?? []
	};
}

const COMMENT_ONLY = /^\s*;/;

function stripComment(line: string): string {
	return line.replace(/;.*$/, '').trim();
}

export function parseDocument(text: string): ParsedDocument {
	// Comment-only lines are not turns; blank lines are (and get flagged).
	const lines = text
		.split('\n')
		.filter((l) => !COMMENT_ONLY.test(l))
		.map(stripComment);
	let start = 0;
	let end = lines.length;
	while (start < end && lines[start] === '') start++;
	while (end > start && lines[end - 1] === '') end--;

	let first: Owner = 'w';
	const header = start < end ? HEADER.exec(lines[start]) : null;
	if (header) {
		first = header[1].toLowerCase() === 'we' ? 'w' : 't';
		start++;
		while (start < end && lines[start] === '') start++;
	}

	const turns: RawTurn[] = [];
	const errors: SyntaxError[] = [];

	for (let i = start; i < end; i++) {
		const number = turns.length + 1;
		const raw = lines[i];
		const fail = (token: string, reason: string) =>
			errors.push({ turn: number, raw: token, reason });

		if (raw === '') {
			fail('', 'empty turn — write .. to pass');
			turns.push({ number, raw, entries: [] });
			continue;
		}

		const { prefix, body, tokens } = splitTurn(raw);
		if (prefix) {
			const written = parseInt(prefix.digits, 10);
			if (written !== number)
				fail(prefix.digits, `turn number ${written} does not match position ${number}`);
		}

		if (body === '..') {
			turns.push({ number, raw, entries: [] });
			continue;
		}

		const entries: Entry[] = [];
		let reaction = false;
		let reactionSize = 0;
		for (const token of tokens) {
			if (token === '(') {
				if (reaction) fail(token, 'reactions cannot nest');
				reaction = true;
				reactionSize = 0;
				continue;
			}
			if (token === ')') {
				if (!reaction) fail(token, 'unmatched )');
				else if (reactionSize === 0) fail('()', 'empty reaction');
				reaction = false;
				continue;
			}
			if (token === '..') {
				fail(token, '.. must be the only entry in a turn');
				continue;
			}
			const move = parseMove(token);
			if (!move) {
				fail(token, 'invalid move syntax');
				continue;
			}
			if (move.action !== Action.Steal && move.action !== Action.Swap && move.value === undefined) {
				fail(token, 'missing value');
				continue;
			}
			entries.push({ move, reaction });
			reactionSize++;
		}
		if (reaction) fail('(', 'unclosed (');

		turns.push({ number, raw, entries });
	}

	return { first, turns, errors };
}
