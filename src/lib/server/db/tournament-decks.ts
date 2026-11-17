/**
 * Tournament Decks as pages need them: a filtered, paginated list; one deck with its path through its
 * event; and decks grouped by Legend line (`docs/spec/tournaments.md` §6).
 *
 * Filtering and paging happen in SQL, so a page's cost is its page size, not the number of decks
 * ever ingested. The only unbounded read is `getDecksByLine`, capped, because a shelf view is a
 * survey of everything by nature.
 */
import {
	and,
	asc,
	count,
	desc,
	eq,
	exists,
	inArray,
	isNotNull,
	ne,
	or,
	sql,
	type SQL
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import {
	buildPath,
	buildShelves,
	DECKS_PER_PAGE,
	pageCount,
	type DeckDetail,
	type DeckFilters,
	type DeckListPage,
	type DeckListRow,
	type LineShelf
} from '#lib/tournaments/deck-views.js';
import type { Period } from '#lib/tournaments/period.js';
import { inPeriod } from './tournament-stats.js';
import type { Db } from './tournaments.js';
import {
	players,
	standings,
	tournamentDeckCards,
	tournamentDecks,
	tournamentMatches,
	tournaments
} from './schema.js';

/** `%` and `_` in what a person typed are text, not wildcards. */
const likeFragment = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const deckColumns = {
	guid: tournamentDecks.guid,
	eventId: tournaments.id,
	eventName: tournaments.name,
	startsAt: tournaments.startsAt,
	playerCount: tournaments.playerCount,
	player: players.displayName,
	rank: standings.rank,
	wins: standings.matchWins,
	losses: standings.matchLosses,
	draws: standings.matchDraws
};

/** The Legends of each of these decks, sorted. A page's worth of guids, so well under D1's parameter limit. */
async function legendsOf(db: Db, guids: string[]): Promise<Map<string, string[]>> {
	const map = new Map<string, string[]>();
	if (guids.length === 0) return map;
	const rows = await db
		.select({ guid: tournamentDeckCards.deckGuid, slug: tournamentDeckCards.cardSlug })
		.from(tournamentDeckCards)
		.where(
			and(inArray(tournamentDeckCards.deckGuid, guids), eq(tournamentDeckCards.board, 'legend'))
		);
	for (const row of rows) map.set(row.guid, [...(map.get(row.guid) ?? []), row.slug].sort());
	return map;
}

const toRow = (
	row: Omit<DeckListRow, 'startsAt' | 'legends'> & { startsAt: Date },
	legends: Map<string, string[]>
): DeckListRow => ({
	...row,
	startsAt: row.startsAt.getTime(),
	legends: legends.get(row.guid) ?? []
});

export async function getDeckList(
	db: Db,
	period: Period,
	filters: DeckFilters
): Promise<DeckListPage> {
	const lc = alias(tournamentDeckCards, 'lc');
	const cc = alias(tournamentDeckCards, 'cc');

	const conditions: (SQL | undefined)[] = [inPeriod(period)];
	if (filters.legend) {
		conditions.push(
			exists(
				db
					.select({ one: sql`1` })
					.from(lc)
					.where(
						and(
							eq(lc.deckGuid, tournamentDecks.guid),
							eq(lc.board, 'legend'),
							eq(lc.cardSlug, filters.legend)
						)
					)
			)
		);
	}
	if (filters.cards.length > 0) {
		conditions.push(
			exists(
				db
					.select({ one: sql`1` })
					.from(cc)
					.where(
						and(
							eq(cc.deckGuid, tournamentDecks.guid),
							ne(cc.board, 'legend'),
							inArray(cc.cardSlug, filters.cards)
						)
					)
			)
		);
	}
	if (filters.player) {
		conditions.push(sql`${players.displayName} like ${likeFragment(filters.player)} escape '\\'`);
	}
	const where = and(...conditions);

	const [{ n: total }] = await db
		.select({ n: count() })
		.from(tournamentDecks)
		.innerJoin(standings, eq(standings.deckGuid, tournamentDecks.guid))
		.innerJoin(players, eq(players.id, standings.playerId))
		.innerJoin(tournaments, eq(tournaments.id, tournamentDecks.tournamentId))
		.where(where);

	const pages = pageCount(total);
	const page = Math.min(Math.max(1, filters.page), pages);

	const order =
		filters.sort === 'finish'
			? [
					asc(sql`${standings.rank} * 1.0 / ${tournaments.playerCount}`),
					desc(tournaments.startsAt),
					asc(tournamentDecks.guid)
				]
			: [desc(tournaments.startsAt), asc(standings.rank), asc(tournamentDecks.guid)];

	const rows = await db
		.select(deckColumns)
		.from(tournamentDecks)
		.innerJoin(standings, eq(standings.deckGuid, tournamentDecks.guid))
		.innerJoin(players, eq(players.id, standings.playerId))
		.innerJoin(tournaments, eq(tournaments.id, tournamentDecks.tournamentId))
		.where(where)
		.orderBy(...order)
		.limit(DECKS_PER_PAGE)
		.offset((page - 1) * DECKS_PER_PAGE);

	const legends = await legendsOf(
		db,
		rows.map((row) => row.guid)
	);
	return { total, page, pages, rows: rows.map((row) => toRow(row, legends)) };
}

/** One deck with its lists and its path through its event, or null for a guid we don't have. */
export async function getDeckDetail(db: Db, guid: string): Promise<DeckDetail | null> {
	const [row] = await db
		.select({
			...deckColumns,
			playerId: players.id,
			name: tournamentDecks.name,
			line: tournamentDecks.legendLine,
			unresolved: tournamentDecks.unresolved
		})
		.from(tournamentDecks)
		.innerJoin(standings, eq(standings.deckGuid, tournamentDecks.guid))
		.innerJoin(players, eq(players.id, standings.playerId))
		.innerJoin(tournaments, eq(tournaments.id, tournamentDecks.tournamentId))
		.where(eq(tournamentDecks.guid, guid));
	if (!row) return null;

	const [cards, matches] = await Promise.all([
		db.select().from(tournamentDeckCards).where(eq(tournamentDeckCards.deckGuid, guid)),
		db
			.select()
			.from(tournamentMatches)
			.where(
				and(
					eq(tournamentMatches.tournamentId, row.eventId),
					or(
						eq(tournamentMatches.playerA, row.playerId),
						eq(tournamentMatches.playerB, row.playerId)
					)
				)
			)
	]);

	// Who the deck's player met, and what those people were playing.
	const opponentIds = [
		...new Set(
			matches
				.flatMap((m) => [m.playerA, m.playerB])
				.filter((id): id is number => id !== null && id !== row.playerId)
		)
	];
	const opponents = new Map<number, { name: string; legends: string[] }>();
	if (opponentIds.length > 0) {
		const found = await db
			.select({
				playerId: standings.playerId,
				name: players.displayName,
				slug: tournamentDeckCards.cardSlug
			})
			.from(standings)
			.innerJoin(players, eq(players.id, standings.playerId))
			.leftJoin(
				tournamentDeckCards,
				and(
					eq(tournamentDeckCards.deckGuid, standings.deckGuid),
					eq(tournamentDeckCards.board, 'legend')
				)
			)
			.where(
				and(eq(standings.tournamentId, row.eventId), inArray(standings.playerId, opponentIds))
			);
		for (const f of found) {
			const cur = opponents.get(f.playerId) ?? { name: f.name, legends: [] };
			if (f.slug) cur.legends = [...cur.legends, f.slug].sort();
			opponents.set(f.playerId, cur);
		}
	}

	const board = (which: 'main' | 'side' | 'legend') =>
		cards
			.filter((c) => c.board === which)
			.map((c) => ({ slug: c.cardSlug, quantity: c.quantity }))
			.sort((a, b) => b.quantity - a.quantity || a.slug.localeCompare(b.slug));

	return {
		guid: row.guid,
		eventId: row.eventId,
		eventName: row.eventName,
		startsAt: row.startsAt.getTime(),
		playerCount: row.playerCount,
		player: row.player,
		rank: row.rank,
		wins: row.wins,
		losses: row.losses,
		draws: row.draws,
		legends: board('legend')
			.map((c) => c.slug)
			.sort(),
		name: row.name,
		line: row.line,
		main: board('main'),
		side: board('side'),
		unresolved: row.unresolved,
		path: buildPath(row.playerId, matches, opponents)
	};
}

/** The most decks a shelf view reads. A survey of everything is unbounded by nature; this bounds it. */
export const SHELF_DECK_CAP = 1000;

export async function getDecksByLine(db: Db, period: Period): Promise<LineShelf[]> {
	const rows = await db
		.select({ ...deckColumns, line: tournamentDecks.legendLine })
		.from(tournamentDecks)
		.innerJoin(standings, eq(standings.deckGuid, tournamentDecks.guid))
		.innerJoin(players, eq(players.id, standings.playerId))
		.innerJoin(tournaments, eq(tournaments.id, tournamentDecks.tournamentId))
		.where(and(isNotNull(tournamentDecks.legendLine), inPeriod(period)))
		.orderBy(desc(tournaments.startsAt), asc(standings.rank))
		.limit(SHELF_DECK_CAP);

	return buildShelves(
		rows.flatMap((row) =>
			row.line === null
				? []
				: [
						{
							...row,
							startsAt: row.startsAt.getTime(),
							// A line is its Legends, sorted and joined, so they need no lookup.
							legends: row.line.split('+'),
							line: row.line
						}
					]
		)
	);
}
