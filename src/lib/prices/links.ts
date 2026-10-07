/**
 * Where a quote's "buy" link goes.
 *
 * TCGplayer resolves a bare `/product/{id}` (checked 2026-10-07; the slug TCGCSV carries is
 * optional), so the snapshot stores ids and not URLs. Cardmarket's form is the one cyberdecktools
 * links with. Neither is an affiliate link: the snapshot carries no referral state, and a
 * commission would be a property of the URL built here, not of the data.
 */

export function tcgplayerUrl(productId: number): string {
	return `https://www.tcgplayer.com/product/${productId}`;
}

export function cardmarketUrl(productId: number): string {
	return `https://www.cardmarket.com/en/Cyberpunk/Products?idProduct=${productId}`;
}
