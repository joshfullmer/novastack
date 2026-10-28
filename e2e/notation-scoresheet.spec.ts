import { expect, test } from '@playwright/test';

/**
 * The printable scoresheet (`/notation/scoresheet`): four best-of-three matches on one landscape
 * page, sixteen rows a game, no notes box.
 *
 * Page counts are read from the PDF Chromium prints, in print media — the same engine and the same
 * `@page` rule a player's print dialog uses, for the two paper sizes the sheet promises to fit.
 */
test.describe('the scoresheet', () => {
	test('is four matches of three games, sixteen rows each, with nowhere to take notes', async ({
		page
	}) => {
		await page.goto('/notation/scoresheet');

		const sheet = page.getByLabel('Nova Notation scoresheet');
		await expect(sheet.getByRole('region', { name: /^Match / })).toHaveCount(4);
		await expect(sheet.getByRole('region', { name: /^Game / })).toHaveCount(12);
		await expect(sheet.getByRole('listitem')).toHaveCount(12 * 16);
		await expect(sheet.getByText('17', { exact: true })).toHaveCount(0);
		await expect(sheet.getByText('notes', { exact: true })).toHaveCount(0);
		await expect(sheet).toContainText('Draft v0.1');
		// The site's nine-square mark, once, in the header.
		await expect(sheet.locator('svg')).toHaveCount(1);
	});

	test('fits its column on screen at any width instead of scrolling sideways', async ({ page }) => {
		for (const width of [1280, 1024, 768, 390]) {
			await page.setViewportSize({ width, height: 900 });
			await page.goto('/notation/scoresheet');
			await page.waitForLoadState('networkidle');

			const sheet = page.getByLabel('Nova Notation scoresheet');
			const box = (await sheet.boundingBox())!;
			expect(box.x, `${width}px: left edge`).toBeGreaterThanOrEqual(0);
			expect(box.x + box.width, `${width}px: right edge`).toBeLessThanOrEqual(width);

			const scrolls = await page.evaluate(
				() => document.documentElement.scrollWidth > document.documentElement.clientWidth
			);
			expect(scrolls, `${width}px: page scrolls sideways`).toBe(false);
		}
	});

	test('prints as exactly one page on Letter and on A4', async ({ page }) => {
		await page.goto('/notation/scoresheet');
		await page.emulateMedia({ media: 'print' });

		for (const format of ['Letter', 'A4'] as const) {
			const pdf = await page.pdf({
				format,
				landscape: true,
				margin: { top: '8mm', bottom: '8mm', left: '8mm', right: '8mm' }
			});
			const counts = [...new TextDecoder('latin1').decode(pdf).matchAll(/\/Count (\d+)/g)].map(
				(m) => m[1]
			);
			expect(counts, format).toEqual(['1']);
		}
	});
});
