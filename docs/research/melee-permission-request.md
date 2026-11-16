# Draft: asking Melee for permission to read tournament data

> **Do not send as written.** This draft promises an identifying User-Agent and a 5 s gap. As of
> 2026-11-16 `docs/spec/tournaments.md` §1.3 has the job send swubase's browser UA at 500 ms, run by
> hand on one tournament id at a time (not "once a day" as the draft says). Either
> rewrite the "How I'd behave" and request 2 below to match, or send it and change the job to the
> honest UA at 5 s. See the spec's §5.

**To:** contact@melee.gg
**Subject:** Request: read-only access to public Cyberpunk TCG tournament data (novastack.gg)

Fill the `[brackets]` before sending. Written 2026-11-16; the paths and the User-Agent below are the
ones in `docs/spec/tournaments.md` and were measured in `docs/research/melee-ingest.md`.

---

Hi Melee team,

I run [Novastack](https://novastack.gg), an unofficial, fan-made card database and deckbuilder for
the Cyberpunk TCG. I'd like to add tournament results and winning decklists to it, linking back to
Melee for every event, and I'd like to do it in a way you're comfortable with.

**What I'd read.** For a short, hand-picked list of finished Cyberpunk TCG tournaments (I choose the
IDs; I'm not crawling or searching Melee), the same public data the tournament page loads:

- `GET /Tournament/View/{id}` and `GET /Tournament/GetTournamentDetails?id={id}`
- `POST /Standing/GetRoundStandings` and `POST /Match/GetRoundMatches/{roundId}`
- `GET /Decklist/View/{guid}` for each registered decklist

No login, no cookies, no API credentials. I only read tournaments whose status is **Ended**.

**How I'd behave.**

- One request every 5 seconds, sequentially (your `robots.txt` crawl delay), from a single scheduled
  job that runs at most once a day. A typical event is a few dozen requests in total.
- An identifying User-Agent: `Mozilla/5.0 (compatible; Novastack/1.0; +https://novastack.gg)`.
- Nothing is changed or submitted on Melee, and nothing is fetched twice once an event is stored.
- I stop immediately if you ask me to.

**What I'd store and show.** Final standings, match results, and each deck's list, plus the player
names exactly as Melee displays them, each event linking back to its Melee page. [Optional: a visible
"Data from Melee" credit.]

**What I'm asking for.**

1. Permission to fetch `/Decklist/View/{guid}` as above. I know `robots.txt` disallows that path, and
   it's the only place the card list is shown, so I'd rather ask than assume.
2. If it's easy, an allowlist for the User-Agent above. Your WAF rejects User-Agents that don't start
   with `Mozilla/5.0`, which is how I found it, and I'd like to avoid being caught by a later rule
   change.
3. If there's a better route than this (a feed, an approved-integration arrangement, a preferred rate
   or schedule), I'm happy to switch.

[Optional, delete if you'd rather not name them: I understand swubase.com does something similar for
Star Wars: Unlimited.]

Thanks for the platform, and for your time.

[Your name]
[A contact address you're happy to receive replies at]
https://novastack.gg
