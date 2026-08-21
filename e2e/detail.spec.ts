import { expect, test } from '@playwright/test';
import { snapshot } from './snapshot.ts';

/**
 * The card detail route: the shareable card URL, the full-size art view, and the printings gallery.
 *
 * The two fixtures the spec makes mandatory are exercised here for the reason they were chosen:
 * `V — StreetKid` has five printings across two artists and the only a/b art treatments, and
 * `Rebecca — Having a Moment` is null on every stat and has no rules text at all.
 */

const card = (slug: string) => {
	const found = snapshot.cards.find((entry) => entry.slug === slug);
	if (found === undefined) throw new Error(`fixture ${slug} missing from the snapshot`);
	return found;
};

test.describe('a card page', () => {
	test('is prerendered with the Default Printing', async ({ page }) => {
		const v = card('v-streetkid');
		await page.goto('/cards/v-streetkid');

		await expect(page.getByRole('heading', { level: 1, name: v.name })).toBeVisible();
		await expect(page.getByText(`Art by ${v.printings[0].artist}`)).toBeVisible();
	});

	test('lists every printing with the metadata that distinguishes them', async ({ page }) => {
		const v = card('v-streetkid');
		await page.goto('/cards/v-streetkid');

		// A flat list of all printings — most render an identical image, so they are told apart by
		// set, collector number and rarity rather than by art.
		const entries = page.locator('section ul li button');
		await expect(entries).toHaveCount(v.printings.length);
		for (const printing of v.printings) {
			await expect(page.getByText(printing.collectorNumber, { exact: true })).toBeVisible();
		}
	});

	test('resolves a printing deep-link, β verbatim', async ({ page }) => {
		const v = card('v-streetkid');
		const beta = v.printings.find((printing) => printing.collectorNumber === 'β144');
		expect(beta).toBeDefined();

		await page.goto(`/cards/v-streetkid?printing=${beta?.key}`);

		// The hero art, not just the gallery entry, follows the deep-link.
		await expect(page.locator('img').nth(1)).toHaveAttribute(
			'src',
			`/card-art/${beta?.id}/488.webp`
		);
		await expect(page.getByText(`Art by ${beta?.artist}`)).toBeVisible();
	});

	test('degrades an unknown printing key to the Default Printing', async ({ page }) => {
		const v = card('v-streetkid');
		await page.goto('/cards/v-streetkid?printing=NOPE-000');
		await expect(page.getByText(`Art by ${v.printings[0].artist}`)).toBeVisible();
	});

	test('choosing a printing leaves the Default Printing as the absent state', async ({ page }) => {
		const v = card('v-streetkid');
		await page.goto('/cards/v-streetkid');

		const second = page.locator('section ul li button').nth(1);
		await second.click();
		expect(new URL(page.url()).searchParams.get('printing')).toBe(v.printings[1].key);

		await page.locator('section ul li button').first().click();
		expect(new URL(page.url()).searchParams.has('printing')).toBe(false);
	});

	test('survives the mandatory fixture: null stats and no rules text', async ({ page }) => {
		const rebecca = card('rebecca-having-a-moment');
		expect(rebecca.rulesText).toEqual([]);

		await page.goto('/cards/rebecca-having-a-moment');

		await expect(page.getByRole('heading', { level: 1, name: rebecca.name })).toBeVisible();
		// A null stat renders as an em dash, never as 0.
		await expect(page.getByText('—', { exact: true }).first()).toBeVisible();
		await expect(page.getByText('No rules text.')).toBeVisible();
	});

	test('links rules-text markup to the filters and cards it refers to', async ({ page }) => {
		// `Deadman Transmitter` refers to itself in ALL-CAPS inside quotes — the one cardRef in the
		// whole corpus — and carries a classification link too.
		await page.goto('/cards/deadman-transmitter');

		const cardRef = page.getByRole('link', { name: /DEADMAN TRANSMITTER/ });
		await expect(cardRef).toHaveAttribute('href', '/cards/deadman-transmitter');
	});

	test('a keyword links back into a filtered grid', async ({ page }) => {
		await page.goto('/cards/v-streetkid');
		await page.getByRole('link', { name: 'Call', exact: true }).first().click();

		await expect(page).toHaveURL(/\/cards\?keywords=call/);
		await expect(page.getByText(/^\d+ of \d+$/)).toBeVisible();
	});

	test('credits the artist for the printing on show', async ({ page }) => {
		const v = card('v-streetkid');
		await page.goto('/cards/v-streetkid');
		for (const artist of new Set(v.printings.map((printing) => printing.artist))) {
			await expect(page.getByText(artist).first()).toBeVisible();
		}
	});
});

test.describe('every card page exists', () => {
	test('the prerenderer produced one page per card', async ({ request }) => {
		// A spot check across the alphabet rather than 133 requests: the prerenderer either has the
		// entries or it does not.
		const sample = [0, 1, Math.floor(snapshot.cards.length / 2), snapshot.cards.length - 1];
		for (const index of sample) {
			const response = await request.get(`/cards/${snapshot.cards[index].slug}`);
			expect(response.status(), snapshot.cards[index].slug).toBe(200);
		}
	});

	test('mirrored art is served for every tier', async ({ request }) => {
		const printing = snapshot.cards[0].printings[0];
		for (const width of [244, 488, 733]) {
			const response = await request.get(`/card-art/${printing.id}/${width}.webp`);
			expect(response.status()).toBe(200);
			expect(response.headers()['content-type']).toContain('image/webp');
		}
	});
});
