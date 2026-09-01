<script lang="ts">
	import type { ParseWarning, ParseWarningReason } from '#lib/query/index.js';
	import { tick } from 'svelte';
	import { autocompleteFor, type AutocompleteState, type Suggestion } from './autocomplete.js';
	import { caretOffsetX, charIndexAtOffset, measureCharacterOffsets } from './caret-position.js';
	import { positionFloating, type Size } from './floating-position.js';
	import { highlightQuery, type HighlightCategory } from './highlight.js';
	import { portal } from './portal.js';

	/**
	 * The query box, as a transparent-overlay editor: a real `<input>` handles all actual
	 * editing (cursor, selection, keyboard, paste) with its own text made invisible, stacked
	 * over a div that renders what's typed, syntax-highlighted, with inline warning markers.
	 *
	 * `type="text"`, not `"search"` — a native search input's browser-drawn clear button
	 * reserves inconsistent space across engines, which would misalign the overlay for anything
	 * built on top of it (highlight spans, the autocomplete popup's caret math). Role is
	 * `combobox`, not `searchbox` — `searchbox` was right for ticket 01, before autocomplete
	 * existed; `combobox` is the ARIA-correct role for "text input with a popup of suggestions"
	 * (ticket 04), and `e2e/grid.spec.ts`'s locator was updated alongside this, not left stale.
	 * "Clear all" already exists elsewhere in `FilterBar` regardless.
	 *
	 * Holds its own text while focused, same reasoning as before this was split out: a debounced
	 * URL push landing mid-keystroke must never overwrite what's being typed.
	 *
	 * **Syntax highlighting** (`.scratch/editor-affordances/issues/02-syntax-highlighting.md`):
	 * `highlightQuery` walks the parsed query and returns category spans; those are sliced into
	 * colored `<span>`s here, with any uncovered stretch (whitespace, or text the parser dropped
	 * entirely on a malformed clause) rendered plain. `layout.css`'s theme reserves saturated
	 * colour for card art and the four Colour identities, so categories are distinguished within
	 * the existing grayscale ramp plus the one `neon` accent — reserved for a recognized field
	 * name, the single most useful thing to make jump out — rather than by adding new hues.
	 * Values stay `bright`, the same color the box always was: tried a dimmer tier for values, a
	 * magenta field accent, and tinting `color:`/`legends:` values with their real Colour identity
	 * — all live, all reverted. Simplicity, and no card-color reuse at all, read best.
	 *
	 * **Color only, never weight or style.** The overlay and the real `<input>` underneath must
	 * agree on every character's pixel width, or the visible (overlay) text drifts from the
	 * native caret's actual position as soon as anything before it renders at a different width —
	 * exactly what `font-medium`/`italic` did here originally, caught live: the drift compounds
	 * with every such segment earlier in the string, so it reads as "fine at first, wonky once the
	 * query gets longer." `color`/`opacity` never change glyph advance width; weight and style do.
	 *
	 * **Kerning must be off, for the same reason weight/style must be uniform.** Splitting text
	 * into per-category `<span>`s can break the font's kerning across a split boundary — a pair
	 * that would shift slightly when shaped together (`"2,"`) doesn't when `"2"` and `","` are
	 * two separate boxes. `font-kerning`/`font-variant-ligatures: none` make every character's
	 * advance width span-boundary-independent — `caret-position.ts`'s mirror copies the same two
	 * properties, or its math would quietly disagree with this the moment either changes.
	 *
	 * **Selecting text needs its own answer, for a reason specific to this technique.** A
	 * selection is a background painted on the *input's* text (`::selection`) — the input sits on
	 * top of the overlay, so that background paints over the overlay's visible glyphs.
	 * `selection:bg-bright/25` pins it to a deliberately translucent, neutral tint instead of
	 * trusting the browser default to stay legible against every category color underneath.
	 *
	 * **Inline error markers** (`.scratch/editor-affordances/issues/03-inline-error-markers.md`):
	 * each `ParseWarning`'s span gets a wavy amber underline, merged into the same segment list as
	 * the syntax-highlight spans (both partition the same string; a segment can need a color *and*
	 * a decoration at once, so segments are built from the union of both spans' boundaries, not
	 * two independent passes).
	 *
	 * **Disclosure has two independent triggers, not one.** Keyboard: tracks `selectionStart` (on
	 * click, keyup, select, and input) and treats the caret sitting inside a warning's span as
	 * active — arrow keys/typing already move the caret through the whole input, so this alone
	 * covers keyboard for free. Mouse: real hover on the *overlay's* own spans doesn't work — the
	 * input sits on top of the overlay in paint order (what makes typing and selection work at
	 * all), so it always intercepts pointer events first, regardless of `pointer-events` on
	 * anything underneath it. Hover is done on the input itself instead: `measureCharacterOffsets`
	 * (`caret-position.ts`) measures every character's position once per text change, and
	 * `mousemove` binary-searches that array (`charIndexAtOffset`) to find which character the
	 * pointer sits over — one full measurement per keystroke, not one `getBoundingClientRect` per
	 * pixel of mouse movement. Either trigger sets the same `activeWarning`; an `aria-live` region
	 * (not `aria-describedby` — that's read on focus, not necessarily re-announced on every
	 * content change while *already* focused, the common case while editing) gives screen-reader
	 * users the same thing as the caret moves, without disturbing the existing `sr-only` label.
	 * Both triggers clear on blur, so the tooltip never outlives focus leaving the input entirely.
	 *
	 * The tooltip renders *above* the input, not below: `FilterBar`'s own count-banner already
	 * occupies the space directly beneath the query row, and the two are translucent in the same
	 * way — stacked, they read as one confusing blob rather than two separate things.
	 * `QueryEditor` has no reason to know the banner exists at all; going up avoids the collision
	 * without coupling the two components' layouts together.
	 *
	 * **Both the tooltip and the autocomplete popup are portaled to `<body>`** (`portal.ts`), not
	 * positioned relative to this component's own wrapper. Found live: the tooltip rendered
	 * *behind* the page header. `FilterBar`'s sticky row is `z-20`, nested inside which no
	 * `z-index` this tooltip could carry would ever out-rank `Nav`'s `z-30` — a child only
	 * competes against siblings *within its own stacking context*, and that row loses to `Nav`
	 * before the tooltip's own `z-index` even enters into it. Portaling out of that ancestor
	 * entirely, to a direct child of `<body>`, is what makes a plain high `z-index` (`z-40`) mean
	 * what it says; positions are computed in viewport coordinates (`getBoundingClientRect()` +
	 * `caretOffsetX`) rather than via CSS keywords relative to a parent that's no longer there.
	 *
	 * **Autocomplete** (`.scratch/editor-affordances/issues/04-autocomplete.md`):
	 * `autocompleteFor` (`autocomplete.ts`) reuses the same `caretPos` state ticket 03 already
	 * tracks — one caret-tracking mechanism, not two — to decide what, if anything, the word under
	 * the caret could complete to. The popup renders below the input, the tooltip's mirror image,
	 * which also keeps the two from ever occupying the same space if a warning and a completion
	 * were somehow both live at once. `Escape` dismisses for the current word only — `dismissed`
	 * resets the moment `autocomplete` recomputes to a new context, so typing further or moving
	 * the caret can bring suggestions back, matching ordinary editor behavior.
	 *
	 * Selecting a suggestion never moves real DOM focus off the input: the listbox's own options
	 * aren't independently focusable (`aria-activedescendant` communicates the "virtual" selection
	 * to assistive tech instead), and each option's `mousedown` calls `preventDefault()` so a
	 * mouse click can't blur the input before its `click` handler even runs. Field suggestions
	 * insert the bare keyword and let this component decide whether to append `:` — checking
	 * whether the text right after the completed span already starts with an operator character,
	 * so completing a word that's sitting directly before its own already-typed `:` can't produce
	 * a double colon.
	 *
	 * **Mobile popup positioning** (`.scratch/editor-affordances/issues/05-mobile-popup-positioning.md`):
	 * both floating elements broke immediately on a 390px phone viewport — the popup ran off the
	 * right edge, and the tooltip's "always above" placement (ticket 03) had nowhere to go above a
	 * query box sitting right under the sticky nav. `floating-position.ts`'s `positionFloating`
	 * fixes both with one function: pick whichever side actually has room (falling back to the
	 * preferred side if neither does, rather than flipping to an equally bad one), then clamp
	 * horizontally to the viewport regardless of which side won. Sizes start at a conservative
	 * estimate and correct once the element actually exists and can be measured
	 * (`getBoundingClientRect()`, re-run whenever the content driving its size might have changed)
	 * — a brief measure-then-correct pass, the same technique real floating-position libraries use,
	 * imperceptible for something this small. `viewportTick` exists purely so `visualViewport`'s
	 * `resize`/`scroll` (real triggers a virtual keyboard opening produces, which change nothing
	 * Svelte's reactivity tracks on its own) can force a recompute — read unconditionally inside
	 * the position `$derived`s, the same lesson the "Clear all" bug (ticket 03) already taught:
	 * a dependency only read on some branches isn't reliably tracked at all.
	 *
	 * **What this could and couldn't verify.** Confirmed live: horizontal overflow on a narrow
	 * viewport, the tooltip's vertical flip when there's no room above, `visualViewport` resize
	 * triggering a reposition, and touch-tap caret placement through the invisible-text overlay —
	 * all via Chromium's mobile device emulation (this repo's own `e2e/mobile.spec.ts` precedent:
	 * one engine, added deliberately without WebKit until a real WebKit-specific bug shows up).
	 * What that setup cannot exercise is a genuine on-screen keyboard actually shrinking
	 * `visualViewport`, or WebKit's own specific history of bugs around `position: fixed` and the
	 * visual-vs-layout-viewport distinction — recorded as a real, disclosed gap, not papered over.
	 */
	let {
		id,
		value,
		placeholder = '',
		warnings = [],
		onSource
	}: {
		id: string;
		value: string;
		placeholder?: string;
		warnings?: readonly ParseWarning[];
		onSource: (next: string) => void;
	} = $props();

	let inputEl = $state<HTMLInputElement>();
	let text = $state('');
	let caretPos = $state<number | null>(null);
	let hoveredWarning = $state<ParseWarning | null>(null);
	let selectedIndex = $state(0);
	let dismissed = $state(false);
	let tooltipEl = $state<HTMLElement>();
	let popupEl = $state<HTMLElement>();
	let tooltipSize = $state<Size>({ width: 280, height: 32 });
	let popupSize = $state<Size>({ width: 200, height: 100 });
	let viewportTick = $state(0);
	// The overlay has no scroll position of its own — it's a `whitespace-pre` div, not an
	// independently-scrollable box — so it has to be told the input's `scrollLeft` and shift its
	// own rendered content to match, or it stays frozen at the original view the moment a query
	// overflows the box width and the input auto-scrolls to keep the caret visible. Real bug,
	// found live on a narrow phone viewport where ordinary queries overflow far more readily than
	// on desktop — but the root cause is the shell itself (ticket 01), not mobile-specific; it was
	// always reachable on desktop too, just needed a long enough query to hit it.
	let scrollLeft = $state(0);

	$effect(() => {
		// `value` must be read unconditionally, every run — not only inside the `if` — or Svelte's
		// fine-grained tracking drops it as a dependency the moment a run happens *while focused*
		// (the branch that never reads it), and this effect stops noticing `value` change at all
		// until something else re-triggers it. That's exactly what made "Clear all" silently leave
		// stale text behind: it changes `value` alone, from a click that moves focus off the input
		// first — a real, long-standing bug, not introduced by this ticket, just found by it.
		const next = value;
		if (inputEl !== document.activeElement) text = next;
	});

	$effect(() => {
		const vv = window.visualViewport;
		const bump = () => (viewportTick += 1);
		vv?.addEventListener('resize', bump);
		vv?.addEventListener('scroll', bump);
		window.addEventListener('resize', bump);
		return () => {
			vv?.removeEventListener('resize', bump);
			vv?.removeEventListener('scroll', bump);
			window.removeEventListener('resize', bump);
		};
	});

	// Re-measures whenever the element exists and whenever its content might have changed size —
	// `void activeWarning`/`void autocomplete` so switching directly from one warning/suggestion
	// list to another (no blur in between) doesn't leave a stale size from the previous one.
	$effect(() => {
		// `!tooltipEl`, not `=== undefined` — `bind:this` resets to `null` on unmount, not
		// `undefined`, despite the declared `HTMLElement | undefined` type; caught live via a
		// real crash (`getBoundingClientRect` on `null`) once the tooltip actually unmounted.
		if (!tooltipEl) return;
		void activeWarning;
		const rect = tooltipEl.getBoundingClientRect();
		tooltipSize = { width: rect.width, height: rect.height };
	});

	$effect(() => {
		if (!popupEl) return;
		void autocomplete;
		const rect = popupEl.getBoundingClientRect();
		popupSize = { width: rect.width, height: rect.height };
	});

	function viewportSize(): Size {
		const vv = window.visualViewport;
		return { width: vv?.width ?? window.innerWidth, height: vv?.height ?? window.innerHeight };
	}

	function updateCaretPos(event: { currentTarget: HTMLInputElement }) {
		caretPos = event.currentTarget.selectionStart;
		// Belt-and-suspenders alongside the dedicated `onscroll` handler below: covers any case
		// where a browser's internal auto-scroll-into-view doesn't itself fire a `scroll` event
		// synchronously with the trigger that caused it.
		scrollLeft = event.currentTarget.scrollLeft;
	}

	function updateHover(event: MouseEvent & { currentTarget: HTMLInputElement }) {
		const x = event.clientX - event.currentTarget.getBoundingClientRect().left;
		const index = charIndexAtOffset(characterOffsets, x);
		hoveredWarning = warnings.find((w) => w.span[0] <= index && index < w.span[1]) ?? null;
	}

	async function acceptSuggestion(state: AutocompleteState, suggestion: Suggestion) {
		const alreadyHasOperator = /^[:=<>]/.test(text.slice(state.span[1]));
		const insertText =
			state.kind === 'field' && !alreadyHasOperator
				? `${suggestion.insertText}:`
				: suggestion.insertText;
		const before = text.slice(0, state.span[0]);
		const after = text.slice(state.span[1]);
		const newCaret = before.length + insertText.length;

		text = before + insertText + after;
		caretPos = newCaret;
		onSource(text);

		await tick();
		inputEl?.setSelectionRange(newCaret, newCaret);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!suggestionsOpen || autocomplete === null) return;
		const { suggestions } = autocomplete;
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			selectedIndex = (selectedIndex + 1) % suggestions.length;
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			selectedIndex = (selectedIndex - 1 + suggestions.length) % suggestions.length;
		} else if (event.key === 'Enter' || event.key === 'Tab') {
			event.preventDefault();
			void acceptSuggestion(autocomplete, suggestions[selectedIndex]);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			dismissed = true;
		}
	}

	// Grammar (operators, parens, the `or`/`and`/`-` connectives) shares one dim tier — it's
	// structure, not content. Values stay `bright`, same as plain/unrecognized text.
	const CATEGORY_CLASS: Record<HighlightCategory, string> = {
		field: 'text-neon',
		operator: 'text-muted',
		keyword: 'text-muted',
		value: 'text-bright',
		regex: 'text-bright'
	};

	const REASON_MESSAGE: Record<ParseWarningReason, string> = {
		'unknown-field': 'Unknown field — this part was dropped.',
		'malformed-value': 'Malformed value — this part was dropped.',
		'unclosed-group': 'Unclosed parenthesis — everything after it was dropped.',
		'invalid-regex': 'Invalid regex pattern — this part was dropped.',
		'inapplicable-field': "Doesn't apply to this field — this part was dropped."
	};

	type Segment = { text: string; class: string; warning?: ParseWarning };

	// Two independent partitions of the same string (highlight categories, warning spans) merged
	// into one: every boundary from either becomes a cut point, so no elementary segment ever
	// needs to represent more than one category or straddle a warning's edge.
	const segments = $derived.by((): Segment[] => {
		const colorSpans = highlightQuery(text);
		// Duplicate boundary points are harmless — they'd produce a zero-length segment, already
		// skipped below — so this collects plain numbers rather than deduping through a `Set`.
		const points = [0, text.length];
		for (const { span } of colorSpans) points.push(span[0], span[1]);
		for (const warning of warnings) points.push(warning.span[0], warning.span[1]);
		points.sort((a, b) => a - b);

		const result: Segment[] = [];
		for (let i = 0; i < points.length - 1; i++) {
			const start = points[i];
			const end = points[i + 1];
			if (start >= end) continue;
			const colorSpan = colorSpans.find((s) => s.span[0] <= start && start < s.span[1]);
			const warning = warnings.find((w) => w.span[0] <= start && start < w.span[1]);
			const decoration =
				warning !== undefined
					? ' underline decoration-wavy decoration-amber-400 underline-offset-2'
					: '';
			result.push({
				text: text.slice(start, end),
				class: (colorSpan ? CATEGORY_CLASS[colorSpan.category] : 'text-bright') + decoration,
				warning
			});
		}
		return result;
	});

	const characterOffsets = $derived.by((): number[] =>
		inputEl === undefined ? [] : measureCharacterOffsets(inputEl, text)
	);

	const caretWarning = $derived.by((): ParseWarning | null => {
		const pos = caretPos;
		if (pos === null) return null;
		return warnings.find((w) => w.span[0] <= pos && pos <= w.span[1]) ?? null;
	});

	const activeWarning = $derived.by((): ParseWarning | null => hoveredWarning ?? caretWarning);

	// Viewport coordinates, not parent-relative — `tooltipEl`/`popupEl` are portaled to `<body>`
	// (see `portal.ts`), so CSS positioning keywords relative to this component's own wrapper no
	// longer apply once they're moved. `caretOffsetX` already returns an offset from the input's
	// own border-box left edge specifically so callers can add `getBoundingClientRect().left`.
	const tooltipPos = $derived.by((): { x: number; y: number; side: 'above' | 'below' } | null => {
		void viewportTick;
		if (activeWarning === null || inputEl === undefined) return null;
		const rect = inputEl.getBoundingClientRect();
		const anchorX = rect.left + caretOffsetX(inputEl, activeWarning.span[0]);
		return positionFloating(rect, anchorX, 'above', tooltipSize, viewportSize());
	});

	const autocomplete = $derived.by((): AutocompleteState | null => {
		const pos = caretPos;
		return pos === null ? null : autocompleteFor(text, pos);
	});

	// Resets on every recompute of `autocomplete` — including ones that don't visibly change
	// anything, e.g. typing another character of the same word — which is exactly right: the top
	// match should re-select as the prefix narrows, and `Escape`'s dismissal should only last
	// until the context actually moves on to something new.
	$effect(() => {
		void autocomplete;
		selectedIndex = 0;
		dismissed = false;
	});

	const suggestionsOpen = $derived(!dismissed && autocomplete !== null);

	const popupPos = $derived.by((): { x: number; y: number; side: 'above' | 'below' } | null => {
		void viewportTick;
		if (autocomplete === null || inputEl === undefined) return null;
		const rect = inputEl.getBoundingClientRect();
		const anchorX = rect.left + caretOffsetX(inputEl, autocomplete.span[0]);
		return positionFloating(rect, anchorX, 'below', popupSize, viewportSize());
	});
</script>

<div
	class="relative rounded-lg border border-edge bg-void transition-colors focus-within:border-neon"
	style="font-kerning: none; font-variant-ligatures: none;"
>
	<div aria-hidden="true" class="pointer-events-none absolute inset-0 overflow-hidden px-4 py-2.5">
		<div class="whitespace-pre" style="transform: translateX({-scrollLeft}px)">
			{#each segments as segment, i (i)}<span class={segment.class}>{segment.text}</span>{/each}
		</div>
	</div>
	<input
		{id}
		bind:this={inputEl}
		value={text}
		oninput={(event) => {
			text = event.currentTarget.value;
			onSource(text);
			updateCaretPos(event);
		}}
		onclick={updateCaretPos}
		onkeyup={updateCaretPos}
		onselect={updateCaretPos}
		onkeydown={handleKeydown}
		onmousemove={updateHover}
		onmouseleave={() => (hoveredWarning = null)}
		onscroll={(event) => (scrollLeft = event.currentTarget.scrollLeft)}
		onblur={() => {
			caretPos = null;
			hoveredWarning = null;
		}}
		type="text"
		role="combobox"
		aria-expanded={suggestionsOpen}
		aria-controls="{id}-listbox"
		aria-autocomplete="list"
		aria-activedescendant={suggestionsOpen ? `${id}-option-${selectedIndex}` : undefined}
		{placeholder}
		autocomplete="off"
		spellcheck="false"
		class="relative w-full bg-transparent px-4 py-2.5 text-transparent caret-bright outline-none
			selection:bg-bright/25 placeholder:text-muted"
	/>
	{#if suggestionsOpen && autocomplete !== null && popupPos !== null}
		<ul
			use:portal
			bind:this={popupEl}
			role="listbox"
			id="{id}-listbox"
			class="fixed z-40 max-h-48 min-w-32 overflow-auto rounded-md border border-edge bg-shell
				py-1 text-sm shadow-lg {popupPos.side === 'above' ? '-translate-y-full' : ''}"
			style="left: {popupPos.x}px; top: {popupPos.y}px"
		>
			{#each autocomplete.suggestions as suggestion, i (suggestion.keyword)}
				<!-- Keyboard interaction lives entirely on the input's `onkeydown` (arrow keys,
					Enter/Tab) per the ARIA combobox pattern — this option is never itself focused,
					only ever "virtually" selected via `aria-activedescendant` above. -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<li
					role="option"
					id="{id}-option-{i}"
					aria-selected={i === selectedIndex}
					onmousedown={(event) => event.preventDefault()}
					onclick={() => acceptSuggestion(autocomplete, suggestion)}
					class="cursor-pointer px-3 py-1 {i === selectedIndex
						? 'bg-neon/20 text-neon'
						: 'text-body hover:bg-raised'}"
				>
					{suggestion.keyword}{#if suggestion.hint}<span class="ml-1.5 text-xs text-muted"
							>{suggestion.hint}</span
						>{/if}
				</li>
			{/each}
		</ul>
	{/if}
	{#if activeWarning !== null && tooltipPos !== null}
		<div
			use:portal
			bind:this={tooltipEl}
			role="status"
			class="pointer-events-none fixed z-40 max-w-xs rounded-md border border-amber-500/40
				bg-amber-500/10 px-2 py-1 text-xs text-amber-200 {tooltipPos.side === 'above'
				? '-translate-y-full'
				: ''}"
			style="left: {tooltipPos.x}px; top: {tooltipPos.y}px"
		>
			{REASON_MESSAGE[activeWarning.reason]}
		</div>
	{/if}
	<div aria-live="polite" class="sr-only">
		{activeWarning !== null ? REASON_MESSAGE[activeWarning.reason] : ''}
	</div>
</div>
