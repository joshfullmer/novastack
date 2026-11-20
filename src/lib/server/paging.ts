/**
 * Fetches one page of a list whose query clamps a page past the last to the last.
 *
 * Without this, every number past the end is its own cache key for the same answer, so a crawler counting
 * `?page=` upwards costs a query for each. Page one is asked first (and cached, shared by every page of
 * the same filters) to learn where the end is, and a request past it is served as the last page. The
 * result's own `page` says which page it is, so a caller shows the clamped one as it already does.
 */
export async function fetchPage<T extends { pages: number }>(
	asked: number,
	fetch: (page: number) => Promise<T>
): Promise<T> {
	if (asked <= 1) return fetch(1);
	const first = await fetch(1);
	if (asked > first.pages) return first.pages === 1 ? first : fetch(first.pages);
	return fetch(asked);
}
