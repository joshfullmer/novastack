/**
 * Reading a pasted decklist back into a deck (`docs/spec/deckbuilder.md` §6, and the counterpart
 * of `./export.ts`).
 *
 * **One tolerant reader for three formats**, because they differ in dressing, not in substance —
 * every one is `{quantity} {name}` lines under section headers:
 *
 * - **the sim's own export** — `# Name: …`, `# Legends`, `# Main Deck`, `# Sideboard`, and
 *   `1x 002 Name` with a collector code before the name (`export.ts`);
 * - **the official deck builder's** — `# Deck Name`, `// Legends (3)`, `// Units (24)`,
 *   `// Sideboard (7)`, and `3 Chrome Fang` with no `x` and no code;
 * - **Melee's** — bare `MainDeck` / `Legends` / `Sideboard` headers.
 *
 * The official and Melee shapes were read out of cyberpunktcg.com's own bundle, not a live export
 * (Share needs an account); the line patterns below are lifted from its importer on purpose, so
 * whatever it accepts, this accepts.
 *
 * **A name is the only identity a pasted line has.** Collector numbers restart in every Set, so a
 * code can't pick a card, only decorate one. The key is `normalizeForSearch` — accent-, case- and
 * punctuation-insensitive — which is also what makes `V: Streetkid`, `V - Streetkid` and
 * `V — Streetkid` the same line: the separator between a Legend's name and subtitle has changed
 * twice in the source data, and this must not care which one it is today. All 151 cards are unique
 * under that key (asserted in `import.spec.ts`), so a match is never a choice.
 *
 * **Strict, never a guess.** A line that doesn't resolve to exactly one card is returned as
 * unresolved, with up to three suggestions for the user to pick from. Nothing near-matching is ever
 * accepted silently — putting the wrong card in a deck is worse than leaving a line out. That
 * includes a bare Legend name (`V`, or even `Dum Dum`, which only one Legend carries): the user
 * is shown the candidates rather than having one picked for them.
 *
 * **Only the two add-time limits are enforced** — a 4th copy (counted across both piles) and an
 * 8th sideboard card — because those are the only states the editor can't represent and the save
 * schema would reject. Everything else (deck size, RAM, Legend-name conflicts) imports as it came
 * and surfaces in the editor's usual issues banner, exactly as if it had been built by hand. Each
 * clamp is reported as a warning; later lines lose.
 *
 * Legends go to the Legend slots by **card type**; the header only decides main deck or
 * sideboard. A Legend under the sideboard is reported, not moved — rules §3.4.4 say it never
 * belongs there, and quietly relocating it would be a guess about what the author meant.
 *
 * Imported lines never carry a Printing: a pasted list names Cards, and the sim's codes are the
 * Default Printing anyway. Keeping the printings a draft already had is the caller's job
 * (`replaceWith` in `deck-state.svelte.ts`).
 */
import { normalizeForSearch } from '#lib/cards/dataset.js';
import type { Card } from '#lib/cards/schema.js';
import { LEGEND_SLOTS, MAX_COPIES, SIDEBOARD_SIZE, copiesOf, type DeckEntry } from './legality.js';

export type ImportWarning = {
	kind: 'copies' | 'sideboard-full' | 'legends-full' | 'legend-duplicate' | 'legend-in-sideboard';
	message: string;
};

export type UnresolvedLine = {
	/** 1-based, as a text editor counts. */
	line: number;
	/** The line as pasted, trimmed. */
	text: string;
	/** `unparsed` is a line with no usable quantity; `unknown` is one that names no single card. */
	reason: 'unparsed' | 'unknown';
	/** What the line asked for — `null` when it didn't ask for a usable amount (`unparsed`). */
	quantity: number | null;
	/** Up to three cards the line might have meant. Never applied on its own. */
	suggestions: Card[];
};

export type DeckImport = {
	/** From a `# …` line, or `null` — Melee's export has none. Informational: import never renames. */
	name: string | null;
	legends: Card[];
	entries: DeckEntry[];
	sideboard: DeckEntry[];
	warnings: ImportWarning[];
	unresolved: UnresolvedLine[];
};

const MAX_SUGGESTIONS = 3;

type Section = 'main' | 'legends' | 'sideboard';

/** Header words → where the lines under them go, keyed as `sectionOf` normalizes them. */
const SECTIONS: Readonly<Record<string, Section>> = {
	'main deck': 'main',
	maindeck: 'main',
	main: 'main',
	deck: 'main',
	unit: 'main',
	units: 'main',
	gear: 'main',
	gears: 'main',
	program: 'main',
	programs: 'main',
	legend: 'legends',
	legends: 'legends',
	sideboard: 'sideboard',
	'side deck': 'sideboard'
};

/**
 * `// Units (24)`, `# Main Deck`, `Side Deck:`, `MainDeck` → the section it names, else `null`.
 * A trailing count and colon are decoration; so is the `//` or `#`.
 */
function sectionOf(line: string): Section | null {
	const word = line
		.replace(/^(?:\/\/|#)\s*/, '')
		.replace(/\s*\(\d+\)\s*$/, '')
		.replace(/\s*:$/, '')
		.trim()
		.toLowerCase();
	return SECTIONS[word] ?? null;
}

/** The two quantity patterns from the official importer: `3 Name` / `3x Name`, and `Name x3`. */
function parseQuantity(line: string): { quantity: number; rest: string } | null {
	const leading = line.match(/^(\d+)x?\s+(.+)$/i);
	if (leading) return { quantity: parseInt(leading[1], 10), rest: leading[2].trim() };
	const trailing = line.match(/^(.+?)\s*x(\d+)$/i);
	if (trailing) return { quantity: parseInt(trailing[2], 10), rest: trailing[1].trim() };
	return null;
}

/** Levenshtein distance, two rows. The strings are card names — a few dozen characters. */
function editDistance(a: string, b: string): number {
	let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
	for (let i = 1; i <= a.length; i++) {
		const current = [i];
		for (let j = 1; j <= b.length; j++) {
			current[j] = Math.min(
				previous[j] + 1,
				current[j - 1] + 1,
				previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
			);
		}
		previous = current;
	}
	return previous[b.length];
}

type Indexed = { card: Card; key: string; baseKey: string };

function index(cards: readonly Card[]): Indexed[] {
	return cards.map((card) => {
		const base =
			card.subtitle === null
				? card.name
				: card.name.slice(0, card.name.length - card.subtitle.length);
		return {
			card,
			key: normalizeForSearch(card.name),
			baseKey: normalizeForSearch(base)
		};
	});
}

/**
 * Up to three cards `query` might have been meant as, best first: the card whose name is exactly
 * what was typed minus its subtitle (`V`), then names that start with it, then ones that contain
 * it, then near misses by edit distance. Tiers keep the ordering explainable — a bare `V` offers
 * the V Legends and nothing else, not whatever happens to be closest by letters.
 */
function suggest(query: string, indexed: readonly Indexed[]): Card[] {
	if (query === '') return [];
	const threshold = Math.max(2, Math.floor(query.length / 4));
	const ranked = indexed
		.map((entry) => {
			const { key, baseKey } = entry;
			if (key === query || baseKey === query) return { entry, tier: 0, tiebreak: key.length };
			if (key.startsWith(`${query} `)) return { entry, tier: 1, tiebreak: key.length };
			if (key.startsWith(query)) return { entry, tier: 2, tiebreak: key.length };
			if (key.includes(query)) return { entry, tier: 3, tiebreak: key.length };
			const distance = Math.min(editDistance(query, key), editDistance(query, baseKey));
			return distance <= threshold ? { entry, tier: 4, tiebreak: distance } : null;
		})
		.filter((match) => match !== null)
		.sort((a, b) => a.tier - b.tier || a.tiebreak - b.tiebreak);
	// Exact base-name matches are the whole candidate set — padding `V`'s two Legends with whatever
	// else starts with a V would only bury them.
	const exact = ranked.filter((match) => match.tier === 0);
	return (exact.length > 0 ? exact : ranked).slice(0, MAX_SUGGESTIONS).map((m) => m.entry.card);
}

/** `Name`, or the name behind a leading collector code (`061`, `A027`, `MS01-131A`). */
function candidates(rest: string): string[] {
	const tokens = rest.split(/\s+/);
	const forms = [rest];
	// Only tried once the whole line has failed, so `6th Street Recruits` keeps its own first word.
	if (tokens.length > 1 && /\d/.test(tokens[0])) forms.push(tokens.slice(1).join(' '));
	return forms;
}

export function importDeck(text: string, cards: readonly Card[]): DeckImport {
	const indexed = index(cards);
	const byKey = new Map<string, Card[]>();
	for (const { card, key } of indexed) byKey.set(key, [...(byKey.get(key) ?? []), card]);

	const result: DeckImport = {
		name: null,
		legends: [],
		entries: [],
		sideboard: [],
		warnings: [],
		unresolved: []
	};
	/** A repeated identical line (`V: Streetkid` three times) is one warning, not three. */
	const warn = (warning: ImportWarning) => {
		if (!result.warnings.some((existing) => existing.message === warning.message)) {
			result.warnings.push(warning);
		}
	};
	const copyDrops = new Map<Card, { requested: number; kept: number }>();
	const sideboardDrops: string[] = [];
	const legendDrops: string[] = [];
	let sideboardTotal = 0;
	let section: Section = 'main';

	text.split(/\r?\n/).forEach((raw, lineIndex) => {
		const line = raw.trim();
		if (line === '') return;

		const header = sectionOf(line);
		if (header) {
			section = header;
			return;
		}
		if (line.startsWith('#') && !line.startsWith('##')) {
			const title = line
				.slice(1)
				.trim()
				.replace(/^name\s*:\s*/i, '');
			if (title !== '') result.name = title;
			return;
		}
		if (line.startsWith('//') || line.startsWith('##')) return;

		const unresolved = (
			reason: UnresolvedLine['reason'],
			quantity: number | null,
			query: string[]
		) => {
			// The whole line first; the name behind a code only when that finds nothing, since a code
			// is noise to a typo'd name but a real first word to `6th Street Recruits`.
			const found = query.map((form) => suggest(normalizeForSearch(form), indexed));
			result.unresolved.push({
				line: lineIndex + 1,
				text: line,
				reason,
				quantity,
				suggestions: found.find((list) => list.length > 0) ?? []
			});
		};

		const parsed = parseQuantity(line);
		if (!parsed || parsed.quantity < 1) {
			unresolved('unparsed', null, candidates(parsed ? parsed.rest : line));
			return;
		}

		const forms = candidates(parsed.rest);
		const card = forms
			.map((form) => byKey.get(normalizeForSearch(form)))
			.find((matches) => matches?.length === 1)?.[0];
		if (!card) {
			unresolved('unknown', parsed.quantity, forms);
			return;
		}

		if (card.cardType === 'Legend') {
			if (section === 'sideboard') {
				warn({
					kind: 'legend-in-sideboard',
					message: `${card.name} is a Legend, and Legends can't go in the sideboard — left out.`
				});
			} else if (result.legends.some((legend) => legend.slug === card.slug)) {
				warn({
					kind: 'legend-duplicate',
					message: `${card.name} is listed more than once — a deck names each Legend once.`
				});
			} else if (result.legends.length >= LEGEND_SLOTS) {
				legendDrops.push(card.name);
			} else {
				result.legends.push(card);
				if (parsed.quantity > 1) {
					warn({
						kind: 'legend-duplicate',
						message: `${card.name} is listed ×${parsed.quantity} — a deck names each Legend once.`
					});
				}
			}
			return;
		}

		const pile = section === 'sideboard' ? result.sideboard : result.entries;
		const copyRoom = MAX_COPIES - copiesOf(card, result.entries, result.sideboard);
		const sideboardRoom = section === 'sideboard' ? SIDEBOARD_SIZE - sideboardTotal : Infinity;
		const kept = Math.max(0, Math.min(parsed.quantity, copyRoom, sideboardRoom));

		const drop = copyDrops.get(card) ?? { requested: 0, kept: 0 };
		drop.requested += parsed.quantity;
		drop.kept += kept;
		copyDrops.set(card, drop);
		// Over the copy cap is named by the copy warning; only what the cap *didn't* already
		// explain is the sideboard's fault.
		if (kept < Math.min(parsed.quantity, Math.max(0, copyRoom)) && section === 'sideboard') {
			sideboardDrops.push(card.name);
		}
		if (kept === 0) return;

		const existing = pile.find((entry) => entry.card.slug === card.slug);
		if (existing) existing.quantity += kept;
		else pile.push({ card, quantity: kept });
		if (section === 'sideboard') sideboardTotal += kept;
	});

	for (const [card, { requested, kept }] of copyDrops) {
		if (kept < requested && requested > MAX_COPIES) {
			warn({
				kind: 'copies',
				message: `${card.name}: ${requested} → ${kept} (at most ${MAX_COPIES} copies, main deck and sideboard together).`
			});
		}
	}
	if (sideboardDrops.length > 0) {
		warn({
			kind: 'sideboard-full',
			message: `The sideboard holds ${SIDEBOARD_SIZE} cards — left out: ${[...new Set(sideboardDrops)].join(', ')}.`
		});
	}
	if (legendDrops.length > 0) {
		warn({
			kind: 'legends-full',
			message: `A deck has ${LEGEND_SLOTS} Legends — left out: ${legendDrops.join(', ')}.`
		});
	}
	return result;
}
