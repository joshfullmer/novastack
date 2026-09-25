import * as v from 'valibot';
import { dataset } from '#lib/cards/index.js';
import { missingForDeck } from '#lib/collection/missing.js';
import { getCollection } from '#lib/server/db/collection.js';
import { listPublicDecks } from '#lib/server/db/decks.js';
import { readViewPref } from '#lib/server/view-pref.js';
import type { PageServerLoad } from './$types';

// Overrides the root layout's `prerender = true` — this reads request-scoped session/DB state.
export const prerender = false;

const TabSchema = v.picklist(['hot', 'newest', 'most-liked', 'buildable', 'starter']);
type Tab = v.InferOutput<typeof TabSchema>;

/** Cards by slug, for turning a version's entries back into Cards to count Missing against. */
const cardsBySlug = new Map(dataset.cards.map((card) => [card.slug, card]));

/**
 * The public deck explorer — `docs/spec/deckbuilder.md` §9. Its own top-level route (`/explore`),
 * not a tab sharing `/decks` with the owner-only "My Decks" list: every reference site we looked
 * at (swudb, Piltover Archive, Moxfield) treats the public browse surface as the primary,
 * nav-reachable destination and tucks the signed-in-only list elsewhere, never as a peer tab on
 * the same page.
 */
export const load: PageServerLoad = async (event) => {
	const tabParam = event.url.searchParams.get('tab');
	const tab: Tab = v.is(TabSchema, tabParam) ? tabParam : 'newest';
	const ownerId = event.url.searchParams.get('owner') ?? undefined;

	/**
	 * **Missing is computed here, not in the browser.** It needs the viewer's Collection and every
	 * deck's card list; the Collection is already a server table and the card lists are already
	 * loaded for `cardCount`, so doing it here costs one extra query and nothing on the wire —
	 * where shipping every public deck's entries to the client to compute it there would grow the
	 * payload with the number of decks. The figure is per viewer, which is fine: this route is
	 * already session-dependent (it reads who has liked what) and is never cached.
	 */
	const [rows, owned] = await Promise.all([
		listPublicDecks(event.locals.db, {
			ownerId,
			starterOnly: tab === 'starter',
			viewerId: event.locals.user?.id ?? null
		}),
		event.locals.user ? getCollection(event.locals.db, event.locals.user.id) : null
	]);

	/** `null` for a signed-out visitor — no Collection, so no claim about what they're missing. */
	const missingFor = (entries: readonly { cardSlug: string; quantity: number }[]) => {
		if (!owned) return null;

		const needed = entries.flatMap((entry) => {
			const card = cardsBySlug.get(entry.cardSlug);
			// A slug that has left the dataset can't be counted; the deck view reports it instead.
			return card ? [{ card, quantity: entry.quantity }] : [];
		});

		const report = missingForDeck(needed, (printingId) => owned[printingId] ?? 0);
		return { cards: report.cardCount, copies: report.copyCount };
	};

	const decks = rows
		.map(({ deck, ownerName, version, likeCount, hotCount }) => ({
			id: deck.id,
			name: deck.name,
			ownerId: deck.ownerId,
			ownerName,
			createdAt: deck.createdAt,
			cardCount: version?.entries.reduce((sum, entry) => sum + entry.quantity, 0) ?? 0,
			/** Separate from `cardCount` — 40–50 is the main deck's range, not the deck's total. */
			sideboardCards: version?.sideboard.reduce((sum, entry) => sum + entry.quantity, 0) ?? 0,
			legendSlugs: version?.legends ?? [],
			likeCount,
			hotCount,
			isStarterDeck: deck.isStarterDeck,
			// Legends are cards you need copies of like any other, so they count too — and so does
			// the sideboard, since tournament rules §D.1 requires all 7 present to field the list.
			// `missingForDeck` sums duplicate slugs itself, so the two piles can be concatenated
			// rather than merged first.
			missing: missingFor([
				...(version?.legends ?? []).map((slug) => ({ cardSlug: slug, quantity: 1 })),
				...(version?.entries ?? []),
				...(version?.sideboard ?? [])
			])
		}))
		.sort((a, b) => {
			// The Starter Decks tab has its own fixed order — newest first — regardless of which
			// of Hot/Newest/Most-liked was last selected; they have no effect on this tab.
			if (tab === 'starter' || tab === 'newest')
				return b.createdAt.getTime() - a.createdAt.getTime();
			if (tab === 'most-liked') return b.likeCount - a.likeCount;
			// Closest to buildable first, by *copies* short rather than distinct cards: three of one
			// card is a smaller errand than one each of three. Ties fall back to newest, and a
			// signed-out viewer has no figures at all, so the tab degrades to that order entirely.
			if (tab === 'buildable') {
				return (
					(a.missing?.copies ?? 0) - (b.missing?.copies ?? 0) ||
					b.createdAt.getTime() - a.createdAt.getTime()
				);
			}
			return b.hotCount - a.hotCount;
		});

	return {
		decks,
		tab,
		ownerId: ownerId ?? null,
		ownerName: ownerId ? (decks[0]?.ownerName ?? null) : null,
		// Not read by this page's own template — Nav still needs it for the Sign in/out swap,
		// since this route has no dedicated `+layout.server.ts` supplying it (`/decks` does).
		user: event.locals.user,
		// Shared with /decks — "how I like browsing a list of decks" is one preference, not two.
		deckView: readViewPref(event.cookies, 'decks-list-view', ['list', 'grid'], 'list')
	};
};
