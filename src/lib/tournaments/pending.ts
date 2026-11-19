/**
 * Events that were asked for before they were ready — `docs/spec/tournaments.md` §4.5.
 *
 * Finding a Melee id is the slow, manual part of adding an event, and an event still in progress (or
 * one whose results or lists aren't up yet) refuses to ingest. So a refusal is remembered here, and
 * `pnpm melee --pending` tries them all again later: the id is only ever looked up once. Pure; the
 * CLI owns the file. Plain JSON keyed by id so it reads and diffs well in git.
 */
import * as v from 'valibot';

const EntrySchema = v.object({
	/** Melee's name for the event, so the list is readable; null when Melee hadn't answered. */
	name: v.nullable(v.string()),
	/** Why it wasn't ingested, as the refusal said it. */
	reason: v.string(),
	firstTried: v.string(),
	lastTried: v.string(),
	attempts: v.pipe(v.number(), v.integer(), v.minValue(1))
});

export type PendingEntry = v.InferOutput<typeof EntrySchema>;
export type Pending = Readonly<Record<string, PendingEntry>>;

const PendingSchema = v.record(v.pipe(v.string(), v.regex(/^\d+$/)), EntrySchema);

export const idsOf = (pending: Pending): number[] =>
	Object.keys(pending)
		.map(Number)
		.sort((a, b) => a - b);

/** The file's text → what it holds. Empty or absent text is an empty list; anything else must be valid. */
export function parsePending(text: string | null): Pending {
	if (text === null || text.trim() === '') return {};
	const raw: unknown = JSON.parse(text);
	if (Array.isArray(raw))
		throw new Error('The pending list is an object keyed by id, not an array.');
	return v.parse(PendingSchema, raw);
}

/** Ids in numeric order, so a re-save changes only what changed. */
export function serializePending(pending: Pending): string {
	const sorted = Object.fromEntries(idsOf(pending).map((id) => [String(id), pending[String(id)]]));
	return `${JSON.stringify(sorted, null, '\t')}\n`;
}

/** The event wasn't ready this time: remember it, or bump what is already remembered. */
export function remember(
	pending: Pending,
	id: number,
	refusal: { name: string | null; reason: string },
	now: Date
): Pending {
	const before = pending[String(id)];
	return {
		...pending,
		[String(id)]: {
			name: refusal.name ?? before?.name ?? null,
			reason: refusal.reason,
			firstTried: before?.firstTried ?? now.toISOString(),
			lastTried: now.toISOString(),
			attempts: (before?.attempts ?? 0) + 1
		}
	};
}

/** It got ingested (or was already), or you gave up on it. */
export function forget(pending: Pending, ids: readonly number[]): Pending {
	const drop = new Set(ids.map(String));
	return Object.fromEntries(Object.entries(pending).filter(([id]) => !drop.has(id)));
}

const days = (from: string, now: Date) =>
	Math.max(0, Math.floor((now.getTime() - new Date(from).getTime()) / 86_400_000));

/** One readable line per id, oldest id first. */
export function describePending(pending: Pending, now: Date): string[] {
	return idsOf(pending).map((id) => {
		const entry = pending[String(id)];
		const waiting = days(entry.firstTried, now);
		return (
			`${id}  ${entry.name ?? '(name unknown)'}\n` +
			`      ${entry.reason}\n` +
			`      ${entry.attempts} ${entry.attempts === 1 ? 'try' : 'tries'}, ` +
			`first ${waiting === 0 ? 'today' : `${waiting}d ago`}`
		);
	});
}
