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
 * `--discover` lists the events Melee has that the local database lacks, and writes nothing.
 *
 * Exit codes are the interface, as for `pnpm prices:check`:
 *
 * - `0` — done / `--check`: what is stored is what would be written
 * - `1` — `--check` only: it would change (a normal answer, not a failure)
 * - `2` — a Tournament was refused or failed an invariant, or something could not be reached
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as v from 'valibot';
import { SnapshotSchema, type Card } from '../src/lib/cards/schema.ts';
import { parseCli, USAGE } from '../src/lib/tournaments/args.ts';
import { MeleeClient, RequestLimitError } from '../src/lib/tournaments/client.ts';
import {
	commandFor,
	eventLines,
	openSearch,
	PAGE_SIZE,
	settled,
	sift,
	walk,
	type Found
} from '../src/lib/tournaments/discover.ts';
import { Refusal, SkipEvent, ingestTournament } from '../src/lib/tournaments/ingest.ts';
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
import {
	describePending,
	dueFirst,
	forget,
	idsOf,
	lapsed,
	parsePending,
	RECHECK_HOURS,
	remember,
	serializePending,
	type Pending
} from '../src/lib/tournaments/pending.ts';
import {
	parseSkipped,
	serializeSkipped,
	skip,
	skippedIds,
	unskip,
	type Skipped
} from '../src/lib/tournaments/skipped.ts';

const CARDS_PATH = path.join('src', 'lib', 'cards', 'cards.json');

const say = (line = '') => console.log(line);

/** Ids that weren't ready, remembered between runs so they are only ever looked up once. */
const PENDING_PATH = process.env.MELEE_PENDING ?? path.join('scripts', 'melee-pending.json');

async function loadPending(): Promise<Pending> {
	const text = await readFile(PENDING_PATH, 'utf8').catch((error: NodeJS.ErrnoException) => {
		if (error.code === 'ENOENT') return null;
		throw error;
	});
	return parsePending(text);
}

/** Events skipped for what they are (Sealed has no decklists), so no run looks at them twice. */
const SKIPPED_PATH = process.env.MELEE_SKIPPED ?? path.join('scripts', 'melee-skipped.json');

async function loadSkipped(): Promise<Skipped> {
	const text = await readFile(SKIPPED_PATH, 'utf8').catch((error: NodeJS.ErrnoException) => {
		if (error.code === 'ENOENT') return null;
		throw error;
	});
	return parseSkipped(text);
}

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
 * `--discover`: the tournaments Melee lists (the Find Events search) that the databases being written
 * lack, newest first, until it reaches events already held. Reads Melee and the databases; writes
 * nothing. `--ingest` then ingests what it found, through the ordinary run.
 */
async function discoverNew(
	client: MeleeClient,
	args: {
		search: string;
		pages: number;
		deep: boolean;
		minPlayers: number;
		since: string | null;
	},
	targets: readonly Target[],
	waiting: Pending,
	skipped: Skipped
): Promise<Found[]> {
	// Known means every database being written holds it: one that lacks it still wants the event.
	const heldByAll = (ids: readonly number[]) => {
		if (ids.length === 0) return new Set<number>();
		const held = targets.map(
			(target) =>
				new Set(
					v
						.parse(v.array(v.object({ id: v.number() })), select(target, storedIdsQuery(ids)))
						.map((row) => row.id)
				)
		);
		return new Set(ids.filter((id) => held.every((set) => set.has(id))));
	};

	const stored = new Set<number>();
	const filters = {
		stored,
		waiting: new Set(idsOf(waiting)),
		skipped: new Set(skippedIds(skipped)),
		...args
	};
	let stoppedAt: number | null = null;
	const search = await openSearch(client, { search: args.search });
	const found = await walk(search, args.pages, (number, page) => {
		for (const id of heldByAll(page.found.map((event) => event.id))) stored.add(id);
		say(paint.dim(`  page ${number}: ${page.found.length} events`));
		if (!args.deep && settled(page.found, filters)) stoppedAt = number;
		return stoppedAt !== null;
	}).finally(() => search.close());

	const {
		candidates,
		known,
		notEnded,
		waiting: waits,
		skipped: skips,
		older,
		small
	} = sift(found, filters);
	const into = targets.map(targetName).join(' and ');
	say();
	say(
		paint.dim(
			args.deep
				? `Read every page (${Math.ceil(found.length / PAGE_SIZE)}).`
				: stoppedAt === null
					? `Read ${args.pages} pages without reaching an event already held (--pages reads more, --deep reads all).`
					: `Stopped at page ${stoppedAt}: events from there on are already held, waiting or skipped, or older than --since.`
		)
	);
	say(
		paint.dim(
			`${found.length} events read · ${known} already in ${into} · ${notEnded.length} not ended · ${waits} waiting · ${skips} skipped · ${older} before --since · ${small} under ${args.minPlayers} players`
		)
	);
	if (notEnded.length > 0) {
		say(
			paint.dim(
				`Not ended (Melee refuses these until they are): ${notEnded.map((event) => event.id).join(' ')}`
			)
		);
	}
	say(paint.dim(`${client.requests} requests to melee.gg so far`));
	say();
	if (candidates.length === 0) say(paint.ok(`Nothing new for the ${into} database.`));
	else {
		say(paint.bold(`${candidates.length} not in the ${into} database yet:`));
		for (const line of eventLines(candidates)) say(line);
	}
	return candidates;
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
	if (args.list || args.forget) {
		const waiting = await loadPending();
		const skipped = await loadSkipped();
		if (args.list) {
			const lines = describePending(waiting, new Date());
			say(lines.length === 0 ? 'Nothing is waiting.' : lines.join('\n'));
			if (skippedIds(skipped).length > 0) {
				say(paint.dim(`\n${skippedIds(skipped).length} skipped for good (${SKIPPED_PATH}).`));
			}
			return 0;
		}
		const next = forget(waiting, args.ids);
		const unskipped = unskip(skipped, args.ids);
		await writeFile(PENDING_PATH, serializePending(next));
		await writeFile(SKIPPED_PATH, serializeSkipped(unskipped));
		const gone = idsOf(waiting).length - idsOf(next).length;
		const freed = skippedIds(skipped).length - skippedIds(unskipped).length;
		say(
			`Forgot ${gone} waiting and ${freed} skipped of ${args.ids.length}; ${idsOf(next).length} still waiting.`
		);
		return 0;
	}
	const targets = targetsFor(args);
	const cards = await loadCards();
	let waiting = await loadPending();
	let skipped = await loadSkipped();
	const client = new MeleeClient({
		delayMs: process.env.MELEE_DELAY_MS ? Number(process.env.MELEE_DELAY_MS) : undefined,
		cookie: process.env.MELEE_COOKIE,
		maxRequests: args.maxRequests
	});
	const now = new Date();
	let ids = args.pending ? dueFirst(waiting, now) : args.ids;
	if (args.pending && ids.length === 0) {
		const total = idsOf(waiting).length;
		const gaveUp = lapsed(waiting, now).length;
		say(
			total === 0
				? 'Nothing is waiting.'
				: `Nothing is due: ${total} waiting, ${gaveUp} given up on, the rest tried within ${RECHECK_HOURS}h (--list says when; \`pnpm melee <id>\` tries one now).`
		);
		return 0;
	}
	if (args.discover) {
		const candidates = await discoverNew(client, args, targets, waiting, skipped);
		if (!args.ingest) {
			if (candidates.length > 0) say(`\n${commandFor(candidates)}`);
			return 0;
		}
		if (candidates.length === 0) return 0;
		ids = candidates.map((event) => event.id);
		say(paint.dim('\nIngesting them:'));
	}

	if (args.reparse) {
		let worst = 0;
		for (const target of targets) worst = Math.max(worst, await reparse(target, cards, args.yes));
		return worst;
	}

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
							.parse(v.array(v.object({ id: v.number() })), select(target, storedIdsQuery(ids)))
							.map((row) => row.id)
			)
		])
	);

	// Saved after every id, so an interrupted run keeps what it learned.
	const settle = async (next: Pending) => {
		if (serializePending(next) === serializePending(waiting)) return;
		waiting = next;
		await writeFile(PENDING_PATH, serializePending(waiting));
	};

	for (const id of ids) {
		say(paint.bold(`\n${id}`));
		// Whether this id is finished with: written everywhere it was wanted (or already there).
		let done = !args.check;
		let refusal: Refusal | undefined;
		let skipping: SkipEvent | undefined;
		const wanting = targets.filter((target) => !stored.get(target)?.has(id));
		for (const target of targets) {
			if (!wanting.includes(target)) {
				say(
					paint.dim(`  ○ already in the ${targetName(target)} database (--force fetches it again)`)
				);
			}
		}
		if (wanting.length === 0) {
			await settle(forget(waiting, [id]));
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
						done = false;
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
					done = false;
					raise(2);
				}
			}
		} catch (error) {
			if (error instanceof RequestLimitError) {
				say(paint.remove(`  ✗ ${error.message}`));
				say(paint.dim(`\nRun again to carry on: --pending tries the longest-waiting ids first.`));
				return 2;
			}
			if (error instanceof SkipEvent) {
				// An answer, not a failure: the event is what it is, so no exit code is raised.
				say(paint.dim(`  ○ ${error.message}`));
				skipping = error;
			} else {
				if (error instanceof Refusal) {
					say(paint.change(`  ○ ${error.message}`));
					refusal = error;
				} else {
					say(paint.remove(`  ✗ ${error instanceof Error ? error.message : String(error)}`));
					done = false;
				}
				raise(2);
			}
		}

		// Not ready is remembered, so the id is only ever looked up once; written is forgotten.
		// `--check` writes nothing, and neither does it touch the list.
		if (args.check) continue;
		if (skipping) {
			// Skipped for good: kept apart from the waiting list, which is only for "not yet".
			skipped = skip(
				skipped,
				id,
				{ name: skipping.eventName, format: skipping.format },
				new Date()
			);
			await writeFile(SKIPPED_PATH, serializeSkipped(skipped));
			await settle(forget(waiting, [id]));
		} else if (refusal) {
			await settle(
				remember(waiting, id, { name: refusal.eventName, reason: refusal.message }, new Date())
			);
		} else if (done) {
			await settle(forget(waiting, [id]));
		}
	}

	say(paint.dim(`\n${client.requests} requests to melee.gg`));
	if (idsOf(waiting).length > 0) {
		say(
			paint.dim(
				`${idsOf(waiting).length} waiting to be ready: pnpm melee --pending to try again, --list to see why.`
			)
		);
	}
	return exit;
}

try {
	process.exitCode = await main();
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	// The usage is for a mistyped command; a run that hit its own request ceiling isn't one.
	if (!(error instanceof RequestLimitError)) console.error(USAGE);
	process.exitCode = 2;
}
