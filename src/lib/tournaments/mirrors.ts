/**
 * The mirror breaker: when two decks of the same Legends (or the same RAM) meet, which Cards does the
 * winner tend to be running that the loser is not?
 *
 * Pure: the database counts, this shapes. The unit is one *decided* mirror match (one side won more games;
 * a drawn match says nothing about who was better). Per Card and board it is told how many matches the
 * winner's deck ran it in, how many the loser's did, and how many both did.
 *
 * **Only matches where exactly one side ran the Card say anything**, so those are what is counted ("split"):
 * a Card both decks run cannot explain the result. Of the split matches, the share the winner was the one
 * running it is the Card's *edge*; 50% is a coin flip. The lists are ranked by the Wilson lower bound of
 * that edge (`power`, the same bound the tier list uses), so a Card seen in three matches never outranks
 * one seen in thirty.
 */
import { power } from './meta.ts';

/** What the database says of one Card on one board, over the decided mirrors in scope. */
export type MirrorRow = {
	slug: string;
	board: 'main' | 'side';
	/** Matches in which the winner's deck ran it. */
	winners: number;
	/** Matches in which the loser's deck ran it. */
	losers: number;
	/** Matches in which both did. */
	both: number;
};

export type MirrorCard = {
	slug: string;
	/** Matches the winner ran it, the loser ran it, and exactly one side did. */
	winners: number;
	losers: number;
	split: number;
	/** The share of split matches in which the side named by the list it is in was the one running it. */
	edge: number;
	/** The lower confidence bound of `edge`: what ranks the list. */
	power: number;
};

/** Which side of the result a list is about. */
export type Side = 'winning' | 'losing';

export type MirrorView = {
	/** Decided mirror matches counted. */
	matches: number;
	main: Record<Side, MirrorCard[]>;
	side: Record<Side, MirrorCard[]>;
};

/** A Card needs this many split matches before it is listed at all: fewer is anecdote. */
export const MIN_SPLIT = 8;
/** How many Cards each list shows. */
export const MIRROR_LIST = 12;
/** Below this many decided matches the page says the sample is thin. */
export const THIN_MIRRORS = 30;

const cardOf = (row: MirrorRow, side: Side): MirrorCard | null => {
	const winners = row.winners - row.both;
	const losers = row.losers - row.both;
	const split = winners + losers;
	if (split < MIN_SPLIT) return null;
	const edge = (side === 'winning' ? winners : losers) / split;
	// A Card's edge is the other side's mirror image, so each Card is in at most one list.
	if (edge <= 0.5) return null;
	return { slug: row.slug, winners, losers, split, edge, power: power(edge, split) ?? 0 };
};

const byPower = (a: MirrorCard, b: MirrorCard) =>
	b.power - a.power || b.split - a.split || a.slug.localeCompare(b.slug);

export function buildMirrors(rows: readonly MirrorRow[], matches: number): MirrorView {
	const list = (board: MirrorRow['board'], side: Side) =>
		rows
			.filter((row) => row.board === board)
			.flatMap((row) => cardOf(row, side) ?? [])
			.sort(byPower)
			.slice(0, MIRROR_LIST);
	const both = (board: MirrorRow['board']) => ({
		winning: list(board, 'winning'),
		losing: list(board, 'losing')
	});
	return { matches, main: both('main'), side: both('side') };
}
