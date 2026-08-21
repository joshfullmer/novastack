import { describe, expect, it } from 'vitest';
import { nextToken } from './lexer.ts';

function tokenize(source: string) {
	const tokens = [];
	let pos = 0;
	for (;;) {
		const { token, next } = nextToken(source, pos);
		tokens.push(token);
		if (token.kind === 'eof') break;
		pos = next;
	}
	return tokens;
}

describe('nextToken', () => {
	it('tokenizes parens', () => {
		expect(tokenize('()')).toMatchObject([
			{ kind: 'lparen', span: [0, 1] },
			{ kind: 'rparen', span: [1, 2] },
			{ kind: 'eof' }
		]);
	});

	it('tokenizes a bare word', () => {
		expect(tokenize('blocker')).toMatchObject([
			{ kind: 'word', text: 'blocker', span: [0, 7] },
			{ kind: 'eof' }
		]);
	});

	it('tokenizes a field clause into word, op, word', () => {
		expect(tokenize('cost:3')).toMatchObject([
			{ kind: 'word', text: 'cost' },
			{ kind: 'op', value: ':' },
			{ kind: 'word', text: '3' },
			{ kind: 'eof' }
		]);
	});

	it('distinguishes single- and double-character comparison operators', () => {
		expect(tokenize('cost>=3<4')).toMatchObject([
			{ kind: 'word', text: 'cost' },
			{ kind: 'op', value: '>=' },
			{ kind: 'word', text: '3' },
			{ kind: 'op', value: '<' },
			{ kind: 'word', text: '4' },
			{ kind: 'eof' }
		]);
	});

	it('keeps a hyphen inside a slugified word', () => {
		expect(tokenize('tag:tyger-claws')).toMatchObject([
			{ kind: 'word', text: 'tag' },
			{ kind: 'op', value: ':' },
			{ kind: 'word', text: 'tyger-claws' },
			{ kind: 'eof' }
		]);
	});

	it('lexes a leading hyphen at an atom boundary as negation', () => {
		expect(tokenize('-cost:3')).toMatchObject([
			{ kind: 'minus', span: [0, 1] },
			{ kind: 'word', text: 'cost' },
			{ kind: 'op', value: ':' },
			{ kind: 'word', text: '3' },
			{ kind: 'eof' }
		]);
	});

	it('does not lex a hyphen right after an operator as negation', () => {
		// Not legal syntax for any field in this domain, but must not be misread as `-` `3`.
		expect(tokenize('cost:-3')).toMatchObject([
			{ kind: 'word', text: 'cost' },
			{ kind: 'op', value: ':' },
			{ kind: 'word', text: '-3' },
			{ kind: 'eof' }
		]);
	});

	it('lexes negation after whitespace and after an open paren', () => {
		expect(tokenize('a -b')).toMatchObject([
			{ kind: 'word', text: 'a' },
			{ kind: 'minus' },
			{ kind: 'word', text: 'b' },
			{ kind: 'eof' }
		]);
		expect(tokenize('(-b)')).toMatchObject([
			{ kind: 'lparen' },
			{ kind: 'minus' },
			{ kind: 'word', text: 'b' },
			{ kind: 'rparen' },
			{ kind: 'eof' }
		]);
	});

	it('tokenizes a quoted string, unescaping backslash-quote', () => {
		expect(tokenize('"a rival unit"')).toMatchObject([
			{ kind: 'string', text: 'a rival unit', span: [0, 14] },
			{ kind: 'eof' }
		]);
		expect(tokenize('"say \\"hi\\""')).toMatchObject([
			{ kind: 'string', text: 'say "hi"' },
			{ kind: 'eof' }
		]);
	});

	it('tokenizes a regex literal', () => {
		expect(tokenize('/bloc+ker/')).toMatchObject([
			{ kind: 'regex', pattern: 'bloc+ker', span: [0, 10] },
			{ kind: 'eof' }
		]);
	});

	it('closes an unterminated string or regex at end of input, leniently', () => {
		expect(tokenize('"unterminated')).toMatchObject([
			{ kind: 'string', text: 'unterminated' },
			{ kind: 'eof' }
		]);
		expect(tokenize('/unterminated')).toMatchObject([
			{ kind: 'regex', pattern: 'unterminated' },
			{ kind: 'eof' }
		]);
	});

	it('skips whitespace between tokens', () => {
		expect(tokenize('  cost : 3  ')).toMatchObject([
			{ kind: 'word', text: 'cost' },
			{ kind: 'op', value: ':' },
			{ kind: 'word', text: '3' },
			{ kind: 'eof' }
		]);
	});

	it('reaches eof on empty input', () => {
		expect(tokenize('')).toMatchObject([{ kind: 'eof', span: [0, 0] }]);
	});
});
