/**
 * The whole pipeline — details, rounds, standings, matches, decks, build, check — over a fake Melee
 * that serves the responses captured from tournament 485070, with the request order and count
 * asserted. The point is the plumbing and the decisions; the parsing is `tournaments.spec.ts`.
 */
import { describe, expect, it } from 'vitest';
import { dataset } from '../cards/index.ts';
import { MeleeClient } from './client.ts';
import { MeleeSignInError } from './html.ts';
import { Refusal, SkipEvent, ingestTournament } from './ingest.ts';
import { ID, fakeClock, fakeMelee, standings, type Fake } from './testing.ts';

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

	it('uses the last round that has standings when nothing after it was played', async () => {
		// Melee lists Round 4 but never ran it: no standings, no matches.
		const roundFourEmpty = {
			standings: (page: { recordsTotal: number; data: unknown[] }, roundId: number) =>
				roundId === 1727274 ? { recordsTotal: 0, data: [] } : page,
			matches: (page: { recordsTotal: number; data: unknown[] }, round: number) =>
				round === 4 ? { recordsTotal: 0, data: [] } : page
		};
		const { requests, ingested } = run(roundFourEmpty);
		const { built, findings } = await ingested;
		expect(built.rounds.map((round) => round.number)).toEqual([1, 2, 3]);
		expect(built.matches.every((match) => match.round <= 3)).toBe(true);
		expect(built.standings).toHaveLength(14);
		expect(findings[0]).toBe(
			'Round 4 has no results on Melee, so the final standings are those after Round 3.'
		);
		// Round 4's standings (empty), then Round 3's, and Round 4's matches checked once.
		expect(requests.slice(2, 4)).toEqual([
			'POST /Standing/GetRoundStandings',
			'POST /Standing/GetRoundStandings'
		]);
		expect(requests.filter((line) => line.endsWith('/GetRoundMatches/1727274'))).toHaveLength(1);
	});

	it('will not guess a ranking when a round after the last standings has results', async () => {
		const roundFourUnpublished = {
			standings: (page: { recordsTotal: number; data: unknown[] }, roundId: number) =>
				roundId === 1727274 ? { recordsTotal: 0, data: [] } : page
		};
		await expect(run(roundFourUnpublished).ingested).rejects.toThrow(
			/Round 4 has results but Melee has no standings for it/
		);
	});

	describe('a playoff that was played but never ranked', () => {
		type Page = { recordsTotal: number; data: unknown[] };
		// Round 4 becomes the Finals between the two best Swiss players, with nothing published for it.
		// The two top-ranked players, in the shape of a Round 4 match.
		const topTwoMeet = (page: Page) => {
			const [match] = page.data as { Competitors: { Team: unknown }[] }[];
			const top = [...standings].sort((a, b) => a.Rank - b.Rank).slice(0, 2);
			return [
				{ ...match, Competitors: match.Competitors.map((c, i) => ({ ...c, Team: top[i].Team })) }
			];
		};
		const finalsUnranked = (round4: (page: Page) => unknown[] | null = topTwoMeet) => {
			return {
				view: (html: string) => html.replaceAll('Round 4', 'Finals'),
				standings: (page: Page, roundId: number) =>
					roundId === 1727274 ? { recordsTotal: 0, data: [] } : page,
				matches: (page: Page, round: number) => {
					if (round !== 4) return page;
					const data = round4(page) ?? page.data;
					return { recordsTotal: data.length, data };
				}
			};
		};

		it('is refused when the playoff is not a clean bracket, saying why', async () => {
			// The captured Round 4 is seven matches, not one final.
			await expect(run(finalsUnranked(() => null)).ingested).rejects.toThrow(
				/Finals has results but Melee has no standings for it, and the final ranking can't be read from them \(the last round is not a single final\)/
			);
		});

		it('reads the ranking from the bracket when it is clean', async () => {
			const { built, findings } = await run(finalsUnranked()).ingested;
			expect(built.rounds.map((round) => round.name)).toEqual([
				'Round 1',
				'Round 2',
				'Round 3',
				'Finals'
			]);
			expect(findings[0]).toMatch(
				/^Finals was played but Melee never published standings for it, so the final ranking is read from the bracket \(2 players in it\)/
			);
			expect(built.standings.map((row) => row.rank).sort((a, b) => a - b)).toEqual(
				Array.from({ length: 14 }, (_, i) => i + 1)
			);
			const finalMatch = built.matches.find((match) => match.round === 4);
			expect(finalMatch).toBeDefined();
			const champion = built.standings.find((row) => row.rank === 1);
			expect(champion?.playerId).toBe(
				finalMatch && finalMatch.gamesA > finalMatch.gamesB
					? finalMatch.playerA
					: finalMatch?.playerB
			);
		});
	});

	it('does not gate on most formats: any event with lists is ingested', async () => {
		const { built } = await run({ details: { Format: 'Draft' } }).ingested;
		expect(built.decks).toHaveLength(13);
	});

	it('skips a Sealed event after one request, before it reads anything else', async () => {
		const attempt = run({ details: { Format: 'Sealed' } });
		await expect(attempt.ingested).rejects.toThrow(SkipEvent);
		expect(attempt.client.requests).toBe(1);
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
