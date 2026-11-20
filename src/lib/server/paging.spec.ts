import { describe, expect, it, vi } from 'vitest';
import { fetchPage } from './paging.ts';

const list = (pages: number) =>
	vi.fn(async (page: number) => ({ page: Math.min(page, pages), pages }));

describe('fetchPage', () => {
	it('fetches page one once for page one', async () => {
		const fetch = list(5);
		expect(await fetchPage(1, fetch)).toEqual({ page: 1, pages: 5 });
		expect(fetch.mock.calls).toEqual([[1]]);
	});

	it('fetches the page asked for, after page one, when it exists', async () => {
		const fetch = list(5);
		expect((await fetchPage(3, fetch)).page).toBe(3);
		expect(fetch.mock.calls).toEqual([[1], [3]]);
	});

	it('serves a page past the end as the last, asking for the same key every time', async () => {
		const fetch = list(5);
		for (const asked of [6, 40, 999_999]) expect((await fetchPage(asked, fetch)).page).toBe(5);
		expect(new Set(fetch.mock.calls.map(([page]) => page))).toEqual(new Set([1, 5]));
	});

	it('does not fetch again when the only page is the first', async () => {
		const fetch = list(1);
		expect((await fetchPage(50, fetch)).page).toBe(1);
		expect(fetch).toHaveBeenCalledTimes(1);
	});
});
