import { expect, test } from '@playwright/test';
import { collectorNumberSortKey } from '../src/lib/cards/derive.ts';
import { printingQuery } from '../src/lib/cards/schema.ts';
import { snapshot } from './snapshot.ts';

const SET_ID = 'MS01-WNC';

/** The retail English checklist, in the order the page opens in: Collector Number. */
const checklist = snapshot.cards
	.flatMap((card) =>
		card.printings
			.filter(
				(printing) =>
					printing.setId === SET_ID &&
					printing.locale === 'en' &&
					!printing.collectorNumber.startsWith('β')
			)
			.map((printing) => ({ card, printing }))
	)
	.sort((a, b) => {
		const [aNum, aText] = collectorNumberSortKey(a.printing.collectorNumber);
		const [bNum, bText] = collectorNumberSortKey(b.printing.collectorNumber);
		return aNum - bNum || aText.localeCompare(bText);
	});

const hrefOf = ({ card, printing }: (typeof checklist)[number]) =>
	`/cards/${card.slug}${printingQuery(card, printing)}`;

const newestFirst = checklist.toSorted((a, b) =>
	b.printing.revealedAt.localeCompare(a.printing.revealedAt)
);

test.describe('a set page, sorted by reveal date', () => {
	test('has dates to sort by', () => {
		// Guards the test itself: with one date the toggle is (rightly) hidden and nothing below means anything.
		expect(new Set(checklist.map((entry) => entry.printing.revealedAt)).size).toBeGreaterThan(1);
		expect(hrefOf(newestFirst[0]!)).not.toBe(hrefOf(checklist[0]!));
	});

	test('opens in collector-number order and the dropdown reorders it, newest first', async ({
		page
	}) => {
		await page.goto(`/sets/${SET_ID}`);
		await page.waitForLoadState('networkidle');

		const first = page.locator('main ul.grid li a').first();
		await expect(first).toHaveAttribute('href', hrefOf(checklist[0]!));

		const sortBy = page.getByLabel('Sort by');
		await expect(sortBy).toHaveValue('');
		await sortBy.selectOption({ label: 'Reveal Date' });

		await expect(page).toHaveURL(/[?&]sort=revealed\b/);
		await expect(sortBy).toHaveValue('revealed');
		await expect(first).toHaveAttribute('href', hrefOf(newestFirst[0]!));

		await sortBy.selectOption({ label: 'Collector number' });
		await expect(page).not.toHaveURL(/sort=/);
		await expect(first).toHaveAttribute('href', hrefOf(checklist[0]!));
	});

	test('a shared ?sort=revealed link opens already sorted', async ({ page }) => {
		await page.goto(`/sets/${SET_ID}?sort=revealed`);
		await page.waitForLoadState('networkidle');

		await expect(page.locator('main ul.grid li a').first()).toHaveAttribute(
			'href',
			hrefOf(newestFirst[0]!)
		);
		await expect(page.getByLabel('Sort by')).toHaveValue('revealed');
	});
});
