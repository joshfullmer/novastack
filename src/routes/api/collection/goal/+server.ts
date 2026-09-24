/**
 * Writing the Collecting Goal. Reads come back with the collection itself (`../+server.ts`),
 * since a completion figure needs both and a second round trip would buy nothing.
 *
 * `PUT` rather than `POST`: a Goal is replaced wholesale, and the same body applied twice leaves
 * the same state. `DELETE` returns the user to the default, which is a distinct outcome from
 * saving an empty Goal — empty means "collecting nothing", absent means "hasn't chosen".
 */
import { error, json } from '@sveltejs/kit';
import * as v from 'valibot';
import { PRINTING_RUNS } from '#lib/collection/goal.js';
import { clearGoal, setGoalRuns } from '#lib/server/db/collecting-goal.js';
import type { RequestHandler } from './$types';

export const prerender = false;

const NO_STORE = { 'cache-control': 'private, no-store' };

/** Only Runs that exist in the current dataset — a combination never printed is never a Goal. */
const RUN_KEYS = new Set(PRINTING_RUNS.map((run) => run.key));

const BodySchema = v.object({
	runs: v.pipe(
		v.array(v.pipe(v.string(), v.nonEmpty())),
		// Seventeen exist; the cap is generous headroom rather than a tight bound, so a future set
		// doesn't trip it.
		v.maxLength(200, 'runs: too many entries')
	)
});

export const PUT: RequestHandler = async (event) => {
	if (!event.locals.user) return error(401, 'Not signed in');

	let body;
	try {
		body = v.parse(BodySchema, await event.request.json());
	} catch (cause) {
		return error(400, cause instanceof v.ValiError ? cause.message : 'Malformed request body');
	}

	// Rejected rather than silently dropped: a client sending an unknown Run is a client whose
	// idea of the dataset disagrees with ours, and quietly storing a subset would make the saved
	// Goal differ from the one just confirmed on screen.
	const unknown = body.runs.filter((run) => !RUN_KEYS.has(run));
	if (unknown.length > 0) return error(400, `Unknown printing run: ${unknown[0]}`);

	await setGoalRuns(event.locals.db, event.locals.user.id, body.runs);
	return json({ runs: [...new Set(body.runs)].sort() }, { headers: NO_STORE });
};

export const DELETE: RequestHandler = async (event) => {
	if (!event.locals.user) return error(401, 'Not signed in');

	await clearGoal(event.locals.db, event.locals.user.id);
	return json({ runs: null }, { headers: NO_STORE });
};
