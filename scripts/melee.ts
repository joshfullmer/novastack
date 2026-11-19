/**
 * `pnpm melee <id> [id …]` — ingest Melee tournaments into D1.
 *
 * ```
 * Melee (anonymous, browser UA, 500 ms apart) → parse → check → SQL → wrangler d1 execute
 * ```
 *
 * Manually triggered, one id at a time, the way swubase does it (`docs/spec/tournaments.md` §1.3,
 * §4): there is no scan and no schedule. Writes the LOCAL database, and PRODUCTION as well with
 * `--remote`. An id a database already holds is skipped; `--force` rewrites it whole, which is also
 * how a repair works. `--promote` copies what is local to production without asking Melee again.
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
	batchPlayersQuery,
	batchQueries,
	diffAgainstStored,
	diffEvents,
	groupByEvent,
	perTable,
	promoteStatements,
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

type Players = Map<number, Record<string, unknown>>;

/** Every owned row and player for these events, from one database, in a handful of SELECTs. */
function readEvents(target: Target, ids: readonly number[]) {
	const queries = batchQueries(ids);
	const batch = perTable((table) => select(target, queries[table]));
	const players: Players = new Map(
		select(target, batchPlayersQuery(ids)).map((row) => [Number(row.id), row])
	);
	return { events: groupByEvent(ids, batch), players };
}

/**
 * `--promote`: bring production up to what the local database holds, with no trip to Melee. Local is
 * the source and production the target, never the other way. Events only production has are left
 * alone. `--check` stops after the comparison.
 */
async function promote(args: { ids: number[]; check: boolean; yes: boolean }): Promise<number> {
	const local: Target = { remote: false };
	const production: Target = { remote: true };

	const heldLocally = v
		.parse(
			v.array(v.object({ id: v.number() })),
			select(local, 'SELECT id FROM tournaments ORDER BY id')
		)
		.map((row) => row.id);
	const missing = args.ids.filter((id) => !heldLocally.includes(id));
	if (missing.length > 0) {
		say(
			paint.remove(`Not in the local database: ${missing.join(', ')}. Ingest them locally first.`)
		);
		return 2;
	}
	const ids = args.ids.length > 0 ? args.ids : heldLocally;
	if (ids.length === 0) {
		say('Nothing in the local database to promote.');
		return 0;
	}

	const source = readEvents(local, ids);
	const target = readEvents(production, ids);
	const pending: { id: number; name: string; statements: string[] }[] = [];
	for (const id of ids) {
		const mine = source.events.get(id);
		const theirs = target.events.get(id);
		if (!mine || !theirs) continue;
		const name = String(mine.tournaments[0]?.name ?? id);
		const differences = diffEvents(mine, theirs, source.players, target.players);
		say(paint.bold(`\n${id}`) + paint.dim(`  ${name}`));
		if (differences.length === 0) {
			say(paint.ok('  ✓ production is current'));
			continue;
		}
		say(
			theirs.tournaments.length === 0
				? paint.change('  + not in production yet')
				: paint.change('  ~ production differs')
		);
		for (const difference of differences) say(paint.dim(`    ${difference}`));
		pending.push({ id, name, statements: promoteStatements(id, mine, source.players) });
	}

	if (pending.length === 0) {
		say(paint.ok(`\n✓ production already holds all ${ids.length} events`));
		return 0;
	}
	if (args.check) {
		say(paint.change(`\n${pending.length} of ${ids.length} events would change production`));
		return 1;
	}
	const summary = `Promote ${pending.length} of ${ids.length} events to production.`;
	if (!(await approved(production, summary, args.yes))) return 2;

	let exit = 0;
	for (const { id, name, statements } of pending) {
		try {
			await runFile(production, toFile(statements));
			say(paint.ok(`  ✓ ${id} ${name}`) + paint.dim(` (${statements.length} statements)`));
		} catch (error) {
			say(
				paint.remove(`  ✗ ${id} ${name}: ${error instanceof Error ? error.message : String(error)}`)
			);
			exit = 2;
		}
	}
	return exit;
}

/**
 * Where a run writes. Local always; `--remote` adds production, so the two hold the same events. Local
 * comes first: it is the cheap one to get wrong.
 */
function targetsFor(args: { remote: boolean; persistTo: string | undefined }): Target[] {
	return args.remote
		? [{ remote: false }, { remote: true }]
		: [{ remote: false, persistTo: args.persistTo }];
}

async function main(): Promise<number> {
	const args = parseCli(process.argv.slice(2));
	if (args.promote) return promote(args);
	const targets = targetsFor(args);
	const cards = await loadCards();

	if (args.reparse) {
		let worst = 0;
		for (const target of targets) worst = Math.max(worst, await reparse(target, cards, args.yes));
		return worst;
	}

	const client = new MeleeClient({
		delayMs: process.env.MELEE_DELAY_MS ? Number(process.env.MELEE_DELAY_MS) : undefined,
		cookie: process.env.MELEE_COOKIE,
		maxRequests: args.maxRequests
	});

	let exit = 0;
	const raise = (code: number) => {
		exit = Math.max(exit, code);
	};

	// A real run leaves what a database already holds alone: re-fetching an event costs ~20 paced
	// requests to Melee. `--force` is how a repair or a late deck gets in; `--check` always fetches.
	// Each database answers for itself, so an event only one of them lacks is fetched once and written
	// to just that one.
	const stored = new Map<Target, Set<number>>(
		targets.map((target) => [
			target,
			new Set(
				args.check || args.force
					? []
					: v
							.parse(
								v.array(v.object({ id: v.number() })),
								select(target, storedIdsQuery(args.ids))
							)
							.map((row) => row.id)
			)
		])
	);

	for (const id of args.ids) {
		say(paint.bold(`\n${id}`));
		const wanting = targets.filter((target) => !stored.get(target)?.has(id));
		for (const target of targets) {
			if (!wanting.includes(target)) {
				say(
					paint.dim(`  ○ already in the ${targetName(target)} database (--force fetches it again)`)
				);
			}
		}
		if (wanting.length === 0) continue;
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

			const statements = writeStatements(built);
			for (const target of wanting) {
				try {
					if (args.check) {
						const queries = storedQueries(id);
						const current = new Map(
							OWNED_TABLES.map((table) => [table, select(target, queries[table])] as const)
						);
						const differences = diffAgainstStored(built, current);
						if (differences.length === 0)
							say(paint.ok(`  ✓ the ${targetName(target)} database is current`));
						else {
							say(paint.change(`  ${targetName(target)}:`));
							for (const difference of differences) say(paint.change(`  ~ ${difference}`));
							raise(1);
						}
						continue;
					}

					if (
						!(await approved(
							target,
							`${tournament.name}: ${statements.length} statements.`,
							args.yes
						))
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
					// One database failing must not stop the other from getting the event.
					say(
						paint.remove(
							`  ✗ ${targetName(target)}: ${error instanceof Error ? error.message : String(error)}`
						)
					);
					raise(2);
				}
			}
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
