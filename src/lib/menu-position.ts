/**
 * Every "⋯" dropdown in the decks UI used to be a plain `position: absolute; right: 0` panel
 * anchored to its own trigger. That breaks down the moment the trigger sits inside something
 * narrower than the panel itself — a 2-column mobile grid card, or a button that isn't the
 * rightmost thing in its row — because a right-anchored panel can only ever grow *left* from
 * there, with no floor on how far. This computes a `position: fixed` origin instead, clamped to
 * the viewport, so the panel can't spill off either edge regardless of where its trigger lives.
 *
 * Computed once, on open — not re-synced on scroll/resize. These menus are short-lived (open,
 * pick one item, closed again), so a stale position across a scroll that happens while one is
 * open is an acceptable, rare tradeoff against the complexity of tracking it live.
 */
export function menuPosition(trigger: HTMLElement, panelWidth: number, margin = 8) {
	const rect = trigger.getBoundingClientRect();
	const left = Math.min(
		Math.max(rect.right - panelWidth, margin),
		window.innerWidth - panelWidth - margin
	);
	return { top: rect.bottom + 4, left };
}
