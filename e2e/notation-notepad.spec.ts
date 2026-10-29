import { expect, test } from '@playwright/test';

/**
 * The notepad sheet (`/notation/scoresheet`): one best-of-three match on a landscape page
 * sized for an A5 or half-letter pad, with a QR code to the notation where the rules text would be.
 *
 * Page counts are read from the PDF Chromium prints, as for the scoresheet.
 */
test.describe('the notepad sheet', () => {
	test('is one match of three games, sixteen rows each, with a key and a QR code', async ({
		page
	}) => {
		await page.goto('/notation/scoresheet');

		const sheet = page.getByLabel('Nova Notation notepad sheet');
		await expect(sheet.getByRole('region', { name: /^Game / })).toHaveCount(3);
		await expect(sheet.getByRole('region', { name: /^Game / }).getByRole('listitem')).toHaveCount(
			3 * 16
		);
		await expect(sheet.getByText('notes', { exact: true })).toHaveCount(0);
		await expect(sheet.getByRole('heading', { name: 'DICE' })).toBeVisible();
		await expect(sheet.getByRole('heading', { name: 'ACTIONS' })).toBeVisible();
		// The QR code says where it goes.
		await expect(sheet.getByRole('img', { name: /^QR code for .+\/notation$/ })).toBeVisible();
	});

	test('fits its column on screen at any width instead of scrolling sideways', async ({ page }) => {
		for (const width of [1280, 1024, 768, 390]) {
			await page.setViewportSize({ width, height: 900 });
			await page.goto('/notation/scoresheet');
			await page.waitForLoadState('networkidle');

			const box = (await page.getByLabel('Nova Notation notepad sheet').boundingBox())!;
			expect(box.x, `${width}px: left edge`).toBeGreaterThanOrEqual(0);
			expect(box.x + box.width, `${width}px: right edge`).toBeLessThanOrEqual(width);

			const scrolls = await page.evaluate(
				() => document.documentElement.scrollWidth > document.documentElement.clientWidth
			);
			expect(scrolls, `${width}px: page scrolls sideways`).toBe(false);
		}
	});

	test('has no text running out of its box', async ({ page }) => {
		await page.goto('/notation/scoresheet');
		const overflowing = await page.getByLabel('Nova Notation notepad sheet').evaluate((sheet) =>
			[...sheet.querySelectorAll('*')]
				.filter((el) => !(el instanceof SVGElement))
				.filter((el) => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1)
				.map((el) => `${el.className} ${el.textContent?.trim().slice(0, 20)}`)
		);
		expect(overflowing).toEqual([]);
	});

	test('prints as exactly one page on A5 and on half-letter', async ({ page }) => {
		await page.goto('/notation/scoresheet');
		await page.emulateMedia({ media: 'print' });

		const papers = {
			A5: { format: 'A5' },
			'Half-letter': { width: '8.5in', height: '5.5in' }
		} as const;
		for (const [name, paper] of Object.entries(papers)) {
			const pdf = await page.pdf({
				...paper,
				landscape: name === 'A5',
				margin: { top: '8mm', bottom: '8mm', left: '8mm', right: '8mm' }
			});
			const counts = [...new TextDecoder('latin1').decode(pdf).matchAll(/\/Count (\d+)/g)].map(
				(m) => m[1]
			);
			expect(counts, name).toEqual(['1']);
		}
	});
});
