import { expect, test } from '@playwright/test';

/**
 * The `/` search shortcut. `/faq` stands in for "any route that shows the header box" — it's
 * hidden on `/` and `/cards`, and `/cards` has its own query row for the shortcut to land on.
 */
test.describe('the `/` search shortcut', () => {
	test('focuses the header search without typing the slash into it', async ({ page }) => {
		await page.goto('/faq');
		const search = page.getByRole('combobox', { name: 'Search cards' });

		// `/faq` is prerendered, so the key can land before hydration has attached the listener.
		// Pressing is idempotent until it takes, hence the retry rather than a fixed wait.
		await expect(async () => {
			await page.keyboard.press('/');
			await expect(search).toBeFocused({ timeout: 250 });
		}).toPass();

		await expect(search).toHaveValue('');
	});

	test('leaves a slash typed into another field alone', async ({ page }) => {
		await page.goto('/faq');
		await page.waitForLoadState('networkidle');
		await page.evaluate(() =>
			document.body.insertAdjacentHTML('beforeend', '<input id="other" />')
		);
		await page.locator('#other').focus();

		await page.keyboard.press('/');

		await expect(page.locator('#other')).toHaveValue('/');
	});

	test('focuses the grid query on /cards, where the header has no search', async ({ page }) => {
		await page.goto('/cards');
		const search = page.getByRole('combobox', { name: 'Search or filter with a query' });
		// Autofocused on arrival, so it has to be left before the shortcut has anything to do.
		await expect(search).toBeFocused();
		await search.blur();

		await expect(async () => {
			await page.keyboard.press('/');
			await expect(search).toBeFocused({ timeout: 250 });
		}).toPass();

		await expect(search).toHaveValue('');
	});
});

/**
 * The nav's dropdowns open on hover and on focus-within, and both outlast a click: the pointer is
 * still over the item and the link keeps focus through a client-side navigation. Using a link in
 * one closes it.
 */
test.describe('the nav dropdowns', () => {
	const open = async (page: import('@playwright/test').Page) => {
		await page.goto('/faq');
		await page.waitForLoadState('networkidle');
		const group = page.locator('nav li.group').first(); // Cards
		await group.getByRole('link', { name: 'Cards', exact: true }).hover();
		const menu = group.locator('ul');
		await expect(menu).toBeVisible();
		return { group, menu };
	};

	test('close once a link inside is clicked, and open again on the next visit', async ({
		page
	}) => {
		const { group, menu } = await open(page);

		await menu.getByRole('link', { name: 'Sets' }).click();
		await expect(page).toHaveURL('/sets');
		await expect(menu).toBeHidden();

		// Away and back: the menu is not stuck shut.
		await page.mouse.move(600, 400);
		await group.getByRole('link', { name: 'Cards', exact: true }).hover();
		await expect(menu).toBeVisible();
	});

	test('stay open for a modified click, which leaves this page where it is', async ({ page }) => {
		const { menu } = await open(page);

		await menu.getByRole('link', { name: 'Sets' }).click({ modifiers: ['ControlOrMeta'] });
		await expect(menu).toBeVisible();
	});

	test('open for a keyboard user and close when they follow a link', async ({ page }) => {
		await page.goto('/faq');
		await page.waitForLoadState('networkidle');
		const group = page.locator('nav li.group').first();
		const menu = group.locator('ul');

		await group.getByRole('link', { name: 'Cards', exact: true }).focus();
		await page.keyboard.press('Tab');
		await expect(menu).toBeVisible();

		await page.keyboard.press('Tab'); // Browse -> Sets
		await page.keyboard.press('Enter');
		await expect(page).toHaveURL('/sets');
		await expect(menu).toBeHidden();
	});
});
