import { describe, expect, it, vi } from 'vitest';

/** `dev` is a build-time constant, so each case loads a fresh copy of the route with it set. */
async function loadWith(dev: boolean) {
	vi.resetModules();
	vi.doMock('$app/env', () => ({ dev }));
	const { load } = await import('./+page.server.ts');
	return load({} as Parameters<typeof load>[0]);
}

describe('/meta/tournaments/add', () => {
	it('is served by the dev server', async () => {
		await expect(loadWith(true)).resolves.toBeUndefined();
	});

	it('is a 404 anywhere else', async () => {
		await expect(loadWith(false)).rejects.toMatchObject({ status: 404 });
	});
});
