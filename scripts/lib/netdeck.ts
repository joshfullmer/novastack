/**
 * Reading the source API.
 *
 * The list endpoint **strips `printings[]`** and nulls `selected_printing_id`, with no error
 * and no warning — so it is only good for enumerating slugs. Every real record comes from the
 * detail endpoint, one request per card, and the slug is the only key it accepts (UUIDs 404).
 */
import * as v from 'valibot';
import { NetdeckCardSchema, NetdeckPageSchema } from '../../src/lib/cards/schema.ts';
import { fetchJson, pool, type RetryOptions } from './http.ts';

export const API = 'https://api.netdeck.gg/api/cards/cyberpunk';

/**
 * The notes measured concurrency 12 as safe, but without retries. Eight with backoff is the
 * better trade: this runs on demand, not per request, so there is nothing to optimise for.
 */
export const CONCURRENCY = 8;

const PAGE_LIMIT = 100;

/** Enumerates every slug. Paginates by `total`, with a hard cap so a bad `total` cannot loop. */
export async function enumerateSlugs(options: RetryOptions = {}): Promise<string[]> {
	const slugs: string[] = [];
	let total = Number.POSITIVE_INFINITY;

	for (let offset = 0; slugs.length < total; offset += PAGE_LIMIT) {
		const page = await fetchJson(
			`${API}?limit=${PAGE_LIMIT}&offset=${offset}`,
			NetdeckPageSchema,
			options
		);

		total = page.total;
		if (page.items.length === 0) break;
		slugs.push(...page.items.map((item) => item.slug));
	}

	if (slugs.length !== total) {
		throw new Error(`Enumerated ${slugs.length} slug(s) but the API reports ${total}.`);
	}

	return slugs;
}

/** Fetches the real record for every slug, at bounded concurrency. */
export async function fetchCardDetails(
	slugs: readonly string[],
	options: RetryOptions & { onProgress?: (done: number, total: number) => void } = {}
) {
	let done = 0;
	return pool(slugs, CONCURRENCY, async (slug) => {
		const card = await fetchJson(`${API}/${slug}`, NetdeckCardSchema, options);
		done += 1;
		options.onProgress?.(done, slugs.length);
		return card;
	});
}

export type NetdeckCard = v.InferOutput<typeof NetdeckCardSchema>;
