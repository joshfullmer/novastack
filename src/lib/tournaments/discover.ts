/**
 * Finding Melee tournament ids to ingest: the same search melee.gg's Find Events page runs.
 *
 * That page talks to an ASP.NET SignalR hub (`searchHub.Search`) over a websocket and is pushed its
 * results, eight tournaments a page, newest first. It needs no login. A request carries the page's
 * anti-forgery token (a form field) with its matching cookie, and answers arrive as `receiveResponse`
 * pushes: `searchStarted`, `tournamentSearchResults` (`Code` 200, or 404 when the pages run out), then
 * `searchCompleted`. Measured 2026-11-21; `docs/research/melee-ingest.md`.
 *
 * This reads and lists. It never ingests, and an id is a candidate, not a promise: whether an event has
 * published decklists is only known when `pnpm melee <id>` fetches it.
 *
 * The protocol is split from the socket: parsing and formatting are pure, `openSearch` takes the socket
 * as an argument, and tests drive it with a fake one. Every page costs one paced request on the
 * `MeleeClient`, as every other request to Melee does.
 */
import * as v from 'valibot';
import { MELEE_ORIGIN, USER_AGENT, type MeleeClient } from './client.ts';

/** The tournaments Melee lists under this name. */
export const GAME = 'CyberpunkTCG';

/** Tournaments Melee shows per page. */
export const PAGE_SIZE = 8;

const TOURNAMENTS = 'tournamentSearchResults';

/** What a search result carries that we use; Melee sends about forty more fields. */
const ResultSchema = v.object({
	ID: v.number(),
	Name: v.string(),
	StartDate: v.string(),
	/** "Registration", "In Progress", "Ended". */
	StatusDescription: v.string(),
	/** Null on some events Melee lists (none registered, or cancelled): read as none. */
	Players: v.nullish(v.number()),
	OrganizationName: v.nullish(v.string())
});
export type Found = {
	id: number;
	name: string;
	/** `YYYY-MM-DD`. */
	date: string;
	status: string;
	players: number;
	organizer: string | null;
};

const PushSchema = v.object({
	RequestId: v.string(),
	Type: v.number(),
	MessageType: v.nullish(v.string()),
	Data: v.nullish(v.unknown())
});
/** `Code` is null on success and 404 when the pages run out (measured 2026-11-21). */
const TournamentsDataSchema = v.object({
	Code: v.nullish(v.number()),
	Json: v.nullish(v.string())
});
const FrameSchema = v.object({
	S: v.optional(v.number()),
	M: v.optional(v.array(v.object({ M: v.string(), A: v.array(v.unknown()) })))
});

export type Page = { found: Found[]; last: boolean };

/** One websocket frame, or null for a frame that says nothing we use (a keep-alive, an echo). */
export type Message =
	| { kind: 'ready' }
	| { kind: 'results'; requestId: string; page: Page }
	| { kind: 'completed'; requestId: string }
	| { kind: 'error'; requestId: string; detail: string };

export function parseFrame(text: string): Message[] {
	const frame = v.parse(FrameSchema, JSON.parse(text));
	const messages: Message[] = frame.S === 1 ? [{ kind: 'ready' }] : [];
	for (const call of frame.M ?? []) {
		if (call.M.toLowerCase() !== 'receiveresponse') continue;
		const push = v.safeParse(PushSchema, call.A[0]);
		if (!push.success) continue;
		const { RequestId: requestId, Type, MessageType, Data } = push.output;
		if (Type === 1) {
			messages.push({ kind: 'error', requestId, detail: JSON.stringify(Data ?? null) });
		} else if (MessageType === 'searchCompleted') {
			messages.push({ kind: 'completed', requestId });
		} else if (MessageType === TOURNAMENTS) {
			messages.push({ kind: 'results', requestId, page: parseResults(Data) });
		}
	}
	return messages;
}

function parseResults(data: unknown): Page {
	const { Code, Json } = v.parse(TournamentsDataSchema, data);
	// The page's own reading of "no more": a 404 and no rows.
	if (Code === 404 || !Json) return { found: [], last: true };
	const parsed = v.safeParse(v.array(ResultSchema), JSON.parse(Json));
	if (!parsed.success) throw new Error(v.summarize(parsed.issues));
	const rows = parsed.output;
	return {
		found: rows.map((row) => ({
			id: row.ID,
			name: row.Name.trim(),
			date: row.StartDate.slice(0, 10),
			status: row.StatusDescription,
			players: row.Players ?? 0,
			organizer: row.OrganizationName?.trim() || null
		})),
		last: rows.length < PAGE_SIZE
	};
}

/** The hub call the page makes: `Search(token, searchId, context, page, game, search, location, filters, timeZone, followed)`. */
export const searchFrame = (token: string, id: string, page: number, search: string, index = 0) =>
	JSON.stringify({
		H: 'searchhub',
		M: 'Search',
		// Context 2 is tournaments; "Past" is the Find Events filter that lists events that have started.
		A: [token, Number(id), 2, page, GAME, search, null, ['Past'], 'UTC', false],
		I: index
	});

/** The page's `__RequestVerificationToken` field. */
export function antiForgeryToken(html: string): string {
	const token = html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/)?.[1];
	if (!token)
		throw new Error('The search page had no anti-forgery token; Melee may have changed it.');
	return token;
}

/** `name=value` of each cookie a response sets, as a `Cookie` header. */
export const cookiesOf = (response: Response): string =>
	response.headers
		.getSetCookie()
		.map((line) => line.split(';')[0])
		.join('; ');

/** What `openSearch` needs of a websocket; `WebSocket` is wrapped to fit, and tests supply their own. */
export type Socket = {
	send(text: string): void;
	close(): void;
	onText(listener: (text: string) => void): void;
	onClose(listener: () => void): void;
};
export type OpenSocket = (url: string, headers: Record<string, string>) => Socket;

/** Node's `WebSocket` (undici), which takes handshake headers as an option the DOM types lack. */
export const nodeSocket: OpenSocket = (url, headers) => {
	const Ctor = WebSocket as unknown as new (url: string, options: { headers: object }) => WebSocket;
	const socket = new Ctor(url, { headers });
	return {
		send: (text) => socket.send(text),
		close: () => socket.close(),
		onText: (listener) => {
			socket.onmessage = (event) => listener(String(event.data));
		},
		onClose: (listener) => {
			socket.onclose = listener;
			socket.onerror = listener;
		}
	};
};

const SIGNALR = 'clientProtocol=2.1&connectionData=' + encodeURIComponent('[{"name":"searchhub"}]');

export type Search = {
	/** The tournaments on one page of results (1-based). */
	page(number: number): Promise<Page>;
	close(): void;
};

/**
 * Opens the search: the page for its token and cookie, a SignalR negotiate and start, a websocket.
 * `timeoutMs` bounds each wait on Melee, so a hub that goes quiet fails instead of hanging.
 */
export async function openSearch(
	client: MeleeClient,
	options: { search: string; open?: OpenSocket; timeoutMs?: number }
): Promise<Search> {
	const open = options.open ?? nodeSocket;
	const timeoutMs = options.timeoutMs ?? 20_000;

	const home = await client.response('/Search');
	const cookie = cookiesOf(home);
	const token = antiForgeryToken(await home.text());

	const negotiated = await client.response(`/signalr/negotiate?${SIGNALR}&_=${Date.now()}`, {
		cookie
	});
	const { ConnectionToken } = v.parse(
		v.object({ ConnectionToken: v.string() }),
		await negotiated.json()
	);
	const connection = `connectionToken=${encodeURIComponent(ConnectionToken)}`;

	const socket = open(
		`${MELEE_ORIGIN.replace('https', 'wss')}/signalr/connect?transport=webSockets&clientProtocol=2.1&${connection}&connectionData=${encodeURIComponent('[{"name":"searchhub"}]')}&tid=3`,
		{ 'user-agent': USER_AGENT, cookie }
	);

	/** Whoever is waiting on the next frame: the handshake, or a page. */
	let waiting: ((message: Message) => void) | null = null;
	let closed = false;
	socket.onText((text) => {
		let messages: Message[];
		try {
			messages = parseFrame(text);
		} catch (error) {
			// A keep-alive or echo we can't read is not one we are waiting for; a results frame we can't read is.
			if (text.includes(TOURNAMENTS)) {
				const detail = error instanceof Error ? error.message : String(error);
				waiting?.({
					kind: 'error',
					requestId: '',
					detail: `could not read the results: ${detail}`
				});
			}
			return;
		}
		for (const message of messages) waiting?.(message);
	});
	socket.onClose(() => {
		closed = true;
		waiting?.({ kind: 'error', requestId: '', detail: 'the connection closed' });
	});

	/** The first message `pick` accepts, or a rejection when Melee errors, closes, or goes quiet. */
	const next = <T>(label: string, pick: (message: Message) => T | undefined) =>
		new Promise<T>((resolve, reject) => {
			if (closed) return reject(new Error(`${label}: the connection is closed.`));
			const timer = setTimeout(() => {
				waiting = null;
				reject(new Error(`${label}: Melee said nothing for ${timeoutMs / 1000}s.`));
			}, timeoutMs);
			waiting = (message) => {
				if (message.kind === 'error') {
					clearTimeout(timer);
					waiting = null;
					return reject(new Error(`${label}: ${message.detail}`));
				}
				const picked = pick(message);
				if (picked === undefined) return;
				clearTimeout(timer);
				waiting = null;
				resolve(picked);
			};
		});

	await next('connecting', (message) => (message.kind === 'ready' ? true : undefined));
	await client.response(
		`/signalr/start?transport=webSockets&${SIGNALR}&${connection}&_=${Date.now()}`,
		{
			cookie
		}
	);

	let sent = 0;
	return {
		async page(number) {
			await client.pace(`SEARCH ${options.search || '(all)'} page ${number}`);
			// The page's own scheme: the time in ms is the search's id, and answers echo it back.
			const id = String(Date.now());
			const results = next(`page ${number}`, (message) =>
				message.kind === 'results' && message.requestId === id ? message.page : undefined
			);
			socket.send(searchFrame(token, id, number, options.search, sent++));
			return results;
		},
		close: () => socket.close()
	};
}

/** What decides whether an event found is worth ingesting. */
export type Filters = {
	/** Ids every database being written already holds, which are not candidates. */
	stored: ReadonlySet<number>;
	/** Ids remembered as not ready (`--pending` retries those), which are not candidates either. */
	waiting: ReadonlySet<number>;
	/** Fewest players an event may have. */
	minPlayers: number;
	/** `YYYY-MM-DD`: events that started earlier are left alone; null for no limit. */
	since: string | null;
};

export type Discovery = {
	/** Ended, big enough, recent enough, and not stored yet, in the order found (newest first). */
	candidates: Found[];
	/** Ended but already stored. */
	known: number;
	/** Not Ended yet: Melee refuses these, and `--pending` tries them later. */
	notEnded: Found[];
	/** Ended, not stored, but already remembered as waiting. */
	waiting: number;
	/** Ended but started before `since`. */
	older: number;
	/** Ended but under the player floor. */
	small: number;
};

export function sift(found: readonly Found[], filters: Filters): Discovery {
	const result: Discovery = {
		candidates: [],
		known: 0,
		notEnded: [],
		waiting: 0,
		older: 0,
		small: 0
	};
	const seen = new Set<number>();
	for (const event of found) {
		if (seen.has(event.id)) continue; // the pages shift as events are added; one id can appear twice
		seen.add(event.id);
		if (event.status !== 'Ended') result.notEnded.push(event);
		else if (filters.stored.has(event.id)) result.known += 1;
		else if (filters.waiting.has(event.id)) result.waiting += 1;
		else if (filters.since !== null && event.date < filters.since) result.older += 1;
		else if (event.players < filters.minPlayers) result.small += 1;
		else result.candidates.push(event);
	}
	return result;
}

/**
 * Whether a page of results is where new events end. Results run newest first, so the first page with
 * nothing to ingest that shows ground already covered (an event we hold, one already waiting in the
 * pending list, or one before `since`) means every later page is older still. A page of in-progress or tiny events is not such a sign: it
 * has no candidates but proves nothing, so the walk goes on past it.
 */
export function settled(page: readonly Found[], filters: Filters): boolean {
	const { candidates, known, waiting, older } = sift(page, filters);
	return candidates.length === 0 && (known > 0 || waiting > 0 || older > 0);
}

/**
 * Walks pages until `pages` are read, Melee has no more, or `onPage` answers `true` (the walk is over).
 * `onPage` runs as each page arrives and may be asynchronous.
 */
export async function walk(
	search: Pick<Search, 'page'>,
	pages: number,
	onPage: (number: number, page: Page) => boolean | void | Promise<boolean | void> = () => {}
): Promise<Found[]> {
	const found: Found[] = [];
	for (let number = 1; number <= pages; number += 1) {
		const page = await search.page(number);
		found.push(...page.found);
		if ((await onPage(number, page)) === true || page.last) break;
	}
	return found;
}

/** One line per event, to read before they are ingested. */
export const eventLines = (candidates: readonly Found[]): string[] =>
	candidates.map(
		(event) =>
			`${String(event.id).padEnd(7)} ${event.date}  ${String(event.players).padStart(3)} players  ${event.name}${event.organizer ? `  (${event.organizer})` : ''}`
	);

/** The command that ingests them. */
export const commandFor = (candidates: readonly Found[]): string =>
	`pnpm melee ${candidates.map((event) => event.id).join(' ')}`;

export const listing = (candidates: readonly Found[]): string[] => [
	...eventLines(candidates),
	'',
	commandFor(candidates)
];
