/**
 * Finding ids through Melee's Find Events search: the frames it pushes, the candidates they make,
 * and the handshake, driven by a fake socket and a fake `fetch`. Rows are shaped as the live hub sent
 * them on 2026-11-21 (about forty fields; only the ones we read are kept here).
 */
import { describe, expect, it } from 'vitest';
import { MeleeClient, RequestLimitError } from './client.ts';
import {
	antiForgeryToken,
	listing,
	openSearch,
	reconnecting,
	PAGE_SIZE,
	parseFrame,
	searchFrame,
	settled,
	sift,
	walk,
	type Found,
	type Socket
} from './discover.ts';
import { fakeClock } from './testing.ts';

const row = (id: number, status = 'Ended', players = 12, extra: object = {}) => ({
	ID: id,
	Name: ` Night City Brawl ${id} `,
	StartDate: '2026-11-21T00:00:00',
	StatusDescription: status,
	Players: players,
	OrganizationName: 'Mox Games',
	...extra
});

const push = (requestId: string, messageType: string, data: unknown = null, type = 2) =>
	JSON.stringify({
		C: 'x',
		M: [
			{
				H: 'searchHub',
				M: 'receiveResponse',
				A: [{ RequestId: requestId, Type: type, MessageType: messageType, Data: data }]
			}
		]
	});
const results = (requestId: string, rows: unknown[], code: number | null = null) =>
	push(requestId, 'tournamentSearchResults', { Code: code, Json: JSON.stringify(rows) });

describe('what the hub pushes', () => {
	it('reads a page of tournaments, trimming names and dates', () => {
		const [message] = parseFrame(results('7', [row(511455, 'In Progress', 4)]));
		expect(message).toEqual({
			kind: 'results',
			requestId: '7',
			page: {
				found: [
					{
						id: 511455,
						name: 'Night City Brawl 511455',
						date: '2026-11-21',
						status: 'In Progress',
						players: 4,
						organizer: 'Mox Games'
					}
				],
				last: true
			}
		});
	});

	it('reads an event with no player count as having none', () => {
		const [message] = parseFrame(results('7', [row(1, 'Registration', 0, { Players: null })]));
		expect(message).toMatchObject({ page: { found: [{ id: 1, players: 0 }] } });
	});

	it('knows a full page is not the last, and a 404 is', () => {
		const full = Array.from({ length: PAGE_SIZE }, (_, i) => row(i + 1));
		expect(parseFrame(results('1', full))[0]).toMatchObject({ page: { last: false } });
		expect(parseFrame(push('1', 'tournamentSearchResults', { Code: 404 }))[0]).toMatchObject({
			page: { found: [], last: true }
		});
	});

	it('reads the handshake, completion and errors, and ignores the rest', () => {
		expect(parseFrame('{"S":1,"M":[]}')).toEqual([{ kind: 'ready' }]);
		expect(parseFrame(push('7', 'searchCompleted'))).toEqual([
			{ kind: 'completed', requestId: '7' }
		]);
		expect(parseFrame(push('7', 'searchStarted'))).toEqual([]);
		expect(parseFrame('{}')).toEqual([]);
		expect(parseFrame(push('7', 'x', 'boom', 1))[0]).toMatchObject({ kind: 'error' });
	});
});

describe('the request it sends', () => {
	it('is the hub call the page makes, for tournaments of this game, past events', () => {
		expect(JSON.parse(searchFrame('tok', '99', 2, 'showdown', 3))).toEqual({
			H: 'searchhub',
			M: 'Search',
			A: ['tok', 99, 2, 2, 'CyberpunkTCG', 'showdown', null, ['Past'], 'UTC', false],
			I: 3
		});
	});

	it('finds the anti-forgery token in the page', () => {
		expect(
			antiForgeryToken('<input name="__RequestVerificationToken" type="hidden" value="abc-_9" />')
		).toBe('abc-_9');
		expect(() => antiForgeryToken('<html></html>')).toThrow(/anti-forgery/);
	});
});

const event = (id: number, status = 'Ended', players = 12): Found => ({
	id,
	name: `Event ${id}`,
	date: '2026-11-21',
	status,
	players,
	organizer: null
});

const none = {
	stored: new Set<number>(),
	waiting: new Set<number>(),
	skipped: new Set<number>(),
	minPlayers: 0,
	since: null
};

describe('which events are candidates', () => {
	it('keeps ended, new, big-enough events, in the order found', () => {
		const found = [
			event(5),
			event(4, 'In Progress'),
			event(3, 'Ended', 3),
			event(2),
			event(1, 'Registration')
		];
		expect(sift(found, { ...none, stored: new Set([2]), minPlayers: 8 })).toEqual({
			candidates: [event(5)],
			known: 1,
			notEnded: [event(4, 'In Progress'), event(1, 'Registration')],
			waiting: 0,
			skipped: 0,
			older: 0,
			small: 1
		});
	});

	it('leaves alone what is waiting to be ready, and what started before --since', () => {
		const old = { ...event(2), date: '2026-10-01' };
		expect(
			sift([event(3), old, event(1)], { ...none, waiting: new Set([3]), since: '2026-11-01' })
		).toMatchObject({
			candidates: [event(1)],
			waiting: 1,
			older: 1
		});
	});

	it('counts an id once when the pages shift and it shows up twice', () => {
		expect(sift([event(1), event(1)], none).candidates).toHaveLength(1);
	});

	it('ends the listing with the command to run', () => {
		const lines = listing([event(7), event(6)]);
		expect(lines.at(-1)).toBe('pnpm melee 7 6');
		expect(lines[0]).toContain('Event 7');
	});
});

describe('where new events end', () => {
	const held = { ...none, stored: new Set([3]) };

	it('is not on a page with something to ingest, even beside an event already held', () => {
		expect(settled([event(4), event(3)], held)).toBe(false);
	});

	it('is the first page with nothing new that shows an event already held', () => {
		expect(settled([event(3), event(2, 'Ended', 1)], { ...held, minPlayers: 5 })).toBe(true);
	});

	it('is a page that reaches an event already waiting in the pending list', () => {
		expect(settled([event(5), event(4)], { ...none, waiting: new Set([4, 5]) })).toBe(true);
		expect(settled([event(6), event(5)], { ...none, waiting: new Set([5]) })).toBe(false);
	});

	it('is a page that reaches an event skipped for good', () => {
		expect(settled([event(5), event(4)], { ...none, skipped: new Set([4, 5]) })).toBe(true);
		expect(sift([event(5)], { ...none, skipped: new Set([5]) })).toMatchObject({
			skipped: 1,
			candidates: []
		});
	});

	it('is not a page of events in progress or too small, which proves nothing', () => {
		expect(
			settled([event(9, 'In Progress'), event(8, 'Ended', 1)], { ...none, minPlayers: 5 })
		).toBe(false);
	});

	it('is a page that reaches events from before --since', () => {
		const old = { ...event(1), date: '2026-10-01' };
		expect(settled([old], { ...none, since: '2026-11-01' })).toBe(true);
	});
});

describe('walking pages', () => {
	const pages = (count: number) => ({
		async page(number: number) {
			return { found: [event(number)], last: number >= count };
		}
	});

	it('stops at the page limit, or when Melee runs out', async () => {
		expect((await walk(pages(99), 3)).map((e) => e.id)).toEqual([1, 2, 3]);
		expect((await walk(pages(2), 10)).map((e) => e.id)).toEqual([1, 2]);
	});

	it('stops when told the walk is over, keeping the page it stopped on', async () => {
		const seen: number[] = [];
		const found = await walk(pages(99), 10, async (number) => {
			seen.push(number);
			return number === 4;
		});
		expect(seen).toEqual([1, 2, 3, 4]);
		expect(found.map((e) => e.id)).toEqual([1, 2, 3, 4]);
	});
});

describe('a search that reopens itself', () => {
	/** Each opened search fails its first `failures[n]` page requests with a stall. */
	function flaky(failures: number[]) {
		let opened = 0;
		const closed: number[] = [];
		const open = async () => {
			const mine = opened++;
			let left = failures[mine] ?? 0;
			return {
				async page(number: number) {
					if (left-- > 0) throw new Error(`page ${number}: Melee said nothing for 20s.`);
					return { found: [event(number)], last: false };
				},
				close: () => closed.push(mine)
			};
		};
		return { open, opened: () => opened, closed };
	}

	it('asks again on a fresh connection when a page stalls, and carries on', async () => {
		const world = flaky([1]);
		const search = await reconnecting(world.open);
		expect((await search.page(5)).found[0].id).toBe(5);
		expect(world.opened()).toBe(2);
		expect(world.closed).toEqual([0]);
	});

	it('gives up after its attempts, with the last stall', async () => {
		const world = flaky([9, 9, 9]);
		const search = await reconnecting(world.open, 3);
		await expect(search.page(7)).rejects.toThrow(/said nothing/);
		expect(world.opened()).toBe(3);
	});

	it('does not retry the request ceiling', async () => {
		const search = await reconnecting(async () => ({
			async page() {
				throw new RequestLimitError(600, 'SEARCH page 2');
			},
			close: () => {}
		}));
		await expect(search.page(2)).rejects.toThrow(RequestLimitError);
	});
});

describe('the connection', () => {
	/** A fake melee.gg: the search page, the SignalR handshake, and a socket that answers searches. */
	function world(options: { silent?: boolean } = {}) {
		const log: string[] = [];
		const sent: string[] = [];
		let deliver: (text: string) => void = () => {};
		const socket: Socket = {
			send: (text) => {
				sent.push(text);
				if (options.silent) return;
				const { A } = JSON.parse(text);
				const id = String(A[1]);
				queueMicrotask(() => {
					deliver(push(id, 'searchStarted'));
					deliver(results(id, [row(A[3] * 10)]));
					deliver(push(id, 'searchCompleted'));
				});
			},
			close: () => log.push('closed'),
			onText: (listener) => {
				deliver = listener;
				queueMicrotask(() => deliver('{"S":1}'));
			},
			onClose: () => {}
		};
		const clock = fakeClock();
		const client = new MeleeClient({
			now: clock.now,
			sleep: clock.sleep,
			fetch: async (input, init) => {
				const url = new URL(String(input));
				log.push(`${init?.method ?? 'GET'} ${url.pathname}`);
				const headers = new Headers(init?.headers);
				if (url.pathname === '/Search') {
					return new Response('<input name="__RequestVerificationToken" value="TOKEN" />', {
						headers: { 'set-cookie': '__RequestVerificationToken=COOKIE; path=/; HttpOnly' }
					});
				}
				log.push(`  cookie ${headers.get('cookie')}`);
				if (url.pathname === '/signalr/negotiate')
					return Response.json({ ConnectionToken: 'a b+c' });
				return new Response('{}');
			}
		});
		return {
			client,
			log,
			sent,
			open: (_url: string, headers: Record<string, string>) => {
				log.push(`socket cookie ${headers.cookie}`);
				return socket;
			}
		};
	}

	it('takes the page for a token, negotiates, opens the socket, then searches page by page', async () => {
		const { client, log, sent, open } = world();
		const search = await openSearch(client, { search: 'showdown', open });
		expect((await search.page(1)).found.map((e) => e.id)).toEqual([10]);
		expect((await search.page(2)).found.map((e) => e.id)).toEqual([20]);
		search.close();

		expect(log.filter((line) => !line.startsWith(' '))).toEqual([
			'GET /Search',
			'GET /signalr/negotiate',
			'socket cookie __RequestVerificationToken=COOKIE',
			'GET /signalr/start',
			'closed'
		]);
		// The anti-forgery cookie goes back with the handshake, and the token goes in the search itself.
		expect(log).toContain('  cookie __RequestVerificationToken=COOKIE');
		expect(
			sent.map((text) =>
				JSON.parse(text).A.slice(0, 1).concat(JSON.parse(text).A[3], JSON.parse(text).A[5])
			)
		).toEqual([
			['TOKEN', 1, 'showdown'],
			['TOKEN', 2, 'showdown']
		]);
		// Each search is a paced request, like any other to Melee: 3 GETs + 2 pages.
		expect(client.requests).toBe(5);
	});

	it('fails rather than hangs when Melee goes quiet', async () => {
		const { client, open } = world({ silent: true });
		const search = await openSearch(client, { search: '', open, timeoutMs: 20 });
		await expect(search.page(1)).rejects.toThrow(/said nothing/);
	});
});
