import { SIDES, sameDie } from './notation.ts';
import type { Die, Gig, Owner } from './notation.ts';

export type PlayerState = { fixer: Die[]; gigs: Gig[] };
export type GameState = { w: PlayerState; t: PlayerState };

export function initialState(): GameState {
	const fixer = (owner: Owner): Die[] => SIDES.map((sides) => ({ sides, owner }));
	return {
		w: { fixer: fixer('w'), gigs: [] },
		t: { fixer: fixer('t'), gigs: [] }
	};
}

export type GigLocation = { holder: Owner; index: number; gig: Gig };

/** Where a die currently sits in someone's gigs, or null if it is still in a fixer. */
export function findGig(state: GameState, die: Die): GigLocation | null {
	for (const holder of ['w', 't'] as const) {
		const index = state[holder].gigs.findIndex((g) => sameDie(g, die));
		if (index !== -1) return { holder, index, gig: state[holder].gigs[index] };
	}
	return null;
}
