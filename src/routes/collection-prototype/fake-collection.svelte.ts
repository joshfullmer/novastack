/**
 * PROTOTYPE — throwaway. Delete this whole folder once a variant wins.
 *
 * In-memory fake state, shaped to the model settled in
 * `docs/adr/0003-the-collection-is-flat-and-binders-are-showcases.md`:
 *
 *   Collection — one flat, unnamed, always-private map of printing → quantity. Ownership.
 *   Binder     — several, named, shareable, Pages of Pockets. A Pocket holds at most one
 *                printing and **no quantity**, and may be deliberately empty. Display only.
 *   Wantlist   — several, named, unordered, target quantity per printing.
 *
 * All three are independent: nothing here ever sums a Binder into a Collection total, and a
 * Pocket's printing need not be owned.
 *
 * No persistence, on purpose — the storage shape is what the prototype is checking, not something
 * it should depend on. Card data is real; holdings are seeded from a deterministic PRNG so every
 * variant shows the identical collection.
 */
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { collectorNumberSortKey, printTreatment, type PrintTreatment } from '#lib/cards/derive.js';
import { dataset } from '#lib/cards/index.js';
import type { Card, Printing } from '#lib/cards/schema.js';

export type Slot = { card: Card; printing: Printing };

/** Every (Card, Printing) pair in the dataset — 698 of them. */
export const slots: readonly Slot[] = dataset.cards.flatMap((card) =>
	card.printings.map((printing) => ({ card, printing }))
);

export const slotByPrintingId = new SvelteMap(slots.map((slot) => [slot.printing.id, slot]));

export const setsById = new SvelteMap(dataset.sets.map((set) => [set.id, set]));

/**
 * Slots grouped by Set, in the dataset's own set order, and **within a Set in printed
 * collector-number order** — not by card name.
 *
 * Collector number is the order the physical set is in, so it's the order someone holding the
 * cards is working in. It also puts a card's alt-art printings adjacent to each other, which is
 * how the printed run reads. `collectorNumberSortKey` (`#lib/cards/derive.ts`) is the existing
 * comparator: numeric part first so `9` precedes `10`, then verbatim so `005a` precedes `005b`.
 */
export const slotsBySet = dataset.sets
	.map((set) => ({
		set,
		slots: slots
			.filter((slot) => slot.printing.setId === set.id)
			.sort((a, b) => {
				const [aNumber, aText] = collectorNumberSortKey(a.printing.collectorNumber);
				const [bNumber, bText] = collectorNumberSortKey(b.printing.collectorNumber);
				return aNumber - bNumber || aText.localeCompare(bText);
			})
	}))
	.filter((group) => group.slots.length > 0);

function seeded(seed: number) {
	let state = seed;
	return () => (state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

// ---------------------------------------------------------------------------
// The Collection — flat, one per user, always private
// ---------------------------------------------------------------------------

export const collection = new SvelteMap<string, number>();
{
	const random = seeded(20260923);
	for (const slot of slots) {
		if (random() > 0.45) continue; // a realistically patchy 45%
		collection.set(slot.printing.id, 1 + Math.floor(random() * 4));
	}
}

/** Owned Count — a single lookup, never an aggregate. */
export function ownedCount(printingId: string): number {
	return collection.get(printingId) ?? 0;
}

export function adjust(printingId: string, delta: number) {
	const next = ownedCount(printingId) + delta;
	if (next <= 0) collection.delete(printingId);
	else collection.set(printingId, next);
}

export function distinctOwned(): number {
	return collection.size;
}

export function totalCopies(): number {
	let total = 0;
	for (const quantity of collection.values()) total += quantity;
	return total;
}

// ---------------------------------------------------------------------------
// The Collecting Goal — what "Complete" means to this user
// ---------------------------------------------------------------------------

/**
 * A **Printing Run** is one Set in one Print Treatment and one Locale — the unit that was
 * physically manufactured as a batch, and so the unit a collector decides about. Seventeen exist
 * today; combinations that were never printed (there is no French beta run) are never offered.
 *
 * The Goal is a flat set of Runs rather than a Set list crossed with Treatment and Locale lists,
 * because a cross product cannot express a diagonal — the Base Set's beta and French runs without
 * its English retail run, which is exactly the kind of thing collectors want.
 */
export type PrintingRun = {
	key: string;
	setId: string;
	setName: string;
	treatment: PrintTreatment;
	locale: string;
	printings: number;
};

export function runKey(setId: string, treatment: PrintTreatment, locale: string): string {
	return `${setId}|${treatment}|${locale}`;
}

/** Derived from the data, so a Run that was never printed cannot be listed. */
export const printingRuns: readonly PrintingRun[] = (() => {
	// A local accumulator that never escapes this IIFE — nothing observes it, so reactivity
	// would be pure overhead.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const counts = new Map<string, PrintingRun>();
	for (const slot of slots) {
		const treatment = printTreatment(slot.printing);
		const { setId, locale } = slot.printing;
		const key = runKey(setId, treatment, locale);
		const existing = counts.get(key);
		if (existing) existing.printings += 1;
		else
			counts.set(key, {
				key,
				setId,
				setName: setsById.get(setId)?.name ?? setId,
				treatment,
				locale,
				printings: 1
			});
	}
	return [...counts.values()].sort(
		(a, b) =>
			dataset.sets.findIndex((set) => set.id === a.setId) -
				dataset.sets.findIndex((set) => set.id === b.setId) ||
			a.treatment.localeCompare(b.treatment) ||
			a.locale.localeCompare(b.locale)
	);
})();

/** Runs grouped by Set, so the editor can hide the eight Sets that offer no choice. */
export const runsBySet = dataset.sets
	.map((set) => ({ set, runs: printingRuns.filter((run) => run.setId === set.id) }))
	.filter((group) => group.runs.length > 0);

/**
 * Defaults to every English retail Run — a denominator of 332 rather than 700. The full 698 shows
 * most collectors a permanent ceiling of 47%, over 218 Kickstarter-only beta printings they often
 * cannot buy.
 */
export const goal = new SvelteSet(
	printingRuns
		.filter((run) => run.treatment === 'retail' && run.locale === 'en')
		.map((run) => run.key)
);

export function runOf(slot: Slot): string {
	return runKey(slot.printing.setId, printTreatment(slot.printing), slot.printing.locale);
}

/** Is this Printing In Goal — i.e. does it count toward Completion? */
export function inGoal(slot: Slot): boolean {
	return goal.has(runOf(slot));
}

export function toggleRun(key: string) {
	if (goal.has(key)) goal.delete(key);
	else goal.add(key);
}

/** Every Printing In Goal. The denominator of every Completion figure on the page. */
export const goalSlots = () => slots.filter(inGoal);

/** Completion — owned over In Goal, never owned over the whole dataset. */
export function completion(): { owned: number; total: number; percent: number } {
	const scoped = goalSlots();
	const owned = scoped.filter((slot) => ownedCount(slot.printing.id) > 0).length;
	return {
		owned,
		total: scoped.length,
		percent: scoped.length === 0 ? 0 : Math.round((owned / scoped.length) * 100)
	};
}

/** Per-Set progress, counting only Printings In Goal — so a retail-only collector sees a Set's
 * retail total, not its retail-plus-beta total. `total: 0` means the Set is out of Goal entirely. */
export function setProgress(setId: string): { owned: number; total: number } {
	const group = slotsBySet.find((entry) => entry.set.id === setId);
	if (!group) return { owned: 0, total: 0 };
	const scoped = group.slots.filter(inGoal);
	let owned = 0;
	for (const slot of scoped) if (ownedCount(slot.printing.id) > 0) owned += 1;
	return { owned, total: scoped.length };
}

export function rarityProgress(): { rarity: string; owned: number; total: number }[] {
	const scoped = goalSlots();
	return dataset.rarities
		.map((rarity) => {
			const inRarity = scoped.filter((slot) => slot.printing.rarity === rarity);
			return {
				rarity,
				owned: inRarity.filter((slot) => ownedCount(slot.printing.id) > 0).length,
				total: inRarity.length
			};
		})
		.filter((row) => row.total > 0);
}

// ---------------------------------------------------------------------------
// Binders — showcases. Pages of Pockets, no quantities, gaps allowed.
// ---------------------------------------------------------------------------

/** `null` is a deliberately empty Pocket — a held space, not a missing row. */
export type Pocket = string | null;
export type Binder = {
	id: string;
	name: string;
	visibility: 'private' | 'shared';
	pages: Pocket[][];
};

export const POCKETS_PER_PAGE = 9;

export function emptyPage(): Pocket[] {
	return Array.from({ length: POCKETS_PER_PAGE }, () => null);
}

function seedBinders(): Binder[] {
	const random = seeded(4242);
	const owned = [...collection.keys()];
	const pick = () => owned[Math.floor(random() * owned.length)];

	/** Leaves real gaps — that's the affordance Q17 chose pockets for. */
	const page = (fill: number): Pocket[] => emptyPage().map(() => (random() < fill ? pick() : null));

	return [
		{
			id: 'b-trade',
			name: 'Trade binder',
			visibility: 'shared',
			pages: [page(0.85), page(0.6), page(0.25)]
		},
		{ id: 'b-art', name: 'Favourite art', visibility: 'private', pages: [page(0.75), emptyPage()] },
		{ id: 'b-legends', name: 'Legends, every printing', visibility: 'shared', pages: [page(0.5)] }
	];
}

export const binders = $state<Binder[]>(seedBinders());

export function place(binder: Binder, page: number, pocket: number, printingId: string) {
	binder.pages[page][pocket] = printingId;
}

export function clearPocket(binder: Binder, page: number, pocket: number) {
	binder.pages[page][pocket] = null;
}

export function addPage(binder: Binder) {
	binder.pages.push(emptyPage());
}

export function removePage(binder: Binder, page: number) {
	if (binder.pages.length > 1) binder.pages.splice(page, 1);
}

export function filledPockets(binder: Binder): number {
	return binder.pages.flat().filter((pocket) => pocket !== null).length;
}

export function totalPockets(binder: Binder): number {
	return binder.pages.length * POCKETS_PER_PAGE;
}

export function addBinder(name: string) {
	binders.push({
		id: `b-${crypto.randomUUID().slice(0, 8)}`,
		name,
		visibility: 'private',
		pages: [emptyPage()]
	});
}

/** Next free Pocket, or `null` when every Page is full. */
export function nextFreePocket(binder: Binder): { page: number; pocket: number } | null {
	for (const [page, pockets] of binder.pages.entries()) {
		const pocket = pockets.indexOf(null);
		if (pocket !== -1) return { page, pocket };
	}
	return null;
}

// ---------------------------------------------------------------------------
// Wantlists — unordered, target quantity per printing
// ---------------------------------------------------------------------------

export type Wantlist = {
	id: string;
	name: string;
	visibility: 'private' | 'shared';
	entries: SvelteMap<string, number>;
};

function seedWantlists(): Wantlist[] {
	const random = seeded(77);
	const chase = new SvelteMap<string, number>();
	const heist = new SvelteMap<string, number>();
	for (const slot of slots) {
		if (random() > 0.02) continue;
		(random() < 0.6 ? chase : heist).set(slot.printing.id, 1 + Math.floor(random() * 3));
	}
	return [
		{ id: 'w-chase', name: 'Chase printings', visibility: 'shared', entries: chase },
		{ id: 'w-heist', name: 'For the Heist deck', visibility: 'private', entries: heist }
	];
}

export const wantlists = $state<Wantlist[]>(seedWantlists());

export function wantedCopies(list: Wantlist): number {
	let total = 0;
	for (const quantity of list.entries.values()) total += quantity;
	return total;
}

export function adjustWant(list: Wantlist, printingId: string, delta: number) {
	const next = (list.entries.get(printingId) ?? 0) + delta;
	if (next <= 0) list.entries.delete(printingId);
	else list.entries.set(printingId, next);
}
