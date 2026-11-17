import { error } from '@sveltejs/kit';
import { getCardUsage } from '#lib/server/db/tournament-stats.js';
import { cardOf } from '#lib/tournaments/present.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, params, parent }) => {
	// Only a Card the dataset knows has a page; anything else can't be a card slug.
	if (!cardOf(params.slug)) error(404, 'Card not found');
	const { period } = await parent();
	return { usage: await getCardUsage(locals.db, period, params.slug) };
};
