import { error } from '@sveltejs/kit';
import { getCardUsage } from '#lib/server/db/tournament-stats.js';
import { periodFor } from '#lib/server/tournament-period.js';
import { cardOf } from '#lib/tournaments/present.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, params, url }) => {
	// Only a Card the dataset knows has a page; anything else can't be a card slug.
	if (!cardOf(params.slug)) error(404, 'Card not found');
	const { period } = await periodFor(locals.db, url);
	return { usage: await getCardUsage(locals.db, period, params.slug) };
};
