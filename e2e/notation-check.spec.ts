import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * The Check page (`/notation/check`) — paste a transcript, get a verdict, share it as a link.
 *
 * `/notation/check` is prerendered, so a `fill` that lands before hydration is overwritten when
 * `bind:value` attaches. `networkidle` is the cheap way to know the page is live, the same
 * compromise `nav.spec.ts` makes.
 */
const open = async (page: Page, url = '/notation/check') => {
	await page.goto(url);
	await page.waitForLoadState('networkidle');
};

test.describe('the Check page', () => {
	test('calls a legal game VALID and names the winner', async ({ page }) => {
		await open(page);
		await page.getByRole('button', { name: 'Full game' }).click();

		await expect(page.getByText('VALID', { exact: true })).toBeVisible();
		await expect(page.getByText('WE wins at the start of turn 11')).toBeVisible();
	});

	test('lists an illegal move by turn, and explains it on hover', async ({ page }) => {
		await open(page);
		await page.locator('#transcript').fill("A4 -A1\nA'4\nB4 -B2 B'3\n");

		await expect(page.getByText('INVALID', { exact: true })).toBeVisible();
		const error = page.getByRole('listitem').filter({ hasText: 'T03' });
		await expect(error).toContainText("Roll: B' is not WE's die");

		// The same reason is on the move itself, in the turn-by-turn column.
		await page.getByRole('button', { name: "B'3" }).hover();
		await expect(page.getByRole('tooltip')).toContainText("Not legal — Roll: B' is not WE's die");
	});

	test('shows the dice state above the turn-by-turn list', async ({ page }) => {
		await open(page);
		await page.getByRole('button', { name: 'Full game' }).click();

		const board = page.getByText('FIXER').first();
		const turns = page.getByText('TURN BY TURN');
		await expect(board).toBeVisible();
		const [boardY, turnsY] = await Promise.all([
			board.evaluate((el) => el.getBoundingClientRect().top),
			turns.evaluate((el) => el.getBoundingClientRect().top)
		]);
		expect(boardY).toBeLessThan(turnsY);
	});

	test('typing the first character does not shift the layout', async ({ page }) => {
		await open(page);
		// Everything that sits still while you type: the page's own box, the input, and the buttons
		// beside the turn count. A flex child that is `mx-auto` without `w-full` shrinks to its
		// content, so the empty state and the results state used to differ in width.
		const spots = () =>
			page.evaluate(() => {
				const box = (el: Element | undefined | null) => {
					const b = el!.getBoundingClientRect();
					return [b.left, b.top, b.width].map(Math.round);
				};
				const button = (name: string) =>
					[...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === name);
				return {
					title: box(document.querySelector('h1')),
					input: box(document.querySelector('#transcript')),
					reset: box(button('Reset')),
					share: box(button('Share'))
				};
			});

		const before = await spots();
		await page.locator('#transcript').pressSequentially('A');
		await expect(page.getByText('1 turn', { exact: true })).toBeVisible();
		expect(await spots()).toEqual(before);
	});

	test('Reset empties the box and clears the shared link from the address bar', async ({
		page
	}) => {
		await open(page);
		await page.getByRole('button', { name: 'Full game' }).click();
		await expect(page).toHaveURL(/#g=/);

		await page.getByRole('button', { name: 'Reset' }).click();

		await expect(page.locator('#transcript')).toHaveValue('');
		await expect(page.getByText('Awaiting a transcript')).toBeVisible();
		await expect(page).not.toHaveURL(/#g=/);
		await expect(page.getByRole('button', { name: 'Reset' })).toBeDisabled();
	});

	test.describe('sharing', () => {
		test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

		test('a copied link opens the same game in a fresh page', async ({ page, context }) => {
			await open(page);
			// Trailing spaces and blank lines are not part of the game: the link is canonical.
			await page.locator('#transcript').fill("first: WE  \n1| A4 -A1\n2| A'4 \n\n");

			await page.getByRole('button', { name: 'Share' }).click();
			await expect(page.getByRole('status')).toHaveText('Link copied');
			const link = await page.evaluate(() => navigator.clipboard.readText());
			expect(link).toContain('/notation/check#g=');

			const fresh = await context.newPage();
			await open(fresh, link);
			await expect(fresh.locator('#transcript')).toHaveValue("first: WE\n1| A4 -A1\n2| A'4");
			await expect(fresh.getByText('VALID', { exact: true })).toBeVisible();
		});

		test('the address bar follows the box, and empties with it', async ({ page }) => {
			await open(page);
			await page.locator('#transcript').fill('A4');
			await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#g=/);

			await page.locator('#transcript').fill('');
			await expect.poll(() => page.evaluate(() => location.hash)).toBe('');
		});

		test('a hash that is not a game leaves the box empty', async ({ page }) => {
			await open(page, '/notation/check#g=%%%');
			await expect(page.locator('#transcript')).toHaveValue('');
		});
	});
});
