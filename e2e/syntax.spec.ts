import { expect, test } from '@playwright/test';

/**
 * The Syntax page (spec §11) — reachable from the grid's query box and the footer, and its
 * worked examples are real, clickable links into the grid.
 */
test.describe('the Syntax page', () => {
	test('is linked from the footer', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('link', { name: 'Syntax' }).click();
		await expect(page).toHaveURL('/syntax');
		await expect(page.getByRole('heading', { name: 'Query syntax' })).toBeVisible();
	});

	test('is linked from the card database, next to the query box', async ({ page }) => {
		await page.goto('/cards');
		// Two links to /syntax exist on this page — inline by the query box, and in the footer.
		await page.getByRole('link', { name: 'Syntax' }).first().click();
		await expect(page).toHaveURL('/syntax');
	});

	test('renders the field table from the parser’s own vocabulary', async ({ page }) => {
		await page.goto('/syntax');
		await expect(page.getByRole('cell', { name: 'Card Type' })).toBeVisible();
		await expect(page.getByText('legends:', { exact: false }).first()).toBeVisible();
	});

	test('a worked example is a live link that actually filters the grid', async ({ page }) => {
		await page.goto('/syntax');
		await page.getByRole('link', { name: 'c:red', exact: true }).click();

		await expect(page).toHaveURL('/cards?q=c%3Ared');
		await expect(page.getByText(/^\d+ of \d+$/)).toBeVisible();
	});
});
