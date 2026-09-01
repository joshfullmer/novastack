import { fail } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';

/**
 * Runs a Better Auth call and turns its failure into a form `fail`, never an unhandled throw.
 * `section` tags the result so a page with several independent forms on it (e.g. `/account`)
 * can tell which one a shared `form` prop's message belongs to.
 */
export async function attemptAuth(run: () => Promise<unknown>, section?: string) {
	try {
		await run();
	} catch (error) {
		if (error instanceof APIError) return fail(400, { message: error.message, section });
		return fail(500, { message: 'Unexpected error', section });
	}
}
