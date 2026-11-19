/**
 * One Tournament, shaped for its page — the contract the three event views (standings, podium,
 * rounds) share.
 *
 * Pure: it takes the rows the data layer selected and returns plain values, so the page's
 * behaviour is tested against the same fixtures the ingest is, with no database. The Cards in a deck
 * are slugs here, not `Card`s: resolving them to names and art is the view's job, which keeps this
 * module free of the dataset and free to run on the server.
 */
import type { EventKind } from './kind.ts';
import type {
	players,
	standings,
	tournamentDeckCards,
	tournamentDecks,
	tournamentMatches,
	tournamentRounds,
	tournaments
} from '../server/db/schema.ts';

export type EventRows = {
	tournament: typeof tournaments.$inferSelect;
	rounds: (typeof tournamentRounds.$inferSelect)[];
	standings: { standing: typeof standings.$inferSelect; player: typeof players.$inferSelect }[];
	decks: (typeof tournamentDecks.$inferSelect)[];
	deckCards: (typeof tournamentDeckCards.$inferSelect)[];
	matches: (typeof tournamentMatches.$inferSelect)[];
};

export type CardCount = { slug: string; quantity: number };

export type DeckView = {
	guid: string;
	/** The player's own label for it; not an archetype. */
	name: string;
	/** The deck's Legend slugs, sorted. Normally three. */
	legends: string[];
	/** What the Legends provide together, as a `legends:` value (`ram.ts`); null when unknown. */
	ram: string | null;
	main: CardCount[];
	side: CardCount[];
	/** Lines that named no single Card when the deck was read. */
	unresolved: number;
};

export type StandingView = {
	rank: number;
	playerId: number;
	name: string;
	points: number;
	wins: number;
	losses: number;
	draws: number;
	/** Null: this player registered no list (or a blank one). */
	deck: DeckView | null;
};

export type MatchSide = { playerId: number; name: string };
export type MatchView = {
	/** `RoundView.number`, not Melee's round id. */
	round: number;
	table: number | null;
	a: MatchSide;
	/** Null for a bye. */
	b: MatchSide | null;
	gamesA: number;
	gamesB: number;
	draws: number;
	kind: 'played' | 'draw' | 'bye' | 'forfeit';
};

export type RoundView = { number: number; name: string };

export type EventView = {
	id: number;
	name: string;
	/** Milliseconds since the epoch, UTC. */
	startsAt: number;
	organizer: string;
	playerCount: number;
	deckCount: number;
	/** Decided from the name by `kind.ts` when ingested; see `tournaments.kind`. */
	kind: EventKind;
	/** From Melee's page header; each null when it couldn't be read. */
	venue: string | null;
	tournamentType: string | null;
	entryFee: string | null;
	registration: string | null;
	capacity: number | null;
	/** The same Tournament on Melee. */
	meleeUrl: string;
	rounds: RoundView[];
	standings: StandingView[];
	matches: MatchView[];
};

const byQuantityThenSlug = (a: CardCount, b: CardCount) =>
	b.quantity - a.quantity || a.slug.localeCompare(b.slug);

export function buildEventView(rows: EventRows): EventView {
	const { tournament } = rows;

	const cardsByDeck = new Map<string, typeof rows.deckCards>();
	for (const row of rows.deckCards) {
		const list = cardsByDeck.get(row.deckGuid) ?? [];
		list.push(row);
		cardsByDeck.set(row.deckGuid, list);
	}

	const decks = new Map<string, DeckView>();
	for (const deck of rows.decks) {
		const cards = cardsByDeck.get(deck.guid) ?? [];
		const board = (which: 'main' | 'legend' | 'side') =>
			cards
				.filter((card) => card.board === which)
				.map((card) => ({ slug: card.cardSlug, quantity: card.quantity }))
				.sort(byQuantityThenSlug);
		decks.set(deck.guid, {
			guid: deck.guid,
			name: deck.name,
			legends: board('legend')
				.map((card) => card.slug)
				.sort(),
			ram: deck.ram ?? null,
			main: board('main'),
			side: board('side'),
			unresolved: deck.unresolved
		});
	}

	const standingViews = rows.standings
		.map(({ standing, player }): StandingView => ({
			rank: standing.rank,
			playerId: player.id,
			name: player.displayName,
			points: standing.points,
			wins: standing.matchWins,
			losses: standing.matchLosses,
			draws: standing.matchDraws,
			deck: standing.deckGuid ? (decks.get(standing.deckGuid) ?? null) : null
		}))
		.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));

	const names = new Map(standingViews.map((s) => [s.playerId, s.name]));
	const side = (playerId: number): MatchSide => ({
		playerId,
		name: names.get(playerId) ?? `Player ${playerId}`
	});

	const matches = rows.matches
		.map((match): MatchView => ({
			round: match.round,
			table: match.tableNumber,
			a: side(match.playerA),
			b: match.playerB === null ? null : side(match.playerB),
			gamesA: match.gamesA,
			gamesB: match.gamesB,
			draws: match.draws,
			kind: match.kind
		}))
		.sort((a, b) => a.round - b.round || (a.table ?? 0) - (b.table ?? 0));

	return {
		id: tournament.id,
		name: tournament.name,
		startsAt: tournament.startsAt.getTime(),
		organizer: tournament.organizerName,
		playerCount: tournament.playerCount,
		deckCount: standingViews.filter((s) => s.deck).length,
		kind: tournament.kind,
		venue: tournament.venue,
		tournamentType: tournament.tournamentType,
		entryFee: tournament.entryFee,
		registration: tournament.registration,
		capacity: tournament.capacity,
		meleeUrl: `https://melee.gg/Tournament/View/${tournament.id}`,
		rounds: rows.rounds
			.map((round) => ({ number: round.number, name: round.name }))
			.sort((a, b) => a.number - b.number),
		standings: standingViews,
		matches
	};
}
