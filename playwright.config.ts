import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against a **built and previewed** app, not against components rendered in
 * isolation.
 *
 * That is a deliberate choice rather than a default. The behaviour most worth testing here is
 * SvelteKit's own: shallow routing, prerendered pages narrowing on hydration, and query-param
 * deep-links. A component rendered without the router has no real `page.url` and no real `goto`,
 * so a test at that level can only exercise mocks — and mocks are precisely what would have hidden
 * the bug where a shallow navigation updated the address bar but not `page.url`.
 */
export default defineConfig({
	testDir: 'e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? 'github' : 'list',

	use: {
		baseURL: 'http://localhost:4173',
		trace: 'retain-on-failure'
	},

	projects: [
		{
			name: 'desktop',
			use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 900 } },
			testIgnore: /mobile\.spec\.ts/
		},
		// The mobile composition is genuinely different — the pane disappears and tapping a tile
		// navigates — so it gets its own spec file rather than a resize inside a desktop test.
		//
		// A Chromium device rather than an iOS one, deliberately: every assertion in that file is
		// about *composition* (pane hidden, filters collapsed, columns clamped), which is
		// engine-independent, and one engine keeps the suite to a single browser download in CI. If
		// an iOS-specific rendering bug ever shows up, that is the moment to add WebKit — not before.
		{ name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ }
	],

	webServer: {
		command: 'pnpm build && pnpm preview --port 4173 --strictPort',
		port: 4173,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000
	}
});
