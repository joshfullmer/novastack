/**
 * Events that will never be ingested, remembered so no run looks at them twice —
 * `docs/spec/tournaments.md` §4.5.
 *
 * Unlike the pending list (events that aren't ready *yet*), these are refused for what they are: a
 * Sealed or Draft event has no constructed decklists to read, however long anyone waits. `--discover`
 * leaves them out and counts them as ground already covered. Pure; the CLI owns the file. Plain JSON
 * keyed by id so it reads and diffs well in git.
 */
import * as v from 'valibot';

const EntrySchema = v.object({
	/** Melee's name for the event, so the list is readable. */
	name: v.nullable(v.string()),
	/** Melee's format for it: what it was skipped for. */
	format: v.string(),
	skippedAt: v.string()
});

export type SkippedEntry = v.InferOutput<typeof EntrySchema>;
export type Skipped = Readonly<Record<string, SkippedEntry>>;

const SkippedSchema = v.record(v.pipe(v.string(), v.regex(/^\d+$/)), EntrySchema);

export const skippedIds = (skipped: Skipped): number[] =>
	Object.keys(skipped)
		.map(Number)
		.sort((a, b) => a - b);

/** The file's text → what it holds. Empty or absent text is an empty list; anything else must be valid. */
export function parseSkipped(text: string | null): Skipped {
	if (text === null || text.trim() === '') return {};
	const raw: unknown = JSON.parse(text);
	if (Array.isArray(raw))
		throw new Error('The skipped list is an object keyed by id, not an array.');
	return v.parse(SkippedSchema, raw);
}

/** Ids in numeric order, so a re-save changes only what changed. */
export function serializeSkipped(skipped: Skipped): string {
	const sorted = Object.fromEntries(
		skippedIds(skipped).map((id) => [String(id), skipped[String(id)]])
	);
	return `${JSON.stringify(sorted, null, '\t')}\n`;
}

/** Remember an event as not worth ingesting. Skipping it again keeps when it was first skipped. */
export function skip(
	skipped: Skipped,
	id: number,
	event: { name: string | null; format: string },
	now: Date
): Skipped {
	const before = skipped[String(id)];
	return {
		...skipped,
		[String(id)]: {
			name: event.name ?? before?.name ?? null,
			format: event.format,
			skippedAt: before?.skippedAt ?? now.toISOString()
		}
	};
}

/** You want it looked at again. */
export function unskip(skipped: Skipped, ids: readonly number[]): Skipped {
	const drop = new Set(ids.map(String));
	return Object.fromEntries(Object.entries(skipped).filter(([id]) => !drop.has(id)));
}
