import { Action, ACTION_NAME, PLAYER_LABEL, formatDie, opponent, sameDie } from './notation.ts';
import type { Owner } from './notation.ts';
import { findGig } from './state.ts';
import type { GameState } from './state.ts';
import type { ParsedMove } from './parse.ts';

export type MoveContext = {
	/** The player performing the move (already flipped for reactions). */
	actor: Owner;
	/** True when the move was written inside parentheses. */
	reaction: boolean;
};

export function validateMove(move: ParsedMove, ctx: MoveContext, state: GameState): string | null {
	const { action, die } = move;
	const value = move.value ?? 0;
	const name = ACTION_NAME[action];
	const label = formatDie(die);
	const max = die.sides;
	const inRange = value >= 1 && value <= max;

	if (ctx.reaction && (action === Action.Roll || action === Action.Steal))
		return `${name}: reactions cannot roll or steal`;
	if (ctx.reaction && action === Action.Swap) return 'Swap: reactions cannot swap';

	switch (action) {
		case Action.Roll: {
			if (die.owner !== ctx.actor) return `Roll: ${label} is not ${PLAYER_LABEL[ctx.actor]}'s die`;
			const fixer = state[ctx.actor].fixer;
			if (!fixer.some((d) => sameDie(d, die))) return `Roll: ${label} is not in the fixer`;
			if (die.sides === 20 && fixer.length > 1)
				return `Roll: d20 must be the last die in the fixer`;
			if (!inRange) return `Roll: value ${value} out of range (1–${max})`;
			return null;
		}
		case Action.Steal: {
			const opp = opponent(ctx.actor);
			const loc = findGig(state, die);
			if (!loc || loc.holder !== opp)
				return `Steal: ${label} is not in ${PLAYER_LABEL[opp]}'s gigs`;
			if (move.value !== undefined && move.value !== loc.gig.value)
				return `Steal: ${label} is ${loc.gig.value}, not ${move.value}`;
			return null;
		}
		case Action.Swap: {
			// §6.7: one die from each side's Gigs. Which is the actor's is read off the board, so the
			// pair may be written either way round; nothing about a swap needs the actor named.
			const other = move.with!;
			const otherLabel = formatDie(other);
			if (sameDie(die, other)) return 'Swap: needs two different dice';
			const first = findGig(state, die);
			const second = findGig(state, other);
			if (!first) return `Swap: ${label} is not in any gigs`;
			if (!second) return `Swap: ${otherLabel} is not in any gigs`;
			if (first.holder === second.holder)
				return `Swap: needs one die from each side's gigs, but ${label} and ${otherLabel} are both in ${PLAYER_LABEL[first.holder]}'s`;
			return null;
		}
		default: {
			const loc = findGig(state, die);
			if (!loc) return `${name}: ${label} is not in any gigs`;
			const current = loc.gig.value;
			if (action === Action.Increment) {
				if (value <= current) return `Increment: ${value} must be greater than ${current}`;
				if (value > max) return `Increment: ${value} exceeds d${max} max`;
			} else if (action === Action.Decrement) {
				if (value >= current) return `Decrement: ${value} must be less than ${current}`;
				if (value < 1) return `Decrement: ${value} below minimum (1)`;
			} else if (!inRange) {
				return `${name}: value ${value} out of range (1–${max})`;
			}
			return null;
		}
	}
}

/** Returns a new state; assumes the move has passed `validateMove`. */
export function applyMove(move: ParsedMove, ctx: MoveContext, state: GameState): GameState {
	const next = structuredClone(state);
	const { action, die } = move;
	const value = move.value ?? 0;

	switch (action) {
		case Action.Roll: {
			const player = next[ctx.actor];
			player.fixer = player.fixer.filter((d) => !sameDie(d, die));
			player.gigs.push({ ...die, value });
			break;
		}
		case Action.Steal: {
			const loc = findGig(next, die);
			if (!loc) break;
			const [gig] = next[loc.holder].gigs.splice(loc.index, 1);
			next[ctx.actor].gigs.push(gig);
			break;
		}
		case Action.Swap: {
			// Both dice change hands at once and keep their values (§6.7.1).
			const first = findGig(next, die);
			const second = findGig(next, move.with!);
			if (!first || !second) break;
			next[first.holder].gigs.splice(first.index, 1);
			next[second.holder].gigs.splice(second.index, 1);
			next[first.holder].gigs.push(second.gig);
			next[second.holder].gigs.push(first.gig);
			break;
		}
		default: {
			const loc = findGig(next, die);
			if (!loc) break;
			next[loc.holder].gigs[loc.index] = { ...loc.gig, value };
		}
	}

	return next;
}
