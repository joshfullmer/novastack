/**
 * Tournament data access — the only place route code reads the Melee-ingested tables
 * (`docs/spec/tournaments.md` §3). Read-only: `pnpm melee` is the one writer.
 *
 * Selects rows and hands them to `buildEventView`, which is where the page's shape is decided and
 * tested. Six small queries rather than one wide join: each is a primary-key or indexed lookup, and a
 * wide join would repeat every deck's cards once per standing.
 */
import { and, count, desc, eq, gte, inArray, isNotNull, lt, max, min, or, sum } from 'drizzle-orm';
import {
	ANY_EVENT,
	buildEventList,
	eventPageCount,
	EVENTS_PER_PAGE,
	type EventListPage,
	type EventQuery
} from '#lib/tournaments/event-list.js';
import { EVENT_KINDS } from '#lib/tournaments/kind.js';
import { buildEventView, type EventView } from '#lib/tournaments/event-view.js';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { contains } from './like.js';
import type * as schema from './schema.js';
import {
	players,
	standings,
	tournamentDeckCards,
	tournamentDecks,
	tournamentMatches,
	tournamentRounds,
	tournaments
} from './schema.js';

/**
 * The common base of D1's Drizzle database and the test harness's (`test-db.ts`), so these functions
 * run in production against D1 and in tests against a real SQLite, unchanged.
 */
export type Db = BaseSQLiteDatabase<'async', unknown, typeof schema>;

/** One Tournament as its page needs it, or `null` when no such event has been ingested. */
export async function getEventView(db: Db, id: number): Promise<EventView | null> {
	const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
	if (!tournament) return null;

	const [rounds, standingRows, decks, deckCards, matches] = await Promise.all([
		db.select().from(tournamentRounds).where(eq(tournamentRounds.tournamentId, id)),
		db
			.select({ standing: standings, player: players })
			.from(standings)
			.innerJoin(players, eq(players.id, standings.playerId))
			.where(eq(standings.tournamentId, id)),
		db.select().from(tournamentDecks).where(eq(tournamentDecks.tournamentId, id)),
		db.select().from(tournamentDeckCards).where(eq(tournamentDeckCards.tournamentId, id)),
		db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id))
	]);

	return buildEventView({
		tournament,
		rounds,
		standings: standingRows,
		decks,
		deckCards,
		matches
	});
}

/**
 * One page of Tournaments, newest first, with what a list row or card needs.
 *
 * **Aggregates, not rows**: counts per event and one row per Legend, for this page's events only, so
 * the cost is the same at ten events and at a thousand (D1 bills by rows read; the full-deck reads
 * belong to the event page, which wants them). The "showcase" is the best-placed player who registered
 * a deck, found by joining each event's minimum deck-holding rank back to its standing.
 */
export async function getEventList(
	db: Db,
	requested: Partial<EventQuery> = {}
): Promise<EventListPage> {
	const asked = { ...ANY_EVENT, ...requested };
	const inYear =
		asked.year === null
			? undefined
			: and(
					gte(tournaments.startsAt, new Date(Date.UTC(asked.year, 0, 1))),
					lt(tournaments.startsAt, new Date(Date.UTC(asked.year + 1, 0, 1)))
				);
	const matchesText =
		asked.q === null
			? undefined
			: or(contains(tournaments.name, asked.q), contains(tournaments.organizerName, asked.q));
	const others = and(inYear, matchesText);
	const where = and(others, asked.kind === null ? undefined : eq(tournaments.kind, asked.kind));

	const [[totals], kindCounts, [span]] = await Promise.all([
		db
			.select({ total: count(), players: sum(tournaments.playerCount).mapWith(Number) })
			.from(tournaments)
			.where(where),
		db
			.select({ kind: tournaments.kind, count: count() })
			.from(tournaments)
			.where(others)
			.groupBy(tournaments.kind),
		db
			.select({ first: min(tournaments.startsAt), last: max(tournaments.startsAt) })
			.from(tournaments)
	]);
	const total = totals?.total ?? 0;
	const pages = eventPageCount(total);
	const page = Math.min(Math.max(1, asked.page), pages);

	const kinds = EVENT_KINDS.flatMap((kind) => {
		const n = kindCounts.find((row) => row.kind === kind)?.count ?? 0;
		return n > 0 || kind === asked.kind ? [{ kind, count: n }] : [];
	});
	const newest = span?.last ? new Date(span.last).getUTCFullYear() : null;
	const oldest = span?.first ? new Date(span.first).getUTCFullYear() : null;
	const years =
		newest === null || oldest === null
			? []
			: Array.from({ length: newest - oldest + 1 }, (_, i) => newest - i);
	const frame = { total, page, pages, query: { ...asked, page }, kinds, years };

	const events = await db
		.select()
		.from(tournaments)
		.where(where)
		.orderBy(desc(tournaments.startsAt), desc(tournaments.id))
		.limit(EVENTS_PER_PAGE)
		.offset((page - 1) * EVENTS_PER_PAGE);
	const ids = events.map((event) => event.id);
	if (ids.length === 0) return { events: [], players: 0, ...frame };

	const best = db
		.select({ tournamentId: standings.tournamentId, rank: min(standings.rank).as('best_rank') })
		.from(standings)
		.where(and(isNotNull(standings.deckGuid), inArray(standings.tournamentId, ids)))
		.groupBy(standings.tournamentId)
		.as('best');

	const [rounds, decks, winners, showcase, legends] = await Promise.all([
		db
			.select({ tournamentId: tournamentRounds.tournamentId, rounds: count() })
			.from(tournamentRounds)
			.where(inArray(tournamentRounds.tournamentId, ids))
			.groupBy(tournamentRounds.tournamentId),
		db
			.select({ tournamentId: tournamentDecks.tournamentId, decks: count() })
			.from(tournamentDecks)
			.where(inArray(tournamentDecks.tournamentId, ids))
			.groupBy(tournamentDecks.tournamentId),
		db
			.select({ tournamentId: standings.tournamentId, name: players.displayName })
			.from(standings)
			.innerJoin(players, eq(players.id, standings.playerId))
			.where(and(eq(standings.rank, 1), inArray(standings.tournamentId, ids))),
		db
			.select({
				tournamentId: standings.tournamentId,
				rank: standings.rank,
				name: players.displayName,
				cardSlug: tournamentDeckCards.cardSlug
			})
			.from(standings)
			.innerJoin(
				best,
				and(eq(best.tournamentId, standings.tournamentId), eq(best.rank, standings.rank))
			)
			.innerJoin(players, eq(players.id, standings.playerId))
			.innerJoin(
				tournamentDeckCards,
				and(
					eq(tournamentDeckCards.deckGuid, standings.deckGuid),
					eq(tournamentDeckCards.board, 'legend')
				)
			),
		db
			.select({
				tournamentId: tournamentDeckCards.tournamentId,
				cardSlug: tournamentDeckCards.cardSlug,
				decks: count()
			})
			.from(tournamentDeckCards)
			.where(
				and(eq(tournamentDeckCards.board, 'legend'), inArray(tournamentDeckCards.tournamentId, ids))
			)
			.groupBy(tournamentDeckCards.tournamentId, tournamentDeckCards.cardSlug)
	]);

	return {
		events: buildEventList({ tournaments: events, rounds, decks, winners, showcase, legends }),
		players: totals?.players ?? 0,
		...frame
	};
}
