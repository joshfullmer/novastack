/**
 * Links inside the tournament pages. Every one carries the period, because a link that dropped it would
 * quietly change what the next page counts.
 */
export type Param = string | number | null | undefined;

/** `path?a=1&b=2`, leaving out anything null, undefined or empty. */
export function href(path: string, params: Readonly<Record<string, Param>> = {}): string {
	const query = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value !== null && value !== undefined && value !== '') query.set(key, String(value));
	}
	const text = query.toString();
	return text ? `${path}?${text}` : path;
}

/**
 * The current location with some params changed and others dropped: how a selector swaps one choice
 * (the period) without disturbing the rest of the query (a filter, a sort). `null`, `undefined` and
 * empty values remove a param.
 */
export function withParams(
	location: { pathname: string; search: string },
	patch: Readonly<Record<string, Param>>,
	drop: readonly string[] = []
): string {
	const query = new URLSearchParams(location.search);
	for (const key of drop) query.delete(key);
	for (const [key, value] of Object.entries(patch)) {
		if (value === null || value === undefined || value === '') query.delete(key);
		else query.set(key, String(value));
	}
	const text = query.toString();
	return text ? `${location.pathname}?${text}` : location.pathname;
}
