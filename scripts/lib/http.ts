/**
 * The network layer for ingest.
 *
 * The source API is undocumented and has no published rate limit, so this is deliberately
 * conservative: bounded concurrency, retry with exponential backoff, and — the one that
 * actually bites — a **content-type check**. An HTML error page served in place of JSON is a
 * realistic response, and `res.json()` on one throws a syntax error that reads like a bug in
 * our parser rather than a bad response. Treated as retryable, because it usually is.
 */
import * as v from 'valibot';

export type RetryOptions = {
	attempts?: number;
	baseDelayMs?: number;
	/** Called before each retry, so a long ingest can say what it is waiting on. */
	onRetry?: (info: { url: string; attempt: number; delayMs: number; reason: string }) => void;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class RetryableError extends Error {}

/** 429 and 5xx are worth retrying; a 404 is an answer. */
function assertRetryableStatus(response: Response, url: string): void {
	if (response.ok) return;
	const message = `${url}: HTTP ${response.status} ${response.statusText}`;
	if (response.status === 429 || response.status >= 500) throw new RetryableError(message);
	throw new Error(message);
}

async function withRetry<T>(
	url: string,
	options: RetryOptions,
	attempt_: (attempt: number) => Promise<T>
): Promise<T> {
	const attempts = options.attempts ?? 4;
	const baseDelayMs = options.baseDelayMs ?? 500;

	let lastError: unknown;
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			return await attempt_(attempt);
		} catch (error) {
			lastError = error;
			const retryable = error instanceof RetryableError || error instanceof TypeError;
			if (!retryable || attempt === attempts) throw error;

			// Exponential backoff with jitter, so a burst of failures does not resynchronise.
			const delayMs = baseDelayMs * 2 ** (attempt - 1) + Math.random() * baseDelayMs;
			options.onRetry?.({
				url,
				attempt,
				delayMs: Math.round(delayMs),
				reason: error instanceof Error ? error.message : String(error)
			});
			await sleep(delayMs);
		}
	}

	throw lastError;
}

export async function fetchJson<TSchema extends v.GenericSchema>(
	url: string,
	schema: TSchema,
	options: RetryOptions = {}
): Promise<v.InferOutput<TSchema>> {
	return withRetry(url, options, async () => {
		const response = await fetch(url, { headers: { accept: 'application/json' } });
		assertRetryableStatus(response, url);

		const contentType = response.headers.get('content-type') ?? '(none)';
		if (!contentType.includes('json')) {
			throw new RetryableError(`${url}: expected JSON, got content-type ${contentType}`);
		}

		return v.parse(schema, await response.json());
	});
}

export async function fetchBinary(url: string, options: RetryOptions = {}): Promise<Buffer> {
	return withRetry(url, options, async () => {
		const response = await fetch(url);
		assertRetryableStatus(response, url);
		return Buffer.from(await response.arrayBuffer());
	});
}

/** Runs `worker` over `items` at bounded concurrency, preserving input order in the result. */
export async function pool<T, R>(
	items: readonly T[],
	concurrency: number,
	worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;

	const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
		while (next < items.length) {
			const index = next;
			next += 1;
			results[index] = await worker(items[index], index);
		}
	});

	await Promise.all(runners);
	return results;
}
