/**
 * Reading the two Melee pages that are HTML rather than JSON — `docs/spec/tournaments.md` §4.1.
 *
 * A real parser, not regexes: round buttons are attributes and the decklist is text that arrives
 * HTML-escaped (`Don&#39;t`), and both are ways a regex quietly returns the wrong thing.
 */
import { parse, type HTMLElement } from 'node-html-parser';

/**
 * Melee answered with its sign-in page instead of what was asked for. swubase's own notes say a stale
 * cookie "can produce a login page instead of tournament markup", and a login page that parsed as an
 * empty Tournament is the quiet way this goes wrong, so it is its own error.
 */
export class MeleeSignInError extends Error {
	constructor(where: string) {
		super(
			`${where}: Melee returned its sign-in page. Public events don't need a login; if this one does, ` +
				`set MELEE_COOKIE from a logged-out browser session.`
		);
		this.name = 'MeleeSignInError';
	}
}

/**
 * An event page with no round buttons at all: it ended with nothing played or published. Its own error,
 * so a run can say that and wait, rather than call it a failure and look again on every run.
 */
export class NoRoundsError extends Error {
	constructor(where: string) {
		super(`${where}: no rounds listed.`);
		this.name = 'NoRoundsError';
	}
}

/** A round of a Tournament, in the order the page's buttons list them. */
export type MeleeRound = {
	/** 1-based position among the buttons, top cut included — NOT parsed from the name. */
	number: number;
	/** What Melee's endpoints take. Different from `number`. */
	meleeRoundId: number;
	name: string;
};

/**
 * What the page's header says about the event, as Melee's own text — `Tournament Type: Tabletop`,
 * `Event Venue: …`, `Entry Fee: $20.00 (External to Melee)`. **Every field may be `null`**: this is
 * metadata, not results, so a header we can't read must not stop a Tournament from being ingested.
 * Nothing here is a category: "Showdown" is in the event's *name*, not in any field (research
 * `melee-ingest.md`).
 */
export type TournamentInfo = {
	/** How it is played, as Melee names it; `Tabletop` on every event seen so far. */
	tournamentType: string | null;
	venue: string | null;
	/** As shown, currency and caveat included: `$20.00 (External to Melee)`. Not parsed to a number. */
	entryFee: string | null;
	/** `Open Registration`, `Invite Only`, … */
	registration: string | null;
	/** The registration cap (the 32 in `14 of 32 Enrolled Players`). */
	capacity: number | null;
};

export type TournamentView = {
	rounds: MeleeRound[];
	/** The last round whose standings are published: an event's final results. */
	finalStandingsRoundId: number;
	info: TournamentInfo;
};

function isSignInPage(html: string): boolean {
	return /^\s*sign in/i.test(parse(html).querySelector('title')?.text ?? '');
}

function buttons(root: HTMLElement, container: string) {
	return root.querySelectorAll(`#${container} button.round-selector`).map((button) => {
		const id = Number(button.getAttribute('data-id'));
		const name = (button.getAttribute('data-name') ?? button.text).trim();
		if (!Number.isInteger(id) || id <= 0 || name === '') {
			throw new Error(`Unreadable round button: ${button.outerHTML}`);
		}
		return { meleeRoundId: id, name };
	});
}

const clean = (text: string | undefined) => text?.replace(/\s+/g, ' ').trim() || null;

/** The part of `Label: value` after the label, or null when the text doesn't start with it. */
const after = (text: string | null, label: string) =>
	text?.startsWith(label) ? clean(text.slice(label.length)) : null;

/**
 * The header block. Its parts have stable element ids; the registration line is one `|`-separated
 * run (`Entry Fee: … | Open Registration | Format: … | Ended | 14 of 32 Enrolled Players`), whose one
 * unlabelled segment is the registration mode, so that is found by elimination and only trusted if
 * exactly one segment is left.
 */
export function parseTournamentInfo(root: HTMLElement): TournamentInfo {
	const segments = (clean(root.querySelector('#tournament-headline-registration')?.text) ?? '')
		.split('|')
		.map((segment) => segment.trim())
		.filter(Boolean);

	const enrolled = segments.find((segment) => /^\d+ of \d+ Enrolled Players?$/i.test(segment));
	const capacity = enrolled ? Number(/ of (\d+) /.exec(enrolled)?.[1]) : null;
	const remaining = segments.filter(
		(segment) =>
			segment !== enrolled &&
			!segment.startsWith('Entry Fee:') &&
			!segment.startsWith('Format:') &&
			!/^(Ended|Started|Not Started|Upcoming|In Progress|Registration Open)$/i.test(segment)
	);

	return {
		tournamentType: after(
			clean(root.querySelector('#tournament-headline-platform')?.text),
			'Tournament Type:'
		),
		venue: clean(root.querySelector('a[data-type="venue"]')?.text),
		entryFee: after(
			segments.find((segment) => segment.startsWith('Entry Fee:')) ?? null,
			'Entry Fee:'
		),
		registration: remaining.length === 1 ? remaining[0] : null,
		capacity: capacity !== null && Number.isInteger(capacity) ? capacity : null
	};
}

/**
 * `GET /Tournament/View/{id}` → its rounds and header.
 *
 * Rounds are numbered by **the order of the buttons** — `Quarterfinals`, `Semifinals` and `Finals`
 * come after the numbered Swiss rounds and have no number in their names — taking the standings
 * container first and the pairings container for anything only it lists (`docs/spec` §4.1).
 */
export function parseTournamentView(html: string, expectedId: number): TournamentView {
	const where = `Tournament/View/${expectedId}`;
	if (isSignInPage(html)) throw new MeleeSignInError(where);
	const root = parse(html);

	// swubase's newer module checks this too: a page that isn't the one asked for must not be read.
	const found = root.querySelector('#tournament-id')?.getAttribute('value');
	if (found !== String(expectedId)) {
		throw new Error(`${where}: not the tournament page (its id is ${found ?? 'absent'}).`);
	}

	const standings = buttons(root, 'standings-round-selector-container');
	const pairings = buttons(root, 'pairings-round-selector-container');

	const seen = new Set<number>();
	const rounds: MeleeRound[] = [];
	for (const button of [...standings, ...pairings]) {
		if (seen.has(button.meleeRoundId)) continue;
		seen.add(button.meleeRoundId);
		rounds.push({ number: rounds.length + 1, ...button });
	}

	const finalStandingsRoundId = (standings.at(-1) ?? pairings.at(-1))?.meleeRoundId;
	if (finalStandingsRoundId === undefined) throw new NoRoundsError(where);
	return { rounds, finalStandingsRoundId, info: parseTournamentInfo(root) };
}

/**
 * `GET /Decklist/View/{guid}` → the decklist text, entity-decoded: `MainDeck` / `Legends` /
 * `Sideboard` sections of `qty Name | Subname`. Exactly one `pre#decklist-text` must exist; none, or
 * two, means the page isn't what we measured.
 */
export function parseDecklistPage(html: string, guid: string): string {
	const where = `Decklist/View/${guid}`;
	if (isSignInPage(html)) throw new MeleeSignInError(where);
	const found = parse(html).querySelectorAll('pre#decklist-text');
	if (found.length !== 1) {
		throw new Error(`${where}: expected one decklist-text element, found ${found.length}.`);
	}
	return found[0].text.replace(/\r\n?/g, '\n').trim();
}
