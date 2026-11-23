/**
 * The one door to melee.gg — `docs/spec/tournaments.md` §1.3, §4.3.
 *
 * Everything the spec says about *how* we ask lives here and nowhere else: a browser's User-Agent
 * and `X-Requested-With` (swubase's), no cookie unless `MELEE_COOKIE` is set, a gap between requests
 * (500 ms by default), a ceiling on how many a run may make, and a refusal to read a sign-in page as
 * data. Sequential by construction: there is one `await` chain and no `Promise.all`.
 *
 * `fetch`, the clock and the sleep are injected so tests drive it with fixtures and a fake clock.
 */
import * as v from 'valibot';
import { MeleeSignInError } from './html.ts';

export const MELEE_ORIGIN = 'https://melee.gg';

/**
 * swubase's, verbatim (Chrome 139 on Windows). Melee's WAF 403s a User-Agent that doesn't start
 * `Mozilla/5.0`; a Chrome version string goes stale, and what matters is that it is a browser's. An
 * honest `Mozilla/5.0 (compatible; …)` also passed on 2026-11-16, so this is one line to change.
 */
export const USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';

export type ClientOptions = {
	/** Minimum time between the start of one request and the next. */
	delayMs?: number;
	/** The `Cookie` header, from a **logged-out** browser. Unset: none is sent. */
	cookie?: string;
	/** A backstop against a loop; every attempt counts, retries included. */
	maxRequests?: number;
	fetch?: typeof fetch;
	sleep?: (ms: number) => Promise<void>;
	now?: () => number;
	/** Called once per request, before it is sent. */
	onRequest?: (line: string) => void;
};

const RETRIES = 3;

const DATATABLES_COLUMN = (index: number, name: string) =>
	[
		[`columns[${index}][data]`, name],
		[`columns[${index}][name]`, name],
		[`columns[${index}][searchable]`, 'false'],
		[`columns[${index}][orderable]`, 'false'],
		[`columns[${index}][search][value]`, ''],
		[`columns[${index}][search][regex]`, 'false']
	] as const;

/**
 * The form a DataTables endpoint wants — the page's own, which Melee 500s on if it is thinner (as a
 * prior scraper's comments record). `extra` carries `roundId` for standings.
 */
export function dataTablesBody(
	columns: readonly string[],
	start: number,
	length: number,
	extra: Readonly<Record<string, string>> = {}
): URLSearchParams {
	const body = new URLSearchParams({ draw: '1' });
	columns.forEach((name, index) => {
		for (const [key, value] of DATATABLES_COLUMN(index, name)) body.set(key, value);
	});
	body.set('order[0][column]', '0');
	body.set('order[0][dir]', 'asc');
	body.set('start', String(start));
	body.set('length', String(length));
	body.set('search[value]', '');
	body.set('search[regex]', 'false');
	for (const [key, value] of Object.entries(extra)) body.set(key, value);
	return body;
}

/** The request ceiling was reached; nothing past it will be sent, so a caller should stop, not move on. */
export class RequestLimitError extends Error {
	constructor(requests: number, line: string) {
		super(`Stopped after ${requests} requests (--max-requests); ${line} not sent.`);
		this.name = 'RequestLimitError';
	}
}

export class MeleeClient {
	requests = 0;
	readonly #delayMs: number;
	readonly #cookie: string | undefined;
	readonly #max: number;
	readonly #fetch: typeof fetch;
	readonly #sleep: (ms: number) => Promise<void>;
	readonly #now: () => number;
	readonly #onRequest: (line: string) => void;
	#lastAt: number | null = null;

	constructor(options: ClientOptions = {}) {
		this.#delayMs = options.delayMs ?? 500;
		this.#cookie = options.cookie || undefined;
		this.#max = options.maxRequests ?? 600;
		this.#fetch = options.fetch ?? fetch;
		this.#sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
		this.#now = options.now ?? Date.now;
		this.#onRequest = options.onRequest ?? (() => {});
	}

	/**
	 * One gap, kept between every pair of requests whatever they are for, and one count against the
	 * ceiling. Public so a request that is not a `fetch` (a message down the search websocket) obeys both.
	 */
	async pace(line: string): Promise<void> {
		if (this.requests >= this.#max) {
			throw new RequestLimitError(this.requests, line);
		}
		if (this.#lastAt !== null) {
			const wait = this.#delayMs - (this.#now() - this.#lastAt);
			if (wait > 0) await this.#sleep(wait);
		}
		this.#lastAt = this.#now();
		this.requests += 1;
		this.#onRequest(line);
	}

	async #send(
		path: string,
		init: { method: 'GET' | 'POST'; body?: URLSearchParams; cookie?: string }
	) {
		let failure = '';
		for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
			await this.pace(`${init.method} ${path}`);

			const response = await this.#fetch(`${MELEE_ORIGIN}${path}`, {
				method: init.method,
				body: init.body,
				headers: {
					'user-agent': USER_AGENT,
					'x-requested-with': 'XMLHttpRequest',
					...(init.body
						? { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' }
						: {}),
					...(this.#cookie || init.cookie
						? { cookie: [this.#cookie, init.cookie].filter(Boolean).join('; ') }
						: {})
				}
			});

			// fetch follows redirects, so a request bounced to login lands here with a 200.
			if (
				new URL(response.url || `${MELEE_ORIGIN}${path}`).pathname.startsWith('/Account/SignIn')
			) {
				throw new MeleeSignInError(path);
			}
			if (response.status === 429 || response.status >= 500) {
				failure = `HTTP ${response.status}`;
				// Back off, but never below the configured gap.
				await this.#sleep(Math.max(this.#delayMs, 1000) * 2 ** (attempt - 1));
				continue;
			}
			if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
			return response;
		}
		throw new Error(`${path}: gave up after ${RETRIES} attempts (${failure}).`);
	}

	/**
	 * A GET whose response is handed back whole, for what a page says in its headers (a cookie).
	 * `cookie` is added to any `MELEE_COOKIE`.
	 */
	async response(path: string, options: { cookie?: string } = {}): Promise<Response> {
		return this.#send(path, { method: 'GET', cookie: options.cookie });
	}

	async text(path: string): Promise<string> {
		return (await this.#send(path, { method: 'GET' })).text();
	}

	async json<S extends v.GenericSchema>(path: string, schema: S): Promise<v.InferOutput<S>> {
		return this.#parse(path, await this.#send(path, { method: 'GET' }), schema);
	}

	async form<S extends v.GenericSchema>(
		path: string,
		body: URLSearchParams,
		schema: S
	): Promise<v.InferOutput<S>> {
		return this.#parse(path, await this.#send(path, { method: 'POST', body }), schema);
	}

	async #parse<S extends v.GenericSchema>(path: string, response: Response, schema: S) {
		const type = response.headers.get('content-type') ?? '(none)';
		if (!type.includes('json')) {
			throw new Error(`${path}: expected JSON, got content-type ${type}.`);
		}
		return v.parse(schema, await response.json());
	}
}
