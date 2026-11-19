import { describe, expect, it, vi } from 'vitest';
import { BOOKMARKLET_SOURCE, bookmarklet } from './bookmarklet.ts';

/** Runs the bookmarklet against a stand-in page and reports what it did. */
async function click(url: string, { clipboard = true } = {}) {
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
		body: { append: (note: { textContent: string }) => notes.push(note.textContent) }
	};
	const navigator = {
		clipboard: {
			writeText: (text: string) =>
				clipboard ? (written.push(text), Promise.resolve()) : Promise.reject(new Error('denied'))
		}
	};
	new Function('location', 'document', 'navigator', 'prompt', 'setTimeout', BOOKMARKLET_SOURCE)(
		{ hostname, pathname },
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

	it('ignores what follows the id', async () => {
		const { written } = await click('https://melee.gg/Tournament/View/477190#standings');
		expect(written).toEqual(['pnpm melee 477190']);
	});

	it('says where to go from any other page, and copies nothing', async () => {
		const { written, notes } = await click('https://melee.gg/Decklist/View/abc');
		expect(written).toEqual([]);
		expect(notes[0]).toMatch(/Open a melee\.gg tournament page/);
		expect((await click('https://example.com/Tournament/View/1')).written).toEqual([]);
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
