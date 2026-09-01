/**
 * Character-position geometry for the query box's transparent-overlay `<input>` — a native input
 * never exposes character-level geometry itself, so both functions here use the standard
 * workaround: a hidden span carrying the same font metrics measures text, and its width stands
 * in for a real position query the DOM doesn't provide.
 */

/** A mirror span configured to render text with exactly the same metrics as `input` — same font,
 * letter-spacing, kerning, and ligature settings. Shared by both functions below so neither can
 * silently drift from the other, or from `QueryEditor`'s own rendering, which sets the same two
 * kerning/ligature properties for the same reason (span-boundary-independent glyph widths). */
function createMirror(style: CSSStyleDeclaration): HTMLSpanElement {
	const mirror = document.createElement('span');
	mirror.style.position = 'absolute';
	mirror.style.visibility = 'hidden';
	mirror.style.whiteSpace = 'pre';
	mirror.style.font = style.font;
	mirror.style.letterSpacing = style.letterSpacing;
	mirror.style.fontKerning = style.fontKerning;
	mirror.style.fontVariantLigatures = style.fontVariantLigatures;
	return mirror;
}

/** Horizontal offset, in pixels from the input's border-box left edge, of the caret if it sat at
 * `charIndex` in `input.value`.
 *
 * Callers add `input.getBoundingClientRect().left` for a viewport coordinate — kept separate so
 * this stays testable without asserting on where the input happens to sit on screen.
 */
export function caretOffsetX(input: HTMLInputElement, charIndex: number): number {
	const style = getComputedStyle(input);

	const mirror = createMirror(style);
	mirror.textContent = input.value.slice(0, charIndex);
	document.body.appendChild(mirror);
	const textWidth = mirror.getBoundingClientRect().width;
	mirror.remove();

	const borderLeft = parseFloat(style.borderLeftWidth);
	const paddingLeft = parseFloat(style.paddingLeft);
	return borderLeft + paddingLeft + textWidth - input.scrollLeft;
}

/** Every character's left-edge offset in `text`, same basis as `caretOffsetX` (index `i` of the
 * returned array is `caretOffsetX(input, i)` — length `text.length + 1`, the last entry being the
 * offset just past the final character).
 *
 * A separate function, not `text.length` calls to `caretOffsetX`, because hit-testing a mouse
 * position against character positions (hover detection) needs this on every `mousemove` — one
 * mirror element measured `text.length` times, rather than `text.length` mirror elements each
 * forcing their own layout, keeps that from compounding into `O(n²)` DOM work per event. Takes
 * `text` explicitly rather than reading `input.value`, so a caller computing this inside reactive
 * state (`QueryEditor`'s `$derived`) depends on the same text state driving everything else, not
 * on the DOM's own (possibly not-yet-flushed) value. */
export function measureCharacterOffsets(input: HTMLInputElement, text: string): number[] {
	const style = getComputedStyle(input);
	const mirror = createMirror(style);
	document.body.appendChild(mirror);

	const borderLeft = parseFloat(style.borderLeftWidth);
	const paddingLeft = parseFloat(style.paddingLeft);
	const base = borderLeft + paddingLeft - input.scrollLeft;

	const offsets: number[] = [];
	for (let i = 0; i <= text.length; i++) {
		mirror.textContent = text.slice(0, i);
		offsets.push(base + mirror.getBoundingClientRect().width);
	}

	mirror.remove();
	return offsets;
}

/** The character index whose span `[offsets[i], offsets[i + 1])` contains `targetX` — the
 * inverse of `measureCharacterOffsets`, for turning a mouse position into "which character is
 * the pointer over." Binary search: `offsets` is monotonically non-decreasing by construction
 * (each successive character can only add width). */
export function charIndexAtOffset(offsets: readonly number[], targetX: number): number {
	let lo = 0;
	let hi = offsets.length - 1;
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		if (offsets[mid] <= targetX) lo = mid;
		else hi = mid - 1;
	}
	return lo;
}
