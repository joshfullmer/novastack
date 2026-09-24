/**
 * Dragging a card into a Pocket, with inertia.
 *
 * **Why this is hand-rolled rather than HTML5 drag-and-drop.** Native DnD gives you a
 * browser-drawn drag image you cannot animate, no velocity, no tilt, and no control over the drop
 * transition — and it is a dead end on touch. An arrangement is the whole point of a Binder, so
 * the act of arranging should feel physical: the card trails the cursor, banks into a turn, and
 * either settles into the pocket or is flung back where it came from. That needs pointer events
 * and a frame loop.
 *
 * **The model.** The ghost is a mass on a spring anchored to the pointer. It is never set equal to
 * the pointer, which is what makes it lag, overshoot and swing; its horizontal velocity drives the
 * tilt, so the banking comes out of the same state rather than being a separate animation. On
 * release the anchor jumps to either the target Pocket or the card's origin, and the pointer's own
 * velocity is injected into the ghost — so a fast flick arcs past and swings back in, and a gentle
 * release just eases home.
 *
 * Fixed-step integration with an accumulator, not per-frame `dt` scaling: a spring integrated with
 * a variable step changes its own stiffness with the frame rate, so the same flick would feel
 * different on a 60Hz and a 144Hz display, and a long frame can make it explode.
 *
 * Under `prefers-reduced-motion` the ghost tracks the pointer exactly, with no tilt, no overshoot
 * and no settle animation. Dragging still works; it just stops being a performance.
 */
import { printingRow } from './printing-search.js';

export type DragPayload =
	/** A card already in the Binder, being rearranged. */
	| { kind: 'pocket'; page: number; pocket: number; printingId: string }
	/** A card from the search panel, on its way in for the first time. */
	| { kind: 'search'; printingId: string };

export type DropTarget = { page: number; pocket: number };

/** Movement before a press becomes a drag rather than a click. */
const MOUSE_SLOP = 4;
/**
 * Touch drags wait for a hold instead. With a 4px threshold, every attempt to scroll the page by
 * swiping over a card would pick the card up instead — so touch has to distinguish "I'm moving the
 * page" from "I'm moving this card", and holding still is the signal.
 */
const TOUCH_HOLD_MS = 180;
const TOUCH_SLOP = 10;

/** Physics, in fixed steps. Tuned by feel; see the file comment for why the step is fixed. */
const STEP_MS = 1000 / 120;
const STIFFNESS = 0.26;
const RELEASE_STIFFNESS = 0.34;
const DAMPING = 0.76;
const TILT_PER_VELOCITY = 1.05;
const MAX_TILT = 16;
const TILT_EASE = 0.2;
const LIFT_SCALE = 1.06;
const SCALE_EASE = 0.18;

/** Close enough, slow enough: the drop is over and the ghost can come down. */
const SETTLE_DISTANCE = 1.5;
const SETTLE_SPEED = 0.25;
/** A hard stop, so a drop can never leave a ghost stuck on screen. */
const MAX_SETTLE_MS = 900;

/** Auto-scroll band at the top and bottom of the viewport, for dragging to a page off-screen. */
const EDGE_BAND = 96;
const EDGE_SPEED = 20;

/** Set by the Pocket markup, and the only thing hit-testing looks for. */
export const POCKET_ATTRIBUTE = 'data-pocket';

export function pocketKey(page: number, pocket: number): string {
	return `${page},${pocket}`;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function prefersReducedMotion(): boolean {
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export type PocketDragOptions = {
	/**
	 * Commits the drop. Awaited, and the ghost stays up until it resolves — it sits over the
	 * destination Pocket, so the round trip reads as the card landing rather than as a flicker.
	 */
	onDrop: (payload: DragPayload, target: DropTarget) => Promise<void>;
};

export class PocketDrag {
	/** What is in the air, or `null`. Also the "is a drag happening" flag. */
	payload = $state<DragPayload | null>(null);
	/** The Pocket under the pointer, if any. */
	over = $state<DropTarget | null>(null);

	/** Ghost geometry, in viewport pixels — read straight into the ghost's `style`. */
	x = $state(0);
	y = $state(0);
	width = $state(0);
	height = $state(0);
	rotation = $state(0);
	scale = $state(1);

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
	/** Smoothed pointer velocity, px per millisecond. */
	#velocityX = 0;
	#velocityY = 0;
	#lastSampleAt = 0;

	/** Where the pointer sits within the card, so the card doesn't jump on pickup. */
	#grabX = 0;
	#grabY = 0;

	/** The spring's anchor: the pointer while dragging, a Pocket or the origin once released. */
	#anchorX = 0;
	#anchorY = 0;
	#ghostVelocityX = 0;
	#ghostVelocityY = 0;
	#targetScale = 1;

	#origin: { x: number; y: number } | null = null;

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

	get overKey(): string | null {
		return this.over ? pocketKey(this.over.page, this.over.pocket) : null;
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
		this.#targetScale = this.#reduced ? 1 : LIFT_SCALE;

		this.#grabX = clientX - rect.left;
		this.#grabY = clientY - rect.top;
		this.#origin = { x: rect.left, y: rect.top };

		this.#pointerX = clientX;
		this.#pointerY = clientY;
		this.#anchorX = rect.left;
		this.#anchorY = rect.top;
		this.#ghostVelocityX = 0;
		this.#ghostVelocityY = 0;
		this.#velocityX = 0;
		this.#velocityY = 0;
		this.#lastSampleAt = performance.now();

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

	/** One pointer position, and the velocity that release will inherit. */
	#sample(clientX: number, clientY: number): void {
		const now = performance.now();
		const elapsed = Math.max(now - this.#lastSampleAt, 1);
		this.#lastSampleAt = now;

		const instantX = (clientX - this.#pointerX) / elapsed;
		const instantY = (clientY - this.#pointerY) / elapsed;

		// Exponential smoothing: raw per-event deltas are far too noisy to tilt a card by, and a
		// single stuttery frame at the moment of release would otherwise fling it across the screen.
		this.#velocityX = this.#velocityX * 0.7 + instantX * 0.3;
		this.#velocityY = this.#velocityY * 0.7 + instantY * 0.3;

		this.#pointerX = clientX;
		this.#pointerY = clientY;
	}

	/** The Pocket under a point, by hit-testing the DOM — the ghost is `pointer-events: none`. */
	#targetAt(clientX: number, clientY: number): DropTarget | null {
		const element = document
			.elementFromPoint(clientX, clientY)
			?.closest(`[${POCKET_ATTRIBUTE}]`) as HTMLElement | null;

		const raw = element?.getAttribute(POCKET_ATTRIBUTE);
		if (!raw) return null;

		const [page, pocket] = raw.split(',').map(Number);
		if (!Number.isInteger(page) || !Number.isInteger(pocket)) return null;

		const { payload } = this;
		// Dropping a card back where it started is a no-op, so it isn't a target — which also stops
		// its own Pocket lighting up as you pick it up.
		if (payload?.kind === 'pocket' && payload.page === page && payload.pocket === pocket) {
			return null;
		}

		return { page, pocket };
	}

	async #release(target: DropTarget | null): Promise<void> {
		const payload = this.payload;
		if (!payload || this.landing) return;

		this.landing = true;
		this.#releasedAt = performance.now();

		if (target) {
			// The destination's own rect, so the ghost lands exactly where the card will be — and
			// scales to it, which matters most dragging out of the search panel, where the card
			// being dragged is smaller than a Pocket.
			const element = document.querySelector<HTMLElement>(
				`[${POCKET_ATTRIBUTE}="${pocketKey(target.page, target.pocket)}"]`
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

		// The flick carries through the release rather than stopping dead at it.
		if (!this.#reduced) {
			this.#ghostVelocityX += this.#velocityX * STEP_MS;
			this.#ghostVelocityY += this.#velocityY * STEP_MS;
		}

		// Commit and settle run together on purpose: the request is in flight while the card flies,
		// so the two costs overlap instead of queueing.
		const committed = target
			? this.#options.onDrop(payload, target).catch(() => undefined)
			: Promise.resolve();

		await Promise.all([committed, this.#settled()]);
		this.#clear();
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

		if (!this.landing) {
			this.#autoScroll(elapsed);
			this.#anchorX = this.#pointerX - this.#grabX;
			this.#anchorY = this.#pointerY - this.#grabY;
		}

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

		if (this.landing && this.#hasSettled(now)) {
			this.x = this.#anchorX;
			this.y = this.#anchorY;
			this.#onSettled?.();
			this.#onSettled = null;
			return;
		}

		this.#frameId = requestAnimationFrame(this.#frame);
	};

	#integrate(): void {
		const stiffness = this.landing ? RELEASE_STIFFNESS : STIFFNESS;

		this.#ghostVelocityX = (this.#ghostVelocityX + (this.#anchorX - this.x) * stiffness) * DAMPING;
		this.#ghostVelocityY = (this.#ghostVelocityY + (this.#anchorY - this.y) * stiffness) * DAMPING;
		this.x += this.#ghostVelocityX;
		this.y += this.#ghostVelocityY;

		// Banking out of the card's own motion, not a separate animation — so it leans into a turn
		// and straightens as it settles, for free.
		const wanted = this.landing
			? 0
			: clamp(this.#ghostVelocityX * TILT_PER_VELOCITY, -MAX_TILT, MAX_TILT);
		this.rotation += (wanted - this.rotation) * TILT_EASE;
		this.scale += (this.#targetScale - this.scale) * SCALE_EASE;
	}

	#hasSettled(now: number): boolean {
		const distance = Math.hypot(this.#anchorX - this.x, this.#anchorY - this.y);
		const speed = Math.hypot(this.#ghostVelocityX, this.#ghostVelocityY);
		if (distance < SETTLE_DISTANCE && speed < SETTLE_SPEED) return true;
		return now - this.#releasedAt > MAX_SETTLE_MS;
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
