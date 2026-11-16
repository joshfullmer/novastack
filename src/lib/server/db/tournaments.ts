/**
 * Tournament data access — the only place route code reads the Melee-ingested tables
 * (`docs/spec/tournaments.md` §3). Read-only: `pnpm melee` is the one writer.
 *
 * Selects rows and hands them to `buildEventView`, which is where the page's shape is decided and
 * tested. Six small queries rather than one wide join: each is a primary-key or indexed lookup, and a
 * wide join would repeat every deck's cards once per standing.
 */
import { eq } from 'drizzle-orm';
import { buildEventView, type EventView } from '#lib/tournaments/event-view.js';
import type { getDb } from './index.js';
import {
	players,
	standings,
	tournamentDeckCards,
	tournamentDecks,
	tournamentMatches,
	tournamentRounds,
	tournaments
} from './schema.js';

type Db = ReturnType<typeof getDb>;

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
