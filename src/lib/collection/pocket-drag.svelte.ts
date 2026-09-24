/**
 * Dragging a card into a Pocket, with inertia.
 *
 * **Why this is hand-rolled rather than HTML5 drag-and-drop.** Native DnD gives you a
 * browser-drawn drag image you cannot animate, no velocity, no tilt, and no control over the drop
 * transition — and it is a dead end on touch. An arrangement is the whole point of a Binder, so
 * the act of arranging should feel physical: the card trails the cursor, banks into a turn, and
 * then glides into the pocket — or back where it came from. That needs pointer events and a frame
 * loop.
 *
 * **Two phases, two different models**, because they want different things.
 *
 * *On pickup*, the ghost grows to the size a Pocket will hold it at — a card dragged out of the
 * search panel starts at thumbnail size and more than doubles. The card in your hand is the thing
 * you are about to place, so it should already be that size; resizing it at the moment of the drop
 * instead made the landing the loudest part of the gesture.
 *
 * *While dragging*, the ghost is a mass on a spring anchored to the pointer. It is never set equal
 * to the pointer, which is what makes it lag and swing; its horizontal velocity drives the tilt, so
 * the banking comes out of the same state rather than being a separate animation. Fixed-step
 * integration with an accumulator, not per-frame `dt` scaling: a spring integrated with a variable
 * step changes its own stiffness with the frame rate, so the same flick would feel different on a
 * 60Hz and a 144Hz display, and a long frame can make it explode.
 *
 * *Once released*, it is a **tween**, and the spring is switched off entirely. A spring landing
 * jiggled: carried velocity meant the card arrived, overshot the Pocket, came back, and rocked as
 * its tilt unwound — three things happening at the settle point, which reads as a wobble rather
 * than as weight. A tween over a fixed duration with an ease-out curve is monotonic by
 * construction, so the card cannot overshoot and every property (position, tilt, scale, fade)
 * finishes together on one clock. The trade is that the flick's momentum doesn't carry into the
 * drop; ease-out starts fast, which covers the handover.
 *
 * Under `prefers-reduced-motion` the ghost tracks the pointer exactly, with no tilt and no landing
 * animation. Dragging still works; it just stops being a performance.
 */
import { printingRow } from './printing-search.js';

export type DragPayload =
	/** A card already in the Binder, being rearranged. */
	| { kind: 'pocket'; page: number; pocket: number; printingId: string }
	/** A card from the search panel, on its way in for the first time. */
	| { kind: 'search'; printingId: string };

/**
 * Where a drag can land.
 *
 * `remove` is the search panel: dragging a card out of the Binder and back to where cards come
 * from is the natural inverse of dragging one in, and it beats hunting for the small ✕ that
 * appears on hover.
 */
export type DropZone = { kind: 'pocket'; page: number; pocket: number } | { kind: 'remove' };

/** Movement before a press becomes a drag rather than a click. */
const MOUSE_SLOP = 4;
/**
 * Touch drags wait for a hold instead. With a 4px threshold, every attempt to scroll the page by
 * swiping over a card would pick the card up instead — so touch has to distinguish "I'm moving the
 * page" from "I'm moving this card", and holding still is the signal.
 */
const TOUCH_HOLD_MS = 180;
const TOUCH_SLOP = 10;

/**
 * Physics, in fixed steps. Tuned by feel; see the file comment for why the step is fixed.
 *
 * These were all livelier on the first pass and it read as jitter rather than as weight. `DAMPING`
 * multiplies velocity each step, so **lower means more friction** — it and `STIFFNESS` came down
 * together, which kills the ringing around the settle point without making the card feel floaty.
 * The tilt is gentler and eased more slowly, because tilt is driven by velocity and velocity is
 * the noisiest thing here: at the old numbers a twitch of the mouse rocked the card visibly.
 */
const STEP_MS = 1000 / 120;
const STIFFNESS = 0.2;
const DAMPING = 0.68;
const TILT_PER_VELOCITY = 0.7;
const MAX_TILT = 10;
const TILT_EASE = 0.12;
const SCALE_EASE = 0.14;

/**
 * The landing tween's length: a floor, plus a little per pixel travelled, capped.
 *
 * Distance-scaled rather than fixed, because a nudge into the next Pocket and a throw across three
 * pages are the same gesture at very different sizes, and one duration makes one of them wrong —
 * the short move crawls or the long one teleports.
 */
const LANDING_MIN_MS = 190;
const LANDING_MAX_MS = 340;
const LANDING_MS_PER_PX = 0.35;
/** A card leaving the Binder doesn't travel, so its fade gets a fixed length instead. */
const REMOVAL_MS = 190;

/** Auto-scroll band at the top and bottom of the viewport, for dragging to a page off-screen. */
const EDGE_BAND = 96;
const EDGE_SPEED = 20;

/** Set by the Pocket markup; hit-testing looks for this and `REMOVE_ATTRIBUTE`, nothing else. */
export const POCKET_ATTRIBUTE = 'data-pocket';
/** Set by whatever region means "drop here to take this out of the Binder". */
export const REMOVE_ATTRIBUTE = 'data-drop-remove';

export function pocketKey(page: number, pocket: number): string {
	return `${page},${pocket}`;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/**
 * Ease-out cubic.
 *
 * Fastest at the start, so the tween picks up roughly where the drag left off, and monotonic, so
 * the card approaches the Pocket without ever passing it.
 */
function easeOut(t: number): number {
	return 1 - (1 - t) ** 3;
}

function prefersReducedMotion(): boolean {
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export type PocketDragOptions = {
	/**
	 * Commits the drop. Awaited, and the ghost stays up until it resolves — it sits over the
	 * destination Pocket, so the round trip reads as the card landing rather than as a flicker.
	 */
	onDrop: (payload: DragPayload, zone: DropZone) => Promise<void>;
};

export class PocketDrag {
	/** What is in the air, or `null`. Also the "is a drag happening" flag. */
	payload = $state<DragPayload | null>(null);
	/** What is under the pointer, if it's something this card can be dropped on. */
	over = $state<DropZone | null>(null);

	/** Ghost geometry, in viewport pixels — read straight into the ghost's `style`. */
	x = $state(0);
	y = $state(0);
	width = $state(0);
	height = $state(0);
	rotation = $state(0);
	scale = $state(1);
	/** Only ever leaves 1 on the way out: a removed card shrinks and fades where you dropped it. */
	opacity = $state(1);
	/**
	 * A Pocket's corner radius in CSS pixels, measured at pickup.
	 *
	 * The ghost has to divide this by its own `scale` to get the radius it should set, because a
	 * transform scales corners along with everything else: at pocket size a card out of the search
	 * panel is scaled ~1.3×, which turned a 16px radius into a visibly rounder 21px one.
	 */
	pocketRadius = $state(0);

	/** True from pointerup until the ghost has settled and the drop has been committed. */
	landing = $state(false);

	/**
	 * Set the moment a press becomes a drag, and cleared by the next press.
	 *
	 * A drag still ends in a `click` on the element it started from, so anything that is both
	 * draggable and clickable has to be able to tell "I was clicked" from "I was just dragged".
	 */
	justDragged = $state(false);

	readonly #options: PocketDragOptions;

	// Everything below is deliberately not `$state`: it changes every frame, and nothing renders
	// from it. Making it reactive would mean up to 120 invalidations a second for no redraw.
	#pointerX = 0;
	#pointerY = 0;

	/** Where the pointer sits within the card, so the card doesn't jump on pickup. */
	#grabX = 0;
	#grabY = 0;

	/** The spring's anchor: the pointer while dragging, a Pocket or the origin once released. */
	#anchorX = 0;
	#anchorY = 0;
	#ghostVelocityX = 0;
	#ghostVelocityY = 0;
	#targetScale = 1;
	#targetOpacity = 1;

	#origin: { x: number; y: number } | null = null;

	/** The landing tween, set on release and read every frame until it finishes. */
	#land: {
		from: { x: number; y: number; rotation: number; scale: number; opacity: number };
		to: { x: number; y: number; rotation: number; scale: number; opacity: number };
		duration: number;
	} | null = null;

	/**
	 * Whether the window listeners are attached.
	 *
	 * Also what makes teardown safe on the server: this is constructed during SSR, where Svelte
	 * still runs `onDestroy` once the render is done — and `window` doesn't exist there. Nothing
	 * can have been attached in that case, so nothing needs detaching.
	 */
	#listening = false;

	#frameId: number | null = null;
	#lastFrameAt = 0;
	#accumulator = 0;
	#releasedAt = 0;
	#reduced = false;

	/** The press that hasn't become a drag yet. */
	#pending: {
		payload: DragPayload;
		element: HTMLElement;
		pointerId: number;
		startX: number;
		startY: number;
		touch: boolean;
		holdTimer: ReturnType<typeof setTimeout> | null;
	} | null = null;

	constructor(options: PocketDragOptions) {
		this.#options = options;
	}

	/** The Pocket the dragged card came from, which should render empty while it's in the air. */
	get sourceKey(): string | null {
		const { payload } = this;
		return payload?.kind === 'pocket' ? pocketKey(payload.page, payload.pocket) : null;
	}

	/** The Pocket under the pointer, for the markup to ring. `null` over anything else. */
	get overKey(): string | null {
		return this.over?.kind === 'pocket' ? pocketKey(this.over.page, this.over.pocket) : null;
	}

	/** True while releasing would take the card out of the Binder. */
	get overRemove(): boolean {
		return this.over?.kind === 'remove';
	}

	/**
	 * Call from `onpointerdown` on anything draggable.
	 *
	 * Doesn't start the drag: a press is still a click until it proves otherwise, and a press on a
	 * card is also how you scroll on a touchscreen.
	 */
	press(event: PointerEvent, payload: DragPayload): void {
		// Left button only, and never while something is already in the air.
		if (event.button !== 0 || this.payload) return;

		const element = (event.currentTarget as HTMLElement | null) ?? null;
		if (!element) return;

		this.cancelPress();
		this.justDragged = false;

		const touch = event.pointerType !== 'mouse';
		this.#pending = {
			payload,
			element,
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			touch,
			holdTimer: touch
				? setTimeout(() => {
						if (this.#pending) this.#begin(this.#pending.startX, this.#pending.startY);
					}, TOUCH_HOLD_MS)
				: null
		};

		window.addEventListener('pointermove', this.#onPointerMove);
		window.addEventListener('pointerup', this.#onPointerUp);
		window.addEventListener('pointercancel', this.#onPointerCancel);
		this.#listening = true;
	}

	/** Lets a click through: the press never became a drag. */
	cancelPress(): void {
		if (this.#pending?.holdTimer) clearTimeout(this.#pending.holdTimer);
		this.#pending = null;
	}

	/** Releases every listener and stops the loop — for `onDestroy`. */
	destroy(): void {
		this.cancelPress();
		if (this.payload) this.#clear();
		this.#stopLoop();
		this.#teardownListeners();
	}

	#onPointerMove = (event: PointerEvent) => {
		const pending = this.#pending;

		if (pending && !this.payload) {
			const distance = Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY);

			// On touch, moving before the hold elapses means the gesture was a scroll all along.
			if (pending.touch) {
				if (distance > TOUCH_SLOP) this.cancelPress();
				return;
			}

			if (distance < MOUSE_SLOP) return;
			this.#begin(event.clientX, event.clientY);
		}

		if (!this.payload || this.landing) return;

		// Stops the browser turning the drag into a text selection or a native image drag.
		event.preventDefault();
		this.#sample(event.clientX, event.clientY);
		this.over = this.#targetAt(event.clientX, event.clientY);
	};

	#onPointerUp = () => {
		if (!this.payload) {
			this.cancelPress();
			this.#teardownListeners();
			return;
		}

		void this.#release(this.over).finally(() => this.#teardownListeners());
	};

	/**
	 * A cancelled pointer is not a drop.
	 *
	 * The browser fires `pointercancel` when it takes the gesture over — most often because a touch
	 * drag turned into a pan. Treating that as a release would commit a move the user never made, so
	 * it flies the card home and commits nothing.
	 */
	#onPointerCancel = () => {
		if (!this.payload) {
			this.cancelPress();
			this.#teardownListeners();
			return;
		}

		void this.#release(null).finally(() => this.#teardownListeners());
	};

	#teardownListeners(): void {
		if (!this.#listening) return;
		this.#listening = false;
		window.removeEventListener('pointermove', this.#onPointerMove);
		window.removeEventListener('pointerup', this.#onPointerUp);
		window.removeEventListener('pointercancel', this.#onPointerCancel);
	}

	#begin(clientX: number, clientY: number): void {
		const pending = this.#pending;
		if (!pending) return;

		if (pending.holdTimer) clearTimeout(pending.holdTimer);
		const rect = pending.element.getBoundingClientRect();

		this.#reduced = prefersReducedMotion();
		this.justDragged = true;
		this.payload = pending.payload;
		this.landing = false;
		this.over = this.#targetAt(clientX, clientY);

		this.width = rect.width;
		this.height = rect.height;
		this.x = rect.left;
		this.y = rect.top;
		this.rotation = 0;
		this.scale = 1;
		this.opacity = 1;

		// Picked up at its own size, then grown to *exactly* Pocket size: what you're carrying is
		// the thing you're about to place, so it should be that size in your hand rather than
		// resizing at the last instant. No extra lift on top — a card 4% larger than the Pocket it
		// was heading for read as "slightly wrong size", and the ring and shadow already say it's in
		// hand. For a card already in a Pocket the ratio is 1, so nothing changes.
		const pocket = this.#measurePocket(rect.width);
		this.#targetScale = this.#reduced ? 1 : pocket.ratio;
		this.pocketRadius = pocket.radius;
		this.#targetOpacity = 1;

		this.#grabX = clientX - rect.left;
		this.#grabY = clientY - rect.top;
		this.#origin = { x: rect.left, y: rect.top };

		this.#pointerX = clientX;
		this.#pointerY = clientY;
		this.#anchorX = rect.left;
		this.#anchorY = rect.top;
		this.#ghostVelocityX = 0;
		this.#ghostVelocityY = 0;

		// The pointer is captured so a fast drag that outruns the element keeps sending events.
		try {
			pending.element.setPointerCapture(pending.pointerId);
		} catch {
			// Safari throws if the pointer has already been released; the window listeners cover it.
		}

		// A drag across a page of cards would otherwise select every caption it crossed, and the
		// cursor would keep claiming the card is clickable while it's already in the air.
		document.body.style.userSelect = 'none';
		document.body.style.cursor = 'grabbing';

		this.#startLoop();
	}

	/**
	 * A Pocket's size relative to the element being dragged, and its corner radius.
	 *
	 * Measured off the first Pocket on the page rather than the drop target, because at pickup there
	 * isn't one yet — and every Pocket on a page is identical, so any of them answers both
	 * questions. Falls back to "no growth" if there is nothing to measure: no Pockets means no drop
	 * is possible anyway, so the only thing at stake is how the ghost looks on its way home.
	 */
	#measurePocket(sourceWidth: number): { ratio: number; radius: number } {
		const pocket = document.querySelector(`[${POCKET_ATTRIBUTE}]`);
		if (!pocket || sourceWidth === 0) return { ratio: 1, radius: 0 };

		const width = pocket.getBoundingClientRect().width;
		return {
			ratio: width === 0 ? 1 : width / sourceWidth,
			radius: Number.parseFloat(getComputedStyle(pocket).borderTopLeftRadius) || 0
		};
	}

	/**
	 * The latest pointer position, which is all the spring needs.
	 *
	 * Pointer *velocity* used to be smoothed and tracked here to carry the flick through the
	 * release. The landing is a tween now, so nothing consumes it — and the tilt never did: it
	 * reads the ghost's own velocity, which is already smooth because a spring cannot jump.
	 */
	#sample(clientX: number, clientY: number): void {
		this.#pointerX = clientX;
		this.#pointerY = clientY;
	}

	/** What's under a point, by hit-testing the DOM — the ghost is `pointer-events: none`. */
	#targetAt(clientX: number, clientY: number): DropZone | null {
		const under = document.elementFromPoint(clientX, clientY);
		if (!under) return null;

		const pocket = under.closest(`[${POCKET_ATTRIBUTE}]`);
		if (pocket) return this.#pocketZone(pocket.getAttribute(POCKET_ATTRIBUTE));

		// Only a card that's *in* the Binder can be taken out of it. Dragging a search result back
		// onto the search panel is a no-op, so the panel isn't a target for it and the card flies
		// home instead of implying something happened.
		if (this.payload?.kind === 'pocket' && under.closest(`[${REMOVE_ATTRIBUTE}]`)) {
			return { kind: 'remove' };
		}

		return null;
	}

	#pocketZone(raw: string | null): DropZone | null {
		if (!raw) return null;

		const [page, pocket] = raw.split(',').map(Number);
		if (!Number.isInteger(page) || !Number.isInteger(pocket)) return null;

		const { payload } = this;
		// Dropping a card back where it started is a no-op, so it isn't a target — which also stops
		// its own Pocket lighting up as you pick it up.
		if (payload?.kind === 'pocket' && payload.page === page && payload.pocket === pocket) {
			return null;
		}

		return { kind: 'pocket', page, pocket };
	}

	async #release(zone: DropZone | null): Promise<void> {
		const payload = this.payload;
		if (!payload || this.landing) return;

		this.landing = true;
		this.#releasedAt = performance.now();

		if (zone?.kind === 'remove') {
			// Nowhere to land: the card is leaving. It shrinks and fades where it was let go, which
			// reads as "gone" without pretending it flew into the panel — the panel is a whole column,
			// and animating to the middle of it would look like a misfire.
			this.#targetScale = 0.6;
			this.#targetOpacity = 0;
		} else if (zone) {
			// The destination's own rect, so the ghost lands exactly where the card will be — and
			// scales to it, which matters most dragging out of the search panel, where the card
			// being dragged is smaller than a Pocket.
			const element = document.querySelector<HTMLElement>(
				`[${POCKET_ATTRIBUTE}="${pocketKey(zone.page, zone.pocket)}"]`
			);
			const rect = element?.getBoundingClientRect();
			if (rect) {
				// Centres, not corners. The ghost scales about its own centre, which means scaling
				// never moves that centre — so aligning centres and scaling to the Pocket's width
				// lands the card exactly on it, whatever the scale is doing at the time.
				this.#anchorX = rect.left + (rect.width - this.width) / 2;
				this.#anchorY = rect.top + (rect.height - this.height) / 2;
				this.#targetScale = this.width === 0 ? 1 : rect.width / this.width;
			}
		} else if (this.#origin) {
			this.#anchorX = this.#origin.x;
			this.#anchorY = this.#origin.y;
			this.#targetScale = 1;
		}

		this.#beginLanding(zone?.kind === 'remove');

		// Commit and settle run together on purpose: the request is in flight while the card flies,
		// so the two costs overlap instead of queueing.
		const committed = zone
			? this.#options.onDrop(payload, zone).catch(() => undefined)
			: Promise.resolve();

		await Promise.all([committed, this.#settled()]);
		this.#clear();
	}

	/**
	 * Freezes where the card is and where it's going, and picks how long it should take.
	 *
	 * Snapshotting `from` is what makes the landing immune to the spring: whatever velocity the
	 * ghost was carrying is simply dropped here, so there is nothing left to oscillate.
	 */
	#beginLanding(removing: boolean): void {
		const distance = Math.hypot(this.#anchorX - this.x, this.#anchorY - this.y);

		this.#land = {
			from: {
				x: this.x,
				y: this.y,
				rotation: this.rotation,
				scale: this.scale,
				opacity: this.opacity
			},
			to: {
				x: this.#anchorX,
				y: this.#anchorY,
				// Straight by the time it's down: a card sitting in a Pocket at an angle is a bug.
				rotation: 0,
				scale: this.#targetScale,
				opacity: this.#targetOpacity
			},
			duration: removing
				? REMOVAL_MS
				: clamp(LANDING_MIN_MS + distance * LANDING_MS_PER_PX, LANDING_MIN_MS, LANDING_MAX_MS)
		};
	}

	/** Advances the landing tween. True once it has finished. */
	#advanceLanding(now: number): boolean {
		const land = this.#land;
		if (!land) return true;

		const progress = clamp((now - this.#releasedAt) / land.duration, 0, 1);
		const eased = easeOut(progress);
		const mix = (from: number, to: number) => from + (to - from) * eased;

		this.x = mix(land.from.x, land.to.x);
		this.y = mix(land.from.y, land.to.y);
		this.rotation = mix(land.from.rotation, land.to.rotation);
		this.scale = mix(land.from.scale, land.to.scale);
		this.opacity = mix(land.from.opacity, land.to.opacity);

		return progress === 1;
	}

	#settled(): Promise<void> {
		if (this.#reduced) return Promise.resolve();

		return new Promise((resolve) => {
			this.#onSettled = resolve;
		});
	}

	#onSettled: (() => void) | null = null;

	#clear(): void {
		document.body.style.userSelect = '';
		document.body.style.cursor = '';
		this.#stopLoop();
		this.payload = null;
		this.over = null;
		this.landing = false;
		this.#origin = null;
		this.#land = null;
		this.#onSettled = null;
	}

	#startLoop(): void {
		this.#lastFrameAt = performance.now();
		this.#accumulator = 0;
		this.#frameId = requestAnimationFrame(this.#frame);
	}

	#stopLoop(): void {
		if (this.#frameId !== null) cancelAnimationFrame(this.#frameId);
		this.#frameId = null;
	}

	#frame = (now: number) => {
		// Capped, so a backgrounded tab doesn't come back and integrate a hundred steps at once.
		const elapsed = Math.min(now - this.#lastFrameAt, 64);
		this.#lastFrameAt = now;

		// The two phases share only the loop. Released, the spring is out of the picture entirely:
		// one tween drives every property to its destination and finishes on a known frame.
		if (this.landing) {
			if (this.#advanceLanding(now)) {
				this.#onSettled?.();
				this.#onSettled = null;
				return;
			}

			this.#frameId = requestAnimationFrame(this.#frame);
			return;
		}

		this.#autoScroll(elapsed);

		// The anchor keeps the point you grabbed under the cursor *as the card grows*, which needs
		// the current scale: the ghost scales about its centre, so an unscaled offset `g` from the
		// left edge ends up at `width/2 + (g - width/2) * scale`. Anchoring at `pointer - g` is only
		// right at scale 1 — a thumbnail grabbed near its corner slid out from under the pointer as
		// it more than doubled in size.
		this.#anchorX = this.#pointerX - this.width / 2 - (this.#grabX - this.width / 2) * this.scale;
		this.#anchorY = this.#pointerY - this.height / 2 - (this.#grabY - this.height / 2) * this.scale;

		if (this.#reduced) {
			this.x = this.#anchorX;
			this.y = this.#anchorY;
		} else {
			this.#accumulator += elapsed;
			while (this.#accumulator >= STEP_MS) {
				this.#integrate();
				this.#accumulator -= STEP_MS;
			}
		}

		this.#frameId = requestAnimationFrame(this.#frame);
	};

	/** The spring, which only runs while the card is in hand — the landing is a tween. */
	#integrate(): void {
		this.#ghostVelocityX = (this.#ghostVelocityX + (this.#anchorX - this.x) * STIFFNESS) * DAMPING;
		this.#ghostVelocityY = (this.#ghostVelocityY + (this.#anchorY - this.y) * STIFFNESS) * DAMPING;
		this.x += this.#ghostVelocityX;
		this.y += this.#ghostVelocityY;

		// Banking out of the card's own motion, not a separate animation — so it leans into a turn
		// and straightens as it slows, for free.
		const wanted = clamp(this.#ghostVelocityX * TILT_PER_VELOCITY, -MAX_TILT, MAX_TILT);
		this.rotation += (wanted - this.rotation) * TILT_EASE;
		this.scale += (this.#targetScale - this.scale) * SCALE_EASE;
	}

	/** Scrolls the window when the pointer is held near an edge, so page 3 is reachable. */
	#autoScroll(elapsed: number): void {
		const fromTop = this.#pointerY;
		const fromBottom = window.innerHeight - this.#pointerY;

		let delta = 0;
		if (fromTop < EDGE_BAND) delta = -(1 - fromTop / EDGE_BAND) * EDGE_SPEED;
		else if (fromBottom < EDGE_BAND) delta = (1 - fromBottom / EDGE_BAND) * EDGE_SPEED;
		if (delta === 0) return;

		// Scaled by frame time so the scroll runs at the same speed on any display.
		window.scrollBy(0, delta * (elapsed / 16.67));
	}
}

/** The card being dragged, for the ghost to render. `undefined` if nothing is in the air. */
export function draggedRow(drag: PocketDrag) {
	return drag.payload ? printingRow(drag.payload.printingId) : undefined;
}
