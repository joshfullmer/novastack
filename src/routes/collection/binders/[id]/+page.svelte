<script lang="ts">
	/**
	 * One Binder — the spread.
	 *
	 * A **Binder** is a showcase: a Pocket holds a card you want to display, and says nothing about
	 * what you own (`CONTEXT.md`). So there are no steppers here and no counts; the Collection is
	 * only ever read, to veil cards you own none of.
	 *
	 * **Two Pages at a time, always, because that is what a binder is.** Page 1 sits on the right
	 * with the binder's name facing it, exactly like opening a real one — the left of the first
	 * spread is the inside front cover, not a page. After that the odd-numbered Page is on the left
	 * and the even one on the right, and turning a page swings a leaf between the two.
	 *
	 * The cost of a spread is that only two Pages are reachable at a time, which dragging has to
	 * cope with: holding a card over a page in the strip turns to it (`HOVER_TURN_MS`). The
	 * pick-up-and-click path needs nothing special — pick a card up, turn the page, click.
	 *
	 * **Three ways to fill a Pocket, on purpose.** Drag a card in (the good one, see
	 * `#lib/collection/pocket-drag.svelte.ts`); or pick a card up with a click and click a Pocket,
	 * which is the path that works without a pointer; or rearrange what's already there by dragging
	 * between Pockets. Dropping onto an occupied Pocket **swaps**, matching `movePocket` — trading
	 * places is what moving a card in a real binder does.
	 *
	 * **The search panel is the full query language**, not a name box: `rarity>=epic`,
	 * `set:MS01-WNC`, `owned>=1`, `type:legend` and the rest, with the same highlighting and
	 * autocomplete as `/cards`. Building a themed page is a *set-shaped* question — "every epic in
	 * The Heist I own" — which is exactly what the query language answers and what a name box
	 * cannot. Its text stays in component state rather than the URL: this page's URL is a share
	 * link, and a stranger opening it should get the arrangement, not your last search.
	 *
	 * Empty Pockets are rendered for everyone, owner or not: a held space is part of the
	 * arrangement, not an artefact to tidy away before sharing.
	 */
	import { applyAction, deserialize, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onDestroy, tick } from 'svelte';
	import { dataset } from '#lib/cards/index.js';
	import { DEFAULT_LOCALE } from '#lib/cards/vocabulary.js';
	import { POCKETS_PER_PAGE } from '#lib/collection/binders.js';
	import { inGoal } from '#lib/collection/goal.js';
	import {
		PocketDrag,
		POCKET_ATTRIBUTE,
		REMOVE_ATTRIBUTE,
		pocketKey,
		type DragPayload,
		type DropZone
	} from '#lib/collection/pocket-drag.svelte.js';
	import {
		PRINTING_ROWS_IN_SET_ORDER,
		printingRow,
		setLabel,
		type PrintingRow
	} from '#lib/collection/printing-search.js';
	import { collection } from '#lib/collection/state.svelte.js';
	import { test } from '#lib/filters/predicate.js';
	import { parseQuery } from '#lib/query/index.js';
	import CardImage from '#lib/components/CardImage.svelte';
	import DragGhost from '#lib/components/DragGhost.svelte';
	import Meta from '#lib/components/Meta.svelte';
	import QueryEditor from '#lib/components/filters/QueryEditor.svelte';

	let { data, form } = $props();

	/** One source of truth for the Pocket image size: the Pockets themselves, and the drag ghost,
	 * which requests this rather than its own width so a drop is always a cache hit. */
	const POCKET_SIZES = '(min-width: 1024px) 150px, 16vw';

	/** How long a page turn takes. The only place it's stated, now that `animate` drives it. */
	const TURN_MS = 500;
	/** How long a held card must hover a page in the strip before the binder turns to it. */
	const HOVER_TURN_MS = 400;

	/** The card in hand: picked from the search panel, waiting for a Pocket. */
	let held = $state<PrintingRow | null>(null);
	let renaming = $state(false);
	let copied = $state(false);
	/** A failed drag-drop has no form to report through, so it reports here. */
	let dropError = $state<string | null>(null);

	/**
	 * Trailing empty Pages exist only on screen until something is put in them — `getBinderPages`
	 * derives the count from the highest occupied Pocket, so "added but empty" has no storage and
	 * needs none. Tracked as a floor rather than a count so a placement that grows the server's
	 * pages can't shrink the view.
	 */
	let pageFloor = $state(1);
	const pageCount = $derived(Math.max(data.pages.length, pageFloor));

	const pages = $derived(
		Array.from(
			{ length: pageCount },
			(_, page) => data.pages[page] ?? Array.from({ length: POCKETS_PER_PAGE }, () => null)
		)
	);

	const filled = $derived(data.pages.flat().filter((pocket) => pocket !== null).length);

	/**
	 * The Collection is read to veil cards with an Owned Count of zero. Harmless for a signed-out
	 * visitor following a shared link: `load` no-ops without a session.
	 */
	$effect(() => void collection.load());

	const ownedOf = (printingId: string) => collection.quantityOf(printingId);

	// ---------------------------------------------------------------------------------------------
	// Spreads and page turning

	/**
	 * Spread 0 is the cover facing Page 1; after that a spread is an odd Page on the left and the
	 * even one on the right. So the right-hand Page is always `2 * spread` and the left is
	 * `2 * spread - 1` — which for spread 0 is -1, meaning no page at all.
	 */
	const spreadCount = $derived(Math.floor(pageCount / 2) + 1);
	let spread = $state(0);

	const leftPage = $derived(spread * 2 - 1);
	const rightPage = $derived(spread * 2);

	function pageAt(index: number): (string | null)[] | null {
		return index >= 0 && index < pageCount ? pages[index] : null;
	}

	/**
	 * The turning leaf: one sheet with the outgoing right-hand Page on its front and the incoming
	 * left-hand Page on its back.
	 *
	 * One leaf covers both directions — forward swings it from 0° to -180° about the spine, back
	 * swings it from -180° to 0° — because either way it is the same physical sheet.
	 */
	let turn = $state<{ front: number; back: number; target: number; from: number } | null>(null);
	let leafEl = $state<HTMLElement>();

	function reduceMotion(): boolean {
		return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	}

	/**
	 * Turns to a spread, animating the leaf between here and there.
	 *
	 * Driven by `element.animate` rather than a CSS transition on a reactive style. A transition
	 * needs the browser to have painted the start angle before the end angle is set, and Svelte's
	 * DOM update lands in a microtask — so the two angles could arrive in the same frame and the
	 * transition would never run. `animate` states both keyframes outright, and `finished` is a
	 * promise, which replaces the timer that used to guess when the turn was over.
	 */
	async function goTo(target: number) {
		if (turn || target === spread || target < 0 || target >= spreadCount) return;

		if (reduceMotion()) {
			spread = target;
			return;
		}

		const forward = target > spread;
		const from = forward ? 0 : -180;
		const to = forward ? -180 : 0;

		turn = {
			front: forward ? rightPage : target * 2,
			back: forward ? target * 2 - 1 : leftPage,
			target,
			from
		};

		await tick();

		if (leafEl) {
			const animation = leafEl.animate(
				[{ transform: leafTransform(from) }, { transform: leafTransform(to) }],
				{ duration: TURN_MS, easing: 'cubic-bezier(0.35, 0, 0.25, 1)', fill: 'forwards' }
			);
			// Rejects if the leaf unmounts mid-turn; either way the spread still has to commit.
			await animation.finished.catch(() => undefined);
		}

		spread = target;
		turn = null;
	}

	/**
	 * `perspective()` lives **in the leaf's own transform**, not on an ancestor.
	 *
	 * The `perspective` property only applies to an element's *direct children*, and the leaf is a
	 * grandchild of the spread — so with the property on the spread the rotation was projected
	 * orthographically: the page squashed horizontally into a sliver instead of swinging, which read
	 * as nothing happening at all. As a transform function it always applies to the element it's on.
	 */
	function leafTransform(angle: number): string {
		return `perspective(2200px) rotateY(${angle}deg)`;
	}

	/**
	 * Mid-turn the static halves show where you came from on the left and where you're going on the
	 * right; the leaf covers the difference, so nothing ever jumps when it lands.
	 */
	const visibleRight = $derived(turn ? turn.target * 2 : rightPage);

	/**
	 * Which spread the strip marks — the destination from the moment a turn begins, not when it
	 * lands. The outline used to wait for the animation to finish and then snap; now it crosses over
	 * while the page is in the air, which is when you're looking at it.
	 */
	const activeSpread = $derived(turn ? turn.target : spread);

	/** The Pages in the spread being shown or turned to, for the strip to mark as current. */
	const currentPages = $derived(new Set([activeSpread * 2 - 1, activeSpread * 2]));

	let hoverTurnTimer: ReturnType<typeof setTimeout> | undefined;

	/** A card can only be dropped on a visible Page, so holding one over a page in the strip turns
	 * there. Delayed, or dragging *across* the strip would flip through the whole binder. */
	function hoverTurn(index: number) {
		hoverTurnSpread(Math.floor((index + 1) / 2));
	}

	function hoverTurnSpread(target: number) {
		if (!drag.payload) return;
		clearTimeout(hoverTurnTimer);
		hoverTurnTimer = setTimeout(() => void goTo(target), HOVER_TURN_MS);
	}

	function cancelHoverTurn() {
		clearTimeout(hoverTurnTimer);
	}

	// ---------------------------------------------------------------------------------------------
	// Search panel

	/**
	 * How many results to render at once, and how many more each time you reach the bottom.
	 *
	 * There is no cap on what a query *matches* — the count tells the truth and scrolling reaches
	 * every one of them. The window exists because each card decodes a ThumbHash when it mounts,
	 * and doing 700 of those at once on every keystroke janks the editor you're typing into.
	 */
	const PAGE_SIZE = 96;

	let source = $state('');
	/**
	 * Off-Goal printings are hidden by default.
	 *
	 * A Binder is built out of what you collect, and the default Goal leaves out 368 of the 700
	 * printings — beta and French runs that someone not collecting them should not have to scroll
	 * past (`CONTEXT.md`, Collecting Goal). Off Goal means uncounted, not untracked, so this is a
	 * toggle rather than an omission.
	 */
	let inGoalOnly = $state(true);
	let limit = $state(PAGE_SIZE);

	const parsed = $derived(parseQuery(source, dataset));

	const matched = $derived(
		// `test` per (card, printing), not `evaluate`: that returns one match per *Card* with a
		// witness printing, and a Binder holds a specific printing of a card, not the card.
		PRINTING_ROWS_IN_SET_ORDER.filter(
			(row) =>
				(!inGoalOnly || inGoal(row.printing, collection.goal)) &&
				test(parsed.predicate, dataset, row.card, row.printing, ownedOf)
		)
	);
	const results = $derived(matched.slice(0, limit));

	// A new query means a new first page of results. Reads only what it resets on, so it can't
	// depend on `limit` and re-trigger itself.
	$effect(() => {
		void source;
		void inGoalOnly;
		limit = PAGE_SIZE;
	});

	/** Grows the window as the panel nears its end, so scrolling reaches every match. */
	function onPanelScroll(event: UIEvent) {
		const panel = event.currentTarget as HTMLElement;
		const remaining = panel.scrollHeight - panel.scrollTop - panel.clientHeight;
		if (remaining < 600 && limit < matched.length) limit += PAGE_SIZE;
	}

	/** Starter queries, because an empty box doesn't teach a language. Real field names and real
	 * values — checked against `FIELDS` in `#lib/query/vocabulary.ts` and the dataset's set ids. */
	const examples = ['owned>=1', 'rarity>=epic', 'set:MS01-WNC', 'type:legend'];

	// ---------------------------------------------------------------------------------------------
	// Dragging

	const drag = new PocketDrag({ onDrop: commitDrop });
	onDestroy(() => {
		drag.destroy();
		clearTimeout(hoverTurnTimer);
	});

	/**
	 * Posts the drop to the same form actions the buttons use, by hand.
	 *
	 * A drag has no `<form>` to submit — an earlier version kept a hidden one and called
	 * `requestSubmit`, which needed a `flushSync` to stop it reading last render's values. This is
	 * the documented manual path instead: `fetch` the action, `deserialize` the result, invalidate.
	 * Validation stays server-side, so a hand-crafted drop is no more trusted than a click.
	 */
	async function commitDrop(payload: DragPayload, zone: DropZone): Promise<void> {
		const body = new FormData();
		let action: 'move' | 'place' | 'clear';

		if (zone.kind === 'remove') {
			// Only a Pocket can be removed from; the engine won't offer this zone for a search card.
			if (payload.kind !== 'pocket') return;
			action = 'clear';
			body.set('page', String(payload.page));
			body.set('pocket', String(payload.pocket));
		} else if (payload.kind === 'pocket') {
			action = 'move';
			body.set('page', String(payload.page));
			body.set('pocket', String(payload.pocket));
			body.set('toPage', String(zone.page));
			body.set('toPocket', String(zone.pocket));
		} else {
			action = 'place';
			body.set('page', String(zone.page));
			body.set('pocket', String(zone.pocket));
			body.set('printingId', payload.printingId);
		}

		dropError = null;
		const response = await fetch(`?/${action}`, { method: 'POST', body });
		const result = deserialize(await response.text());

		if (result.type === 'failure') {
			dropError = typeof result.data?.message === 'string' ? result.data.message : 'Drop failed.';
			return;
		}

		if (result.type === 'success') await invalidateAll();
		await applyAction(result);
	}

	/** A Pocket's contents while a drag is in the air: the card it holds, minus the one that left. */
	function pocketContents(page: number, pocket: number, printingId: string | null) {
		if (!printingId) return undefined;
		if (drag.sourceKey === pocketKey(page, pocket)) return undefined;
		return printingRow(printingId);
	}

	// ---------------------------------------------------------------------------------------------

	async function copyLink() {
		await navigator.clipboard.writeText(`${data.origin}/collection/binders/${data.binder.id}`);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<Meta
	title="{data.binder.name} — novastack"
	description="A binder of {filled} cards, arranged by {data.binder.ownerName}."
	origin={data.origin}
	path="/collection/binders/{data.binder.id}"
/>

<DragGhost {drag} sizes={POCKET_SIZES} />

{#snippet sheet(index: number, pockets: (string | null)[])}
	<ul class="grid grid-cols-3 gap-2 rounded-xl border border-edge bg-shell p-2 sm:gap-3 sm:p-3">
		{#each pockets as printingId, pocket (pocket)}
			{@const row = pocketContents(index, pocket, printingId)}
			{@const key = pocketKey(index, pocket)}
			<!--
				`data-pocket` is the drop target: `PocketDrag` hit-tests with `elementFromPoint`, so the
				target has to be a real element under the cursor with the coordinates of the Pocket
				itself — which is this `li`, whether the Pocket is full or empty.
			-->
			<li
				{...{ [POCKET_ATTRIBUTE]: key }}
				class="relative rounded-2xl transition-shadow {drag.overKey === key
					? 'ring-2 ring-neon ring-offset-2 ring-offset-shell'
					: ''}"
			>
				{#if row}
					<!--
						Drag is a pointer affordance and left as one: no `role="button"` or tabindex, which
						would announce an action the keyboard cannot perform. Rearranging without a pointer
						is emptying a Pocket and placing again, which works throughout.

						Veiled when the owner owns no copies (`card-veil` in `layout.css`), and only for the
						owner: a Binder says nothing about ownership, so veiling a stranger's view by
						*their* collection would read as a claim about the owner's.

						`ondragstart` is cancelled because the card art is an `<img>`, and the browser's own
						image drag would otherwise fight the real one for the gesture.
					-->
					<div
						class="group/pocket relative rounded-2xl select-none
							{data.isOwner && ownedOf(row.printing.id) === 0 ? 'card-veil' : ''}
							{data.isOwner ? 'cursor-grab' : ''}"
						role="group"
						aria-label="{row.card.name}, pocket {pocket + 1} on page {index + 1}"
						onpointerdown={(event) => {
							if (data.isOwner) {
								drag.press(event, {
									kind: 'pocket',
									page: index,
									pocket,
									printingId: row.printing.id
								});
							}
						}}
						ondragstart={(event) => event.preventDefault()}
					>
						<CardImage
							printingId={row.printing.id}
							thumbhash={row.printing.thumbhash}
							color={row.card.color}
							alt={row.card.name}
							sizes={POCKET_SIZES}
							class="rounded-2xl"
						/>
						{#if data.isOwner}
							<form
								method="POST"
								action="?/clear"
								use:enhance
								onpointerdown={(event) => event.stopPropagation()}
								class="absolute top-1 right-1 opacity-0 transition-opacity
									group-hover/pocket:opacity-100 has-[:focus-visible]:opacity-100"
							>
								<input type="hidden" name="page" value={index} />
								<input type="hidden" name="pocket" value={pocket} />
								<button
									type="submit"
									title="Empty this pocket"
									class="rounded bg-void/90 px-1.5 py-0.5 text-xs text-muted hover:text-card-red"
									>✕</button
								>
							</form>
						{/if}
					</div>
				{:else if data.isOwner}
					<form
						method="POST"
						action="?/place"
						use:enhance={() => {
							// The card stays in hand, so filling a run of pockets is one click each.
							return async ({ update }) => update({ reset: false });
						}}
					>
						<input type="hidden" name="page" value={index} />
						<input type="hidden" name="pocket" value={pocket} />
						<input type="hidden" name="printingId" value={held?.printing.id ?? ''} />
						<button
							type="submit"
							disabled={!held}
							title={held ? `Put ${held.card.name} here` : 'Pick a card first, or drag one in'}
							class="card-frame w-full rounded-2xl border-2 border-dashed transition-colors
								disabled:pointer-events-none {held
								? 'border-neon-dim/60 text-neon hover:border-neon hover:bg-neon/5'
								: 'border-edge text-transparent'}"
						>
							<span class="text-2xl" aria-hidden="true">+</span>
							<span class="sr-only">Empty pocket {pocket + 1} on page {index + 1}</span>
						</button>
					</form>
				{:else}
					<div
						class="card-frame rounded-2xl border-2 border-dashed border-edge/60"
						aria-label="Empty pocket"
					></div>
				{/if}
			</li>
		{/each}
	</ul>
{/snippet}

{#snippet pageStrut()}
	<!--
		An invisible Page, purely as a strut.

		A cover has no content of its own to give it height, and mid-turn *both* static halves can be
		covers — turning between the first spread and the second, the left is the inside front cover
		and the right is the inside back cover. The row then collapsed to nothing while the leaf,
		absolutely positioned to that row, rendered a real Page inside a box a fraction of its height
		and spilled out the bottom. Matching a Page's own padding, gaps and border keeps the strut
		exactly a Page tall.
	-->
	<div
		aria-hidden="true"
		class="invisible grid grid-cols-3 gap-2 border border-transparent p-2 sm:gap-3 sm:p-3"
	>
		{#each Array.from({ length: POCKETS_PER_PAGE }, (_, pocket) => pocket) as pocket (pocket)}
			<div class="card-frame"></div>
		{/each}
	</div>
{/snippet}

{#snippet cover(inside: 'front' | 'back')}
	<!-- Not a Page: the left of the first spread is the inside front cover, which is why Page 1
	     opens on the right exactly as it does in the real thing, and past the last Page you reach
	     the inside back one. -->
	<div class="relative">
		{@render pageStrut()}
		<div
			class="absolute inset-0 flex flex-col justify-center rounded-xl border p-6 text-center
				{inside === 'front'
				? 'border-edge bg-gradient-to-br from-shell to-void'
				: 'border-dashed border-edge/50'}"
		>
			{#if inside === 'front'}
				<p class="text-xs font-medium tracking-widest text-neon-dim uppercase">Binder</p>
				<p class="mt-2 text-2xl font-bold tracking-tight text-balance text-bright">
					{data.binder.name}
				</p>
				<p class="mt-2 font-mono text-xs text-muted tabular-nums">
					{filled}
					{filled === 1 ? 'card' : 'cards'} · {pageCount}
					{pageCount === 1 ? 'page' : 'pages'}
				</p>
				{#if !data.isOwner}
					<p class="mt-1 text-xs text-muted/70">arranged by {data.binder.ownerName}</p>
				{/if}
			{/if}
		</div>
	</div>
{/snippet}

{#snippet half(index: number)}
	{#if index < 0}
		{@render cover('front')}
	{:else if pageAt(index)}
		{@render sheet(index, pages[index])}
	{:else}
		{@render cover('back')}
	{/if}
{/snippet}

<div class="mb-6 flex flex-wrap items-end justify-between gap-4">
	<div class="min-w-0">
		<p class="text-xs font-medium tracking-widest text-neon-dim uppercase">Binder</p>
		{#if renaming}
			<form
				method="POST"
				action="?/rename"
				use:enhance={() => {
					renaming = false;
					return async ({ update }) => update();
				}}
				class="mt-1 flex items-center gap-2"
			>
				<input
					name="name"
					value={data.binder.name}
					required
					maxlength="60"
					class="rounded-md border border-edge bg-surface px-3 py-1.5 text-2xl font-bold text-bright"
				/>
				<button type="submit" class="text-sm text-neon hover:text-bright">Save</button>
			</form>
		{:else}
			<h1 class="mt-1 truncate text-4xl font-bold tracking-tight text-bright">
				{data.binder.name}
			</h1>
		{/if}
		<p class="mt-2 text-sm text-muted tabular-nums">
			{filled}
			{filled === 1 ? 'card' : 'cards'} · {pageCount}
			{pageCount === 1 ? 'page' : 'pages'}
			{#if !data.isOwner}· arranged by {data.binder.ownerName}{/if}
		</p>
	</div>

	{#if data.isOwner}
		<div class="flex flex-wrap items-center gap-2 text-sm">
			<a href="/collection/binders" class="px-2 py-2 text-muted hover:text-neon">All binders</a>

			{#if !renaming}
				<button
					type="button"
					onclick={() => (renaming = true)}
					class="px-2 py-2 text-muted hover:text-neon">Rename</button
				>
			{/if}

			<form method="POST" action="?/visibility" use:enhance>
				<input
					type="hidden"
					name="visibility"
					value={data.binder.visibility === 'shared' ? 'private' : 'shared'}
				/>
				<button
					type="submit"
					class="rounded-lg border border-edge px-3 py-2 text-body transition-colors
						hover:border-neon-dim hover:text-neon"
				>
					{data.binder.visibility === 'shared' ? 'Make private' : 'Share by link'}
				</button>
			</form>

			{#if data.binder.visibility === 'shared'}
				<button
					type="button"
					onclick={copyLink}
					class="rounded-lg border border-neon bg-neon/10 px-3 py-2 text-neon"
					>{copied ? 'Copied' : 'Copy link'}</button
				>
			{/if}
		</div>
	{/if}
</div>

{#if form?.message || dropError}
	<p class="mb-4 rounded-lg border border-card-red/50 bg-card-red/10 px-4 py-2.5 text-sm text-body">
		{form?.message ?? dropError}
	</p>
{/if}

<div class="flex flex-col gap-8 lg:flex-row">
	<div class="min-w-0 flex-1">
		<!--
			The spread, flanked by its own arrows. Nothing in this subtree may clip: the leaf swings out
			of the right half and across the left one, and an `overflow-hidden` anywhere above it would
			cut the turn in half.
		-->
		<div class="flex items-stretch gap-1 sm:gap-2">
			<!-- Full-height arrows either side of the pages, where your hands already are. Hidden below
			     `sm`, where the strip's arrows are the better target and the width is wanted for the
			     cards. They turn pages mid-drag too, like the strip's thumbnails. -->
			<button
				type="button"
				onclick={() => goTo(spread - 1)}
				onpointerenter={() => hoverTurnSpread(spread - 1)}
				onpointerleave={cancelHoverTurn}
				disabled={spread === 0}
				aria-label="Previous pages"
				class="hidden w-7 shrink-0 items-center justify-center rounded-lg border border-edge
					text-lg text-muted transition-colors hover:border-neon-dim hover:bg-surface
					hover:text-neon disabled:opacity-25 disabled:hover:border-edge
					disabled:hover:bg-transparent disabled:hover:text-muted sm:flex">‹</button
			>

			<div class="min-w-0 flex-1">
				<!--
					**No gap between the halves**, and that is load-bearing rather than taste. The leaf
					rotates about the spine — the right half's left edge — so at 180° it lands mirrored
					across that edge. A column gap put it exactly one gap-width right of the left page, so
					the instant the turn committed and the real left page took over, the whole page jumped
					sideways by those 16px. With the halves touching, the mirror is exact by construction,
					and the two sheets' own borders read as the binder's gutter.
				-->
				<div class="grid grid-cols-2">
					<div>{@render half(leftPage)}</div>
					<div class="relative">
						{@render half(visibleRight)}

						{#if turn}
							<!--
								One sheet, two faces. `transform-origin` is the spine, so it swings about the
								binder's centre; `backface-visibility: hidden` on both faces is what makes the
								back appear only once the sheet has passed 90°. The start angle is inline so there
								is no unrotated frame before `animate` takes over.
							-->
							<div
								bind:this={leafEl}
								class="pointer-events-none absolute inset-0 origin-left shadow-2xl shadow-void
									[transform-style:preserve-3d]"
								style="transform: {leafTransform(turn.from)};"
							>
								<div class="absolute inset-0 [backface-visibility:hidden]">
									{@render half(turn.front)}
								</div>
								<div
									class="absolute inset-0 [transform:rotateY(180deg)] [backface-visibility:hidden]"
								>
									{@render half(turn.back)}
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>

			<button
				type="button"
				onclick={() => goTo(spread + 1)}
				onpointerenter={() => hoverTurnSpread(spread + 1)}
				onpointerleave={cancelHoverTurn}
				disabled={spread >= spreadCount - 1}
				aria-label="Next pages"
				class="hidden w-7 shrink-0 items-center justify-center rounded-lg border border-edge
					text-lg text-muted transition-colors hover:border-neon-dim hover:bg-surface
					hover:text-neon disabled:opacity-25 disabled:hover:border-edge
					disabled:hover:bg-transparent disabled:hover:text-muted sm:flex">›</button
			>
		</div>

		<!--
			Pagination as page previews, not numbers: which page you want is a question about what is
			*on* it, and a 3×3 of filled and empty pockets answers that at a glance where "07" cannot.
			Borrowed from cyberdecktools, which gets this right.
		-->
		<div class="mt-5 flex flex-wrap items-stretch gap-2">
			<button
				type="button"
				onclick={() => goTo(spread - 1)}
				disabled={spread === 0}
				aria-label="Previous pages (strip)"
				class="rounded-lg border border-edge px-3 text-muted transition-colors
					hover:border-neon-dim hover:text-neon disabled:opacity-30 disabled:hover:border-edge
					disabled:hover:text-muted">←</button
			>

			<ul class="flex flex-wrap gap-2">
				{#each pages as pockets, index (index)}
					{@const current = currentPages.has(index)}
					<li>
						<button
							type="button"
							onclick={() => goTo(Math.floor((index + 1) / 2))}
							onpointerenter={() => hoverTurn(index)}
							onpointerleave={cancelHoverTurn}
							aria-current={current ? 'page' : undefined}
							title="Page {index + 1}"
							class="flex flex-col items-center gap-1 rounded-lg border px-2 py-1.5
								transition-colors duration-500 ease-[cubic-bezier(0.35,0,0.25,1)]
								{current ? 'border-neon bg-neon/5' : 'border-edge hover:border-neon-dim'}"
						>
							<span class="grid grid-cols-3 gap-0.5" aria-hidden="true">
								{#each pockets as printingId, pocket (pocket)}
									<span
										class="size-1.5 rounded-[1px] transition-colors duration-500
											ease-[cubic-bezier(0.35,0,0.25,1)] {printingId ? (current ? 'bg-neon' : 'bg-neon-dim') : 'bg-edge'}"
									></span>
								{/each}
							</span>
							<span
								class="font-mono text-[0.65rem] tabular-nums transition-colors duration-500
									ease-[cubic-bezier(0.35,0,0.25,1)] {current ? 'text-neon' : 'text-muted'}"
								>{String(index + 1).padStart(2, '0')}</span
							>
						</button>
					</li>
				{/each}
			</ul>

			<button
				type="button"
				onclick={() => goTo(spread + 1)}
				disabled={spread >= spreadCount - 1}
				aria-label="Next pages (strip)"
				class="rounded-lg border border-edge px-3 text-muted transition-colors
					hover:border-neon-dim hover:text-neon disabled:opacity-30 disabled:hover:border-edge
					disabled:hover:text-muted">→</button
			>

			{#if data.isOwner}
				<button
					type="button"
					onclick={() => {
						pageFloor = pageCount + 1;
						// Straight to the new page: you added it in order to put something in it.
						goTo(Math.floor((pageCount + 1) / 2));
					}}
					class="rounded-lg border border-edge px-3.5 text-sm text-body transition-colors
						hover:border-neon-dim hover:text-neon">+ Page</button
				>

				<!-- Removes the last Page, the only one whose removal can't renumber the pages you are
				     looking at. `removePage` still closes gaps server-side. -->
				<form
					method="POST"
					action="?/removePage"
					use:enhance={() => {
						pageFloor = Math.max(1, pageCount - 1);
						spread = Math.min(spread, Math.floor((pageCount - 1) / 2));
						return async ({ update }) => update();
					}}
				>
					<input type="hidden" name="page" value={pageCount - 1} />
					<button
						type="submit"
						disabled={pageCount === 1}
						title="Remove page {pageCount}"
						class="h-full rounded-lg border border-edge px-3.5 text-sm text-muted transition-colors
							hover:border-card-red/60 hover:text-card-red disabled:opacity-30
							disabled:hover:border-edge disabled:hover:text-muted">Remove page</button
					>
				</form>
			{/if}
		</div>
	</div>

	{#if data.isOwner}
		<!-- Side by side from `lg`, not `xl`. Stacked, the panel sits below the spread and every
		     placement becomes a scroll — and `/collection/add` already taught this lesson once, where
		     an `xl` gate meant most windows never saw the preview at all.

		     The stuck offset is the nav's height *plus* a rem, not the nav's height: pinned flush to
		     Nav, the panel reads as part of it. `max-h` gives that rem back at the bottom as well, so
		     the panel keeps its own margin on both ends and can still scroll to its last result. -->
		<aside
			{...{ [REMOVE_ATTRIBUTE]: '' }}
			onscroll={onPanelScroll}
			class="relative w-full shrink-0 self-start rounded-xl border bg-shell transition-colors
				lg:sticky lg:top-[calc(var(--spacing-nav)+1rem)]
				lg:max-h-[calc(100vh-var(--spacing-nav)-2rem)] lg:w-80 lg:overflow-y-auto xl:w-96
				{drag.overRemove ? 'border-card-red bg-card-red/5' : 'border-edge'}"
		>
			{#if drag.payload?.kind === 'pocket'}
				<!-- Only while a card that's *in* the Binder is in the air: dragging a search result back
				     here does nothing, so promising otherwise would be a lie. -->
				<p
					class="sticky top-0 z-20 -mb-px border-b px-4 py-2 text-center text-xs transition-colors
						{drag.overRemove
						? 'border-card-red bg-card-red/15 text-bright'
						: 'border-edge bg-shell text-muted'}"
				>
					{drag.overRemove ? 'Release to take it out of the binder' : 'Drop here to remove'}
				</p>
			{/if}

			<div class="sticky top-0 z-10 space-y-3 border-b border-edge bg-shell p-4">
				<div class="flex items-baseline justify-between gap-2">
					<p class="text-xs font-medium tracking-widest text-muted uppercase">Add cards</p>
					<span class="font-mono text-[0.65rem] text-muted/70 tabular-nums">
						{#if matched.length > results.length}
							{results.length} of {matched.length}
						{:else}
							{matched.length} printings
						{/if}
					</span>
				</div>

				<QueryEditor
					id="binder-query"
					value={source}
					placeholder="Query — try rarity>=epic owned>=1"
					warnings={parsed.warnings}
					onSource={(next) => (source = next)}
				/>

				<div class="flex flex-wrap items-center gap-1.5">
					<button
						type="button"
						onclick={() => (inGoalOnly = !inGoalOnly)}
						aria-pressed={!inGoalOnly}
						title={inGoalOnly
							? 'Also show printings outside your collecting goal'
							: 'Only show printings in your collecting goal'}
						class="rounded-full border px-2 py-0.5 text-[0.65rem] transition-colors {inGoalOnly
							? 'border-edge text-muted hover:border-neon-dim hover:text-neon'
							: 'border-neon bg-neon/10 text-neon'}"
						>{inGoalOnly ? 'In goal' : 'All printings'}</button
					>

					{#if source.trim() === ''}
						{#each examples as example (example)}
							<button
								type="button"
								onclick={() => (source = example)}
								class="rounded-full border border-edge px-2 py-0.5 font-mono text-[0.65rem] text-muted
									transition-colors hover:border-neon-dim hover:text-neon">{example}</button
							>
						{/each}
					{/if}
				</div>

				{#if held}
					<div class="flex items-center gap-2 rounded-lg border border-neon/40 bg-neon/5 p-2">
						<div class="w-10 shrink-0">
							<CardImage
								printingId={held.printing.id}
								thumbhash={held.printing.thumbhash}
								color={held.card.color}
								alt=""
								sizes="40px"
								class="rounded"
							/>
						</div>
						<div class="min-w-0 flex-1">
							<p class="truncate text-xs text-bright">{held.card.name}</p>
							<p class="text-[0.65rem] text-neon-dim">In hand — click a pocket</p>
						</div>
						<button
							type="button"
							onclick={() => (held = null)}
							class="shrink-0 text-xs text-muted hover:text-neon">Put back</button
						>
					</div>
				{:else}
					<p class="text-[0.7rem] text-muted/70">
						Drag a card into a pocket, or click it to pick it up.
					</p>
				{/if}
			</div>

			{#if results.length === 0}
				<p class="p-4 text-sm text-muted">Nothing matches that query.</p>
			{:else}
				<ul class="grid grid-cols-3 gap-2 p-4">
					{#each results as row (row.printing.id)}
						{@const owned = ownedOf(row.printing.id)}
						<li>
							<button
								type="button"
								onpointerdown={(event) =>
									drag.press(event, { kind: 'search', printingId: row.printing.id })}
								ondragstart={(event) => event.preventDefault()}
								onclick={() => {
									// A drag ends in a click on the element it started from; that click isn't one.
									if (!drag.justDragged) held = held?.printing.id === row.printing.id ? null : row;
								}}
								title="{row.card.name} · {setLabel(row.printing.setId)} {row.printing
									.collectorNumber}{row.printing.locale !== DEFAULT_LOCALE
									? ` · ${row.printing.locale.toUpperCase()}`
									: ''}"
								class="relative block w-full cursor-grab rounded-lg transition-transform select-none
									hover:-translate-y-0.5 {owned === 0 ? 'card-veil' : ''} {held?.printing.id === row.printing.id
									? 'ring-2 ring-neon'
									: ''}"
							>
								<CardImage
									printingId={row.printing.id}
									thumbhash={row.printing.thumbhash}
									color={row.card.color}
									alt={row.card.name}
									sizes="110px"
									class="rounded-lg"
								/>
								<span
									class="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1
										rounded-b-lg bg-void/85 px-1 py-0.5 font-mono text-[0.55rem] text-muted
										tabular-nums"
								>
									<span class="truncate">{row.printing.collectorNumber}</span>
									{#if owned > 0}<span class="ml-auto text-neon-dim">×{owned}</span>{/if}
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</aside>
	{/if}
</div>
