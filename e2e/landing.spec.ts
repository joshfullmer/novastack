import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import * as v from 'valibot';
import { LandingSchema } from '../src/lib/cards/schema.ts';

const landing = v.parse(
	LandingSchema,
	JSON.parse(readFileSync(new URL('../src/lib/cards/landing.json', import.meta.url), 'utf8'))
);

/**
 * The landing page.
 *
 * The load-bearing assertions here are the ones about what `/` *doesn't* do: it must not download
 * the dataset to render a search box, and the hero collage must not be decoration — the cards are
 * links, and the gradient above them must not swallow the clicks.
 */

/**
 * `/` and `/faq` are prerendered, so a keystroke or `Enter` that lands before hydration meets a form
 * with no handler yet and submits natively — to a URL that is not the one the handler would build.
 * `networkidle` is the cheap way to know the page is live, the same compromise `nav.spec.ts` makes.
 */
const live = async (page: Page, path: string) => {
	await page.goto(path);
	await page.waitForLoadState('networkidle');
};

test.describe('the landing page', () => {
	test('shows every hero card as a link', async ({ page }) => {
		await live(page, '/');

		// Which cards, how many of each color, in what order: all hand-curated in `hero.ts`, and any valid
		// card may be there for any reason. So nothing here says what a hero is — only that whatever
		// `landing.json` lists is what the page renders, one link each.
		const heroes = page.locator('a[href^="/cards/"]');
		await expect(heroes).toHaveCount(landing.heroes.length);
		for (const hero of landing.heroes) {
			await expect(page.locator(`a[href="/cards/${hero.slug}"]`)).toHaveCount(1);
		}
	});

	test('the hero cards are links that actually receive clicks', async ({ page }) => {
		await live(page, '/');

		// Nothing about a background collage suggests it is clickable, so the affordances matter —
		// and the overlaid gradient sits above the fan, so `pointer-events` has to be layered.
		const hero = page.locator(`a[href="/cards/${landing.heroes[0].slug}"]`);
		await expect(hero).toHaveAttribute('title', landing.heroes[0].name);
		await expect(hero.getByRole('img', { name: landing.heroes[0].name })).toBeVisible();

		await hero.click();
		await expect(page).toHaveURL(`/cards/${landing.heroes[0].slug}`);
	});

	test('a hero card is keyboard reachable', async ({ page }) => {
		await live(page, '/');
		const hero = page.locator(`a[href="/cards/${landing.heroes[0].slug}"]`);
		await hero.focus();
		await expect(hero).toBeFocused();
	});

	test('shows the build-time stats line', async ({ page }) => {
		await live(page, '/');
		await expect(
			page.getByText(
				`${landing.stats.cards} cards · ${landing.stats.printings} printings · ${landing.stats.sets} ${landing.stats.sets === 1 ? 'set' : 'sets'}`
			)
		).toBeVisible();
	});

	test('the search field navigates into the grid', async ({ page }) => {
		await live(page, '/');
		await page.getByRole('combobox', { name: 'Search cards' }).fill('blocker');
		await page.getByRole('combobox', { name: 'Search cards' }).press('Enter');

		await expect(page).toHaveURL('/cards?q=blocker');
		await expect(page.getByText(/^\d+ of \d+$/)).toBeVisible();
	});

	test('accepts the full query language, not just plain words', async ({ page }) => {
		await live(page, '/');
		await page.getByRole('combobox', { name: 'Search cards' }).fill('t:legend c:red');
		await page.getByRole('combobox', { name: 'Search cards' }).press('Enter');

		await expect(page).toHaveURL('/cards?q=t%3Alegend%20c%3Ared');
		await expect(page.getByText(/^\d+ of \d+$/)).toBeVisible();
	});

	test('the search field is focused on arrival', async ({ page }) => {
		await live(page, '/');
		await expect(page.getByRole('combobox', { name: 'Search cards' })).toBeFocused();
	});

	test('highlights and completes the query language, same as /cards', async ({ page }) => {
		await live(page, '/');
		const box = page.getByRole('combobox', { name: 'Search cards' });

		// The overlay is what's actually visible — the input's own text is transparent — so a
		// recognized field showing up as a `text-neon` span is the observable form of "highlighted".
		await box.fill('c:red');
		// Scoped to the form: the wordmark's own `stack` is a `text-neon` span too.
		await expect(page.locator('form span.text-neon')).toHaveText('c');

		// Autocomplete, which needs no dataset: `rar` is a prefix of the `rarity` field keyword.
		await box.fill('rar');
		await expect(page.getByRole('option', { name: /rarity/ })).toBeVisible();
		await box.press('Enter');
		// Accepting completed the word rather than submitting — `/` is still the page.
		await expect(page).toHaveURL('/');
		await expect(box).toHaveValue('rarity:');
	});

	test('flags a syntax mistake without downloading the dataset', async ({ page }) => {
		await live(page, '/');
		// Warnings here are the syntax half only (`parse`, not `parseQuery`) — an unknown field is
		// on that side of the line, so `/` can mark it without the 277 KB snapshot.
		await page.getByRole('combobox', { name: 'Search cards' }).fill('nope:1');
		await expect(page.getByRole('status')).toContainText('Unknown field');
	});

	test('an empty search leaves no empty param behind', async ({ page }) => {
		await live(page, '/');
		await page.getByRole('combobox', { name: 'Search cards' }).press('Enter');
		await expect(page).toHaveURL('/cards');
	});

	test('does not download the dataset', async ({ page }) => {
		// `/` imports the 1.7 KB landing artifact, not the 277 KB snapshot. Vite code-splits per
		// route, so this holds only while the dataset import stays out of the shared layout — which
		// is exactly the regression worth catching.
		const bytes: number[] = [];
		page.on('response', async (response) => {
			if (!response.url().endsWith('.js')) return;
			const length = Number(response.headers()['content-length'] ?? 0);
			if (Number.isFinite(length)) bytes.push(length);
		});

		await page.goto('/', { waitUntil: 'networkidle' });

		const total = bytes.reduce((sum, size) => sum + size, 0);
		expect(total, 'landing JS payload').toBeLessThan(150_000);
	});
});

test.describe('navigation', () => {
	test('links every built destination from the nav', async ({ page }) => {
		await live(page, '/');

		// Cards, Decks and Rules are triggers with a hover dropdown, so most of these are in a menu
		// that is hidden until hovered; they are still in the markup, and still real links.
		const nav = page.locator('nav').first();
		for (const href of [
			'/cards',
			'/sets',
			'/decks',
			'/explore',
			'/collection',
			'/faq',
			'/notation'
		]) {
			expect(await nav.locator(`a[href="${href}"]`).count(), href).toBeGreaterThan(0);
		}

		// Decks is both the top-level link and the dropdown's "My Decks".
		await expect(nav.locator('a[href="/decks"]')).toHaveCount(2);
	});

	test('carries the attribution the project is required to show', async ({ page }) => {
		await live(page, '/');
		await expect(
			page.getByText(/Unofficial fan project\. Not associated with or endorsed by the publisher/)
		).toBeVisible();
		await expect(page.getByRole('link', { name: 'api.netdeck.gg' })).toBeVisible();
	});

	/**
	 * The nav's card search. The assertions worth having are about where it *isn't*: on `/` and
	 * `/cards` a second box would sit inches from a box that already does the same job.
	 */
	test.describe('the nav search', () => {
		const navSearch = (page: Page) => page.locator('nav').getByRole('combobox');

		test('searches the whole pool from any other page', async ({ page }) => {
			await live(page, '/faq');
			await navSearch(page).fill('c:red');
			await navSearch(page).press('Enter');

			await expect(page).toHaveURL('/cards?q=c%3Ared');
			await expect(page.getByText(/^\d+ of \d+$/)).toBeVisible();
		});

		test('is absent where a query box already exists', async ({ page }) => {
			await live(page, '/');
			await expect(navSearch(page)).toHaveCount(0);

			await live(page, '/cards');
			await expect(navSearch(page)).toHaveCount(0);
		});

		test('empties itself once spent, rather than following you around', async ({ page }) => {
			await live(page, '/faq');
			await navSearch(page).fill('c:red');
			await navSearch(page).press('Enter');
			await expect(page).toHaveURL('/cards?q=c%3Ared');

			await page.goBack();
			await expect(navSearch(page)).toHaveValue('');
		});
	});
});
