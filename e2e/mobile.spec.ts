import { expect, test } from '@playwright/test';
import { gotoGrid } from './snapshot.ts';

/**
 * The phone composition, which is genuinely different rather than a squeezed desktop.
 *
 * Measured at 390px, the three-pane layout failed badly: the header consumed ~350px of 844 and the
 * fixed pane crushed the grid to a ~55px sliver. So below the breakpoint the pane disappears,
 * tapping a card navigates to its page, filters collapse behind one button, and columns clamp.
 * This is what makes the detail route earn its keep rather than duplicating the pane.
 */
test.describe('on a phone', () => {
	test('hides the detail pane entirely', async ({ page }) => {
		await gotoGrid(page, '/cards');
		await expect(page.getByRole('complementary', { name: 'Selected card' })).toBeHidden();
	});

	test('tapping a card navigates to its page instead of selecting', async ({ page }) => {
		await gotoGrid(page, '/cards');

		const first = page.locator('ul li a[href^="/cards/"]').first();
		const href = await first.getAttribute('href');
		await first.click();

		await expect(page).toHaveURL(String(href));
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	});

	test('collapses the filters behind a single button', async ({ page }) => {
		await gotoGrid(page, '/cards');

		const toggle = page.getByRole('button', { name: /^Chips & filters/ });
		await expect(toggle).toBeVisible();
		await expect(page.getByRole('button', { name: 'Red', exact: true })).toBeHidden();

		await toggle.click();
		await expect(page.getByRole('button', { name: 'Red', exact: true })).toBeVisible();
	});

	test('the collapsed button reports how many facets are engaged', async ({ page }) => {
		await gotoGrid(page, '/cards?q=color%3Ared%20type%3Aunit');
		await expect(page.getByRole('button', { name: /Chips & filters.*2 active/ })).toBeVisible();
	});

	test('clamps the grid to a readable number of columns', async ({ page }) => {
		await gotoGrid(page, '/cards');

		const grid = page
			.locator('ul')
			.filter({ has: page.locator('li a[href^="/cards/"]') })
			.first();
		const columns = await grid.evaluate(
			(element) => getComputedStyle(element).gridTemplateColumns.split(' ').length
		);
		expect(columns).toBeLessThanOrEqual(3);
		expect(columns).toBeGreaterThanOrEqual(2);

		// The guard that matters: a tile must never be floored to zero width.
		const tile = page.locator('ul li a[href^="/cards/"]').first();
		const box = await tile.boundingBox();
		expect(box?.width ?? 0).toBeGreaterThan(0);
	});

	test('filtering still works with the panel open', async ({ page }) => {
		await gotoGrid(page, '/cards');
		await page.getByRole('button', { name: /^Chips & filters/ }).click();
		await page.getByRole('button', { name: 'Red', exact: true }).click();

		expect(new URL(page.url()).searchParams.get('q')).toBe('color:Red');
		await expect(page.getByText(/^\d+ of \d+$/)).toBeVisible();
	});
});
