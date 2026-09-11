/**
 * FAQs — a separate resource from card detail, at `GET /api/faqs/{game}`
 * (`scripts/lib/netdeck.ts`'s `fetchFaqs`), not nested under a card's own endpoint.
 *
 * `scope: "card"` entries attach to one Card (`groupFaqsByCardSlug`); `scope: "game"` entries are
 * general rulings tied to none (`normalizeGeneralFaqs`), and live on `Snapshot.generalFaqs`
 * instead of any Card.
 *
 * Answers (and questions) carry their own `[Bracket]` markup — a different, less disciplined
 * scheme than `rules_text`'s `{Keyword}` braces: casing is inconsistent (`[PLAY]` vs `[Play]`)
 * and at least one token is a typo (`[ADRENALIINE]`). Not worth a `rules-text.ts`-style segment
 * parser with vocabulary validation over ~33 occurrences in 245 answers — `segmentFaqText` just
 * bolds whatever is inside the brackets, typos included, at render time.
 */
import * as v from 'valibot';

const text = (field: string) => v.string(`${field}: expected a string`);
const nonEmptyText = (field: string) =>
	v.pipe(text(field), v.nonEmpty(`${field}: expected a non-empty string`));
const count = (field: string) => v.number(`${field}: expected a number`);

// ---------------------------------------------------------------------------
// The source API's shape
// ---------------------------------------------------------------------------

export const NetdeckFaqCardSchema = v.object({
	id: nonEmptyText('faq.card.id'),
	external_id: nonEmptyText('faq.card.external_id'),
	name: nonEmptyText('faq.card.name'),
	slug: nonEmptyText('faq.card.slug'),
	image_url: nonEmptyText('faq.card.image_url')
});

export const NetdeckFaqSchema = v.object({
	id: nonEmptyText('faq.id'),
	scope: v.picklist(['game', 'card'], 'faq.scope: expected "game" or "card"'),
	question: nonEmptyText('faq.question'),
	answer: nonEmptyText('faq.answer'),
	sort_order: count('faq.sort_order'),
	published_at: nonEmptyText('faq.published_at'),
	card: v.nullable(NetdeckFaqCardSchema)
});
export type NetdeckFaq = v.InferOutput<typeof NetdeckFaqSchema>;

export const NetdeckFaqPageSchema = v.object({
	game: v.object({
		id: nonEmptyText('faqs.game.id'),
		code: nonEmptyText('faqs.game.code'),
		name: nonEmptyText('faqs.game.name')
	}),
	updated_at: nonEmptyText('faqs.updated_at'),
	items: v.array(NetdeckFaqSchema, 'faqs.items: expected an array'),
	total: count('faqs.total')
});
export type NetdeckFaqPage = v.InferOutput<typeof NetdeckFaqPageSchema>;

// ---------------------------------------------------------------------------
// Our model
// ---------------------------------------------------------------------------

export const FaqSchema = v.object({
	id: v.pipe(v.string(), v.nonEmpty()),
	question: v.pipe(v.string(), v.nonEmpty()),
	answer: v.pipe(v.string(), v.nonEmpty()),
	sortOrder: v.number()
});
export type Faq = v.InferOutput<typeof FaqSchema>;

function normalizeFaq(raw: NetdeckFaq): Faq {
	return { id: raw.id, question: raw.question, answer: raw.answer, sortOrder: raw.sort_order };
}

const bySortOrder = (a: Faq, b: Faq) => a.sortOrder - b.sortOrder;

/** Card-scope entries, grouped by the card slug they attach to and sorted within each group. */
export function groupFaqsByCardSlug(faqs: readonly NetdeckFaq[]): ReadonlyMap<string, Faq[]> {
	const bySlug = new Map<string, Faq[]>();
	for (const raw of faqs) {
		if (raw.scope !== 'card' || raw.card === null) continue;
		const list = bySlug.get(raw.card.slug) ?? [];
		list.push(normalizeFaq(raw));
		bySlug.set(raw.card.slug, list);
	}
	for (const list of bySlug.values()) list.sort(bySortOrder);
	return bySlug;
}

/** Game-scope entries — general rulings, tied to no Card. */
export function normalizeGeneralFaqs(faqs: readonly NetdeckFaq[]): Faq[] {
	return faqs
		.filter((raw) => raw.scope === 'game')
		.map(normalizeFaq)
		.sort(bySortOrder);
}

/** One plain-text run, or a `[Bracket]`'s contents to render bold. Brackets are stripped either
 * way — `[Spend Icon:]` renders as `Spend Icon:`, bold. */
export type FaqSegment = { text: string; bold: boolean };

/**
 * Splits on `[Bracket]` tokens with no vocabulary lookup — see the module comment for why this
 * stays this simple. A typo in the source (`[ADRENALIINE]`) renders bold and misspelled, exactly
 * as printed; fixing it here would be silently inventing data.
 */
export function segmentFaqText(raw: string): FaqSegment[] {
	const segments: FaqSegment[] = [];
	let cursor = 0;

	for (const match of raw.matchAll(/\[([^\]]+)\]/g)) {
		if (match.index > cursor) segments.push({ text: raw.slice(cursor, match.index), bold: false });
		segments.push({ text: match[1], bold: true });
		cursor = match.index + match[0].length;
	}
	if (cursor < raw.length) segments.push({ text: raw.slice(cursor), bold: false });

	return segments;
}
