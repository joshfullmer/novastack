import { describe, expect, it } from 'vitest';
import { href, withParams } from './url.ts';

describe('href', () => {
	it('is just the path with no params', () => {
		expect(href('/meta')).toBe('/meta');
	});

	it('adds params, leaving out null, undefined and empty ones', () => {
		expect(href('/meta/decks', { period: 3, page: null, legend: undefined, card: '' })).toBe(
			'/meta/decks?period=3'
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
	const at = (search: string) => ({ pathname: '/meta/decks', search });

	it('swaps one param and leaves the rest alone', () => {
		expect(withParams(at('?legend=a&sort=recent'), { period: 3 })).toBe(
			'/meta/decks?legend=a&sort=recent&period=3'
		);
		expect(withParams(at('?period=2&legend=a'), { period: 3 })).toBe(
			'/meta/decks?period=2&legend=a'.replace('period=2', 'period=3')
		);
	});

	it('removes a param with null, and drops named ones', () => {
		expect(withParams(at('?period=2&page=4'), { period: null }, ['page'])).toBe('/meta/decks');
	});

	it('is just the path when nothing is left', () => {
		expect(withParams(at(''), {})).toBe('/meta/decks');
	});
});
