import { expect, test } from '@playwright/test';
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
test.describe('the landing page', () => {
	test('shows seven hero cards with interleaved colors', async ({ page }) => {
		await page.goto('/');

		const heroes = page.locator('a[href^="/cards/"]');
		await expect(heroes).toHaveCount(landing.heroes.length);
		expect(landing.heroes).toHaveLength(7);

		// Interleaved, not dataset order — which begins with a long run of one color.
		//
		// Asserts the *property* the spec cares about rather than one arrangement: all four colors
		// present, and none of them dominating. Pinning an exact sequence would make every
		// recuration of HEROES a test failure, which is how a guard gets deleted rather than
		// satisfied — and adjacency alone is too strict, since one repeated neighbour in seven is
		// nothing like the monochrome spread the rule exists to prevent.
		const colors = landing.heroes.map((hero) => hero.color);
		expect(new Set(colors).size).toBe(4);
		for (const color of new Set(colors)) {
			expect(
				colors.filter((entry) => entry === color).length,
				`${color} dominates the fan`
			).toBeLessThanOrEqual(2);
		}
	});

	test('the hero cards are links that actually receive clicks', async ({ page }) => {
		await page.goto('/');

		// Nothing about a background collage suggests it is clickable, so the affordances matter —
		// and the overlaid gradient sits above the fan, so `pointer-events` has to be layered.
		const hero = page.locator(`a[href="/cards/${landing.heroes[0].slug}"]`);
		await expect(hero).toHaveAttribute('title', landing.heroes[0].name);
		await expect(hero.getByRole('img', { name: landing.heroes[0].name })).toBeVisible();

		await hero.click();
		await expect(page).toHaveURL(`/cards/${landing.heroes[0].slug}`);
	});

	test('a hero card is keyboard reachable', async ({ page }) => {
		await page.goto('/');
		const hero = page.locator(`a[href="/cards/${landing.heroes[0].slug}"]`);
		await hero.focus();
		await expect(hero).toBeFocused();
	});

	test('shows the build-time stats line', async ({ page }) => {
		await page.goto('/');
		await expect(
			page.getByText(
				`${landing.stats.cards} cards · ${landing.stats.printings} printings · ${landing.stats.sets} ${landing.stats.sets === 1 ? 'set' : 'sets'}`
			)
		).toBeVisible();
	});

	test('the search field navigates into the grid', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('searchbox', { name: 'Search cards' }).fill('blocker');
		await page.getByRole('searchbox', { name: 'Search cards' }).press('Enter');

		await expect(page).toHaveURL('/cards?q=blocker');
		await expect(page.getByText(/^\d+ of \d+$/)).toBeVisible();
	});

	test('accepts the full query language, not just plain words', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('searchbox', { name: 'Search cards' }).fill('t:legend c:red');
		await page.getByRole('searchbox', { name: 'Search cards' }).press('Enter');

		await expect(page).toHaveURL('/cards?q=t%3Alegend%20c%3Ared');
		await expect(page.getByText(/^\d+ of \d+$/)).toBeVisible();
	});

	test('an empty search leaves no empty param behind', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('searchbox', { name: 'Search cards' }).press('Enter');
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
	test('marks unbuilt destinations as coming soon, with no clickable 404', async ({ page }) => {
		await page.goto('/');

		for (const label of ['Decks', 'Sets', 'Rules']) {
			const item = page.getByText(label, { exact: false }).first();
			await expect(item).toBeVisible();
		}
		// The signal that they are inert: no anchor carries them.
		await expect(page.locator('nav a', { hasText: 'Decks' })).toHaveCount(0);
		await expect(page.locator('nav a', { hasText: 'Rules' })).toHaveCount(0);
	});

	test('carries the attribution the project is required to show', async ({ page }) => {
		await page.goto('/');
		await expect(
			page.getByText(/Unofficial fan project\. Not associated with or endorsed by the publisher/)
		).toBeVisible();
		await expect(page.getByRole('link', { name: 'api.netdeck.gg' })).toBeVisible();
	});
});
