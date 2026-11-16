/**
 * Shared by the tournament specs: the responses captured from tournament 485070 (a 14-player,
 * 4-round Swiss Constructed event, 2026-11-16), and a fake Melee that serves them.
 */
import { readFileSync } from 'node:fs';
import * as v from 'valibot';
import { parseDecklistPage, parseTournamentView } from './html.ts';
import {
	MeleeDetailsSchema,
	MeleeMatchesPageSchema,
	MeleeStandingsPageSchema,
	type MeleeStanding
} from './sources.ts';

export const ID = 485070;
export const WINNER_DECK = '7d108679-b55c-4994-8880-b5010014112d';

export const read = (name: string) =>
	readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
export const json = (name: string): unknown => JSON.parse(read(name));

export const details = v.parse(MeleeDetailsSchema, json('details.json'));
export const view = parseTournamentView(read('view-rounds.html'), ID);
export const standings: MeleeStanding[] = v.parse(
	MeleeStandingsPageSchema,
	json('standings-final.json')
).data;
export const matches = [1, 2, 3, 4].flatMap(
	(n) => v.parse(MeleeMatchesPageSchema, json(`matches-round-${n}.json`)).data
);
export const deckText = parseDecklistPage(read('decklist-view.html'), WINNER_DECK);

export type Fake = {
	/** Replace a Tournament-details field, e.g. `{ Status: 'In Progress' }`. */
	details?: Record<string, unknown>;
	/** Rewrite the standings JSON before it is served. */
	standings?: (page: { recordsTotal: number; data: unknown[] }) => {
		recordsTotal: number;
		data: unknown[];
	};
	/** Rewrite what `GetPlayerDetails` answers. */
	player?: unknown;
	/** Answer a path with a sign-in redirect instead. */
	signInAt?: string;
	/** Status for a path, e.g. a 503 once. */
	status?: (path: string, attempt: number) => number | undefined;
};

const HTML_HEADERS = { 'content-type': 'text/html; charset=utf-8' };

/**
 * A `fetch` that answers as melee.gg did for 485070. Every decklist page is the winner's (the only
 * one captured), so the thirteen decks all read the same; what the tests look at is the plumbing.
 * `log` receives each `METHOD path` in order.
 */
export function fakeMelee(fake: Fake = {}, log: string[] = []): typeof fetch {
	const attempts = new Map<string, number>();
	return async (input, init) => {
		const url = new URL(String(input));
		const path = `${url.pathname}${url.search}`;
		const method = init?.method ?? 'GET';
		log.push(`${method} ${path}`);

		const attempt = (attempts.get(path) ?? 0) + 1;
		attempts.set(path, attempt);
		const forced = fake.status?.(path, attempt);
		if (forced !== undefined) return new Response('', { status: forced });

		if (fake.signInAt && path.startsWith(fake.signInAt)) {
			const response = new Response('<title>Sign In to Your Account | Melee</title>', {
				headers: HTML_HEADERS
			});
			Object.defineProperty(response, 'url', { value: `${url.origin}/Account/SignIn?ReturnUrl=x` });
			return response;
		}

		const body = init?.body instanceof URLSearchParams ? init.body : new URLSearchParams();

		if (path.startsWith('/Tournament/GetTournamentDetails')) {
			return Response.json({ ...(json('details.json') as object), ...fake.details });
		}
		if (path.startsWith('/Tournament/View/')) {
			return new Response(read('view-rounds.html'), { headers: HTML_HEADERS });
		}
		if (path === '/Standing/GetRoundStandings') {
			const all = (json('standings-final.json') as { data: unknown[] }).data;
			const start = Number(body.get('start'));
			const page = { recordsTotal: all.length, data: all };
			const shaped = fake.standings ? fake.standings(page) : page;
			return Response.json({ recordsTotal: shaped.recordsTotal, data: shaped.data.slice(start) });
		}
		const round = /^\/Match\/GetRoundMatches\/(\d+)$/.exec(path)?.[1];
		if (round) {
			const n = Number(round) - 1727270;
			const page = json(`matches-round-${n}.json`) as { recordsTotal: number; data: unknown[] };
			return Response.json({ ...page, data: page.data.slice(Number(body.get('start'))) });
		}
		if (path.startsWith('/Decklist/View/')) {
			return new Response(read('decklist-view.html'), { headers: HTML_HEADERS });
		}
		if (path.startsWith('/Player/GetPlayerDetails')) {
			return Response.json(fake.player ?? json('player-no-decklist.json'));
		}
		return new Response('not found', { status: 404 });
	};
}

/** A clock that only moves when the code under test sleeps, so a gap can be measured exactly. */
export function fakeClock() {
	let now = 1_000_000;
	const sleeps: number[] = [];
	return {
		now: () => now,
		sleep: async (ms: number) => {
			sleeps.push(ms);
			now += ms;
		},
		sleeps
	};
}
