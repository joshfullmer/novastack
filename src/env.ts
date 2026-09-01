import { defineEnvVars } from '@sveltejs/kit/env';
import { building } from '$app/env';
import * as v from 'valibot';

/**
 * Optional while `building` (the SSR bundle is analysed/prerendered with no real request
 * context), required otherwise — the documented SvelteKit pattern for exactly this case
 * (https://svelte.dev/docs/kit/environment-variables#Validation). Without this, `pnpm build`
 * fails everywhere, including CI, purely because `src/lib/server/auth.ts` is eagerly evaluated
 * during prerendering even though none of the prerendered routes touch auth.
 */
const requiredAtRuntime = building ? v.optional(v.string()) : v.pipe(v.string(), v.nonEmpty());

export const variables = defineEnvVars({
	ORIGIN: {
		description: 'The app origin (base URL), e.g. `http://localhost:5173`.',
		schema: requiredAtRuntime
	},
	BETTER_AUTH_SECRET: {
		description:
			'Secret used to sign tokens. For production use 32 characters generated with high entropy. See [Better Auth installation](https://www.better-auth.com/docs/installation).',
		schema: requiredAtRuntime
	},
	RESEND_API_KEY: {
		description:
			'API key for the Resend account sending verification/reset emails. See https://resend.com/api-keys.',
		schema: requiredAtRuntime
	},
	DISCORD_CLIENT_ID: {
		description:
			'OAuth2 client ID for the Discord application backing Discord sign-in. See https://discord.com/developers/applications.',
		schema: requiredAtRuntime
	},
	DISCORD_CLIENT_SECRET: {
		description:
			'OAuth2 client secret for the Discord application backing Discord sign-in. See https://discord.com/developers/applications.',
		schema: requiredAtRuntime
	}
});
