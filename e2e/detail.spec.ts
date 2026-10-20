import { expect, test, type Page } from '@playwright/test';
import { splitCardName } from '../src/lib/cards/derive.ts';
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

/**
 * The printing chooser's buttons — `li > button`, not `li button`: each tile also nests the
 * collection stepper's buttons, which are a different control and only render once the collection
 * has loaded, so a descendant selector counts them and races hydration.
 */
const chooser = (page: Page) => page.locator('section ul li > button');

test.describe('a card page', () => {
	test('shows the Default Printing when none is specified', async ({ page }) => {
		const v = card('v-streetkid');
		await page.goto('/cards/v-streetkid');

		await expect(
			page.getByRole('heading', { level: 1, name: splitCardName(v).name })
		).toBeVisible();
		await expect(page.getByText(`Art by ${v.printings[0].artist}`)).toBeVisible();
	});

	test('lists every printing with the metadata that distinguishes them', async ({ page }) => {
		const v = card('v-streetkid');
		await page.goto('/cards/v-streetkid');

		// A flat list of the printings in the active locale — most render an identical image, so they
		// are told apart by set, collector number and rarity rather than by art. The Locale toggle
		// shows one locale at a time, defaulting to the Default Printing's own, so the French
		// printings (which repeat the retail run's collector numbers) are not on this list.
		const locale = v.printings[0].locale;
		const shown = v.printings.filter((printing) => printing.locale === locale);
		expect(shown.length).toBeLessThan(v.printings.length);

		await expect(chooser(page)).toHaveCount(shown.length);
		for (const printing of shown) {
			await expect(page.getByText(printing.collectorNumber, { exact: true })).toBeVisible();
		}
	});

	test('zooms the art to fit the viewport, and Esc, a click and Back all close it', async ({
		page
	}) => {
		await page.goto('/cards/v-streetkid');
		const art = page.getByRole('button', { name: /^Enlarge .* art$/ });
		const lightbox = page.getByRole('dialog');
		const viewport = page.viewportSize()!;

		await art.click();
		await expect(lightbox).toBeVisible();
		expect(new URL(page.url()).searchParams.has('zoom')).toBe(true);

		// Fit to the viewport: the card's height is 92% of it, unless the width is the tighter limit.
		const zoomed = lightbox.getByRole('button', { name: 'Close enlarged art' });
		await expect
			.poll(async () => (await zoomed.boundingBox())!.height, { timeout: 2000 })
			.toBeCloseTo(Math.min(viewport.height * 0.92, viewport.width * 0.94 * (1024 / 733)), -1);

		await page.keyboard.press('Escape');
		await expect(lightbox).toBeHidden();
		expect(new URL(page.url()).searchParams.has('zoom')).toBe(false);

		await art.click();
		await expect(lightbox).toBeVisible();
		await lightbox.click();
		await expect(lightbox).toBeHidden();

		// Back closes it too — opening pushed a history entry.
		await art.click();
		await expect(lightbox).toBeVisible();
		await page.goBack();
		await expect(lightbox).toBeHidden();
		await expect(art).toBeVisible();
	});

	test('a ?zoom=1 link opens the art already zoomed', async ({ page }) => {
		await page.goto('/cards/v-streetkid?zoom=1');
		await expect(page.getByRole('dialog')).toBeVisible();
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

	test('a printing deep-link is resolved server-side, for non-JS crawlers reading Open Graph tags', async ({
		request
	}) => {
		// This page is server-rendered (not prerendered) specifically so a shared `?printing=` link
		// carries its own printing's art in og:image — a crawler like Discord's never runs the
		// client-side chooser JS below, so this has to be true of the raw response itself, not just
		// of the interactive page a browser ends up showing.
		const v = card('v-streetkid');
		const beta = v.printings.find((printing) => printing.collectorNumber === 'β144');
		expect(beta).toBeDefined();

		const response = await request.get(`/cards/v-streetkid?printing=${beta?.key}`);
		const html = await response.text();
		expect(html).toContain(`<meta property="og:image" content="`);
		expect(html).toContain(`/card-art/${beta?.id}/733.webp`);
	});

	test('choosing a printing leaves the Default Printing as the absent state', async ({ page }) => {
		const v = card('v-streetkid');
		await page.goto('/cards/v-streetkid');

		const second = chooser(page).nth(1);
		await second.click();
		expect(new URL(page.url()).searchParams.get('printing')).toBe(v.printings[1].key);

		await chooser(page).first().click();
		expect(new URL(page.url()).searchParams.has('printing')).toBe(false);
	});

	test('survives the mandatory fixture: null stats and no rules text', async ({ page }) => {
		const rebecca = card('rebecca-having-a-moment');
		expect(rebecca.rulesText).toEqual([]);

		await page.goto('/cards/rebecca-having-a-moment');

		await expect(
			page.getByRole('heading', { level: 1, name: splitCardName(rebecca).name })
		).toBeVisible();
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

		await expect(page).toHaveURL(/\/cards\?q=/);
		expect(new URL(page.url()).searchParams.get('q')).toBe('keyword:Call');
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
	test('every card slug resolves', async ({ request }) => {
		// A spot check across the alphabet rather than 133 requests: the slug lookup either has the
		// card or it does not.
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
