/**
 * The decks pages' shapes: a filtered list, one deck with its path through its event, and decks
 * grouped by Legend line. Pure; the database selects and `tournament-decks.ts` hands rows here.
 */
import { MIN_DECKS } from './meta.ts';

export const DECKS_PER_PAGE = 30;

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
};

export type DeckFilters = {
	/** A Legend's slug: decks that run it as one of their Legends. */
	legend: string | null;
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
	opponents: ReadonlyMap<number, { name: string; legends: string[] }>
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

/** A shelf of decks sharing a Legend line. */
export type LineShelf = {
	line: string;
	legends: string[];
	decks: DeckListRow[];
	/** The best finish any of its decks had (1 is a win). */
	bestRank: number;
	/** Match win rate with a draw as half; null below `MIN_DECKS` decks or when nothing was played. */
	winRate: number | null;
};

export function buildShelves(rows: readonly (DeckListRow & { line: string })[]): LineShelf[] {
	const by = new Map<string, (DeckListRow & { line: string })[]>();
	for (const row of rows) by.set(row.line, [...(by.get(row.line) ?? []), row]);

	return [...by]
		.map(([line, decks]): LineShelf => {
			const played = decks.reduce((n, d) => n + d.wins + d.losses + d.draws, 0);
			const won = decks.reduce((n, d) => n + d.wins + d.draws / 2, 0);
			return {
				line,
				legends: line.split('+'),
				decks: [...decks].sort(
					(a, b) => a.rank / a.playerCount - b.rank / b.playerCount || b.startsAt - a.startsAt
				),
				bestRank: Math.min(...decks.map((d) => d.rank)),
				winRate: decks.length >= MIN_DECKS && played ? won / played : null
			};
		})
		.sort(
			(a, b) =>
				b.decks.length - a.decks.length || a.bestRank - b.bestRank || a.line.localeCompare(b.line)
		);
}
