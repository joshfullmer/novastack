/**
 * `pnpm melee`'s command line — `docs/spec/tournaments.md` §4.
 *
 * Strict: an unknown flag, a non-numeric id, or a flag that makes no sense with another is an error
 * before anything touches Melee or a database. The default target is the LOCAL database; production
 * is written only when `--remote` is typed.
 */
import { parseArgs } from 'node:util';

export type Args = {
	/** Melee tournament ids, in the order given. Empty only for `--reparse`. */
	ids: number[];
	remote: boolean;
	/** Skip the "write PRODUCTION?" question; for a run nobody is at the keyboard for. */
	yes: boolean;
	check: boolean;
	/** Fetch and rewrite ids that are already stored, instead of skipping them. */
	force: boolean;
	reparse: boolean;
	/** A throwaway local database directory (`wrangler --persist-to`), for trying a run out. */
	persistTo: string | undefined;
	maxRequests: number | undefined;
};

export const USAGE = `usage: pnpm melee <id> [id …] [--force] [--check] [--remote [--yes]] [--max-requests N]
       pnpm melee --reparse [--remote]
  Writes the LOCAL database unless --remote is given. Ids already stored are skipped unless --force.`;

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

	const reparse = values.reparse;
	if (reparse && (ids.length > 0 || values.check)) {
		throw new Error('--reparse takes no ids and no --check.');
	}
	if (values.force && (reparse || values.check)) {
		throw new Error('--force only applies to a real run; --check and --reparse never skip.');
	}
	if (!reparse && ids.length === 0) throw new Error('Give at least one Melee tournament id.');
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
		persistTo: values['persist-to'],
		maxRequests
	};
}
