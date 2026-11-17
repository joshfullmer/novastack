/**
 * The meta statistics, as grouped aggregates over the ingested tables (`docs/spec/tournaments.md` §6).
 *
 * SQL does the counting so a view's cost grows with the number of *groups* it returns, not with the
 * number of decks it reads into memory. (D1 still bills by rows scanned; the indexes in schema.ts are
 * what keep that down, and `rows_read` is measured on the real thing, not here.) Every query takes a
 * `Period`: a Tournament counts when its start falls in the window.
 */
import { and, count, eq, gte, inArray, isNotNull, lt, min, ne, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import {
	buildCardStats,
	buildCardUsage,
	type CardStat,
	type CardUsage
} from '#lib/tournaments/cards.js';
import {
	buildLines,
	buildMeta,
	MATRIX_SIZE,
	type GroupStat,
	type LineRow,
	type MetaView
} from '#lib/tournaments/meta.js';
import type { MetaRow, Period } from '#lib/tournaments/period.js';
import type { Db } from './tournaments.js';
import {
	metas,
	players,
	standings,
	tournamentDeckCards,
	tournamentDecks,
	tournamentMatches,
	tournaments
} from './schema.js';

/** The window as a condition on the Tournament's start; no condition for an unbounded side. */
export const inPeriod = (period: Period): SQL | undefined =>
	and(
		period.from === null ? undefined : gte(tournaments.startsAt, new Date(period.from)),
		period.to === null ? undefined : lt(tournaments.startsAt, new Date(period.to))
	);

/** `SUM(expr)` that is 0 rather than NULL for an empty group, as a number. */
const total = (expression: SQL) => sql<number>`coalesce(sum(${expression}), 0)`.mapWith(Number);

const one = (condition: SQL) => sql`case when ${condition} then 1 else 0 end`;

/** Every `metas` row, for the period selector. */
export async function getMetas(db: Db): Promise<MetaRow[]> {
	return db.select().from(metas);
}

const recordColumns = {
	decks: count(),
	matchWins: total(sql`${standings.matchWins}`),
	matchLosses: total(sql`${standings.matchLosses}`),
	matchDraws: total(sql`${standings.matchDraws}`),
	top8: total(one(sql`${standings.rank} <= 8`)),
	wins: total(one(sql`${standings.rank} = 1`)),
	best: min(standings.rank).mapWith(Number)
};

/** One row per Legend line with its record: the first half of `getMeta`, for pages that only need that. */
export async function lineRows(db: Db, period: Period): Promise<LineRow[]> {
	return db
		.select({ line: tournamentDecks.legendLine, ...recordColumns })
		.from(tournamentDecks)
		.innerJoin(standings, eq(standings.deckGuid, tournamentDecks.guid))
		.innerJoin(tournaments, eq(tournaments.id, tournamentDecks.tournamentId))
		.where(and(isNotNull(tournamentDecks.legendLine), inPeriod(period)))
		.groupBy(tournamentDecks.legendLine);
}

/** The Legend lines in a period, most-played first. */
export async function getLines(db: Db, period: Period): Promise<GroupStat[]> {
	return buildLines(await lineRows(db, period));
}

/**
 * The whole meta view for a period: decks and results grouped by Legend line and by single Legend,
 * and who beat whom among the eight most-played lines.
 */
export async function getMeta(
	db: Db,
	period: Period,
	/** Which expensive parts to compute; a view that doesn't draw one shouldn't pay for it. */
	parts: { legends: boolean; matchups: boolean } = { legends: true, matchups: true }
): Promise<MetaView> {
	const [lines, legends] = await Promise.all([
		lineRows(db, period),
		parts.legends
			? db
					.select({ line: tournamentDeckCards.cardSlug, ...recordColumns })
					.from(tournamentDeckCards)
					.innerJoin(standings, eq(standings.deckGuid, tournamentDeckCards.deckGuid))
					.where(
						and(
							eq(tournamentDeckCards.board, 'legend'),
							inArray(
								tournamentDeckCards.tournamentId,
								db.select({ id: tournaments.id }).from(tournaments).where(inPeriod(period))
							)
						)
					)
					.groupBy(tournamentDeckCards.cardSlug)
			: Promise.resolve([])
	]);

	// The matrix is drawn for the most-played lines only, so those are found first and then used to
	// bound the matches query.
	const top = lines
		.flatMap((row) => (row.line ? [row] : []))
		.sort(
			(a, b) => b.decks - a.decks || b.wins - a.wins || (a.line ?? '').localeCompare(b.line ?? '')
		)
		.slice(0, MATRIX_SIZE)
		.flatMap((row) => (row.line ? [row.line] : []));

	const [matchups, crossMatchesTotal] = parts.matchups
		? await Promise.all([getMatchups(db, period, top), countCrossMatches(db, period)])
		: [[], undefined];
	return buildMeta({ lines, legends, matchups, crossMatchesTotal });
}

/** Every match between two decks of different Legend lines, whichever lines: the matrix's context. */
async function countCrossMatches(db: Db, period: Period): Promise<number> {
	const sa = alias(standings, 'sa');
	const sb = alias(standings, 'sb');
	const da = alias(tournamentDecks, 'da');
	const db2 = alias(tournamentDecks, 'db2');
	const m = tournamentMatches;
	const [row] = await db
		.select({ n: count() })
		.from(m)
		.innerJoin(tournaments, eq(tournaments.id, m.tournamentId))
		.innerJoin(sa, and(eq(sa.tournamentId, m.tournamentId), eq(sa.playerId, m.playerA)))
		.innerJoin(sb, and(eq(sb.tournamentId, m.tournamentId), eq(sb.playerId, m.playerB)))
		.innerJoin(da, eq(da.guid, sa.deckGuid))
		.innerJoin(db2, eq(db2.guid, sb.deckGuid))
		.where(
			and(
				inPeriod(period),
				inArray(m.kind, ['played', 'draw']),
				isNotNull(da.legendLine),
				isNotNull(db2.legendLine),
				ne(da.legendLine, db2.legendLine)
			)
		);
	return row?.n ?? 0;
}

/**
 * Matches between two decks of different Legend lines, both among `lines`, grouped by the pair as they
 * were drawn. `score` is the first side's: a win is 1, a draw (or equal games) 0.5, a loss 0. Byes and
 * forfeits, mirrors, and players with no deck are left out.
 */
async function getMatchups(db: Db, period: Period, lines: string[]) {
	if (lines.length < 2) return [];
	const sa = alias(standings, 'sa');
	const sb = alias(standings, 'sb');
	const da = alias(tournamentDecks, 'da');
	const db2 = alias(tournamentDecks, 'db2');
	const m = tournamentMatches;

	return db
		.select({
			a: da.legendLine,
			b: db2.legendLine,
			matches: count(),
			score: total(
				sql`case when ${m.kind} = 'draw' or ${m.gamesA} = ${m.gamesB} then 0.5 when ${m.gamesA} > ${m.gamesB} then 1 else 0 end`
			)
		})
		.from(m)
		.innerJoin(tournaments, eq(tournaments.id, m.tournamentId))
		.innerJoin(sa, and(eq(sa.tournamentId, m.tournamentId), eq(sa.playerId, m.playerA)))
		.innerJoin(sb, and(eq(sb.tournamentId, m.tournamentId), eq(sb.playerId, m.playerB)))
		.innerJoin(da, eq(da.guid, sa.deckGuid))
		.innerJoin(db2, eq(db2.guid, sb.deckGuid))
		.where(
			and(
				inPeriod(period),
				inArray(m.kind, ['played', 'draw']),
				inArray(da.legendLine, lines),
				inArray(db2.legendLine, lines),
				ne(da.legendLine, db2.legendLine)
			)
		)
		.groupBy(da.legendLine, db2.legendLine);
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/** Decks in scope (a period, and optionally one Legend line): the denominator of a Card's inclusion. */
async function countDecks(db: Db, period: Period, line: string | null): Promise<number> {
	const [row] = await db
		.select({ n: count() })
		.from(tournamentDecks)
		.innerJoin(tournaments, eq(tournaments.id, tournamentDecks.tournamentId))
		.where(and(inPeriod(period), line === null ? undefined : eq(tournamentDecks.legendLine, line)));
	return row?.n ?? 0;
}

/**
 * What is played: every Card's main-deck and sideboard usage across the decks in scope, optionally
 * narrowed to one Legend line. Legends are left out: they are a Legend, not a "card in the deck".
 */
export async function getCardStats(
	db: Db,
	period: Period,
	line: string | null
): Promise<{ decks: number; cards: CardStat[] }> {
	const columns = {
		slug: tournamentDeckCards.cardSlug,
		mainDecks: total(one(sql`${tournamentDeckCards.board} = 'main'`)),
		copies: total(
			sql`case when ${tournamentDeckCards.board} = 'main' then ${tournamentDeckCards.quantity} else 0 end`
		),
		sideDecks: total(one(sql`${tournamentDeckCards.board} = 'side'`))
	};
	const [decks, rows] = await Promise.all([
		countDecks(db, period, line),
		// Two shapes, because each wants a different driving table. Across every deck the rows are found
		// by `(board, tournament_id, card_slug)`, so a window is a range and no deck is joined. For one
		// Legend line the few decks that ran it are found first and their cards read by deck; there the
		// board test is deliberately `<>`, which that index cannot serve, or the planner prefers walking
		// every card row to starting from the line (measured: 4 ms vs 255 ms at 1,000 events).
		line === null
			? db
					.select(columns)
					.from(tournamentDeckCards)
					.where(
						and(
							inArray(tournamentDeckCards.board, ['main', 'side']),
							inArray(
								tournamentDeckCards.tournamentId,
								db.select({ id: tournaments.id }).from(tournaments).where(inPeriod(period))
							)
						)
					)
					.groupBy(tournamentDeckCards.cardSlug)
			: db
					.select(columns)
					.from(tournamentDeckCards)
					.innerJoin(tournamentDecks, eq(tournamentDecks.guid, tournamentDeckCards.deckGuid))
					.innerJoin(tournaments, eq(tournaments.id, tournamentDecks.tournamentId))
					.where(
						and(
							ne(tournamentDeckCards.board, 'legend'),
							inPeriod(period),
							eq(tournamentDecks.legendLine, line)
						)
					)
					.groupBy(tournamentDeckCards.cardSlug)
	]);
	return { decks, cards: buildCardStats(rows, decks) };
}

/** One Card's usage: every deck that ran it, with its finish, and how it compares with the field. */
export async function getCardUsage(db: Db, period: Period, slug: string): Promise<CardUsage> {
	const [rows, totals, lines] = await Promise.all([
		db
			.select({
				guid: tournamentDecks.guid,
				eventId: tournaments.id,
				eventName: tournaments.name,
				startsAt: tournaments.startsAt,
				playerCount: tournaments.playerCount,
				player: players.displayName,
				rank: standings.rank,
				wins: standings.matchWins,
				losses: standings.matchLosses,
				draws: standings.matchDraws,
				line: tournamentDecks.legendLine,
				main: total(
					sql`case when ${tournamentDeckCards.board} = 'main' then ${tournamentDeckCards.quantity} else 0 end`
				),
				side: total(
					sql`case when ${tournamentDeckCards.board} = 'side' then ${tournamentDeckCards.quantity} else 0 end`
				),
				legend: total(one(sql`${tournamentDeckCards.board} = 'legend'`))
			})
			.from(tournamentDeckCards)
			.innerJoin(tournamentDecks, eq(tournamentDecks.guid, tournamentDeckCards.deckGuid))
			.innerJoin(standings, eq(standings.deckGuid, tournamentDecks.guid))
			.innerJoin(players, eq(players.id, standings.playerId))
			.innerJoin(tournaments, eq(tournaments.id, tournamentDecks.tournamentId))
			.where(and(eq(tournamentDeckCards.cardSlug, slug), inPeriod(period)))
			.groupBy(tournamentDecks.guid),
		db
			.select({
				decks: count(),
				winners: total(one(sql`${standings.rank} = 1`)),
				top8: total(one(sql`${standings.rank} <= 8`))
			})
			.from(tournamentDecks)
			.innerJoin(standings, eq(standings.deckGuid, tournamentDecks.guid))
			.innerJoin(tournaments, eq(tournaments.id, tournamentDecks.tournamentId))
			.where(inPeriod(period)),
		db
			.select({ line: tournamentDecks.legendLine, decks: count() })
			.from(tournamentDecks)
			.innerJoin(tournaments, eq(tournaments.id, tournamentDecks.tournamentId))
			.where(and(isNotNull(tournamentDecks.legendLine), inPeriod(period)))
			.groupBy(tournamentDecks.legendLine)
	]);

	return buildCardUsage({
		slug,
		rows: rows.map((row) => ({
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
			line: row.line,
			main: row.main,
			side: row.side,
			asLegend: row.legend > 0
		})),
		totals: totals[0] ?? { decks: 0, winners: 0, top8: 0 },
		lines
	});
}
