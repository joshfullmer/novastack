import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Deploying to Cloudflare Workers static assets. Card images are served as
			// static assets, which are free and unlimited — only Worker script
			// invocations count against the 100k/day free limit. Never set
			// run_worker_first, or asset requests become billable.
			// See docs/netdeck-api-notes.md §5.
			adapter: adapter({
				/**
				 * Cloudflare **Pages** only — ignored on Workers static assets, which is this
				 * project's primary target.
				 *
				 * On Pages the adapter enumerates every static file into `_routes.json`, and
				 * `_routes.json` is capped at 100 rules. With 1,167 mirrored images that cap is blown
				 * by an order of magnitude: the adapter drops ~1,206 exclude rules and warns that this
				 * "will cause unnecessary function invocations" — i.e. asset requests start invoking
				 * the Function and become billable, which is precisely what the hosting choice exists
				 * to prevent.
				 *
				 * Globs fix it. Every route here prerenders and there is no server code, so the
				 * Function is only ever the 404 fallback: excluding the whole tree by prefix costs
				 * seven rules instead of 1,305. This is only expressible because the card art lives
				 * under its own `/card-art/` prefix rather than inside the `/cards/` route namespace.
				 */
				routes: {
					include: ['/*'],
					exclude: [
						'/card-art/*', // 1,167 mirrored images, three tiers each
						'/_app/*', // build artifacts
						'/cards/*', // the prerendered card pages
						'/cards', // the grid itself — `/cards/*` does not match it
						'/', // the landing page
						'/robots.txt',
						'/404.html'
					]
				}
			}),

			// Absolute paths, not SvelteKit's default relative ones.
			//
			// Relative paths make prerendered HTML disagree with the running app: a prerendered
			// hero card emits `href="./cards/v-streetkid"` while the same component renders
			// `/cards/v-streetkid` after hydration. That is portable across deploy prefixes, which
			// this site does not need — it is served from the root of its own domain — and it costs
			// the property that a link's markup means the same thing everywhere.
			paths: { relative: false }
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
