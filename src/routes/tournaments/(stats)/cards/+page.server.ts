import { redirect } from '@sveltejs/kit';
import { getCardStats } from '#lib/server/db/tournament-stats.js';
import { cardOf } from '#lib/tournaments/present.js';
import { href } from '#lib/tournaments/url.js';
import type { PageServerLoad } from './$types';

/**
 * `/tournaments/cards` is a front door, not a page: with `?card=<slug>` (the picker's form) it goes to
 * that Card, otherwise to the most-played one. Only a period with no decks at all has nothing to show.
 */
export const load: PageServerLoad = async ({ locals, parent, url }) => {
	const { period } = await parent();
	const asked = url.searchParams.get('card');
	if (asked !== null && cardOf(asked)) {
		redirect(302, href(`/tournaments/cards/${asked}`, { period: period.id }));
	}

	const { cards } = await getCardStats(locals.db, period, null);
	const top = cards[0]?.slug;
	if (top) redirect(302, href(`/tournaments/cards/${top}`, { period: period.id }));
	return {};
};
