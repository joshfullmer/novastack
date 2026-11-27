/**
 * The meta statistics, as grouped aggregates over the ingested tables (`docs/spec/tournaments.md` §6).
 *
 * SQL does the counting so a view's cost grows with the number of *groups* it returns, not with the
 * number of decks it reads into memory. (D1 still bills by rows scanned; the indexes in schema.ts are
 * what keep that down, and `rows_read` is measured on the real thing, not here.) Every query takes a
 * `Period`: a Tournament counts when its start falls in the window.
 */
import {
	and,
	count,
	eq,
	gte,
	inArray,
	isNotNull,
	lt,
	min,
	ne,
	sql,
	type SQL,
	type SQLWrapper
} from 'drizzle-orm';
import { alias, type SQLiteColumn } from 'drizzle-orm/sqlite-core';
import {
	buildCardStats,
	buildCardUsage,
	type CardStat,
	type CardUsage
} from '#lib/tournaments/cards.js';
import { buildMirrors, type MirrorRow, type MirrorView } from '#lib/tournaments/mirrors.js';
import {
	buildLines,
	buildMeta,
	MATRIX_SIZE,
	type GroupStat,
	type LineRow,
	type MetaView,
	type Phase
} from '#lib/tournaments/meta.js';
import { EVENT_KINDS, type EventKind } from '#lib/tournaments/kind.js';
import type { MetaRow, Period } from '#lib/tournaments/period.js';
import type { DayRow } from '#lib/tournaments/trend.js';
import type { Db } from './tournaments.js';
import {
	metas,
	standings,
	tournamentDeckCards,
	tournamentDecks,
	tournamentMatches,
	tournamentRounds,
	tournaments
} from './schema.js';

/**
 * The scope as a condition on the Tournament: its start within the window, and, when set, its kinds and
 * size. No condition for anything unbounded.
 */
export const inPeriod = (period: Period): SQL | undefined =>
	and(
		period.from === null ? undefined : gte(tournaments.startsAt, new Date(period.from)),
		period.to === null ? undefined : lt(tournaments.startsAt, new Date(period.to)),
		period.kinds.length === 0 ? undefined : inArray(tournaments.kind, [...period.kinds]),
		period.minPlayers === null ? undefined : gte(tournaments.playerCount, period.minPlayers)
	);

/** `SUM(expr)` that is 0 rather than NULL for an empty group, as a number. */
const total = (expression: SQL) => sql<number>`coalesce(sum(${expression}), 0)`.mapWith(Number);

const one = (condition: SQL) => sql`case when ${condition} then 1 else 0 end`;

/** The kinds of event ingested so far, so a selector offers only choices that can match something. */
export async function getEventKinds(db: Db): Promise<EventKind[]> {
	const rows = await db.selectDistinct({ kind: tournaments.kind }).from(tournaments);
	return EVENT_KINDS.filter((kind) => rows.some((row) => row.kind === kind));
}

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

/** How decks are grouped into archetypes: by their three Legends, or by the RAM those provide together. */
export type Grouping = 'line' | 'ram';

/** The column a grouping reads, on `tournament_decks` or an alias of it. */
const groupColumn = <T extends { ram: SQLiteColumn; legendLine: SQLiteColumn }>(
	by: Grouping,
	decks: T
) => (by === 'ram' ? decks.ram : decks.legendLine);

/** One row per group with its record. The key is in `line`, whichever grouping it is. */
async function groupRows(db: Db, period: Period, by: Grouping): Promise<LineRow[]> {
	const column = groupColumn(by, tournamentDecks);
	return db
		.select({ line: column, ...recordColumns })
		.from(tournamentDecks)
		.innerJoin(standings, eq(standings.deckGuid, tournamentDecks.guid))
		.innerJoin(tournaments, eq(tournaments.id, tournamentDecks.tournamentId))
		.where(and(isNotNull(column), inPeriod(period)))
		.groupBy(column);
}

/** One row per Legend line with its record: the first half of `getMeta`, for pages that only need that. */
export const lineRows = (db: Db, period: Period) => groupRows(db, period, 'line');

/** One row per RAM (`rryyyy`) with its record. */
export const ramRows = (db: Db, period: Period) => groupRows(db, period, 'ram');

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
	parts: {
		legends: boolean;
		rams: boolean;
		matchups: Grouping | false;
		/** Which rounds the matrix counts: all of them unless said. */
		phase?: Phase;
	} = {
		legends: true,
		rams: true,
		matchups: 'line'
	}
): Promise<MetaView> {
	const phase = parts.phase ?? 'all';
	const [lines, rams, legends] = await Promise.all([
		lineRows(db, period),
		parts.rams || parts.matchups === 'ram' ? ramRows(db, period) : Promise.resolve([]),
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

	// The matrix is drawn for the most-played groups only, so those are found first and then used to
	// bound the matches query.
	const top = (parts.matchups === 'ram' ? rams : lines)
		.flatMap((row) => (row.line ? [row] : []))
		.sort(
			(a, b) => b.decks - a.decks || b.wins - a.wins || (a.line ?? '').localeCompare(b.line ?? '')
		)
		.slice(0, MATRIX_SIZE)
		.flatMap((row) => (row.line ? [row.line] : []));

	const [matchups, crossMatchesTotal] = parts.matchups
		? await Promise.all([
				getMatchups(db, period, parts.matchups, top, phase),
				countCrossMatches(db, period, parts.matchups, phase)
			])
		: [[], undefined];
	return buildMeta({
		lines,
		rams,
		legends,
		matchups,
		matrixBy: parts.matchups || 'line',
		crossMatchesTotal
	});
}

/**
 * A round is in `phase`: any, a Swiss round, or the playoff. A Swiss round is named "Round 4" and anything
 * else is the playoff (`isPlayoffRound`, which a regex says and SQLite can't: this is its glob).
 */
const inPhase = (phase: Phase): SQL | undefined => {
	const name = sql`lower(trim(${tournamentRounds.name}))`;
	const swiss = sql`${name} glob 'round [0-9]*' and ${name} not glob 'round *[^0-9 ]*'`;
	return phase === 'swiss' ? swiss : phase === 'cut' ? sql`not (${swiss})` : undefined;
};

/** Every match between two decks of different groups, whichever: the matrix's context. */
async function countCrossMatches(
	db: Db,
	period: Period,
	by: Grouping,
	phase: Phase = 'all'
): Promise<number> {
	const sa = alias(standings, 'sa');
	const sb = alias(standings, 'sb');
	const da = alias(tournamentDecks, 'da');
	const db2 = alias(tournamentDecks, 'db2');
	const m = tournamentMatches;
	const [row] = await db
		.select({ n: count() })
		.from(m)
		.innerJoin(tournaments, eq(tournaments.id, m.tournamentId))
		.leftJoin(
			tournamentRounds,
			and(eq(tournamentRounds.tournamentId, m.tournamentId), eq(tournamentRounds.number, m.round))
		)
		.innerJoin(sa, and(eq(sa.tournamentId, m.tournamentId), eq(sa.playerId, m.playerA)))
		.innerJoin(sb, and(eq(sb.tournamentId, m.tournamentId), eq(sb.playerId, m.playerB)))
		.innerJoin(da, eq(da.guid, sa.deckGuid))
		.innerJoin(db2, eq(db2.guid, sb.deckGuid))
		.where(
			and(
				inPeriod(period),
				inArray(m.kind, ['played', 'draw']),
				isNotNull(groupColumn(by, da)),
				isNotNull(groupColumn(by, db2)),
				ne(groupColumn(by, da), groupColumn(by, db2)),
				inPhase(phase)
			)
		);
	return row?.n ?? 0;
}

/**
 * Matches between two decks of different groups (Legend lines, or RAMs), both among `keys`, grouped by the
 * pair as they were drawn. `score` is the first side's: a win is 1, a draw (or equal games) 0.5, a loss 0.
 * Byes and forfeits, mirrors, and players with no deck are left out.
 */
async function getMatchups(
	db: Db,
	period: Period,
	by: Grouping,
	keys: string[],
	phase: Phase = 'all'
) {
	if (keys.length < 2) return [];
	const sa = alias(standings, 'sa');
	const sb = alias(standings, 'sb');
	const da = alias(tournamentDecks, 'da');
	const db2 = alias(tournamentDecks, 'db2');
	const m = tournamentMatches;

	return db
		.select({
			a: groupColumn(by, da),
			b: groupColumn(by, db2),
			matches: count(),
			score: total(
				sql`case when ${m.kind} = 'draw' or ${m.gamesA} = ${m.gamesB} then 0.5 when ${m.gamesA} > ${m.gamesB} then 1 else 0 end`
			)
		})
		.from(m)
		.innerJoin(tournaments, eq(tournaments.id, m.tournamentId))
		.leftJoin(
			tournamentRounds,
			and(eq(tournamentRounds.tournamentId, m.tournamentId), eq(tournamentRounds.number, m.round))
		)
		.innerJoin(sa, and(eq(sa.tournamentId, m.tournamentId), eq(sa.playerId, m.playerA)))
		.innerJoin(sb, and(eq(sb.tournamentId, m.tournamentId), eq(sb.playerId, m.playerB)))
		.innerJoin(da, eq(da.guid, sa.deckGuid))
		.innerJoin(db2, eq(db2.guid, sb.deckGuid))
		.where(
			and(
				inPeriod(period),
				inArray(m.kind, ['played', 'draw']),
				inArray(groupColumn(by, da), keys),
				inArray(groupColumn(by, db2), keys),
				ne(groupColumn(by, da), groupColumn(by, db2)),
				inPhase(phase)
			)
		)
		.groupBy(groupColumn(by, da), groupColumn(by, db2));
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/** What a Card's stats are narrowed to besides the period: one Legend line, one RAM, both or neither. */
export type DeckScope = { line: string | null; ram: string | null };

const scopeCondition = (scope: DeckScope) =>
	and(
		scope.line === null ? undefined : eq(tournamentDecks.legendLine, scope.line),
		scope.ram === null ? undefined : eq(tournamentDecks.ram, scope.ram)
	);

/** Decks in scope (a period, and optionally a line or a RAM): the denominator of a Card's inclusion. */
async function countDecks(db: Db, period: Period, scope: DeckScope): Promise<number> {
	const [row] = await db
		.select({ n: count() })
		.from(tournamentDecks)
		.innerJoin(tournaments, eq(tournaments.id, tournamentDecks.tournamentId))
		.where(and(inPeriod(period), scopeCondition(scope)));
	return row?.n ?? 0;
}

/**
 * What is played: every Card's main-deck and sideboard usage across the decks in scope, optionally
 * narrowed to one Legend line or one RAM. Legends are left out: they are a Legend, not a "card in the deck".
 */
export async function getCardStats(
	db: Db,
	period: Period,
	scope: DeckScope = { line: null, ram: null }
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
		countDecks(db, period, scope),
		// Two shapes, because each wants a different driving table. Across every deck the rows are found
		// by `(board, tournament_id, card_slug)`, so a window is a range and no deck is joined. For one
		// Legend line the few decks that ran it are found first and their cards read by deck; there the
		// board test is deliberately `<>`, which that index cannot serve, or the planner prefers walking
		// every card row to starting from the line (measured: 4 ms vs 255 ms at 1,000 events).
		scope.line === null && scope.ram === null
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
						and(ne(tournamentDeckCards.board, 'legend'), inPeriod(period), scopeCondition(scope))
					)
					.groupBy(tournamentDeckCards.cardSlug)
	]);
	return { decks, cards: buildCardStats(rows, decks) };
}

/** One Card's usage: every deck that ran it, with its finish, and how it compares with the field. */
export async function getCardUsage(db: Db, period: Period, slug: string): Promise<CardUsage> {
	const [rows, totals, lines, rams] = await Promise.all([
		db
			.select({
				rank: standings.rank,
				line: tournamentDecks.legendLine,
				ram: tournamentDecks.ram,
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
			.groupBy(tournamentDecks.legendLine),
		db
			.select({ line: tournamentDecks.ram, decks: count() })
			.from(tournamentDecks)
			.innerJoin(tournaments, eq(tournaments.id, tournamentDecks.tournamentId))
			.where(and(isNotNull(tournamentDecks.ram), inPeriod(period)))
			.groupBy(tournamentDecks.ram)
	]);

	return buildCardUsage({
		slug,
		rows: rows.map((row) => ({
			rank: row.rank,
			line: row.line,
			ram: row.ram,
			main: row.main,
			side: row.side,
			asLegend: row.legend > 0
		})),
		totals: totals[0] ?? { decks: 0, winners: 0, top8: 0 },
		lines,
		rams
	});
}

// ---------------------------------------------------------------------------
// Mirrors
// ---------------------------------------------------------------------------

/**
 * The decided matches in a period, each with its winner's and loser's deck: the one subquery every mirror
 * question starts from. A drawn match, a bye, a forfeit and a player with no deck are not in it; a match is
 * one row, so a mirror is counted once. Both decks' Legend line and RAM are carried so the caller says what
 * counts as a mirror.
 */
function decidedMatches(db: Db, period: Period) {
	const sa = alias(standings, 'sa');
	const sb = alias(standings, 'sb');
	const da = alias(tournamentDecks, 'da');
	const db2 = alias(tournamentDecks, 'db2');
	const m = tournamentMatches;
	const aWon = sql`${m.gamesA} > ${m.gamesB}`;
	return db
		.select({
			winner: sql<string>`case when ${aWon} then ${sa.deckGuid} else ${sb.deckGuid} end`.as(
				'winner'
			),
			loser: sql<string>`case when ${aWon} then ${sb.deckGuid} else ${sa.deckGuid} end`.as('loser'),
			// Named, or the two decks' `legend_line` (and `ram`) would be one column of the subquery.
			aLine: sql<string | null>`${da.legendLine}`.as('a_line'),
			bLine: sql<string | null>`${db2.legendLine}`.as('b_line'),
			aRam: sql<string | null>`${da.ram}`.as('a_ram'),
			bRam: sql<string | null>`${db2.ram}`.as('b_ram')
		})
		.from(m)
		.innerJoin(tournaments, eq(tournaments.id, m.tournamentId))
		.innerJoin(sa, and(eq(sa.tournamentId, m.tournamentId), eq(sa.playerId, m.playerA)))
		.innerJoin(sb, and(eq(sb.tournamentId, m.tournamentId), eq(sb.playerId, m.playerB)))
		.innerJoin(da, eq(da.guid, sa.deckGuid))
		.innerJoin(db2, eq(db2.guid, sb.deckGuid))
		.where(and(inPeriod(period), inArray(m.kind, ['played', 'draw']), ne(m.gamesA, m.gamesB)))
		.as('decided');
}

/**
 * The matches between two decks of the same Legend line (`line`) and/or the same RAM (`ram`): a mirror.
 * Asking for neither would mean every match between two decks of any kind, which is not a mirror, so a
 * scope with neither matches nothing.
 */
const mirrorOf = (decided: ReturnType<typeof decidedMatches>, scope: DeckScope) =>
	scope.line === null && scope.ram === null
		? sql`0`
		: and(
				scope.line === null
					? undefined
					: and(eq(decided.aLine, scope.line), eq(decided.bLine, scope.line)),
				scope.ram === null
					? undefined
					: and(eq(decided.aRam, scope.ram), eq(decided.bRam, scope.ram))
			);

/**
 * Decided mirror matches per Legend line or RAM, most first: where a mirror breaker has anything to say.
 * Bounded, since the page offers only the few with a sample worth reading.
 */
export async function getMirrorGroups(
	db: Db,
	period: Period,
	by: Grouping,
	limit = 12
): Promise<{ key: string; matches: number }[]> {
	const decided = decidedMatches(db, period);
	// An aliased expression of the subquery is not a column to `select` or `groupBy`; the bare reference is.
	const [a, b] = (by === 'ram' ? [decided.aRam, decided.bRam] : [decided.aLine, decided.bLine]).map(
		(field) => sql<string | null>`${field}`
	);
	const rows = await db
		.select({ key: a, matches: count() })
		.from(decided)
		.where(and(isNotNull(a), eq(a, b)))
		.groupBy(a)
		.orderBy(sql`count(*) desc`, a)
		.limit(limit);
	return rows.flatMap((row) => (row.key ? [{ key: row.key, matches: row.matches }] : []));
}

/**
 * What the mirror breaker counts for one Legend line or RAM: the decided mirrors, and per Card and board in
 * how many the winner's deck ran it, the loser's did, and both did (`docs/spec/tournaments.md` §6).
 */
export async function getMirrorRows(
	db: Db,
	period: Period,
	scope: DeckScope
): Promise<{ matches: number; rows: MirrorRow[] }> {
	const decided = decidedMatches(db, period);
	const mirror = mirrorOf(decided, scope);
	const mine = alias(tournamentDeckCards, 'mine');
	const theirs = alias(tournamentDeckCards, 'theirs');

	/** Per Card, the mirrors this side ran it in, and how many of those the other side did too. */
	const side = (own: SQLWrapper, other: SQLWrapper) =>
		db
			.select({
				slug: mine.cardSlug,
				board: mine.board,
				n: count(),
				both: total(sql`case when ${theirs.cardSlug} is not null then 1 else 0 end`)
			})
			.from(decided)
			.innerJoin(mine, eq(mine.deckGuid, own))
			.leftJoin(
				theirs,
				and(
					eq(theirs.deckGuid, other),
					eq(theirs.cardSlug, mine.cardSlug),
					eq(theirs.board, mine.board)
				)
			)
			.where(and(mirror, inArray(mine.board, ['main', 'side'])))
			.groupBy(mine.cardSlug, mine.board);

	const [[tally], won, lost] = await Promise.all([
		db.select({ n: count() }).from(decided).where(mirror),
		side(decided.winner, decided.loser),
		side(decided.loser, decided.winner)
	]);

	const cards = new Map<string, MirrorRow>();
	const rowOf = (slug: string, board: 'main' | 'side'): MirrorRow => {
		const key = `${board}|${slug}`;
		const found = cards.get(key) ?? { slug, board, winners: 0, losers: 0, both: 0 };
		cards.set(key, found);
		return found;
	};
	// `both` is one count seen from either side; the winners' read of it is the one kept.
	for (const r of won)
		Object.assign(rowOf(r.slug, r.board as 'main' | 'side'), { winners: r.n, both: r.both });
	for (const r of lost) rowOf(r.slug, r.board as 'main' | 'side').losers = r.n;
	return { matches: tally?.n ?? 0, rows: [...cards.values()] };
}

/** The mirror breaker's lists for one Legend line or RAM. */
export async function getMirrors(db: Db, period: Period, scope: DeckScope): Promise<MirrorView> {
	const { matches, rows } = await getMirrorRows(db, period, scope);
	return buildMirrors(rows, matches);
}

// ---------------------------------------------------------------------------
// Trends
// ---------------------------------------------------------------------------

/**
 * Decks and their match results per day (the event's start, UTC) and group, for the trends page. Daily
 * rather than per week so one cached result serves both: `buildTrend` buckets them. Bounded by days times
 * groups, which a period keeps small, and read from the same indexed join as the tier list.
 */
export async function getDailyRows(db: Db, period: Period, by: Grouping): Promise<DayRow[]> {
	const column = groupColumn(by, tournamentDecks);
	const day = sql<string>`strftime('%Y-%m-%d', ${tournaments.startsAt} / 1000, 'unixepoch')`;
	const rows = await db
		.select({
			day,
			key: column,
			decks: count(),
			wins: total(sql`${standings.matchWins}`),
			losses: total(sql`${standings.matchLosses}`),
			draws: total(sql`${standings.matchDraws}`)
		})
		.from(tournamentDecks)
		.innerJoin(standings, eq(standings.deckGuid, tournamentDecks.guid))
		.innerJoin(tournaments, eq(tournaments.id, tournamentDecks.tournamentId))
		.where(and(isNotNull(column), inPeriod(period)))
		.groupBy(day, column);
	return rows.flatMap((row) => (row.key ? [{ ...row, key: row.key }] : []));
}
