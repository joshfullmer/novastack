import { expect, test, type Page } from '@playwright/test';
import { cardsOfColor, flavourOnlyWord, gotoGrid, snapshot, TOTAL_CARDS } from './snapshot.ts';

/**
 * The grid's interaction loop, against the real router.
 *
 * The regression these exist for: **a chip click updated the address bar but not the grid.**
 * Shallow routing deliberately leaves `page.url` pointing at the loaded page and exposes the new
 * URL at `page.shallow.url`, so reading `page.url` returned the URL we started on and filters only
 * appeared to work after a reload.
 *
 * Every assertion here therefore checks the **rendered result first**. A test that only asserted
 * "the URL changed" would have passed while the app was visibly broken.
 *
 * The chip panel collapses by default on every viewport now (spec §9), so every test that
 * touches a chip opens it first via `openChips`.
 */

const total = TOTAL_CARDS;
const count = cardsOfColor;

declare global {
	interface Window {
		/** Set by the Escape-propagation test only, to count keydowns that reach `window`. */
		__escapeCount?: number;
	}
}

const resultCount = (page: Page) => page.getByText(/^\d+ of \d+$/);

const tiles = (page: Page) => page.locator('ul li a[href^="/cards/"]');

// `combobox`, not `searchbox` — the query box grew autocomplete (ticket 04,
// `.scratch/editor-affordances/map.md`), and `combobox` is the ARIA-correct role once a text
// input has a popup of suggestions attached to it.
const queryBox = (page: Page) =>
	page.getByRole('combobox', { name: 'Search or filter with a query' });

const queryParam = (page: Page) => new URL(page.url()).searchParams.get('q');

async function openChips(page: Page) {
	await page.getByRole('button', { name: /^Chips & filters/ }).click();
}

test.describe('filtering', () => {
	test('narrows the grid on a chip click, without a reload', async ({ page }) => {
		await gotoGrid(page, '/cards');
		await expect(resultCount(page)).toHaveText(`${total} of ${total}`);

		// Prove no document navigation happens: an attribute set on <body> survives a shallow
		// update and would be gone after a real navigation, since the document would be replaced.
		await page.evaluate(() => (document.body.dataset.kept = 'yes'));

		await openChips(page);
		await page.getByRole('button', { name: 'Red', exact: true }).click();

		await expect(resultCount(page)).toHaveText(`${count('Red')} of ${total}`);
		await expect(tiles(page)).toHaveCount(count('Red'));
		expect(queryParam(page)).toBe('color:Red');
		await expect(page.locator('body')).toHaveAttribute('data-kept', 'yes');
	});

	test('ORs within a facet and ANDs across facets', async ({ page }) => {
		await gotoGrid(page, '/cards');
		await openChips(page);

		await page.getByRole('button', { name: 'Red', exact: true }).click();
		await page.getByRole('button', { name: 'Blue', exact: true }).click();
		await expect(resultCount(page)).toHaveText(`${count('Red') + count('Blue')} of ${total}`);

		await page.getByRole('button', { name: 'Legend', exact: true }).click();
		const expected = snapshot.cards.filter(
			(card) => (card.color === 'Red' || card.color === 'Blue') && card.cardType === 'Legend'
		).length;
		await expect(resultCount(page)).toHaveText(`${expected} of ${total}`);
	});

	test('a cleared filter leaves an absent param, not an empty one', async ({ page }) => {
		await gotoGrid(page, '/cards');
		await openChips(page);
		const red = page.getByRole('button', { name: 'Red', exact: true });

		await red.click();
		await expect(resultCount(page)).toHaveText(`${count('Red')} of ${total}`);
		await red.click();

		await expect(resultCount(page)).toHaveText(`${total} of ${total}`);
		expect(new URL(page.url()).search).toBe('');
	});

	test('Back is filter-undo', async ({ page }) => {
		await gotoGrid(page, '/cards');
		await openChips(page);
		await page.getByRole('button', { name: 'Red', exact: true }).click();
		await expect(resultCount(page)).toHaveText(`${count('Red')} of ${total}`);

		await page.goBack();

		await expect(resultCount(page)).toHaveText(`${total} of ${total}`);
		expect(new URL(page.url()).search).toBe('');
	});

	test('clear-all appears only when filters are active, and resets everything', async ({
		page
	}) => {
		await gotoGrid(page, '/cards');
		await expect(page.getByRole('button', { name: 'Clear all' })).toBeHidden();

		await openChips(page);
		await page.getByRole('button', { name: 'Red', exact: true }).click();
		await page.getByRole('button', { name: 'Clear all' }).click();

		await expect(resultCount(page)).toHaveText(`${total} of ${total}`);
		expect(new URL(page.url()).search).toBe('');
	});

	test('a shared filtered link narrows on hydration', async ({ page }) => {
		// The prerendered HTML is the *unfiltered* grid — static HTML cannot know a query string —
		// so this asserts the post-hydration state, which is the trade the spec makes explicit.
		await gotoGrid(page, '/cards?q=type%3Alegend');

		const legends = snapshot.cards.filter((card) => card.cardType === 'Legend').length;
		await expect(resultCount(page)).toHaveText(`${legends} of ${total}`);
	});

	test('a mangled query degrades to a wider result set, with a visible warning', async ({
		page
	}) => {
		await gotoGrid(page, '/cards?q=color%3Achartreuse%20cost%3Abanana%20tag%3Anonesuch');
		await expect(resultCount(page)).toHaveText(`${total} of ${total}`);
		// Superseding stage 1's own tested silent degrade (spec §6): the reader must be able to
		// tell they're seeing a wider result than what was typed, not just get more cards for free.
		await expect(page.getByRole('status')).toBeVisible();
	});

	test('the query box narrows across an em dash', async ({ page }) => {
		await gotoGrid(page, '/cards');
		await queryBox(page).fill('v streetkid');

		await expect(resultCount(page)).toHaveText(`1 of ${total}`);
		expect(queryParam(page)).toBe('v streetkid');
	});

	test('typing slower than the debounce does not lose keystrokes', async ({ page }) => {
		// Each keystroke here is far enough apart to push its own URL update, so the box gets
		// re-rendered between characters. If it rendered the URL's value directly, the older
		// string would land back in it and eat characters.
		await gotoGrid(page, '/cards');
		const box = queryBox(page);

		await box.pressSequentially('blocker', { delay: 300 });

		await expect(box).toHaveValue('blocker');
		expect(queryParam(page)).toBe('blocker');
	});

	test('search does not reach flavour text', async ({ page }) => {
		// Flavour is prose, not a game effect; matching it would be a lie about what the card does.
		// The ingest split pulled this text out of `rules_text` precisely so it is not searchable.
		await gotoGrid(page, '/cards');
		await queryBox(page).fill(flavourOnlyWord());

		await expect(page.getByText('No cards match these filters.')).toBeVisible();
	});

	test('a power bound never admits null, and + none restores those cards', async ({ page }) => {
		await gotoGrid(page, '/cards?q=0%3C%3Dpower%3C%3D15');
		const withPower = snapshot.cards.filter((card) => card.power !== null).length;
		expect(withPower).toBeLessThan(total);
		await expect(resultCount(page)).toHaveText(`${withPower} of ${total}`);

		await openChips(page);
		await page.getByRole('button', { name: /Include the \d+ cards with no power/ }).click();
		await expect(resultCount(page)).toHaveText(`${total} of ${total}`);
	});

	test('the colored RAM budget admits the cards the spec verified by hand', async ({ page }) => {
		await gotoGrid(page, '/cards?q=legends%3Ar4b2');
		await expect(resultCount(page)).toHaveText(`57 of ${total}`);
	});

	test('the result count lives in a polite live region', async ({ page }) => {
		await gotoGrid(page, '/cards');
		await expect(resultCount(page)).toHaveAttribute('aria-live', 'polite');
	});

	/**
	 * Escape's two stages (the ARIA APG combobox pattern's own optional behaviour): dismiss the
	 * suggestion popup while it's showing, clear the box once it isn't.
	 */
	test.describe('Escape', () => {
		test('dismisses the popup first and clears only on the second press', async ({ page }) => {
			await gotoGrid(page, '/cards');
			const box = queryBox(page);
			// Ends on a completable word, so the popup is open — `rar` prefixes the `rarity` keyword.
			await box.pressSequentially('c:red rar');
			await expect(page.getByRole('option', { name: /rarity/ })).toBeVisible();

			await box.press('Escape');
			await expect(page.getByRole('option', { name: /rarity/ })).toHaveCount(0);
			// The load-bearing half: dismissing the popup must not also wipe what was typed.
			await expect(box).toHaveValue('c:red rar');

			await box.press('Escape');
			await expect(box).toHaveValue('');
			// A cleared query is an absent param, the same canonicality rule "Clear all" keeps.
			await expect(page).toHaveURL('/cards');
		});

		test('leaves the clear undoable', async ({ page }) => {
			// `clear()` goes through `execCommand` rather than assigning state precisely so this
			// works — one keypress must not be able to destroy a long hand-written query. Undo fires
			// its own `input` event, so the text, the highlight overlay and the URL all come back.
			await gotoGrid(page, '/cards');
			const box = queryBox(page);
			// A word no field keyword prefixes, so no popup is open and Escape goes straight to the
			// clear. `c:red` would spend the first press dismissing the suggestion for `red`.
			await box.fill('blocker');
			await expect(page).toHaveURL('/cards?q=blocker');

			await box.press('Escape');
			await expect(box).toHaveValue('');

			await box.press('ControlOrMeta+z');
			await expect(box).toHaveValue('blocker');
			await expect(page).toHaveURL('/cards?q=blocker');
		});

		test('reaches window handlers only when there is nothing to clear', async ({ page }) => {
			// `DeckEntryManager` closes on a window-level Escape, and `Nav` carries this same box on
			// every wide page — so a clear has to stop propagating, or one press would clear the box
			// and close an unrelated sheet. An *empty* box must not swallow the key for nothing.
			await gotoGrid(page, '/cards');
			const box = queryBox(page);

			await page.evaluate(() => {
				window.__escapeCount = 0;
				window.addEventListener('keydown', (event) => {
					if (event.key === 'Escape') window.__escapeCount = (window.__escapeCount ?? 0) + 1;
				});
			});
			const seen = () => page.evaluate(() => window.__escapeCount ?? 0);

			await box.fill('blocker');
			await box.press('Escape');
			await expect(box).toHaveValue('');
			expect(await seen(), 'a clear must not also trip window handlers').toBe(0);

			await box.press('Escape');
			expect(await seen(), 'an empty box has no reason to swallow Escape').toBe(1);
		});
	});
});

test.describe('printing-level filters swap the art', () => {
	test('shows the printing that matched, badged with its collector number', async ({ page }) => {
		const v = snapshot.cards.find((card) => card.slug === 'v-streetkid');
		const iconic = v?.printings.find((printing) => printing.rarity === 'Iconic Legend');
		expect(iconic).toBeDefined();

		await gotoGrid(page, '/cards?q=rarity%3Aiconic-legend');

		const tile = page.locator(`a[href="/cards/v-streetkid"]`);
		await expect(tile.locator('img').nth(1)).toHaveAttribute(
			'src',
			`/card-art/${iconic?.id}/488.webp`
		);
		// The only tile text there is: supplementary to the art, never a replacement for it.
		await expect(tile.getByText(String(iconic?.collectorNumber))).toBeVisible();
	});
});

test.describe('the detail pane', () => {
	test('selecting a tile fills the pane and does not navigate', async ({ page }) => {
		await gotoGrid(page, '/cards');
		await expect(page.getByText(/Select a card to read it here/)).toBeVisible();

		const first = tiles(page).first();
		const href = await first.getAttribute('href');
		await first.click();

		await expect(page.getByRole('complementary', { name: 'Selected card' })).toContainText(
			'Collector no.'
		);
		// Never navigates: the grid stays put while the pane does the reading.
		expect(new URL(page.url()).pathname).toBe('/cards');
		expect(href).toMatch(/^\/cards\//);
	});

	test('a selection filtered away stops being shown', async ({ page }) => {
		await gotoGrid(page, '/cards?q=color%3Ared');
		await tiles(page).first().click();
		await expect(page.getByRole('complementary', { name: 'Selected card' })).toContainText(
			'Collector no.'
		);

		await openChips(page);
		await page.getByRole('button', { name: 'Red', exact: true }).click();
		await page.getByRole('button', { name: 'Blue', exact: true }).click();

		await expect(page.getByText(/Select a card to read it here/)).toBeVisible();
	});
});
