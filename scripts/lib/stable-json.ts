/**
 * Stable JSON output.
 *
 * The whole case for committing the snapshot is that drift arrives as a *reviewable diff*. A
 * writer with unstable key order or unstable indentation collapses that into noise, so the
 * output is sorted, tab-indented (matching this repo's Prettier config) and newline-terminated.
 */

function sortValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortValue);
	if (typeof value !== 'object' || value === null) return value;

	return Object.fromEntries(
		Object.entries(value)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, nested]) => [key, sortValue(nested)])
	);
}

export function stableStringify(value: unknown): string {
	return `${JSON.stringify(sortValue(value), null, '\t')}\n`;
}
