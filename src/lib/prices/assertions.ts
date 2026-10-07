/**
 * What has to be true of a join before its result is written.
 *
 * Same stance as `#lib/cards/assertions.ts`, for the same reason: both sources are files we do not
 * control, and a wrong join is worse than no join — it puts a real, plausible-looking price on the
 * wrong card. So the curated ids in `marketplaces.ts` are *checked*, not trusted, and a violation
 * fails the run with the previous file left in place. Staleness is visible (every file carries its
 * source time); a mispriced card is not.
 */
import type { Violation } from '../cards/assertions.ts';
import { IGNORED_TCGPLAYER_GROUPS, TCGPLAYER_GROUPS } from './marketplaces.ts';
import type { PriceReport } from './mapping.ts';
import type { TcgcsvGroup } from './sources.ts';

/**
 * Name mismatches tolerated on the TCGplayer join, as a share of what mapped. Two exist today and
 * both are their typos (`Tetratonic Rippler`). Numbering drift — a renumbered set — shows up as a
 * *wall* of mismatches, which is the thing worth failing on.
 */
const NAME_MISMATCH_SHARE = 0.05;
const NAME_MISMATCH_FLOOR = 3;

/**
 * A wrong or swapped `idExpansion` finds almost none of our names; a right one finds most, but not
 * all — Cardmarket lists 3 of our 4 promo Printings, and a high bar would fail on a gap in their
 * catalogue that is not our mistake. Half is far from both: 4-card expansions can lose one card,
 * and a mix-up between two decks cannot reach it.
 */
const MIN_EXPANSION_NAME_HIT_RATE = 0.5;

export function checkPriceInvariants(report: PriceReport): Violation[] {
	const violations: Violation[] = [];
	const { tcgplayer, cardmarket } = report;

	if (tcgplayer.duplicateProducts.length > 0) {
		violations.push({
			check: 'tcgplayer-unique-products',
			detail:
				'two Printings joined to one TCGplayer product: ' +
				tcgplayer.duplicateProducts
					.map(({ productId, keys }) => `${productId} ← ${keys.join(', ')}`)
					.join('; ')
		});
	}

	const allowedMismatches = Math.max(
		NAME_MISMATCH_FLOOR,
		Math.floor(tcgplayer.mapped * NAME_MISMATCH_SHARE)
	);
	if (tcgplayer.nameMismatches.length > allowedMismatches) {
		violations.push({
			check: 'tcgplayer-names-agree',
			detail:
				`${tcgplayer.nameMismatches.length} of ${tcgplayer.mapped} number joins disagree on the ` +
				`name (allowed ${allowedMismatches}) — a renumbered group looks like this: ` +
				tcgplayer.nameMismatches
					.slice(0, 5)
					.map(({ key, ours, theirs }) => `${key}: "${ours}" vs "${theirs}"`)
					.join('; ')
		});
	}

	// Beta is the one run that is fully on sale and fully listed. A beta Printing with a group but
	// no product is a regression in our join, not a gap in their catalogue.
	const betaGaps = tcgplayer.noProduct.filter(({ run }) => run.includes('|beta|'));
	if (betaGaps.length > 0) {
		violations.push({
			check: 'tcgplayer-beta-complete',
			detail: `beta Printings with a TCGplayer group but no product: ${betaGaps
				.map(({ key }) => key)
				.join(', ')}`
		});
	}

	for (const [expansion, { ours, found }] of cardmarket.expansions) {
		if (ours > 0 && found / ours < MIN_EXPANSION_NAME_HIT_RATE) {
			violations.push({
				check: 'cardmarket-expansion-names',
				detail:
					`Cardmarket expansion ${expansion} knows only ${found} of our ${ours} names — ` +
					`the curated idExpansion in marketplaces.ts is probably wrong`
			});
		}
	}

	return violations;
}

/**
 * TCGplayer groups in the live listing that nothing here has decided about. Reported, not failed
 * on: a new group is usually a sealed product or the next set, and the right response to it is a
 * human adding an entry — not the daily refresh going dark meanwhile.
 */
export function unknownTcgplayerGroups(listing: readonly TcgcsvGroup[]): TcgcsvGroup[] {
	const mapped = new Set(TCGPLAYER_GROUPS.values());
	return listing.filter(
		({ groupId }) => !mapped.has(groupId) && !IGNORED_TCGPLAYER_GROUPS.has(groupId)
	);
}
