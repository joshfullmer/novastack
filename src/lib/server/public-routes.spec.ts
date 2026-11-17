import { describe, expect, it } from 'vitest';
import { isPublicRead } from './public-routes.ts';

describe('isPublicRead', () => {
	it('takes a read of a tournament page', () => {
		expect(isPublicRead('GET', '/tournaments')).toBe(true);
		expect(isPublicRead('GET', '/tournaments/485070')).toBe(true);
		expect(isPublicRead('HEAD', '/tournaments/meta/matchups')).toBe(true);
	});

	it('leaves a write on the full path, so a form action still gets a session', () => {
		expect(isPublicRead('POST', '/tournaments/decks')).toBe(false);
	});

	it('does not take a lookalike or another section', () => {
		expect(isPublicRead('GET', '/tournaments-old')).toBe(false);
		expect(isPublicRead('GET', '/decks/x')).toBe(false);
		expect(isPublicRead('GET', '/api/tournaments')).toBe(false);
	});
});
