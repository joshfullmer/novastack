/**
 * Where a deck opens in place beside a list (the decks list, an event's standings) instead of on its own
 * page: only on a screen wide enough to hold both, and only for a plain click, so a link still opens in a
 * new tab, a new window or a phone.
 */
export const SPLIT = '(min-width: 1536px)';

export function opensInPane(event: MouseEvent): boolean {
	if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
		return false;
	}
	return window.matchMedia(SPLIT).matches;
}
