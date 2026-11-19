# Runbook: putting the tournament pages on production

Written 2026-11-18. **Every step that touches production is yours to run**; nothing here has been run
against it. Local is the default for every command below unless it says `--remote`.

What ships: one migration (`drizzle/0014_*.sql`, 8 new tables, nothing existing touched), a `metas` row,
the five local events, then the code. The pages are `noindex` and linked from nowhere, so a deploy with
the data loaded is invisible until you link it.

## Order, and why

1. **Migrate** before the code: the new code queries the tournament tables, so deploying first would make
   `/tournaments/*` error. The migration is additive, so the code already live ignores it.
2. **Seed and populate** before the push if you can: `--check --remote` then proves prod matches a fresh
   fetch before anyone could land on a page. (Either order is safe; the pages are unlinked.)
3. **Push** (a push to `main` deploys; the managed hook stops Claude from doing it).

## Before you start

- [ ] `pnpm lint && pnpm check && pnpm test` pass (`pnpm test` is the unit tests, then the e2e suite).
- [ ] Read-only: which migrations production has. Expect it to stop at `0013_overconfident_surge`, with
      `0014_conscious_sunfire` the only one pending. If it lists `0014_cuddly_hex` or any `0015`-`0018`, stop:
      those were the pre-squash names and the squash would conflict.
      `pnpm exec wrangler d1 migrations list novastack-decks --remote`
- [ ] A restore point. D1 Time Travel is on by default; note the time now:
      `pnpm exec wrangler d1 time-travel info novastack-decks`

## Steps

```sh
# 1. The tables. Lists what is pending and asks first.
pnpm exec wrangler d1 migrations apply novastack-decks --remote

# 2. The one meta. (Not in the migration: test databases run every migration and expect no metas.)
pnpm exec wrangler d1 execute novastack-decks --remote \
  --command "INSERT INTO metas (name, starts_on, ends_on) VALUES ('WNC', 1793923200000, NULL)"

# 3. The events. It asks before writing; --yes skips the question. About 114 requests to Melee.
pnpm melee 485070 477190 495716 487802 478979 --remote

# 4. Prove it: exits 0 when production is what a fresh fetch would write. (Fetches Melee again.)
pnpm melee 485070 477190 495716 487802 478979 --check --remote
```

Then spot-check the totals against local: 5 events, 32 decks (30 with a RAM), 71 standings, 174 matches.

```sh
pnpm exec wrangler d1 execute novastack-decks --remote --command \
  "select (select count(*) from tournaments) events, (select count(*) from tournament_decks) decks, (select count(*) from tournament_decks where ram is not null) with_ram, (select count(*) from standings) standings, (select count(*) from tournament_matches) matches"
```

5. Push. Open `/tournaments` and a few pages (the period menu should default to WNC).

## If something goes wrong

- **A step 3 write fails part-way:** run the same id again; it deletes the event and writes it whole. The
  remote all-or-nothing behaviour was only ever tested locally, which is why "Before you start" takes a restore point.
- **Back the whole thing out:** it is additive and nothing else uses the tables, so drop them rather than
  restoring (a Time Travel restore also rewinds every other table, including anything written since):

  ```sh
  pnpm exec wrangler d1 execute novastack-decks --remote --command \
    "DROP TABLE tournament_matches; DROP TABLE standings; DROP TABLE tournament_deck_cards; DROP TABLE tournament_decks; DROP TABLE tournament_rounds; DROP TABLE tournaments; DROP TABLE players; DROP TABLE metas; DELETE FROM d1_migrations WHERE name = '0014_conscious_sunfire.sql'"
  ```

## Later

- Adding an event: `pnpm melee <id> --remote`, then `--check --remote`. The id is the number in
  `melee.gg/Tournament/View/<id>`; `/tournaments/add` hosts a bookmarklet that copies the command from
  that page (`src/lib/tournaments/bookmarklet.ts`). It only reads the address and writes the clipboard.
- A new meta is one `INSERT INTO metas` (name, start in ms UTC, end or NULL).
- To show the pages to everyone: add the nav link and drop `noindex` (`Meta` component), when you are ready.
