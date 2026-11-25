/**
 * What Melee sends back, parsed at the boundary — `docs/spec/tournaments.md` §1.2.
 *
 * Melee publishes no schema, and a prior scraper broke when it renamed an endpoint, so nothing here
 * is trusted as typed: every response is `v.parse`d, and a shape that has changed fails loudly rather
 * than becoming a half-empty Tournament. Each schema lists only the fields we use; Melee sends many
 * more and `v.object` drops them.
 *
 * Shapes were read from tournament 485070 on 2026-11-16 (`research/melee-ingest.md`). What that one
 * event could not show — a bye, a forfeit, a top cut, a non-empty `GetPlayerDetails` — is marked
 * where it appears.
 */
import * as v from 'valibot';

const int = v.pipe(v.number(), v.integer());
const nonEmpty = v.pipe(v.string(), v.nonEmpty());

/** Melee sends `null` for "none": a loser with no game wins, a match with no draws. Read as 0. */
const count = v.pipe(
	v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
	v.transform((n) => n ?? 0)
);

const PlayerSchema = v.object({
	/** The only stable identity: usernames can be `__placeholder__`, display names are free text. */
	ID: int,
	DisplayName: nonEmpty,
	Username: nonEmpty
});

/**
 * Exactly one player. Teams of several are a different game's events, and quietly taking the first
 * would put the wrong people in the results, so this fails the run instead.
 */
const TeamSchema = v.object({ Players: v.pipe(v.array(PlayerSchema), v.length(1)) });

const DecklistRefSchema = v.object({
	DecklistId: nonEmpty,
	PlayerId: int,
	/** The player's own label (colour letters in the event measured) — not an archetype. */
	DecklistName: v.string(),
	Format: v.string(),
	FormatId: nonEmpty
});
export type MeleeDecklistRef = v.InferOutput<typeof DecklistRefSchema>;

/** `GET /Tournament/GetTournamentDetails?id=` */
export const MeleeDetailsSchema = v.object({
	ID: int,
	Name: nonEmpty,
	StartDate: v.pipe(v.string(), v.isoTimestamp()),
	/** "Ended" once over; anything else means the results aren't final. */
	Status: nonEmpty,
	OrganizationId: int,
	OrganizationName: nonEmpty,
	/** Empty for an event never set up (no format, no players): refused as not ended before it matters. */
	Format: v.string(),
	ParticipatorCount: v.pipe(int, v.minValue(0))
});
export type MeleeDetails = v.InferOutput<typeof MeleeDetailsSchema>;

/** One row of `POST /Standing/GetRoundStandings`. */
export const MeleeStandingSchema = v.object({
	Rank: int,
	Points: int,
	MatchWins: int,
	MatchLosses: int,
	MatchDraws: int,
	GameWins: int,
	GameLosses: int,
	GameDraws: int,
	GameCount: int,
	Team: TeamSchema,
	/** Empty for a player who registered no list — or, per swubase, one Melee hasn't surfaced yet. */
	Decklists: v.array(DecklistRefSchema),
	FormatId: nonEmpty,
	RoundId: int,
	TournamentId: int
});
export type MeleeStanding = v.InferOutput<typeof MeleeStandingSchema>;

/** DataTables pages: `recordsTotal` is how many rows exist, `data` the page. */
export const MeleeStandingsPageSchema = v.object({
	recordsTotal: v.pipe(int, v.minValue(0)),
	data: v.array(MeleeStandingSchema)
});

const CompetitorSchema = v.object({
	Team: TeamSchema,
	GameWins: count,
	GameByes: count
});

/** One row of `POST /Match/GetRoundMatches/{roundId}`. */
export const MeleeMatchSchema = v.object({
	/**
	 * Two for a played match. **One for a bye** — unseen in the event measured; taken from swubase's
	 * handling and the `ResultString`. Zero is tolerated and skipped.
	 */
	Competitors: v.pipe(v.array(CompetitorSchema), v.maxLength(2)),
	/** `"X won 2-1-0"`, `"1-1-1 Draw"`, and — per swubase, unseen here — a bye or forfeit sentence. */
	ResultString: v.nullable(v.string()),
	GameDraws: count,
	HasResult: v.boolean(),
	/** What the round buttons carry; `RoundNumber` is not used because a top cut may not have one. */
	RoundId: int,
	TableNumber: v.nullable(int)
});
export type MeleeMatch = v.InferOutput<typeof MeleeMatchSchema>;

export const MeleeMatchesPageSchema = v.object({
	recordsTotal: v.pipe(int, v.minValue(0)),
	data: v.array(MeleeMatchSchema)
});

/**
 * `GET /Player/GetPlayerDetails?id=` — used only as swubase does, when a final standing shows no
 * decklist. In the one case seen, the list was empty (the player genuinely registered none), so the
 * element shape is **unverified**: swubase reads `id`, and normalizes `DecklistId ?? id`. Both are
 * accepted; anything else fails.
 */
export const MeleePlayerDetailsSchema = v.object({
	/** `null` for a player Melee has no lists for at all (479485), the same as `[]`. */
	decklists: v.pipe(
		v.nullable(
			v.array(
				v.union([
					v.pipe(
						v.looseObject({ id: nonEmpty }),
						v.transform((item) => item.id)
					),
					v.pipe(
						v.looseObject({ DecklistId: nonEmpty }),
						v.transform((item) => item.DecklistId)
					)
				])
			)
		),
		v.transform((lists) => lists ?? [])
	)
});
