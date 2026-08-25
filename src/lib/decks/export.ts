/**
 * Plain-text deck export (`docs/spec/deckbuilder.md` §6) — quantity-first, a labelled Legends
 * section separate from Main Deck. A human-paste format (Discord, forums), not a machine-import
 * format: no card-Id or Printing encoded, deliberately.
 */
import type { Card } from '#lib/cards/schema.js';
import type { DeckEntryGroup } from './grouping.js';

export function deckToPlainText(
	legends: readonly Card[],
	mainGroups: readonly DeckEntryGroup[]
): string {
	const lines: string[] = ['Legends:'];
	for (const legend of legends) lines.push(`1 ${legend.name}`);

	const totalCards = mainGroups.reduce((sum, group) => sum + group.quantity, 0);
	lines.push('', `Main Deck (${totalCards}):`);
	for (const group of mainGroups) {
		for (const entry of group.entries) lines.push(`${entry.quantity} ${entry.card.name}`);
	}

	return lines.join('\n');
}
