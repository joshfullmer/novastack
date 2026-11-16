/**
 * The tournament list, shaped for its page.
 *
 * Pure, like `event-view.ts`: the data layer hands it small aggregate rows (counts and one row per
 * Legend), not whole Tournaments, because the list shows every event and must not load every deck to
 * do it. Cards are slugs; resolving them to art is the view's job.
 */
import type { tournaments } from '../server/db/schema.ts';

export type EventListRows = {
	tournaments: (typeof tournaments.$inferSelect)[];
	rounds: { tournamentId: number; rounds: number }[];
	decks: { tournamentId: number; decks: number }[];
	/** The rank-1 player of each event, whether or not they registered a deck. */
	winners: { tournamentId: number; name: string }[];
	/** The best-placed player who registered a deck: one row per Legend of their deck. */
	showcase: { tournamentId: number; rank: number; name: string; cardSlug: string }[];
	/** How many decks in each event ran each Legend. */
	legends: { tournamentId: number; cardSlug: string; decks: number }[];
};

export type EventListItem = {
	id: number;
	name: string;
	/** Milliseconds since the epoch, UTC. */
	startsAt: number;
	organizer: string;
	playerCount: number;
	deckCount: number;
	roundCount: number;
	/** Rank 1, deck or not. */
	winner: string | null;
	/**
	 * The best-placed deck we have, for the art. It is the winner's whenever the winner registered
	 * one; otherwise it is the next player who did (`rank` says which), so a card isn't blank just
	 * because the champion left their list empty.
	 */
	showcase: { rank: number; name: string; legends: string[] } | null;
	/** Decks per Legend across the event, most-played first: the field's makeup. */
	field: { slug: string; decks: number }[];
};

const group = <T extends { tournamentId: number }>(rows: readonly T[]) => {
	const map = new Map<number, T[]>();
	for (const row of rows) map.set(row.tournamentId, [...(map.get(row.tournamentId) ?? []), row]);
	return map;
};

/** Newest first; events that started together keep a stable order by id. */
export function buildEventList(rows: EventListRows): EventListItem[] {
	const rounds = new Map(rows.rounds.map((r) => [r.tournamentId, r.rounds]));
	const decks = new Map(rows.decks.map((d) => [d.tournamentId, d.decks]));
	const winners = new Map(rows.winners.map((w) => [w.tournamentId, w.name]));
	const showcases = group(rows.showcase);
	const legends = group(rows.legends);

	return rows.tournaments
		.map((t): EventListItem => {
			const best = showcases.get(t.id);
			const [first] = best ?? [];
			return {
				id: t.id,
				name: t.name,
				startsAt: t.startsAt.getTime(),
				organizer: t.organizerName,
				playerCount: t.playerCount,
				deckCount: decks.get(t.id) ?? 0,
				roundCount: rounds.get(t.id) ?? 0,
				winner: winners.get(t.id) ?? null,
				showcase: first
					? {
							rank: first.rank,
							name: first.name,
							legends: (best ?? []).map((row) => row.cardSlug).sort()
						}
					: null,
				field: (legends.get(t.id) ?? [])
					.map((row) => ({ slug: row.cardSlug, decks: row.decks }))
					.sort((a, b) => b.decks - a.decks || a.slug.localeCompare(b.slug))
			};
		})
		.sort((a, b) => b.startsAt - a.startsAt || b.id - a.id);
}
