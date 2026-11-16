/**
 * The whole pipeline — details, rounds, standings, matches, decks, build, check — over a fake Melee
 * that serves the responses captured from tournament 485070, with the request order and count
 * asserted. The point is the plumbing and the decisions; the parsing is `tournaments.spec.ts`.
 */
import { describe, expect, it } from 'vitest';
import { dataset } from '../cards/index.ts';
import { MeleeClient } from './client.ts';
import { MeleeSignInError } from './html.ts';
import { Refusal, ingestTournament } from './ingest.ts';
import { ID, fakeClock, fakeMelee, type Fake } from './testing.ts';

function run(fake: Fake = {}) {
	const requests: string[] = [];
	const clock = fakeClock();
	const client = new MeleeClient({
		fetch: fakeMelee(fake, requests),
		now: clock.now,
		sleep: clock.sleep
	});
	return {
		requests,
		client,
		ingested: ingestTournament(client, ID, { cards: dataset.cards })
	};
}

describe('ingesting a finished Constructed event', () => {
	it('reads details, the page, standings, the one player with no list, every round, then every deck', async () => {
		const { requests, ingested, client } = run();
		const { built, violations } = await ingested;

		expect(requests.map((line) => line.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/, '<guid>'))).toEqual([
			'GET /Tournament/GetTournamentDetails?id=485070',
			'GET /Tournament/View/485070',
			'POST /Standing/GetRoundStandings',
			'GET /Player/GetPlayerDetails?id=4649883',
			'POST /Match/GetRoundMatches/1727271',
			'POST /Match/GetRoundMatches/1727272',
			'POST /Match/GetRoundMatches/1727273',
			'POST /Match/GetRoundMatches/1727274',
			...Array.from({ length: 13 }, () => 'GET /Decklist/View/<guid>')
		]);
		expect(client.requests).toBe(21);

		expect(violations).toEqual([]);
		expect(built.tournament).toMatchObject({ id: ID, playerCount: 14 });
		expect(built.standings).toHaveLength(14);
		expect(built.decks).toHaveLength(13);
		expect(built.standings.filter((row) => row.deckGuid === null)).toHaveLength(1);
		expect(built.matches).toHaveLength(28);
	});

	it('reads each deck once, however many standings share a guid', async () => {
		const { requests, ingested } = run();
		await ingested;
		const guids = requests.filter((line) => line.includes('/Decklist/View/'));
		expect(new Set(guids).size).toBe(guids.length);
	});

	it('uses the GetPlayerDetails fallback when it finds a list', async () => {
		const { requests, ingested } = run({ player: { decklists: [{ id: 'fallback-guid' }] } });
		const { built } = await ingested;
		expect(requests).toContain('GET /Decklist/View/fallback-guid');
		expect(built.standings.find((row) => row.rank === 12)?.deckGuid).toBe('fallback-guid');
		expect(built.decks).toHaveLength(14);
	});
});

describe('an event that is not ready', () => {
	it('refuses one that has not ended, after a single request', async () => {
		const { requests, ingested } = run({ details: { Status: 'In Progress' } });
		await expect(ingested).rejects.toThrow(Refusal);
		await expect(run({ details: { Status: 'In Progress' } }).ingested).rejects.toThrow(
			/"In Progress", not Ended/
		);
		expect(requests).toHaveLength(1);
	});

	it('does not ingest an event that has no decklists, and says why', async () => {
		const noLists = (page: { recordsTotal: number; data: unknown[] }) => ({
			...page,
			data: page.data.map((row) => ({ ...(row as object), Decklists: [] }))
		});
		await expect(run({ standings: noLists }).ingested).rejects.toThrow(
			/no decklists \(none of its 14 players has one up\)/
		);
	});

	it('refuses an event whose last round has no published standings, saying why', async () => {
		const unpublished = () => ({ recordsTotal: 0, data: [] });
		await expect(run({ standings: unpublished }).ingested).rejects.toThrow(
			/no standings for the last round \(Round 4\)/
		);
	});

	it('does not gate on format: any event with lists is ingested', async () => {
		const { built } = await run({ details: { Format: 'Draft' } }).ingested;
		expect(built.decks).toHaveLength(13);
	});

	it('does not ingest an event whose only lists are blank', async () => {
		const blank = (page: { recordsTotal: number; data: unknown[] }) => ({
			...page,
			data: page.data.map((row) => ({ ...(row as object), Decklists: [] }))
		});
		await expect(run({ standings: blank }).ingested).rejects.toThrow(Refusal);
	});
});

describe('when Melee is not what we measured', () => {
	it('names the sign-in page instead of reading it', async () => {
		await expect(run({ signInAt: '/Tournament/View' }).ingested).rejects.toThrow(MeleeSignInError);
	});

	it('fails rather than truncate when a page returns fewer rows than Melee says exist', async () => {
		const lying = (page: { recordsTotal: number; data: unknown[] }) => ({
			...page,
			recordsTotal: 20
		});
		await expect(run({ standings: lying }).ingested).rejects.toThrow(
			/reports 20 rows but returned only 14/
		);
	});

	it('refuses a response for a different tournament than asked', async () => {
		await expect(run({ details: { ID: 7 } }).ingested).rejects.toThrow(/Melee answered 7/);
	});
});
