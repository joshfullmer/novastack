import { describe, expect, it, vi } from 'vitest';
import { BOOKMARKLET_SOURCE, bookmarklet } from './bookmarklet.ts';

/** Runs the bookmarklet against a stand-in page and reports what it did. */
async function click(url: string, { clipboard = true, links = [] as string[] } = {}) {
	const { hostname, pathname } = new URL(url);
	const notes: string[] = [];
	const written: string[] = [];
	const prompt = vi.fn();
	const document = {
		createElement: () => ({
			style: {},
			textContent: '',
			remove: () => {}
		}),
		querySelectorAll: () => links.map((href) => ({ href })),
		body: { append: (note: { textContent: string }) => notes.push(note.textContent) }
	};
	const navigator = {
		clipboard: {
			writeText: (text: string) =>
				clipboard ? (written.push(text), Promise.resolve()) : Promise.reject(new Error('denied'))
		}
	};
	new Function('location', 'document', 'navigator', 'prompt', 'setTimeout', BOOKMARKLET_SOURCE)(
		{ hostname, pathname, href: url },
		document,
		navigator,
		prompt,
		() => {}
	);
	await Promise.resolve();
	await Promise.resolve();
	return { notes, written, prompt };
}

describe('bookmarklet', () => {
	it('copies the ingest command for a tournament page', async () => {
		const { written, notes } = await click('https://melee.gg/Tournament/View/485070');
		expect(written).toEqual(['pnpm melee 485070']);
		expect(notes).toEqual(['Copied: pnpm melee 485070']);
	});

	it('copies one command for every tournament a search page links to, once each', async () => {
		const row = (id: number) => `https://melee.gg/Tournament/View/${id}`;
		const { written, notes } = await click('https://melee.gg/Decklists', {
			links: [
				row(474967),
				row(474967),
				'/Tournament/View/467844',
				'https://melee.gg/Organization/View/7050',
				row(492606)
			]
		});
		expect(written).toEqual(['pnpm melee 474967 467844 492606']);
		expect(notes).toEqual(['Copied: 3 events']);
	});

	it('ignores what follows the id', async () => {
		const { written } = await click('https://melee.gg/Tournament/View/477190#standings');
		expect(written).toEqual(['pnpm melee 477190']);
	});

	it('says so when a melee.gg page links to no tournaments, and copies nothing', async () => {
		const { written, notes } = await click('https://melee.gg/Decklist/View/abc');
		expect(written).toEqual([]);
		expect(notes).toEqual(['No tournaments found on this page.']);
	});

	it('stays out of other sites', async () => {
		const { written, notes } = await click('https://example.com/Tournament/View/1');
		expect(written).toEqual([]);
		expect(notes).toEqual(['Open a melee.gg page first.']);
	});

	it('offers the command to copy by hand when the clipboard is refused', async () => {
		const { prompt } = await click('https://melee.gg/Tournament/View/485070', { clipboard: false });
		expect(prompt).toHaveBeenCalledWith('Copy this:', 'pnpm melee 485070');
	});

	it('is one percent-encoded line that decodes back to a runnable program', () => {
		const url = bookmarklet();
		expect(url.startsWith('javascript:')).toBe(true);
		expect(url).not.toMatch(/[\s"<>]/);
		const program = decodeURIComponent(url.slice('javascript:'.length));
		expect(program).not.toContain('\n');
		expect(() => new Function(program)).not.toThrow();
	});
});
