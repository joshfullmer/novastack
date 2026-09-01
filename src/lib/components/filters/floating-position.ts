/**
 * Viewport-aware positioning for `QueryEditor`'s two portaled floating elements — the warning
 * tooltip (ticket 03) and the autocomplete popup (ticket 04). Both were built desktop-first with
 * a fixed preferred side (tooltip always above, popup always below) and no clamping; verified
 * live on a 390px-wide phone viewport, both broke immediately — the popup ran off the right edge,
 * and the tooltip (with no room above a query box sitting right under the sticky nav) rendered
 * partly above the top of the screen entirely. One shared function fixes both, since the failure
 * mode — and the fix — is identical: pick whichever side actually has room, then clamp to the
 * viewport regardless.
 */
export type Rect = { left: number; right: number; top: number; bottom: number };
export type Size = { width: number; height: number };
export type Side = 'above' | 'below';

function clamp(value: number, min: number, max: number): number {
	return max < min ? min : Math.min(Math.max(value, min), max);
}

/** `preferred` wins unless it doesn't actually fit *and* the other side has more room — a side
 * with merely "enough" room never loses to a side with "more" room, so this doesn't flip back
 * and forth between two sides that both fit. */
function chooseSide(spaceAbove: number, spaceBelow: number, preferred: Side, height: number): Side {
	const preferredSpace = preferred === 'above' ? spaceAbove : spaceBelow;
	if (preferredSpace >= height) return preferred;
	const otherSpace = preferred === 'above' ? spaceBelow : spaceAbove;
	return otherSpace > preferredSpace ? (preferred === 'above' ? 'below' : 'above') : preferred;
}

/** `anchorX` and the returned `x` are both viewport coordinates (already `rect.left +` an
 * in-input offset, same convention `caret-position.ts` uses) — this function only ever adds the
 * vertical anchor (`anchor.top`/`anchor.bottom`) itself. `margin` keeps the box off both the
 * anchor and the viewport edge by the same small gap. */
export function positionFloating(
	anchor: Rect,
	anchorX: number,
	preferred: Side,
	size: Size,
	viewport: Size,
	margin = 4
): { x: number; y: number; side: Side } {
	const spaceAbove = anchor.top;
	const spaceBelow = viewport.height - anchor.bottom;
	const side = chooseSide(spaceAbove, spaceBelow, preferred, size.height);

	const y = side === 'below' ? anchor.bottom + margin : anchor.top - margin;
	const x = clamp(anchorX, margin, viewport.width - size.width - margin);

	return { x, y, side };
}
