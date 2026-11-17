/**
 * Tournament data access — the only place route code reads the Melee-ingested tables
 * (`docs/spec/tournaments.md` §3). Read-only: `pnpm melee` is the one writer.
 *
 * Selects rows and hands them to `buildEventView`, which is where the page's shape is decided and
 * tested. Six small queries rather than one wide join: each is a primary-key or indexed lookup, and a
 * wide join would repeat every deck's cards once per standing.
 */
import { and, count, eq, isNotNull, min } from 'drizzle-orm';
import { buildEventList, type EventListItem } from '#lib/tournaments/event-list.js';
import { buildEventView, type EventView } from '#lib/tournaments/event-view.js';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
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
		db
			.select({ card: tournamentDeckCards })
			.from(tournamentDeckCards)
			.innerJoin(tournamentDecks, eq(tournamentDecks.guid, tournamentDeckCards.deckGuid))
			.where(eq(tournamentDecks.tournamentId, id)),
		db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id))
	]);

	return buildEventView({
		tournament,
		rounds,
		standings: standingRows,
		decks,
		deckCards: deckCards.map((row) => row.card),
		matches
	});
}

/**
 * Every ingested Tournament, newest first, with what a list row or card needs.
 *
 * **Aggregates, not rows**: counts per event and one row per Legend, so the list's cost grows with the
 * number of events rather than the number of decks. (D1 bills by rows read; the full-deck reads belong to
 * the event page, which wants them.) The "showcase" is the best-placed player who registered a deck,
 * found by joining each event's minimum deck-holding rank back to its standing.
 */
export async function getEventList(db: Db): Promise<EventListItem[]> {
	const best = db
		.select({ tournamentId: standings.tournamentId, rank: min(standings.rank).as('best_rank') })
		.from(standings)
		.where(isNotNull(standings.deckGuid))
		.groupBy(standings.tournamentId)
		.as('best');

	const [events, rounds, decks, winners, showcase, legends] = await Promise.all([
		db.select().from(tournaments),
		db
			.select({ tournamentId: tournamentRounds.tournamentId, rounds: count() })
			.from(tournamentRounds)
			.groupBy(tournamentRounds.tournamentId),
		db
			.select({ tournamentId: tournamentDecks.tournamentId, decks: count() })
			.from(tournamentDecks)
			.groupBy(tournamentDecks.tournamentId),
		db
			.select({ tournamentId: standings.tournamentId, name: players.displayName })
			.from(standings)
			.innerJoin(players, eq(players.id, standings.playerId))
			.where(eq(standings.rank, 1)),
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
				tournamentId: tournamentDecks.tournamentId,
				cardSlug: tournamentDeckCards.cardSlug,
				decks: count()
			})
			.from(tournamentDeckCards)
			.innerJoin(tournamentDecks, eq(tournamentDecks.guid, tournamentDeckCards.deckGuid))
			.where(eq(tournamentDeckCards.board, 'legend'))
			.groupBy(tournamentDecks.tournamentId, tournamentDeckCards.cardSlug)
	]);

	return buildEventList({ tournaments: events, rounds, decks, winners, showcase, legends });
}
