/**
 * The decks pages' shapes: a filtered list, one deck with its path through its event, and decks
 * grouped by Legend line. Pure; the database selects and `tournament-decks.ts` hands rows here.
 */
import { MIN_DECKS, type LineRow } from './meta.ts';

export const DECKS_PER_PAGE = 30;

/** Melee's decklist ids are GUIDs; anything else can't name a deck and shouldn't reach the database. */
export const DECK_GUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** A Legend line as `legend_line` stores it: up to six Legend slugs, joined by `+`. */
export const LEGEND_LINE = /^[a-z0-9-]{1,100}(\+[a-z0-9-]{1,100}){0,5}$/;

export type DeckListRow = {
	guid: string;
	eventId: number;
	eventName: string;
	/** Milliseconds since the epoch, UTC. */
	startsAt: number;
	playerCount: number;
	player: string;
	rank: number;
	wins: number;
	losses: number;
	draws: number;
	/** The deck's Legend slugs, sorted. */
	legends: string[];
	/** What they provide together, as a `legends:` value (`ram.ts`); null when unknown. */
	ram: string | null;
};

export type DeckFilters = {
	/** A Legend's slug: decks that run it as one of their Legends. */
	legend: string | null;
	/** A canonical RAM (`ram.ts`): decks whose Legends provide exactly that. */
	ram: string | null;
	/** A whole Legend line (`a+b+c`): decks whose Legends are exactly those, not just any one of them. */
	line: string | null;
	/** Card slugs, any of which the deck runs (main or sideboard). */
	cards: string[];
	/** A fragment of the player's name. */
	player: string | null;
	sort: 'finish' | 'recent';
	/** 1-based. */
	page: number;
};

export type DeckListPage = {
	total: number;
	page: number;
	pages: number;
	rows: DeckListRow[];
};

export const pageCount = (total: number) => Math.max(1, Math.ceil(total / DECKS_PER_PAGE));

/** One round of a deck's event, from the deck's player's side. */
export type PathRow = {
	round: number;
	opponent: string | null;
	oppLegends: string[];
	/** The opponent's deck, when they have one to open; null for a bye or a player with no list. */
	oppDeck: string | null;
	result: 'W' | 'L' | 'D' | 'BYE';
	/** `2–1`, from the deck's player's side; empty for a bye. */
	score: string;
};

export type MatchRowForPath = {
	round: number;
	playerA: number;
	playerB: number | null;
	gamesA: number;
	gamesB: number;
	kind: 'played' | 'draw' | 'bye' | 'forfeit';
};

export function buildPath(
	playerId: number,
	matches: readonly MatchRowForPath[],
	opponents: ReadonlyMap<number, { name: string; legends: string[]; deck: string | null }>
): PathRow[] {
	return matches
		.filter((m) => m.playerA === playerId || m.playerB === playerId)
		.sort((a, b) => a.round - b.round)
		.map((m) => {
			const isA = m.playerA === playerId;
			const opponentId = isA ? m.playerB : m.playerA;
			const [mine, theirs] = isA ? [m.gamesA, m.gamesB] : [m.gamesB, m.gamesA];
			const opponent = opponentId === null ? undefined : opponents.get(opponentId);
			const result: PathRow['result'] =
				m.kind === 'bye'
					? 'BYE'
					: m.kind === 'draw' || mine === theirs
						? 'D'
						: mine > theirs
							? 'W'
							: 'L';
			return {
				round: m.round,
				opponent: opponentId === null ? null : (opponent?.name ?? `Player ${opponentId}`),
				oppLegends: opponent?.legends ?? [],
				oppDeck: opponent?.deck ?? null,
				result,
				score: m.kind === 'bye' ? '' : `${mine}–${theirs}`
			};
		});
}

export type DeckDetail = DeckListRow & {
	name: string;
	line: string | null;
	main: { slug: string; quantity: number }[];
	side: { slug: string; quantity: number }[];
	unresolved: number;
	path: PathRow[];
};

/** How many Legend lines the shelf view draws, and how many decks of each. */
export const SHELF_LINES = 12;
export const SHELF_DECKS = 12;

/** A shelf of decks sharing a Legend line: a sample of them, and the line's record over all of them. */
export type LineShelf = {
	line: string;
	legends: string[];
	/** The best-placed `SHELF_DECKS` of them. */
	decks: DeckListRow[];
	/** Every deck that ran the line, of which `decks` shows some. */
	deckCount: number;
	/** The best finish any of its decks had (1 is a win). */
	bestRank: number;
	/** Match win rate with a draw as half; null below `MIN_DECKS` decks or when nothing was played. */
	winRate: number | null;
};

/** One line's shelf: its record is of every deck, its tiles are the sample read for it. */
export function buildShelf(
	row: LineRow & { line: string },
	decks: readonly DeckListRow[]
): LineShelf {
	const played = row.matchWins + row.matchLosses + row.matchDraws;
	return {
		line: row.line,
		legends: row.line.split('+'),
		decks: [...decks].sort(
			(a, b) => a.rank / a.playerCount - b.rank / b.playerCount || b.startsAt - a.startsAt
		),
		deckCount: row.decks,
		bestRank: row.best,
		winRate: row.decks >= MIN_DECKS && played ? (row.matchWins + row.matchDraws / 2) / played : null
	};
}
