/**
 * Which marketplace product run holds each of our Printing Runs.
 *
 * Curated, like `#lib/cards/sets.ts`, and for the same reason: neither marketplace exposes our
 * Set Identifier, and neither has a join key to the source API (netdeck carries no marketplace id
 * of any kind — `docs/research/prices.md` §3.4). A run is `<setId>|<treatment>|<locale>`, because
 * retail and beta share one printed Set Identifier but are different products with different prices.
 *
 * What is deliberately **absent** is as important as what is here:
 *
 * - **No French run.** Neither marketplace lists one (2026-10-07). Never borrow the English
 *   price — different product, and 157 printings would show a number that is not theirs.
 * - **No `PRM-DD1`, `PRM-DD2`, `PRR02-WNC`, `NCS01-WNC` on TCGplayer**, and no retail, `EOR01` or
 *   `NCB01` on Cardmarket. A run with no entry here has no price, and the UI says so.
 *
 * Retail groups are mapped now, although both marketplaces list them as presale until 2026-11-06:
 * they carry no market price yet, so they resolve to "no price" and light up on their own at launch
 * with no further change.
 */
import { printTreatment } from '../cards/derive.ts';
import type { Printing } from '../cards/schema.ts';
import { DEFAULT_LOCALE, type Locale } from '../cards/vocabulary.ts';

export type Run = { setId: string; beta: boolean; locale: Locale };

export function runKey({ setId, beta, locale }: Run): string {
	return `${setId}|${beta ? 'beta' : 'retail'}|${locale}`;
}

export function runOf(printing: Printing): Run {
	return {
		setId: printing.setId,
		beta: printTreatment(printing) === 'beta',
		locale: printing.locale
	};
}

const en = (setId: string, beta: boolean): string =>
	runKey({ setId, beta, locale: DEFAULT_LOCALE });

/** TCGplayer `groupId`s under TCGCSV category 92 ("Cyberpunk TCG"). */
export const TCGPLAYER_GROUPS: ReadonlyMap<string, number> = new Map([
	[en('MS01-WNC', true), 24845], // Welcome to Night City - Beta
	[en('MS01-WNC', false), 24855], // Welcome to Night City - Retail
	[en('SD01-HEI', true), 24847], // The Heist - Beta Starter Deck
	[en('SD01-HEI', false), 24859], // The Heist - Retail Starter Deck
	[en('SD02-EBP', true), 24846], // Embracing Power - Beta Starter Deck
	[en('SD02-EBP', false), 24858], // Embracing Power - Retail Starter Deck
	[en('PRM-WNC', true), 24848], // Box Toppers - Beta
	[en('PRM-WNC', false), 24857], // Box Toppers - Retail
	[en('PRR01-WNC', false), 24880], // Pre-Release Beta (printed PRR01; no β prefix)
	[en('PRM01', false), 24860], // Set 1 Promos
	[en('EOR01-WNC', false), 24883], // Edgerunner Open Season 1
	[en('NCB01-WNC', false), 24884] // Night City Brawl Season 1
]);

/**
 * TCGplayer groups that exist and are knowingly not mapped. Anything in the listing that is in
 * neither this nor `TCGPLAYER_GROUPS` is reported by `pnpm prices`, so a new set cannot arrive
 * unnoticed.
 */
export const IGNORED_TCGPLAYER_GROUPS: ReadonlyMap<number, string> = new Map([
	[24881, 'Alpha Kit — a one-product demo kit with no printing of ours']
]);

/**
 * Cardmarket `idExpansion`s. Retail has none (0 cards, 2026-10-07). These ids were inferred from
 * product counts and names, not read off a labelled list, so `checkPriceInvariants` requires
 * nearly every one of our names to be found inside its expansion — a wrong id fails the run
 * instead of mapping the wrong cards.
 */
export const CARDMARKET_EXPANSIONS: ReadonlyMap<string, number> = new Map([
	[en('MS01-WNC', true), 6714],
	[en('SD01-HEI', true), 6715],
	[en('SD02-EBP', true), 6716],
	[en('PRM-WNC', true), 6717],
	[en('PRR01-WNC', false), 6718],
	[en('PRM01', false), 6719],
	[en('PRM-DD1', false), 6720],
	[en('PRM-DD2', false), 6721]
]);
