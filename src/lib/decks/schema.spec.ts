/**
 * Round-trip parsing for the `deck_versions` JSON payload — mirrors `#lib/cards/schema.js`'s own
 * no-coercion conventions. This is the boundary between "JSON blob in a D1 column" and "typed
 * value the app trusts," so a malformed value must fail loudly, not silently coerce.
 */
import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { DeckEntrySchema, DeckVersionPayloadSchema } from './schema.js';

describe('DeckEntrySchema', () => {
	it('parses a full entry', () => {
		const entry = { cardSlug: 'v-streetkid', quantity: 2, printingId: 'MS01-WNC-005' };
		expect(v.parse(DeckEntrySchema, entry)).toEqual(entry);
	});

	it('parses an entry with no printingId — falls back to the Default Printing', () => {
		const entry = { cardSlug: 'v-streetkid', quantity: 1 };
		expect(v.parse(DeckEntrySchema, entry)).toEqual(entry);
	});

	it('rejects a quantity outside 1–3', () => {
		expect(() => v.parse(DeckEntrySchema, { cardSlug: 'x', quantity: 0 })).toThrow();
		expect(() => v.parse(DeckEntrySchema, { cardSlug: 'x', quantity: 4 })).toThrow();
	});

	it('rejects an empty cardSlug', () => {
		expect(() => v.parse(DeckEntrySchema, { cardSlug: '', quantity: 1 })).toThrow();
	});
});

describe('DeckVersionPayloadSchema', () => {
	it('parses a full payload', () => {
		const payload = {
			entries: [{ cardSlug: 'v-streetkid', quantity: 1 }],
			legends: ['adam-smasher', 'alt-cunningham']
		};
		expect(v.parse(DeckVersionPayloadSchema, payload)).toEqual(payload);
	});

	it('parses zero entries and zero legends — a brand-new draft deck', () => {
		const payload = { entries: [], legends: [] };
		expect(v.parse(DeckVersionPayloadSchema, payload)).toEqual(payload);
	});

	it('rejects more than 3 legends', () => {
		const payload = { entries: [], legends: ['a', 'b', 'c', 'd'] };
		expect(() => v.parse(DeckVersionPayloadSchema, payload)).toThrow();
	});
});
