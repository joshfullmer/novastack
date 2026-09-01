import { describe, expect, it } from 'vitest';
import { positionFloating } from './floating-position.js';

const viewport = { width: 390, height: 844 };

describe('positionFloating', () => {
	it('stays on the preferred side when it has room', () => {
		const anchor = { left: 20, right: 300, top: 100, bottom: 140 };
		const result = positionFloating(anchor, 20, 'below', { width: 200, height: 100 }, viewport);
		expect(result.side).toBe('below');
		expect(result.y).toBe(anchor.bottom + 4);
	});

	it('flips to the other side when the preferred side is too cramped and the other has more room', () => {
		// Anchor near the bottom of a short viewport — almost no room below, plenty above.
		const anchor = { left: 20, right: 300, top: 700, bottom: 740 };
		const result = positionFloating(anchor, 20, 'below', { width: 200, height: 200 }, viewport);
		expect(result.side).toBe('above');
		expect(result.y).toBe(anchor.top - 4);
	});

	it('does not flip when the preferred side merely has less room, not less than needed', () => {
		const anchor = { left: 20, right: 300, top: 400, bottom: 440 };
		// 404px below is more than the 100px the box needs — stays, even though "above" has more.
		const result = positionFloating(anchor, 20, 'below', { width: 200, height: 100 }, viewport);
		expect(result.side).toBe('below');
	});

	it('does not flip back and forth between two sides that both fit', () => {
		const anchor = { left: 20, right: 300, top: 400, bottom: 440 };
		const below = positionFloating(anchor, 20, 'below', { width: 200, height: 50 }, viewport);
		const above = positionFloating(anchor, 20, 'above', { width: 200, height: 50 }, viewport);
		expect(below.side).toBe('below');
		expect(above.side).toBe('above');
	});

	it('when neither side fits, keeps the preferred side rather than flipping to an equally bad one', () => {
		const anchor = { left: 20, right: 300, top: 400, bottom: 440 };
		const tooTall = { width: 200, height: 10_000 };
		const result = positionFloating(anchor, 20, 'below', tooTall, viewport);
		expect(result.side).toBe('below');
	});

	it('clamps x so the box never overflows the right edge of the viewport', () => {
		const anchor = { left: 350, right: 390, top: 100, bottom: 140 };
		const result = positionFloating(anchor, 350, 'below', { width: 200, height: 50 }, viewport);
		expect(result.x).toBeLessThanOrEqual(viewport.width - 200 - 4);
		expect(result.x).toBeGreaterThanOrEqual(0);
	});

	it('clamps x so the box never overflows the left edge of the viewport', () => {
		const anchor = { left: -50, right: 10, top: 100, bottom: 140 };
		const result = positionFloating(anchor, -50, 'below', { width: 200, height: 50 }, viewport);
		expect(result.x).toBe(4);
	});

	it('falls back to the left-edge margin rather than a negative position when the box is wider than the viewport', () => {
		const anchor = { left: 20, right: 300, top: 100, bottom: 140 };
		const result = positionFloating(anchor, 20, 'below', { width: 500, height: 50 }, viewport);
		expect(result.x).toBe(4);
	});
});
