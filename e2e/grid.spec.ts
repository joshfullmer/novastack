import { expect, test } from '@playwright/test';
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
 */

const total = TOTAL_CARDS;
const count = cardsOfColor;

const resultCount = (page: import('@playwright/test').Page) => page.getByText(/^\d+ of \d+$/);

const tiles = (page: import('@playwright/test').Page) => page.locator('ul li a[href^="/cards/"]');

test.describe('filtering', () => {
	test('narrows the grid on a chip click, without a reload', async ({ page }) => {
		await gotoGrid(page, '/cards');
		await expect(resultCount(page)).toHaveText(`${total} of ${total}`);

		// Prove no document navigation happens: a value set on `window` must survive the click.
		await page.evaluate(() => ((window as unknown as { __kept: boolean }).__kept = true));

		await page.getByRole('button', { name: 'Red', exact: true }).click();

		await expect(resultCount(page)).toHaveText(`${count('Red')} of ${total}`);
		await expect(tiles(page)).toHaveCount(count('Red'));
		expect(new URL(page.url()).search).toBe('?color=red');
		expect(await page.evaluate(() => (window as unknown as { __kept?: boolean }).__kept)).toBe(
			true
		);
	});

	test('ORs within a facet and ANDs across facets', async ({ page }) => {
		await gotoGrid(page, '/cards');

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
		const red = page.getByRole('button', { name: 'Red', exact: true });

		await red.click();
		await expect(resultCount(page)).toHaveText(`${count('Red')} of ${total}`);
		await red.click();

		await expect(resultCount(page)).toHaveText(`${total} of ${total}`);
		expect(new URL(page.url()).search).toBe('');
	});

	test('Back is filter-undo', async ({ page }) => {
		await gotoGrid(page, '/cards');
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

		await page.getByRole('button', { name: 'Red', exact: true }).click();
		await page.getByRole('button', { name: 'Clear all' }).click();

		await expect(resultCount(page)).toHaveText(`${total} of ${total}`);
		expect(new URL(page.url()).search).toBe('');
	});

	test('a shared filtered link narrows on hydration', async ({ page }) => {
		// The prerendered HTML is the *unfiltered* grid — static HTML cannot know a query string —
		// so this asserts the post-hydration state, which is the trade the spec makes explicit.
		await gotoGrid(page, '/cards?type=legend');

		const legends = snapshot.cards.filter((card) => card.cardType === 'Legend').length;
		await expect(resultCount(page)).toHaveText(`${legends} of ${total}`);
	});

	test('a mangled link degrades to a wider result set rather than erroring', async ({ page }) => {
		await gotoGrid(page, '/cards?color=chartreuse&cost=banana&tags=nonesuch');
		await expect(resultCount(page)).toHaveText(`${total} of ${total}`);
	});

	test('search narrows across an em dash', async ({ page }) => {
		await gotoGrid(page, '/cards');
		await page.getByRole('searchbox', { name: 'Search cards' }).fill('v streetkid');

		await expect(resultCount(page)).toHaveText(`1 of ${total}`);
		expect(new URL(page.url()).searchParams.get('search')).toBe('v streetkid');
	});

	test('typing slower than the debounce does not lose keystrokes', async ({ page }) => {
		// Each keystroke here is far enough apart to push its own URL update, so the search box gets
		// re-rendered between characters. If the box rendered the URL's value directly, the older
		// string would land back in it and eat characters.
		await gotoGrid(page, '/cards');
		const box = page.getByRole('searchbox', { name: 'Search cards' });

		await box.pressSequentially('blocker', { delay: 300 });

		await expect(box).toHaveValue('blocker');
		expect(new URL(page.url()).searchParams.get('search')).toBe('blocker');
	});

	test('search does not reach flavour text', async ({ page }) => {
		// Flavour is prose, not a game effect; matching it would be a lie about what the card does.
		// The ingest split pulled this text out of `rules_text` precisely so it is not searchable.
		await gotoGrid(page, '/cards');
		await page.getByRole('searchbox', { name: 'Search cards' }).fill(flavourOnlyWord());

		await expect(page.getByText('No cards match these filters.')).toBeVisible();
	});

	test('a power bound never admits null, and + none restores those cards', async ({ page }) => {
		await gotoGrid(page, '/cards?power=0-15');
		const withPower = snapshot.cards.filter((card) => card.power !== null).length;
		expect(withPower).toBeLessThan(total);
		await expect(resultCount(page)).toHaveText(`${withPower} of ${total}`);

		await page.getByRole('button', { name: /Include the \d+ cards with no power/ }).click();
		await expect(resultCount(page)).toHaveText(`${total} of ${total}`);
	});

	test('the coloured RAM budget admits the cards the spec verified by hand', async ({ page }) => {
		await gotoGrid(page, '/cards?legends=red,red,blue');
		await expect(resultCount(page)).toHaveText(`57 of ${total}`);
	});

	test('the result count lives in a polite live region', async ({ page }) => {
		await gotoGrid(page, '/cards');
		await expect(resultCount(page)).toHaveAttribute('aria-live', 'polite');
	});
});

test.describe('printing-level filters swap the art', () => {
	test('shows the printing that matched, badged with its collector number', async ({ page }) => {
		const v = snapshot.cards.find((card) => card.slug === 'v-streetkid');
		const iconic = v?.printings.find((printing) => printing.rarity === 'Iconic Legend');
		expect(iconic).toBeDefined();

		await gotoGrid(page, '/cards?rarity=iconic-legend');

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
		await gotoGrid(page, '/cards?color=red');
		await tiles(page).first().click();
		await expect(page.getByRole('complementary', { name: 'Selected card' })).toContainText(
			'Collector no.'
		);

		await page.getByRole('button', { name: 'Red', exact: true }).click();
		await page.getByRole('button', { name: 'Blue', exact: true }).click();

		await expect(page.getByText(/Select a card to read it here/)).toBeVisible();
	});
});
