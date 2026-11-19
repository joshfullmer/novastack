/**
 * The scale audit: how each page's queries behave as the corpus grows from a year to several years of
 * events. Opt-in, because it builds corpora of up to ~1,000 events:
 *
 *     TOURNAMENT_SCALE=100,300,1000 pnpm exec vitest run src/lib/server/db/scale.spec.ts
 *
 * It measures what a plain SQLite can: wall time (is it linear in the corpus?), the size of what a query
 * returns (what a page would have to render and ship), and the plan SQLite chose (a SCAN reads a whole
 * table or index; a SEARCH walks an index to the rows it wants). What it can't measure is D1's billing:
 * `rows_read` comes from the real thing. A scan here is where that number grows with the corpus.
 */
import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_TIME, type Period, ANY_EVENTS } from '#lib/tournaments/period.js';
import type { DeckFilters } from '#lib/tournaments/deck-views.js';
import { createTestDb } from './test-db.js';
import { seedCorpus } from './test-corpus.js';
import { getDeckList, getDecksByLine } from './tournament-decks.js';
import { getCardStats, getCardUsage, getLines, getMeta } from './tournament-stats.js';
import { getEventList, getEventView } from './tournaments.js';

const sizes = (process.env.TOURNAMENT_SCALE ?? '')
	.split(',')
	.map(Number)
	.filter((n) => n > 0);

/** Print the report; vitest hides a passing test's console, so `TOURNAMENT_SCALE_OUT=<file>` saves it too. */
function emit(text: string) {
	console.log(text);
	if (process.env.TOURNAMENT_SCALE_OUT)
		appendFileSync(process.env.TOURNAMENT_SCALE_OUT, `${text}\n`);
}

const base: DeckFilters = {
	legend: null,
	ram: null,
	cards: [],
	player: null,
	sort: 'finish',
	page: 1
};

type Capture = { sql: string; params: unknown[] };

/** The tables and indexes a statement scans in full, from SQLite's own plan. */
function scans(sqlite: ReturnType<typeof createTestDb>['sqlite'], captured: Capture[]): string[] {
	const found = new Set<string>();
	for (const { sql, params } of captured) {
		const bound = params.map((v) => (typeof v === 'boolean' ? Number(v) : v));
		for (const row of sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...(bound as never[]))) {
			const detail = String(row.detail);
			if (detail.startsWith('SCAN')) found.add(detail.replace(/^SCAN /, '').replace(/\s+/g, ' '));
		}
	}
	return [...found];
}

describe.skipIf(sizes.length === 0)('scale audit', () => {
	it('measures every page at each corpus size', async () => {
		const report = new Map<string, { ms: number[]; bytes: number[]; scans: string[] }>();
		const header: string[] = [];

		for (const events of sizes) {
			const captured: Capture[] = [];
			const { db, sqlite } = createTestDb({
				onQuery: (sql, params) => captured.push({ sql, params })
			});

			const t0 = performance.now();
			seedCorpus(sqlite, { events });
			const seedSeconds = ((performance.now() - t0) / 1000).toFixed(1);
			const count = (table: string) =>
				Number(sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n);
			const rows = {
				events: count('tournaments'),
				players: count('players'),
				decks: count('tournament_decks'),
				deckCards: count('tournament_deck_cards'),
				standings: count('standings'),
				matches: count('tournament_matches'),
				legendLines: Number(
					sqlite.prepare('SELECT count(DISTINCT legend_line) AS n FROM tournament_decks').get()?.n
				),
				linesWithOneDeck: Number(
					sqlite
						.prepare(
							'SELECT count(*) AS n FROM (SELECT legend_line FROM tournament_decks GROUP BY legend_line HAVING count(*) = 1)'
						)
						.get()?.n
				)
			};
			const pragma = (name: string) =>
				Number(Object.values(sqlite.prepare(`PRAGMA ${name}`).get() ?? {})[0]);
			const megabytes = ((pragma('page_count') * pragma('page_size')) / 1_048_576).toFixed(0);
			header.push(
				`${events} events: ${JSON.stringify(rows)} (seeded in ${seedSeconds}s; database ${megabytes} MB, with deck text stored as 1 byte, not ~700)`
			);

			const end = Number(sqlite.prepare('SELECT max(starts_at) AS m FROM tournaments').get()?.m);
			const last30: Period = {
				id: 1,
				name: 'last 30 days',
				from: end - 30 * 86_400_000,
				to: null,
				param: null,
				...ANY_EVENTS
			};
			const [topLine] = await getLines(db, ALL_TIME);
			const mid = Math.ceil(events / 2);

			const cases: [string, () => Promise<unknown>][] = [
				['event list, page 1', () => getEventList(db, { page: 1 })],
				['event list, last page', () => getEventList(db, { page: 9999 })],
				['event list, one kind', () => getEventList(db, { kinds: ['Showdown'] })],
				['event list, one year', () => getEventList(db, { year: 2024 })],
				['event list, name search', () => getEventList(db, { q: 'showdown' })],
				['one event page', () => getEventView(db, mid)],
				[
					'meta tier list, all time',
					() => getMeta(db, ALL_TIME, { legends: true, rams: true, matchups: false })
				],
				[
					'meta matchup matrix, all time',
					() => getMeta(db, ALL_TIME, { legends: false, rams: false, matchups: 'line' })
				],
				[
					'meta tier list, last 30 days',
					() => getMeta(db, last30, { legends: true, rams: true, matchups: false })
				],
				["what's played, all decks, all time", () => getCardStats(db, ALL_TIME)],
				[
					"what's played, one line, all time",
					() => getCardStats(db, ALL_TIME, { line: topLine.key, ram: null })
				],
				["what's played, all decks, last 30 days", () => getCardStats(db, last30)],
				['card page, staple card (all time)', () => getCardUsage(db, ALL_TIME, 'card-0')],
				['card page, rare card (all time)', () => getCardUsage(db, ALL_TIME, 'card-140')],
				['deck list, best finish, page 1', () => getDeckList(db, ALL_TIME, base)],
				[
					'deck list, most recent, page 1',
					() => getDeckList(db, ALL_TIME, { ...base, sort: 'recent' })
				],
				['deck list, deep page (100)', () => getDeckList(db, ALL_TIME, { ...base, page: 100 })],
				['deck list, by Legend', () => getDeckList(db, ALL_TIME, { ...base, legend: 'legend-0' })],
				[
					'deck list, by card (staple)',
					() => getDeckList(db, ALL_TIME, { ...base, cards: ['card-0'] })
				],
				[
					'deck list, by player name',
					() => getDeckList(db, ALL_TIME, { ...base, player: 'Player 12' })
				],
				['decks by Legend line (shelves)', () => getDecksByLine(db, ALL_TIME)]
			];

			for (const [name, run] of cases) {
				await run(); // warm up
				let best = Infinity;
				let result: unknown;
				for (let i = 0; i < 3; i += 1) {
					captured.length = 0;
					const t = performance.now();
					result = await run();
					best = Math.min(best, performance.now() - t);
				}
				const entry = report.get(name) ?? { ms: [], bytes: [], scans: [] };
				entry.ms.push(best);
				entry.bytes.push(JSON.stringify(result).length);
				entry.scans = scans(sqlite, captured); // keep the largest corpus's plan
				report.set(name, entry);
			}
		}

		const kb = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(0)} KB`);
		const lines = [
			'',
			...header,
			'',
			`| query | ${sizes.map((s) => `${s} ev ms`).join(' | ')} | growth | returns at ${sizes.at(-1)} | scans (largest corpus) |`,
			`| --- | ${sizes.map(() => '---:').join(' | ')} | ---: | ---: | --- |`
		];
		for (const [name, r] of report) {
			const growth = r.ms[0] > 0.05 ? `${((r.ms.at(-1) ?? 0) / r.ms[0]).toFixed(1)}×` : '—';
			lines.push(
				`| ${name} | ${r.ms.map((m) => m.toFixed(1)).join(' | ')} | ${growth} | ${kb(r.bytes.at(-1) ?? 0)} | ${r.scans.join('; ') || '(none)'} |`
			);
		}
		emit(lines.join('\n'));
		expect(report.size).toBeGreaterThan(0);
	}, 600_000);

	/**
	 * Candidate fixes, tried on the largest corpus with raw SQL (no migration): is a slow query slow
	 * because of how it is written, or because of the schema? Each prints the cost today and with the fix.
	 */
	it('tries the candidate fixes', async () => {
		const events = sizes.at(-1) ?? 0;
		const { db, sqlite } = createTestDb();
		seedCorpus(sqlite, { events });
		const end = Number(sqlite.prepare('SELECT max(starts_at) AS m FROM tournaments').get()?.m);
		const since = end - 30 * 86_400_000;

		const time = (label: string, sql: string, ...params: number[]) => {
			sqlite.prepare(sql).all(...params); // warm
			let best = Infinity;
			let rows = 0;
			for (let i = 0; i < 5; i += 1) {
				const t = performance.now();
				rows = sqlite.prepare(sql).all(...params).length;
				best = Math.min(best, performance.now() - t);
			}
			return `| ${label} | ${best.toFixed(1)} | ${rows} |`;
		};
		const out: string[] = [
			'',
			`candidate fixes at ${events} events`,
			'| query | ms | rows |',
			'| --- | ---: | ---: |'
		];

		// --- Legend records: today they go through tournament_deck_cards (every row of every deck) ---
		const today = (where: string) => `SELECT c.card_slug, count(*) AS decks, sum(s.match_wins) AS w
			FROM tournament_deck_cards c
			JOIN tournament_decks d ON d.guid = c.deck_guid
			JOIN standings s ON s.deck_guid = d.guid
			JOIN tournaments t ON t.id = d.tournament_id
			WHERE c.board = 'legend' ${where} GROUP BY c.card_slug`;
		out.push(time('legends today, all time', today('')));
		out.push(time('legends today, last 30 days', today('AND t.starts_at >= ?'), since));

		// fix: the three Legends as their own small table (3 rows a deck, not ~32)
		sqlite.exec(`CREATE TABLE deck_legend AS SELECT deck_guid, card_slug AS legend, 0 AS tournament_id FROM tournament_deck_cards WHERE board = 'legend';
			UPDATE deck_legend SET tournament_id = (SELECT tournament_id FROM tournament_decks WHERE guid = deck_legend.deck_guid);
			CREATE INDEX deck_legend_t ON deck_legend (tournament_id, legend); CREATE INDEX deck_legend_d ON deck_legend (deck_guid);`);
		const fixed = (where: string) => `SELECT l.legend, count(*) AS decks, sum(s.match_wins) AS w
			FROM deck_legend l JOIN standings s ON s.deck_guid = l.deck_guid JOIN tournaments t ON t.id = l.tournament_id
			WHERE 1=1 ${where} GROUP BY l.legend`;
		out.push(time('legends from a 3-rows-a-deck table, all time', fixed('')));
		out.push(
			time('legends from a 3-rows-a-deck table, last 30 days', fixed('AND t.starts_at >= ?'), since)
		);

		// --- Card statistics: today a window still walks the whole card index ---
		const cards = (
			join: string,
			where: string
		) => `SELECT c.card_slug, count(*) AS decks, sum(c.quantity) AS copies
			FROM tournament_deck_cards c ${join} WHERE c.board <> 'legend' ${where} GROUP BY c.card_slug`;
		const todayJoin =
			'JOIN tournament_decks d ON d.guid = c.deck_guid JOIN tournaments t ON t.id = d.tournament_id';
		out.push(time('card stats today, all time', cards(todayJoin, '')));
		out.push(
			time('card stats today, last 30 days', cards(todayJoin, 'AND t.starts_at >= ?'), since)
		);

		// shipped (the tournament migration): tournament_id on each card row, indexed (board, tournament_id, card_slug).
		const windowIds = `c.tournament_id IN (SELECT id FROM tournaments WHERE starts_at >= ?)`;
		out.push(
			time(
				'card stats with tournament_id on the row, last 30 days (the shipped shape)',
				cards('', `AND ${windowIds}`),
				since
			)
		);

		const legendsViaIndex = (
			where: string
		) => `SELECT c.card_slug, count(*) AS decks, sum(s.match_wins) AS w
			FROM tournament_deck_cards c JOIN standings s ON s.deck_guid = c.deck_guid
			WHERE c.board = 'legend' ${where} GROUP BY c.card_slug`;
		out.push(
			time(
				'legends via the shipped (board, tournament_id, card) index, all time',
				legendsViaIndex('')
			)
		);
		out.push(
			time(
				'legends via the shipped (board, tournament_id, card) index, last 30 days',
				legendsViaIndex(`AND ${windowIds}`),
				since
			)
		);
		const cardsViaIndex = (
			where: string
		) => `SELECT c.card_slug, count(*) AS decks, sum(c.quantity) AS copies
			FROM tournament_deck_cards c WHERE c.board IN ('main', 'side') ${where} GROUP BY c.card_slug`;
		out.push(time('card stats via the shipped index, all time', cardsViaIndex('')));
		out.push(
			time(
				'card stats via the shipped index, last 30 days',
				cardsViaIndex(`AND ${windowIds}`),
				since
			)
		);

		// fix: precompute, the way swubase does: one row a card per window, refreshed when an event is ingested
		sqlite.exec(
			`CREATE TABLE card_summary AS SELECT card_slug, count(*) AS decks, sum(quantity) AS copies FROM tournament_deck_cards WHERE board <> 'legend' GROUP BY card_slug;`
		);
		out.push(time('card stats from a precomputed summary, all time', 'SELECT * FROM card_summary'));

		// --- the card page's unbounded list ---
		const entries = (
			limit: string
		) => `SELECT d.guid, s.rank, p.display_name, t.name FROM tournament_deck_cards c
			JOIN tournament_decks d ON d.guid = c.deck_guid JOIN standings s ON s.deck_guid = d.guid
			JOIN players p ON p.id = s.player_id JOIN tournaments t ON t.id = d.tournament_id
			WHERE c.card_slug = 'card-0' ORDER BY s.rank, t.starts_at DESC ${limit}`;
		out.push(time('card page entries, staple card, every deck', entries('')));
		out.push(time('card page entries, staple card, first 50', entries('LIMIT 50')));

		// --- the event list ---
		out.push(
			time(
				'event list, every event',
				`SELECT id, name, starts_at FROM tournaments ORDER BY starts_at DESC`
			)
		);
		out.push(
			time(
				'event list, one page of 30',
				`SELECT id, name, starts_at FROM tournaments ORDER BY starts_at DESC LIMIT 30`
			)
		);

		void db;
		emit(out.join('\n'));
		expect(out.length).toBeGreaterThan(4);
	}, 600_000);
});
