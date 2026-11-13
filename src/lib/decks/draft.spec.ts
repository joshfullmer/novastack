import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	DEFAULT_DECK_NAME,
	DRAFT_KEY,
	EMPTY_PAYLOAD,
	clearDraft,
	isEmptyDraft,
	loadDraft,
	storeDraft,
	type DraftState
} from './draft.js';

const draft = (overrides: Partial<DraftState> = {}): DraftState => ({
	name: 'My deck',
	payload: { entries: [{ cardSlug: 'chrome-fang', quantity: 2 }], legends: [], sideboard: [] },
	bookmarks: ['kiroshi-optics'],
	guide: '## Plan',
	...overrides
});

/** The `server` test project has no DOM; a Map is all `localStorage` is to this module. */
beforeEach(() => {
	const store = new Map<string, string>();
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => void store.set(key, value),
		removeItem: (key: string) => void store.delete(key)
	});
});

describe('the local draft', () => {
	it('round-trips', () => {
		storeDraft(draft());
		expect(loadDraft()).toEqual(draft());
	});

	it('is null when there is none', () => {
		expect(loadDraft()).toBeNull();
	});

	it('forgets a draft that has been emptied, rather than keeping a blank one', () => {
		storeDraft(draft());
		storeDraft(
			draft({ payload: EMPTY_PAYLOAD, bookmarks: [], guide: '', name: DEFAULT_DECK_NAME })
		);
		expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
	});

	it('clears', () => {
		storeDraft(draft());
		clearDraft();
		expect(loadDraft()).toBeNull();
	});

	describe('never trusts what it reads back', () => {
		it.each([
			['not JSON', '{nope'],
			['the wrong shape', JSON.stringify({ name: 1 })],
			[
				'a payload that fails validation',
				JSON.stringify({ ...draft(), payload: { entries: 'x' } })
			],
			['an oversized guide', JSON.stringify({ ...draft(), guide: 'x'.repeat(100_000) })]
		])('degrades %s to no draft', (_label, raw) => {
			localStorage.setItem(DRAFT_KEY, raw);
			expect(loadDraft()).toBeNull();
		});
	});
});

describe('isEmptyDraft', () => {
	const blank = draft({
		payload: EMPTY_PAYLOAD,
		bookmarks: [],
		guide: '',
		name: DEFAULT_DECK_NAME
	});

	it('is true for a deck nobody has touched', () => {
		expect(isEmptyDraft(blank)).toBe(true);
	});

	it.each([
		['a card', { payload: draft().payload }],
		['a bookmark', { bookmarks: ['x'] }],
		['a guide', { guide: 'hi' }],
		['a name of its own', { name: 'Burn' }]
	])('is false once it has %s', (_label, change) => {
		expect(isEmptyDraft({ ...blank, ...change })).toBe(false);
	});
});
