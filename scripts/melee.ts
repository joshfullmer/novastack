/**
 * `pnpm melee <id> [id …]` — ingest Melee tournaments into D1.
 *
 * ```
 * Melee (anonymous, browser UA, 500 ms apart) → parse → check → SQL → wrangler d1 execute
 * ```
 *
 * Manually triggered, one id at a time, the way swubase does it (`docs/spec/tournaments.md` §1.3,
 * §4): there is no scan and no schedule. Writes the LOCAL database unless `--remote` is given.
 * Running an id again rewrites it whole, which is also how a repair works.
 *
 * Exit codes are the interface, as for `pnpm prices:check`:
 *
 * - `0` — done / `--check`: what is stored is what would be written
 * - `1` — `--check` only: it would change (a normal answer, not a failure)
 * - `2` — a Tournament was refused or failed an invariant, or something could not be reached
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import * as v from 'valibot';
import { SnapshotSchema, type Card } from '../src/lib/cards/schema.ts';
import { parseCli, USAGE } from '../src/lib/tournaments/args.ts';
import { MeleeClient } from '../src/lib/tournaments/client.ts';
import { Refusal, ingestTournament } from '../src/lib/tournaments/ingest.ts';
import {
	OWNED_TABLES,
	diffAgainstStored,
	reindexStatements,
	rekindStatements,
	storedIdsQuery,
	storedQueries,
	toFile,
	writeStatements
} from '../src/lib/tournaments/sql.ts';
import { confirmRemote, runFile, select, targetName, type Target } from './lib/d1.ts';
import { paint } from './lib/ui.ts';

const CARDS_PATH = path.join('src', 'lib', 'cards', 'cards.json');

const say = (line = '') => console.log(line);

async function loadCards(): Promise<readonly Card[]> {
	return v.parse(SnapshotSchema, JSON.parse(await readFile(CARDS_PATH, 'utf8'))).cards;
}

/** Production is only written after a yes. Local never asks. */
async function approved(target: Target, summary: string, yes: boolean): Promise<boolean> {
	if (!target.remote || yes) return true;
	if (await confirmRemote(summary)) return true;
	say(paint.change('  ○ not written (no confirmation; pass --yes to skip the question)'));
	return false;
}

async function reparse(target: Target, cards: readonly Card[], yes: boolean): Promise<number> {
	const decks = v.parse(
		v.array(v.object({ guid: v.string(), tournament_id: v.number(), text: v.string() })),
		select(target, 'SELECT guid, tournament_id, text FROM tournament_decks ORDER BY guid')
	);
	const events = v.parse(
		v.array(v.object({ id: v.number(), name: v.string(), kind: v.string() })),
		select(target, 'SELECT id, name, kind FROM tournaments ORDER BY id')
	);
	const kinds = rekindStatements(events);
	if (decks.length === 0 && kinds.length === 0) {
		say(`Nothing in the ${targetName(target)} database to re-read.`);
		return 0;
	}
	const summary = `Re-read ${decks.length} decks; ${kinds.length} of ${events.length} events change kind.`;
	if (!(await approved(target, summary, yes))) return 2;
	await runFile(
		target,
		toFile([
			...kinds,
			...reindexStatements(
				decks.map(({ guid, tournament_id, text }) => ({ guid, tournamentId: tournament_id, text })),
				cards
			)
		])
	);
	say(paint.ok(`✓ ${summary}`) + paint.dim(` (${targetName(target)} database)`));
	return 0;
}

async function main(): Promise<number> {
	const args = parseCli(process.argv.slice(2));
	const target: Target = { remote: args.remote, persistTo: args.persistTo };
	const cards = await loadCards();

	if (args.reparse) return reparse(target, cards, args.yes);

	const client = new MeleeClient({
		delayMs: process.env.MELEE_DELAY_MS ? Number(process.env.MELEE_DELAY_MS) : undefined,
		cookie: process.env.MELEE_COOKIE,
		maxRequests: args.maxRequests
	});

	let exit = 0;
	const raise = (code: number) => {
		exit = Math.max(exit, code);
	};

	// A real run leaves what is already stored alone: re-fetching an event costs ~20 paced requests
	// to Melee. `--force` is how a repair or a late deck gets in; `--check` always fetches.
	const stored = new Set<number>(
		args.check || args.force
			? []
			: v
					.parse(v.array(v.object({ id: v.number() })), select(target, storedIdsQuery(args.ids)))
					.map((row) => row.id)
	);

	for (const id of args.ids) {
		say(paint.bold(`\n${id}`));
		if (stored.has(id)) {
			say(
				paint.dim(`  ○ already in the ${targetName(target)} database (--force fetches it again)`)
			);
			continue;
		}
		try {
			const { built, violations, findings } = await ingestTournament(client, id, {
				cards,
				log: (line) => say(paint.dim(`  ${line}`))
			});

			for (const finding of findings) say(paint.change(`  ! ${finding}`));
			if (violations.length > 0) {
				for (const violation of violations) say(paint.remove(`  ✗ ${violation}`));
				say(paint.remove(`  not written: ${violations.length} invariant(s) violated`));
				raise(2);
				continue;
			}

			const { tournament, standings, matches, decks, notes } = built;
			say(
				`  ${tournament.name}` +
					paint.dim(
						`\n  ${standings.length} standings · ${matches.length} matches · ${decks.length} decks` +
							(notes.zeroRecordPlayers.length
								? ` · ${notes.zeroRecordPlayers.length} played nothing`
								: '')
					)
			);

			if (args.check) {
				const queries = storedQueries(id);
				const stored = new Map(
					OWNED_TABLES.map((table) => [table, select(target, queries[table])] as const)
				);
				const differences = diffAgainstStored(built, stored);
				if (differences.length === 0)
					say(paint.ok(`  ✓ the ${targetName(target)} database is current`));
				else {
					for (const difference of differences) say(paint.change(`  ~ ${difference}`));
					raise(1);
				}
				continue;
			}

			const statements = writeStatements(built);
			if (
				!(await approved(target, `${tournament.name}: ${statements.length} statements.`, args.yes))
			) {
				raise(2);
				continue;
			}
			await runFile(target, toFile(statements));
			say(
				paint.ok(`  ✓ written to the ${targetName(target)} database`) +
					paint.dim(` (${statements.length} statements)`)
			);
		} catch (error) {
			if (error instanceof Refusal) say(paint.change(`  ○ ${error.message}`));
			else say(paint.remove(`  ✗ ${error instanceof Error ? error.message : String(error)}`));
			raise(2);
		}
	}

	say(paint.dim(`\n${client.requests} requests to melee.gg`));
	return exit;
}

try {
	process.exitCode = await main();
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	console.error(USAGE);
	process.exitCode = 2;
}
