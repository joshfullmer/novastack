import { describe, expect, it } from 'vitest';
import { isShareCode, normalizeShareCode, randomShareCode, SHARE_CODE_LENGTH } from './short-id.js';

describe('randomShareCode', () => {
	it('is 10 characters of lowercase Crockford base32', () => {
		for (let attempt = 0; attempt < 200; attempt += 1) {
			expect(randomShareCode()).toMatch(/^[0-9abcdefghjkmnpqrstvwxyz]{10}$/);
		}
	});

	it('never emits the four ambiguous letters', () => {
		// The whole point of the alphabet: `l` vs `1`, `o` vs `0`, and `u` out for spelling.
		const sample = Array.from({ length: 500 }, randomShareCode).join('');
		expect(sample).not.toMatch(/[ilou]/);
	});

	it('draws from the full alphabet — a masking bug would silently shrink it', () => {
		const seen = new Set(Array.from({ length: 2000 }, randomShareCode).join(''));
		expect(seen.size).toBe(32);
	});
});

describe('normalizeShareCode', () => {
	it('accepts the stored form unchanged', () => {
		expect(normalizeShareCode('k7m2qx9v4t')).toBe('k7m2qx9v4t');
	});

	it('folds case, since Crockford decoding is case-insensitive', () => {
		expect(normalizeShareCode('K7M2QX9V4T')).toBe('k7m2qx9v4t');
	});

	it('drops hyphens — they are separators, not part of the value', () => {
		expect(normalizeShareCode('k7m2-qx9v4t')).toBe('k7m2qx9v4t');
	});

	it('repairs the confusions the alphabet exists to avoid', () => {
		expect(normalizeShareCode('k7mzqxIv4t')).toBe('k7mzqx1v4t');
		expect(normalizeShareCode('k7mzqxlv4t')).toBe('k7mzqx1v4t');
		expect(normalizeShareCode('k7mzqxOv4t')).toBe('k7mzqx0v4t');
	});

	it('rejects anything that is not a code', () => {
		expect(normalizeShareCode('')).toBeNull();
		expect(normalizeShareCode('k7m2qx9v4')).toBeNull(); // 9 chars
		expect(normalizeShareCode('k7m2qx9v4tt')).toBeNull(); // 11
		expect(normalizeShareCode('k7m2 qx9v4t')).toBeNull(); // interior space
		expect(normalizeShareCode('k7m2qx9v4!')).toBeNull();
	});

	it('rejects a UUID, so the two identifier shapes never collide', () => {
		const uuid = '3f8a2c19-4b7e-4c2a-9d1e-6b5f0a7c8d3e';
		expect(normalizeShareCode(uuid)).toBeNull();
		expect(isShareCode(uuid)).toBe(false);
		expect(uuid.replaceAll('-', '').length).not.toBe(SHARE_CODE_LENGTH);
	});

	it('round-trips whatever the generator produces', () => {
		for (let attempt = 0; attempt < 200; attempt += 1) {
			const code = randomShareCode();
			expect(normalizeShareCode(code)).toBe(code);
			expect(isShareCode(code)).toBe(true);
		}
	});
});
