import { describe, expect, it } from 'vitest';
import { canonicalize, decode, encode, fromHash, toHash } from './share.ts';
import { INVALID_GAME, VALID_GAME } from './examples.ts';

describe('encode / decode', () => {
	it.each([
		['the valid example', VALID_GAME],
		['the invalid example, interior blank line and all', INVALID_GAME],
		['a single move', 'A4'],
		['non-ASCII, such as the typographic prime', 'A’4 ; THEY — d4']
	])('round-trips %s', (_, text) => {
		expect(decode(encode(text))).toBe(canonicalize(text));
	});

	it('round-trips an empty game', () => {
		expect(decode(encode(''))).toBe('');
	});

	it('is URL-safe: no +, / or = padding', () => {
		// 0xfb 0xff bytes force `+` and `/` in plain base64.
		expect(encode('???>>>~~~')).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(encode(INVALID_GAME)).not.toMatch(/[+/=]/);
	});
});

describe('canonical form', () => {
	it('gives the same link for CRLF, trailing spaces and outer blank lines', () => {
		const tidy = "A4 -A1\nA'4";
		expect(encode("\r\n  \r\nA4 -A1   \r\nA'4\t\r\n\r\n")).toBe(encode(tidy));
	});

	it('keeps a blank line in the middle of a game', () => {
		expect(canonicalize('A4\n\nB4')).toBe('A4\n\nB4');
	});

	it('is idempotent', () => {
		const once = canonicalize(INVALID_GAME + '  \r\n\r\n');
		expect(canonicalize(once)).toBe(once);
		expect(encode(once)).toBe(encode(INVALID_GAME));
	});
});

describe('garbage', () => {
	it.each(['not base64!', 'a=b', '%%%', '=', 'A', '/+'])('decodes %j to null', (bad) => {
		expect(decode(bad)).toBeNull();
	});

	it('rejects bytes that are not UTF-8', () => {
		// 0xff 0xfe — never valid UTF-8.
		expect(decode('__4')).toBeNull();
	});
});

describe('hash', () => {
	it('round-trips through a location hash', () => {
		expect(fromHash(toHash(VALID_GAME))).toBe(canonicalize(VALID_GAME));
	});

	it('is empty for an empty game', () => {
		expect(toHash('')).toBe('');
		expect(toHash('  \n\n')).toBe('');
	});

	it('yields null when the hash carries no game or a bad one', () => {
		expect(fromHash('')).toBeNull();
		expect(fromHash('#other=1')).toBeNull();
		expect(fromHash('#g=%%%')).toBeNull();
	});
});
