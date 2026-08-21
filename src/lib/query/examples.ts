/**
 * Worked examples for the `/syntax` page (spec §11) — live links into `/cards?q=…`, and the
 * single source `examples.spec.ts` tests against so a documented query that stops parsing fails
 * the build, rather than quietly going stale.
 */
export type Example = { query: string; description: string };

export const EXAMPLES: readonly Example[] = [
	{ query: 'blocker', description: 'A bare word searches names and rules text.' },
	{ query: 'c:red', description: 'Color, by its short alias.' },
	{ query: 't:legend c:red', description: 'Two clauses, implicitly ANDed.' },
	{ query: 't:legend or c:red', description: 'The `or` connective.' },
	{ query: '-kw:blocker', description: 'Negation — cards without the Blocker keyword.' },
	{ query: '(t:legend or c:red) -kw:blocker', description: 'Grouping with parens.' },
	{ query: 'cost>=3', description: 'A comparison on a numeric field.' },
	{ query: '1<=ram<=3', description: 'The chained-interval sugar for a range.' },
	{ query: 'cost:none', description: 'Isolating the null bucket — cards with no cost at all.' },
	{ query: 'tag:none', description: 'Array emptiness — cards with no tags.' },
	{ query: 'tag:"Tyger Claws"', description: 'A multi-word value, quoted.' },
	{ query: 'rarity>=epic', description: 'Rarity comparisons use the curated order.' },
	{ query: 'legends:rryyyy', description: 'The colored RAM budget — Red 2, Yellow 4.' },
	{ query: 'legends:r2y4', description: 'The same budget, digit spelling.' },
	{ query: 'name:v', description: 'Scoped to the card name only.' },
	{ query: 'rules:"a rival unit"', description: 'Scoped to rules text, an exact phrase.' },
	{ query: '/bloc+ker/', description: 'A regex pattern, scoped to the free-text field.' }
];
