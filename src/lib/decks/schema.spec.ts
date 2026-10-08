/**
 * Round-trip parsing for the `deck_versions` JSON payload — mirrors `#lib/cards/schema.js`'s own
 * no-coercion conventions. This is the boundary between "JSON blob in a D1 column" and "typed
 * value the app trusts," so a malformed value must fail loudly, not silently coerce.
 */
import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import {
	DeckEntrySchema,
	DeckVersionPayloadSchema,
	LegendEntrySchema,
	legendRefsFromJson,
	legendSlugsFromJson
} from './schema.js';

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
	it('parses a full payload, normalizing legends to objects', () => {
		const payload = {
			entries: [{ cardSlug: 'v-streetkid', quantity: 1 }],
			legends: ['adam-smasher', { cardSlug: 'alt-cunningham', printingId: 'alt-beta' }],
			sideboard: [{ cardSlug: 'chrome-fang', quantity: 2 }]
		};
		expect(v.parse(DeckVersionPayloadSchema, payload)).toEqual({
			...payload,
			legends: [
				{ cardSlug: 'adam-smasher' },
				{ cardSlug: 'alt-cunningham', printingId: 'alt-beta' }
			]
		});
	});

	it('accepts a legends array of bare slugs — every row written before printings were choosable', () => {
		const parsed = v.parse(DeckVersionPayloadSchema, {
			entries: [],
			legends: ['adam-smasher', 'alt-cunningham', 'royce']
		});
		expect(parsed.legends).toEqual([
			{ cardSlug: 'adam-smasher' },
			{ cardSlug: 'alt-cunningham' },
			{ cardSlug: 'royce' }
		]);
	});

	it('parses zero entries and zero legends — a brand-new draft deck', () => {
		const payload = { entries: [], legends: [] };
		expect(v.parse(DeckVersionPayloadSchema, payload)).toEqual({ ...payload, sideboard: [] });
	});

	it('defaults an absent sideboard to empty — a row written before the column existed', () => {
		const parsed = v.parse(DeckVersionPayloadSchema, {
			entries: [{ cardSlug: 'v-streetkid', quantity: 1 }],
			legends: []
		});
		expect(parsed.sideboard).toEqual([]);
	});

	it('does not cap the sideboard at 7 — an oversized pile is a reported issue, not a load failure', () => {
		const sideboard = Array.from({ length: 4 }, (_, index) => ({
			cardSlug: `card-${index}`,
			quantity: 3
		}));
		expect(v.parse(DeckVersionPayloadSchema, { entries: [], legends: [], sideboard })).toEqual({
			entries: [],
			legends: [],
			sideboard
		});
	});

	it('rejects more than 3 legends', () => {
		const payload = { entries: [], legends: ['a', 'b', 'c', 'd'] };
		expect(() => v.parse(DeckVersionPayloadSchema, payload)).toThrow();
	});

	it('holds the sideboard to the same per-entry rules as the main deck', () => {
		const payload = { entries: [], legends: [], sideboard: [{ cardSlug: 'x', quantity: 4 }] };
		expect(() => v.parse(DeckVersionPayloadSchema, payload)).toThrow();
	});
});

describe('LegendEntrySchema', () => {
	it('turns a bare slug into an object, so downstream sees one shape', () => {
		expect(v.parse(LegendEntrySchema, 'adam-smasher')).toEqual({ cardSlug: 'adam-smasher' });
	});

	it('keeps a chosen printing', () => {
		const legend = { cardSlug: 'adam-smasher', printingId: 'adam-beta' };
		expect(v.parse(LegendEntrySchema, legend)).toEqual(legend);
	});

	it('rejects an empty slug in either shape', () => {
		expect(() => v.parse(LegendEntrySchema, '')).toThrow();
		expect(() => v.parse(LegendEntrySchema, { cardSlug: '' })).toThrow();
	});

	it('rejects an empty printingId rather than storing a meaningless one', () => {
		expect(() => v.parse(LegendEntrySchema, { cardSlug: 'x', printingId: '' })).toThrow();
	});
});

describe('legendSlugsFromJson', () => {
	it('reads both stored shapes, and a mix of them', () => {
		expect(
			legendSlugsFromJson(['adam-smasher', { cardSlug: 'royce', printingId: 'royce-beta' }])
		).toEqual(['adam-smasher', 'royce']);
	});

	it('is empty for anything that is not an array of legends', () => {
		// The deck-list pages read this straight off the row, so a surprise must render nothing
		// rather than throw on a page that is mostly about other decks.
		expect(legendSlugsFromJson(null)).toEqual([]);
		expect(legendSlugsFromJson(undefined)).toEqual([]);
		expect(legendSlugsFromJson('adam-smasher')).toEqual([]);
		expect(legendSlugsFromJson([42, null, {}, { cardSlug: 7 }, ''])).toEqual([]);
	});
});

describe('legendRefsFromJson', () => {
	it('keeps the printing a Legend was saved with, and leaves it off one that has none', () => {
		expect(
			legendRefsFromJson(['adam-smasher', { cardSlug: 'royce', printingId: 'royce-beta' }])
		).toEqual([{ cardSlug: 'adam-smasher' }, { cardSlug: 'royce', printingId: 'royce-beta' }]);
	});

	it('treats an empty printing id as none, not as a choice', () => {
		expect(legendRefsFromJson([{ cardSlug: 'royce', printingId: '' }])).toEqual([
			{ cardSlug: 'royce' }
		]);
	});

	it('is empty for anything that is not an array of legends', () => {
		expect(legendRefsFromJson(null)).toEqual([]);
		expect(legendRefsFromJson([42, null, {}, { cardSlug: 7 }, ''])).toEqual([]);
	});
});
