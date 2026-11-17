/**
 * Choosing a Standing's decklist, and reading one — `docs/spec/tournaments.md` §3.2, §4.1.
 *
 * Shared by the builder and by `pnpm melee --reparse`, so a deck read at ingest and a deck re-read
 * after `cards.json` moves come out of the same function.
 */
import type { Card } from '../cards/schema.ts';
import { importDeck } from '../decks/import.ts';
import type { tournamentDeckCards } from '../server/db/schema.ts';
import { ramOf } from './ram.ts';
import type { MeleeStanding } from './sources.ts';

/** Every Standing of one event carries the same format id; anything else isn't one event. */
export function formatIdOf(standings: readonly MeleeStanding[]): string {
	const ids = new Set(standings.map((standing) => standing.FormatId));
	const [id] = ids;
	if (ids.size !== 1 || id === undefined) {
		throw new Error(`Standings name ${ids.size} formats; expected exactly one.`);
	}
	return id;
}

/**
 * The one decklist a Standing is playing, or `null` for none. The Standing's own list for the
 * event's format wins; only when it has none is the `GetPlayerDetails` fallback (swubase's) used.
 * More than one candidate is a refusal, not a guess.
 */
export function pickDecklist(
	standing: MeleeStanding,
	formatId: string,
	fallback: readonly string[] = []
): { guid: string; name: string } | null {
	const own = standing.Decklists.filter((list) => list.FormatId === formatId);
	const fromFallback = own.length === 0 ? fallback : [];
	if (own.length > 1 || fromFallback.length > 1) {
		const player = standing.Team.Players[0];
		throw new Error(
			`${player.DisplayName} (${player.ID}) has more than one decklist for the format.`
		);
	}
	if (own[0]) return { guid: own[0].DecklistId, name: own[0].DecklistName };
	if (fromFallback[0] !== undefined) return { guid: fromFallback[0], name: '' };
	return null;
}

export type DeckIndex = {
	/** The three Legend slugs, sorted, joined by `+`; null when the deck doesn't name three. */
	legendLine: string | null;
	/** What the Legends provide together, as a `legends:` value (`ram.ts`); null when it can't be known. */
	ram: string | null;
	unresolved: number;
	cards: (typeof tournamentDeckCards.$inferInsert)[];
	/** What `reviewDecks` looks at. */
	reading: { legends: number; mainCards: number; unresolved: number };
};

/** Reads a deck's text into the derived columns and card rows. Never guesses: see `importDeck`. */
export function indexDeck(
	guid: string,
	tournamentId: number,
	text: string,
	cards: readonly Card[]
): DeckIndex {
	const reading = importDeck(text, cards);
	const legendSlugs = reading.legends.map((card) => card.slug).sort();
	const rows: DeckIndex['cards'] = [
		...reading.legends.map((card) => ({
			deckGuid: guid,
			tournamentId,
			cardSlug: card.slug,
			board: 'legend' as const,
			quantity: 1
		})),
		...reading.entries.map((entry) => ({
			deckGuid: guid,
			tournamentId,
			cardSlug: entry.card.slug,
			board: 'main' as const,
			quantity: entry.quantity
		})),
		...reading.sideboard.map((entry) => ({
			deckGuid: guid,
			tournamentId,
			cardSlug: entry.card.slug,
			board: 'side' as const,
			quantity: entry.quantity
		}))
	];
	return {
		legendLine: legendSlugs.length === 3 ? legendSlugs.join('+') : null,
		ram: ramOf(reading.legends),
		unresolved: reading.unresolved.length,
		cards: rows,
		reading: {
			legends: reading.legends.length,
			mainCards: reading.entries.reduce((sum, entry) => sum + entry.quantity, 0),
			unresolved: reading.unresolved.length
		}
	};
}
