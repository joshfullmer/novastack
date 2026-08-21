import { error } from '@sveltejs/kit';
import { dataset } from '#lib/cards/index.js';

/**
 * One prerendered page per card. `entries` is what tells the prerenderer which slugs exist —
 * without it, a dynamic route has no crawlable starting point and nothing gets built.
 */
export function entries() {
	return dataset.cards.map((card) => ({ slug: card.slug }));
}

export function load({ params }: { params: { slug: string } }) {
	const card = dataset.bySlug.get(params.slug);
	if (card === undefined) error(404, `No card with slug "${params.slug}".`);
	return { card };
}
