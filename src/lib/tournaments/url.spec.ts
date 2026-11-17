import { describe, expect, it } from 'vitest';
import { href, withParams } from './url.ts';

describe('href', () => {
	it('is just the path with no params', () => {
		expect(href('/tournaments/meta')).toBe('/tournaments/meta');
	});

	it('adds params, leaving out null, undefined and empty ones', () => {
		expect(href('/tournaments/decks', { period: 3, page: null, legend: undefined, card: '' })).toBe(
			'/tournaments/decks?period=3'
		);
	});

	it('encodes what needs it', () => {
		expect(href('/x', { player: 'a b&c' })).toBe('/x?player=a+b%26c');
	});

	it('keeps 0, which is a value', () => {
		expect(href('/x', { page: 0 })).toBe('/x?page=0');
	});
});

describe('withParams', () => {
	const at = (search: string) => ({ pathname: '/tournaments/decks', search });

	it('swaps one param and leaves the rest alone', () => {
		expect(withParams(at('?legend=a&sort=recent'), { period: 3 })).toBe(
			'/tournaments/decks?legend=a&sort=recent&period=3'
		);
		expect(withParams(at('?period=2&legend=a'), { period: 3 })).toBe(
			'/tournaments/decks?period=2&legend=a'.replace('period=2', 'period=3')
		);
	});

	it('removes a param with null, and drops named ones', () => {
		expect(withParams(at('?period=2&page=4'), { period: null }, ['page'])).toBe(
			'/tournaments/decks'
		);
	});

	it('is just the path when nothing is left', () => {
		expect(withParams(at(''), {})).toBe('/tournaments/decks');
	});
});
