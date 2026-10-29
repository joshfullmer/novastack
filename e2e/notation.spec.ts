import { expect, test } from '@playwright/test';
import { NOTATION_LAUNCHED } from '../src/lib/notation/launch.ts';

/**
 * The Notation front door (`docs/spec/notation.md`).
 *
 * The tooltip is the thing worth testing end to end: it has three triggers (pointer, keyboard,
 * touch) that are separate code paths in `NotationToken`, and the only way they stay the same
 * sentence is a test that asks all three. A component test can't — it has no real focus-visible
 * or pointer type.
 */
/**
 * `/notation` is prerendered, so an event dispatched before hydration reaches no handler.
 * `networkidle` is the cheap way to know the page is live — the same compromise `nav.spec.ts` makes.
 */
const open = async (page: import('@playwright/test').Page) => {
	await page.goto('/notation');
	await page.waitForLoadState('networkidle');
};

const EXPECTED = 'WE lowers their d6 from 2 to 1.';

test.describe('the Notation front door', () => {
	test('steps through the worked game, board and narration together', async ({ page }) => {
		await page.goto('/notation');
		await expect(page.getByText('turn 0 / 10')).toBeVisible();

		for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'next →' }).click();

		await expect(page.getByText('turn 5 / 10')).toBeVisible();
		// The intro says the same turn in the same words, so read the narration, not the page.
		const narration = page.getByRole('status');
		await expect(narration).toContainText(EXPECTED);
		await expect(narration).toContainText('WE rolls their d8; it shows 8.');
	});

	test('introduces the notation with one turn, told in first person and written out', async ({
		page
	}) => {
		await page.goto('/notation');
		const intro = page.getByRole('region', { name: 'One turn, said and written' });
		await expect(intro).toContainText(
			"I rolled my d12 and it rolled a 12. Then I lowered my d12 from 12 to 7. Then I stole my Rival's d8 and d10."
		);
		await expect(intro).toContainText("E12 -E7 xC' xD'");
		await expect(intro).not.toContainText(/\bWE\b|\bTHEY\b/);
	});

	test('copying a line gives back notation the checker would accept', async ({ page }) => {
		await page.goto('/notation');
		const line = page.locator('li', { hasText: 'D6' }).first().locator('span.font-mono').first();
		await expect(line).toHaveText(/D6 -D4 xB' xA'/);
	});

	test('ends with a cheatsheet whose dice and win numbers come from the checker', async ({
		page
	}) => {
		await page.goto('/notation');
		const sheet = page.getByRole('heading', { name: 'Cheatsheet' });
		await expect(sheet).toBeVisible();
		const card = page.locator('section[aria-labelledby="cheatsheet"]');
		await expect(card).toContainText('d20');
		await expect(card).toContainText('Steal');
		await expect(card).toContainText(/holding 7 or more\s+gigs/);
		// After the worked game, before the links out.
		const order = await page.evaluate(() => {
			const y = (sel: string) => document.querySelector(sel)!.getBoundingClientRect().top;
			return [
				y('section[aria-label="A worked game"]'),
				y('section[aria-labelledby="cheatsheet"]'),
				y('section[aria-labelledby="next-steps"]')
			];
		});
		expect(order).toEqual([...order].sort((a, b) => a - b));
	});

	test.describe('a token explains itself', () => {
		const token = (page: import('@playwright/test').Page) =>
			page.getByRole('button', { name: '-B1', exact: true }).first();
		const tip = (page: import('@playwright/test').Page) => page.getByRole('tooltip');

		test('after resting the pointer on it, and not before', async ({ page }) => {
			await open(page);
			// Synthetic events, so "not before" is checked in the same task as the pointer arriving
			// rather than racing a real hover against the 400ms delay.
			const openedAtOnce = await token(page).evaluate((el) => {
				el.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
				return document.querySelector('[role=tooltip]') !== null;
			});
			expect(openedAtOnce).toBe(false);
			await expect(tip(page)).toHaveText(EXPECTED);
			await token(page).evaluate((el) =>
				el.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }))
			);
			await expect(tip(page)).toHaveCount(0);
		});

		test('is fully opaque, even over a row the example has not reached yet', async ({ page }) => {
			await open(page);
			// Step 0: every row is still "ahead", which is dimmed. Dimming by `opacity` would fade the
			// tooltip along with the row — and let the rows below paint over it.
			await page.locator('.game').getByRole('button', { name: '-B1', exact: true }).first().focus();
			await page.keyboard.press('Tab');
			await page.keyboard.press('Shift+Tab');
			await expect(tip(page)).toBeVisible();
			const opacity = await tip(page).evaluate((el) => {
				let effective = 1;
				for (let node: Element | null = el; node; node = node.parentElement)
					effective *= parseFloat(getComputedStyle(node).opacity);
				return effective;
			});
			expect(opacity).toBe(1);
		});

		test('on keyboard focus, and Escape closes it', async ({ page }) => {
			await open(page);
			// A Tab first, so the last input was the keyboard: only then does a scripted `.focus()`
			// match `:focus-visible`, which is what `NotationToken` opens on.
			await page.keyboard.press('Tab');
			await token(page).focus();
			await expect(tip(page)).toHaveText(EXPECTED);
			await page.keyboard.press('Escape');
			await expect(tip(page)).toHaveCount(0);
		});

		test.describe('on touch', () => {
			test.use({ hasTouch: true });

			test('a tap opens it and a tap elsewhere closes it', async ({ page }) => {
				await open(page);
				await token(page).tap();
				await expect(tip(page)).toHaveText(EXPECTED);
				await page.getByRole('heading', { level: 1 }).tap();
				await expect(tip(page)).toHaveCount(0);
			});
		});
	});

	test('stays out of search until launched, though the nav already links to it', async ({
		page,
		request
	}) => {
		await page.goto('/notation');
		const robots = page.locator('meta[name="robots"][content="noindex"]');
		await expect(robots).toHaveCount(NOTATION_LAUNCHED ? 0 : 1);

		const sitemap = await (await request.get('/sitemap.xml')).text();
		expect(sitemap.includes('/notation')).toBe(NOTATION_LAUNCHED);

		const nav = page.getByRole('navigation').first();
		await expect(nav.getByRole('link', { name: 'Notation', exact: true })).toHaveCount(1);
	});

	test('has Sets under a Cards dropdown, and Notation as a link of its own', async ({ page }) => {
		await page.goto('/');
		const nav = page.getByRole('navigation').first();
		// The dropdown is `visibility: hidden` until hovered, so it is hidden from the accessibility tree.
		const inDropdown = (name: string) =>
			nav.getByRole('link', { name, exact: true, includeHidden: true });
		await expect(inDropdown('Sets')).toHaveCount(1);
		await expect(inDropdown('Browse')).toHaveCount(1);
		await expect(nav.getByRole('link', { name: 'Notation', exact: true })).toHaveAttribute(
			'href',
			'/notation'
		);

		// Notation sits before Rules, which is the last item in the row.
		const labels = await page.locator('nav > ul > li > a').allInnerTexts();
		expect(labels.map((label) => label.trim())).toEqual([
			'Cards',
			'Decks',
			'Collection',
			'Notation',
			'Rules'
		]);
	});

	test('gives all four pages the same column and the same heading', async ({ page }) => {
		const paths = ['/notation', '/notation/reference', '/notation/scoresheet', '/notation/check'];
		const seen: { frame: number[]; h1: { size: string; left: number; top: number } }[] = [];
		for (const path of paths) {
			await page.goto(path);
			await page.waitForLoadState('networkidle');
			seen.push(
				await page.evaluate(() => {
					const frame = document.querySelector('.notation-frame')!.getBoundingClientRect();
					const h1El = document.querySelector('h1')!;
					const h1 = h1El.getBoundingClientRect();
					return {
						frame: [frame.left, frame.width].map(Math.round),
						h1: {
							size: getComputedStyle(h1El).fontSize,
							left: Math.round(h1.left),
							top: Math.round(h1.top)
						}
					};
				})
			);
		}
		for (const page of seen.slice(1)) {
			expect(page.frame).toEqual(seen[0].frame);
			expect(page.h1).toEqual(seen[0].h1);
		}
		// "Nova Notation" is in the tab row, and nowhere else as a heading.
		await page.goto('/notation');
		await expect(page.getByRole('navigation', { name: 'Notation sections' })).toContainText(
			/nova notation/i
		);
		await expect(page.getByText('NOVA NOTATION', { exact: true })).toHaveCount(0);
	});

	test('has one section nav on every page, marking the page you are on', async ({ page }) => {
		const pages = [
			['/notation', 'Learn'],
			['/notation/reference', 'Reference'],
			['/notation/scoresheet', 'Scoresheet'],
			['/notation/scoresheet/full-page', 'Scoresheet'],
			['/notation/check', 'Check a game']
		] as const;
		for (const [path, label] of pages) {
			await page.goto(path);
			const section = page.getByRole('navigation', { name: 'Notation sections' });
			await expect(section.getByRole('link')).toHaveCount(4);
			await expect(section.locator('a[aria-current="page"]')).toHaveText(label);
		}
	});
});

test.describe('the Notation reference', () => {
	test('has a table of contents whose every link lands on a section', async ({ page }) => {
		await page.goto('/notation/reference');
		const links = page.getByRole('navigation', { name: 'Contents' }).getByRole('link');
		const hrefs = await links.evaluateAll((as) => as.map((a) => a.getAttribute('href')!));
		expect(hrefs.length).toBeGreaterThan(5);
		for (const href of hrefs) await expect(page.locator(href)).toHaveCount(1);

		await links.filter({ hasText: /^Winning$/ }).click();
		await expect(page).toHaveURL(/#winning$/);
		await expect(page.locator('#winning')).toBeInViewport();
	});
});
