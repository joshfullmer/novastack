/**
 * The rules `docs/spec/tournaments.md` §1.3 and §4.3 set for talking to Melee, enforced in one place.
 * A fake clock stands in for time, so "500 ms apart" is measured, not slept.
 */
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { MeleeClient, RequestLimitError, USER_AGENT, dataTablesBody } from './client.ts';
import { MeleeSignInError } from './html.ts';
import { fakeClock, fakeMelee } from './testing.ts';

const Details = v.object({ ID: v.number() });

function make(options: ConstructorParameters<typeof MeleeClient>[0] = {}, fake = {}) {
	const clock = fakeClock();
	const seen: string[] = [];
	const client = new MeleeClient({
		fetch: fakeMelee(fake, seen),
		now: clock.now,
		sleep: clock.sleep,
		...options
	});
	return { client, clock, seen };
}

describe('the gap between requests', () => {
	it('keeps the configured gap between every pair, whatever they are for', async () => {
		const stamps: number[] = [];
		const clock = fakeClock();
		const inner = fakeMelee();
		const client = new MeleeClient({
			delayMs: 500,
			now: clock.now,
			sleep: clock.sleep,
			fetch: async (input, init) => {
				stamps.push(clock.now());
				return inner(input, init);
			}
		});
		await client.json('/Tournament/GetTournamentDetails?id=485070', Details);
		await client.text('/Tournament/View/485070');
		await client.json('/Tournament/GetTournamentDetails?id=485070', Details);
		const gaps = stamps.slice(1).map((at, i) => at - stamps[i]);
		expect(gaps).toEqual([500, 500]);
	});

	it('does not sleep before the first request, nor when the gap has already passed', async () => {
		const { client, clock } = make({ delayMs: 500 });
		await client.text('/Tournament/View/485070');
		expect(clock.sleeps).toEqual([]);
	});
});

describe('what it sends', () => {
	function capture(options: ConstructorParameters<typeof MeleeClient>[0] = {}) {
		const heads: Headers[] = [];
		const clock = fakeClock();
		const inner = fakeMelee();
		const client = new MeleeClient({
			now: clock.now,
			sleep: clock.sleep,
			fetch: async (input, init) => {
				heads.push(new Headers(init?.headers));
				return inner(input, init);
			},
			...options
		});
		return { client, heads };
	}

	it("sends swubase's browser User-Agent and X-Requested-With, and no cookie by default", async () => {
		const { client, heads } = capture();
		await client.text('/Tournament/View/485070');
		expect(heads[0].get('user-agent')).toBe(USER_AGENT);
		expect(USER_AGENT.startsWith('Mozilla/5.0')).toBe(true);
		expect(heads[0].get('x-requested-with')).toBe('XMLHttpRequest');
		expect(heads[0].has('cookie')).toBe(false);
	});

	it('sends the cookie only when one is given', async () => {
		const { client, heads } = capture({ cookie: '_ga=abc' });
		await client.text('/Tournament/View/485070');
		expect(heads[0].get('cookie')).toBe('_ga=abc');
	});

	it('posts a form with the form content type', async () => {
		const { client, heads } = capture();
		await client.form(
			'/Standing/GetRoundStandings',
			dataTablesBody(['Rank'], 0, 500),
			v.object({})
		);
		expect(heads[0].get('content-type')).toContain('application/x-www-form-urlencoded');
	});

	it('builds the DataTables form the page sends', () => {
		const body = dataTablesBody(['Rank', 'Player'], 500, 500, { roundId: '9' });
		expect(Object.fromEntries(body)).toMatchObject({
			start: '500',
			length: '500',
			roundId: '9',
			'columns[0][data]': 'Rank',
			'columns[1][name]': 'Player',
			'order[0][column]': '0',
			'search[regex]': 'false'
		});
	});
});

describe('when Melee misbehaves', () => {
	it('retries a 503 and counts the attempt', async () => {
		const { client } = make(
			{},
			{ status: (_path: string, attempt: number) => (attempt === 1 ? 503 : undefined) }
		);
		await client.text('/Tournament/View/485070');
		expect(client.requests).toBe(2);
	});

	it('gives up after three attempts', async () => {
		const { client } = make({}, { status: () => 429 });
		await expect(client.text('/Tournament/View/485070')).rejects.toThrow(
			/gave up after 3 attempts/
		);
		expect(client.requests).toBe(3);
	});

	it('does not retry a 404: that is an answer', async () => {
		const { client } = make({}, { status: () => 404 });
		await expect(client.text('/Tournament/View/1')).rejects.toThrow(/HTTP 404/);
		expect(client.requests).toBe(1);
	});

	it('stops at the request ceiling rather than looping', async () => {
		const { client } = make({ maxRequests: 2 });
		await client.text('/Tournament/View/485070');
		await client.text('/Tournament/View/485070');
		await expect(client.text('/Tournament/View/485070')).rejects.toThrow(
			/Stopped after 2 requests/
		);
		await expect(client.text('/Tournament/View/485070')).rejects.toThrow(RequestLimitError);
	});

	it('names the sign-in page when a request is bounced to it', async () => {
		const { client } = make({}, { signInAt: '/Tournament/View' });
		await expect(client.text('/Tournament/View/485070')).rejects.toThrow(MeleeSignInError);
	});

	it('refuses an HTML page where JSON was expected', async () => {
		const { client } = make();
		await expect(client.json('/Tournament/View/485070', Details)).rejects.toThrow(/expected JSON/);
	});
});
