export type Owner = 'w' | 't';
export const Owner = { We: 'w', They: 't' } as const satisfies Record<string, Owner>;
export const PLAYER_LABEL: Record<Owner, string> = { w: 'WE', t: 'THEY' };

export function opponent(owner: Owner): Owner {
	return owner === 'w' ? 't' : 'w';
}

export type Sides = 4 | 6 | 8 | 10 | 12 | 20;
export const SIDES: readonly Sides[] = [4, 6, 8, 10, 12, 20];

export type DieLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export const DIE_LETTERS = {
	A: 4,
	B: 6,
	C: 8,
	D: 10,
	E: 12,
	F: 20
} as const satisfies Record<DieLetter, Sides>;
export const LETTER_OF: Record<Sides, DieLetter> = {
	4: 'A',
	6: 'B',
	8: 'C',
	10: 'D',
	12: 'E',
	20: 'F'
};

export const Action = {
	Roll: '',
	Steal: 'x',
	Increment: '+',
	Decrement: '-',
	Set: '=',
	Reroll: '~',
	/** Written between two dice — `A<>B'` — rather than before one. */
	Swap: '<>'
} as const;
export type Action = (typeof Action)[keyof typeof Action];
export const ACTION_NAME: Record<Action, string> = {
	'': 'Roll',
	x: 'Steal',
	'+': 'Increment',
	'-': 'Decrement',
	'=': 'Set',
	'~': 'Reroll',
	'<>': 'Swap'
};

export type Die = { sides: Sides; owner: Owner };
export type Gig = Die & { value: number };

export function sameDie(a: Die, b: Die): boolean {
	return a.sides === b.sides && a.owner === b.owner;
}

/** `B` for WE's d6, `B'` for THEY's. */
export function formatDie(die: Die): string {
	return LETTER_OF[die.sides] + (die.owner === 't' ? "'" : '');
}

/** `B'4` — die plus its current value. */
export function formatGig(gig: Gig): string {
	return formatDie(gig) + gig.value;
}
