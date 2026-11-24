/**
 * `pnpm melee`'s command line — `docs/spec/tournaments.md` §4.
 *
 * Strict: an unknown flag, a non-numeric id, or a flag that makes no sense with another is an error
 * before anything touches Melee or a database. The default target is the LOCAL database; production
 * is written only when `--remote` is typed, and then the local one too so the two hold the same events.
 */
import { parseArgs } from 'node:util';

export type Args = {
	/** Melee tournament ids, in the order given. Empty only for `--reparse` and `--promote` (all of them). */
	ids: number[];
	remote: boolean;
	/** Skip the "write PRODUCTION?" question; for a run nobody is at the keyboard for. */
	yes: boolean;
	check: boolean;
	/** Fetch and rewrite ids that are already stored, instead of skipping them. */
	force: boolean;
	reparse: boolean;
	/** Copy what the local database holds to production, with no trip to Melee. */
	promote: boolean;
	/** Retry every id remembered as not ready yet (`scripts/melee-pending.json`). */
	pending: boolean;
	/** Show the remembered ids and why each is waiting; touches no database and no network. */
	list: boolean;
	/** Stop remembering the ids given. */
	forget: boolean;
	/** List tournaments Melee has that the local database doesn't: read-only, ingests nothing. */
	discover: boolean;
	/** `--discover`: words to search tournament names for; empty lists every Cyberpunk TCG event. */
	search: string;
	/** `--discover`: how many pages of eight to read. */
	pages: number;
	/** `--discover`: read every page rather than stopping where new events seem to end. */
	deep: boolean;
	/** `--discover`: skip events with fewer players. */
	minPlayers: number;
	/** `--discover`: skip events that started before this date (`YYYY-MM-DD`). */
	since: string | null;
	/** `--discover`: ingest what it finds, as `pnpm melee <ids>` would, instead of listing it. */
	ingest: boolean;
	/** A throwaway local database directory (`wrangler --persist-to`), for trying a run out. */
	persistTo: string | undefined;
	maxRequests: number | undefined;
};

export const USAGE = `usage: pnpm melee <id> [id …] [--force] [--check] [--remote [--yes]] [--max-requests N]
       pnpm melee --reparse [--remote]
       pnpm melee --promote [id …] [--check] [--yes]
       pnpm melee --pending [--remote [--yes]]     try again every id that wasn't ready
       pnpm melee --discover [--search words] [--pages N | --deep] [--min-players N] [--since YYYY-MM-DD]
                  [--ingest [--check] [--remote [--yes]]]
                                                   list tournaments Melee has that we don't, or ingest them
       pnpm melee --list                           which ids are waiting, and why
       pnpm melee --forget <id> [id …]             stop waiting for those, or skipping them
  Writes the LOCAL database; --remote writes PRODUCTION as well. A database that already has an id
  skips it unless --force.`;

export function parseCli(argv: readonly string[]): Args {
	const { values, positionals } = parseArgs({
		args: [...argv],
		allowPositionals: true,
		strict: true,
		options: {
			remote: { type: 'boolean', default: false },
			yes: { type: 'boolean', default: false },
			check: { type: 'boolean', default: false },
			force: { type: 'boolean', default: false },
			reparse: { type: 'boolean', default: false },
			promote: { type: 'boolean', default: false },
			pending: { type: 'boolean', default: false },
			list: { type: 'boolean', default: false },
			forget: { type: 'boolean', default: false },
			discover: { type: 'boolean', default: false },
			search: { type: 'string' },
			pages: { type: 'string' },
			deep: { type: 'boolean', default: false },
			'min-players': { type: 'string' },
			since: { type: 'string' },
			ingest: { type: 'boolean', default: false },
			'persist-to': { type: 'string' },
			'max-requests': { type: 'string' }
		}
	});

	const ids = positionals.map((text) => {
		const id = Number(text);
		if (!/^\d+$/.test(text) || !Number.isSafeInteger(id) || id <= 0) {
			throw new Error(`"${text}" is not a Melee tournament id (a positive whole number).`);
		}
		return id;
	});
	if (new Set(ids).size !== ids.length) throw new Error('A tournament id was given twice.');

	let maxRequests: number | undefined;
	if (values['max-requests'] !== undefined) {
		maxRequests = Number(values['max-requests']);
		if (!Number.isInteger(maxRequests) || maxRequests <= 0) {
			throw new Error('--max-requests wants a positive whole number.');
		}
	}

	const whole = (flag: string, text: string | undefined, fallback: number, least: number) => {
		if (text === undefined) return fallback;
		const number = Number(text);
		if (!/^\d+$/.test(text) || !Number.isSafeInteger(number) || number < least) {
			throw new Error(`--${flag} wants a whole number, ${least} or more.`);
		}
		return number;
	};
	if (values.deep && values.pages !== undefined) {
		throw new Error('--deep reads every page; it takes no --pages.');
	}
	const pages = values.deep ? Infinity : whole('pages', values.pages, 10, 1);
	const minPlayers = whole('min-players', values['min-players'], 0, 0);
	const discover = values.discover;
	if (
		!discover &&
		(values.search !== undefined ||
			values.pages ||
			values.deep ||
			values['min-players'] ||
			values.since ||
			values.ingest)
	) {
		throw new Error(
			'--search, --pages, --deep, --min-players, --since and --ingest only go with --discover.'
		);
	}
	const since = values.since ?? null;
	if (since !== null && !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
		throw new Error('--since wants a date like 2026-11-01.');
	}

	const reparse = values.reparse;
	if (reparse && (ids.length > 0 || values.check)) {
		throw new Error('--reparse takes no ids and no --check.');
	}
	if (values.force && (reparse || values.check)) {
		throw new Error('--force only applies to a real run; --check and --reparse never skip.');
	}
	const promote = values.promote;
	if (promote && (reparse || values.remote || values.force || values['persist-to'] !== undefined)) {
		throw new Error(
			'--promote copies local to production by itself; it takes no --remote, --force, --reparse or --persist-to.'
		);
	}
	if (promote && values['max-requests'] !== undefined) {
		throw new Error('--promote makes no requests to Melee, so --max-requests means nothing.');
	}
	const { pending, list, forget } = values;
	if ([reparse, promote, pending, list, forget, discover].filter(Boolean).length > 1) {
		throw new Error(
			'--reparse, --promote, --pending, --list, --forget and --discover are each their own run.'
		);
	}
	// Listing is read-only; ingesting takes the flags a normal run does, except --force (what is stored
	// is what tells it to stop).
	const writes = discover && values.ingest;
	if (
		discover &&
		(ids.length > 0 ||
			values.force ||
			(!writes &&
				(values.check || values.remote || values.yes || values['persist-to'] !== undefined)))
	) {
		throw new Error(
			writes
				? '--discover --ingest takes no ids and no --force.'
				: '--discover takes no ids, and --check, --remote, --yes and --persist-to only with --ingest.'
		);
	}
	if ((list || forget) && (values.check || values.force || values.remote || values.yes)) {
		throw new Error('--list and --forget take no other flags.');
	}
	if ((pending || list) && ids.length > 0) {
		throw new Error(`--${pending ? 'pending' : 'list'} takes no ids; it uses the ones remembered.`);
	}
	if (forget && ids.length === 0) throw new Error('--forget wants the ids to forget.');
	if (!reparse && !promote && !pending && !list && !forget && !discover && ids.length === 0)
		throw new Error('Give at least one Melee tournament id.');
	if (values.remote && values['persist-to'] !== undefined) {
		throw new Error(
			"--persist-to is for a local scratch database; it can't be used with --remote."
		);
	}

	return {
		ids,
		remote: values.remote,
		yes: values.yes,
		check: values.check,
		force: values.force,
		reparse,
		promote,
		pending,
		list,
		forget,
		discover,
		search: values.search?.trim() ?? '',
		pages,
		deep: values.deep,
		minPlayers,
		since,
		ingest: values.ingest,
		persistTo: values['persist-to'],
		maxRequests
	};
}
