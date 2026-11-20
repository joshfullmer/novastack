/**
 * Talking to D1 through `wrangler`, which is already logged in on the machine that runs the job —
 * the reason `pnpm melee` needs no Cloudflare token in CI (`docs/spec/tournaments.md` §4).
 *
 * Two operations: run a SQL file (a write), and run one SELECT (a read). Local is the default.
 * `--remote` is the production database, and `confirmRemote` asks before a write goes there.
 */
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import * as v from 'valibot';

export type Target = { remote: boolean; persistTo?: string };

/** The `DB` binding in `wrangler.jsonc`: the one database, `novastack-decks`. */
const BINDING = 'DB';

const base = (target: Target) => [
	'exec',
	'wrangler',
	'd1',
	'execute',
	BINDING,
	target.remote ? '--remote' : '--local',
	...(target.persistTo ? ['--persist-to', target.persistTo] : [])
];

export const targetName = (target: Target) => (target.remote ? 'PRODUCTION' : 'local');

/**
 * Asks before a write to production. Our question rather than wrangler's, so it names what is about
 * to happen; `--yes` skips it. Without a terminal the answer is no.
 */
export async function confirmRemote(summary: string): Promise<boolean> {
	if (!process.stdin.isTTY) return false;
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const answer = await rl.question(`  ${summary}\n  Write to the PRODUCTION database? [y/N] `);
	rl.close();
	return /^y(es)?$/i.test(answer.trim());
}

/**
 * Appended to every write, so a changed database is a changed cache key (`query-cache.ts`). Inside the
 * same file, so it commits or rolls back with the write it announces. Writes that bypass `runFile` (a
 * hand-run `wrangler d1 execute`) must run this themselves.
 */
const BUMP_META_VERSION =
	'INSERT INTO meta_version (id, version) VALUES (1, 1) ON CONFLICT (id) DO UPDATE SET version = version + 1;';

const FileResultSchema = v.array(v.object({ success: v.boolean() }));

/**
 * Runs a SQL file and returns how many statements it ran. wrangler prints a JSON result for every
 * one, which for a big event is thousands of lines, so its output is read here and summarised, not
 * passed through. Throws on failure, with wrangler's own words.
 */
export async function runFile(target: Target, sql: string): Promise<number> {
	const dir = await mkdtemp(path.join(tmpdir(), 'melee-'));
	const file = path.join(dir, 'write.sql');
	await writeFile(file, `${sql}\n${BUMP_META_VERSION}\n`);
	const result = spawnSync('pnpm', [...base(target), '--yes', '--json', '--file', file], {
		encoding: 'utf8',
		maxBuffer: 256 * 1024 * 1024
	});
	const fail = (why: string) =>
		new Error(
			`${why} writing the ${targetName(target)} database. A failed file is rolled back locally; ` +
				`rerunning the same id repairs a partial write.\n${(result.stderr || result.stdout).slice(-1500)}`
		);
	if (result.status !== 0) throw fail(`wrangler failed (exit ${result.status})`);
	const outcomes = v.parse(
		FileResultSchema,
		JSON.parse(result.stdout.slice(result.stdout.indexOf('[')))
	);
	if (!outcomes.every((outcome) => outcome.success)) throw fail('A statement did not succeed');
	return outcomes.length;
}

const ResultSchema = v.pipe(
	v.array(v.object({ results: v.array(v.record(v.string(), v.unknown())) })),
	v.length(1)
);

/** One SELECT, as rows. */
export function select(target: Target, sql: string): Record<string, unknown>[] {
	const result = spawnSync('pnpm', [...base(target), '--json', '--command', sql], {
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024
	});
	if (result.status !== 0) {
		const hint = /no such table/i.test(`${result.stdout}${result.stderr}`)
			? ` The ${targetName(target)} database has no tournament tables: apply migrations first (pnpm exec wrangler d1 migrations apply DB ${target.remote ? '--remote' : '--local'}).`
			: '';
		throw new Error(`wrangler failed running a SELECT.${hint}\n${result.stderr || result.stdout}`);
	}
	// `--json` prints one JSON document; anything before its opening bracket is wrangler's banner.
	const json = result.stdout.slice(result.stdout.indexOf('['));
	return v.parse(ResultSchema, JSON.parse(json))[0].results;
}
