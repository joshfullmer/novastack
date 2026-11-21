# Runbook: putting the tournament pages on production

Written 2026-11-18. **Every step that touches production is yours to run**; nothing here has been run
against it. Local is the default for every command below unless it says `--remote`.

What ships: two migrations (`drizzle/0014_*.sql`, 8 new tables, and `0015_meta_version.sql`, one more for the
query cache's key; nothing existing touched), a `metas` row,
the five local events, then the code. The pages are `noindex` and linked from nowhere, so a deploy with
the data loaded is invisible until you link it.

## Order, and why

1. **Migrate** before the code: the new code queries the tournament tables, so deploying first would make
   `/meta/tournaments/*` error. The migration is additive, so the code already live ignores it.
2. **Seed and populate** before the push if you can: `--check --remote` then proves prod matches a fresh
   fetch before anyone could land on a page. (Either order is safe; the pages are unlinked.)
3. **Push** (a push to `main` deploys; the managed hook stops Claude from doing it).

## Before you start

- [ ] `pnpm lint && pnpm check && pnpm test` pass (`pnpm test` is the unit tests, then the e2e suite).
- [ ] Read-only: which migrations production has. Expect it to stop at `0013_overconfident_surge`, with
      `0014_conscious_sunfire` and `0015_meta_version` the only ones pending. If it lists `0014_cuddly_hex` or any
      `0015`-`0018` other than `0015_meta_version`, stop:
      those were the pre-squash names and the squash would conflict.
      `pnpm exec wrangler d1 migrations list novastack-decks --remote`
- [ ] A restore point. D1 Time Travel is on by default; note the time now:
      `pnpm exec wrangler d1 time-travel info novastack-decks`

## Steps

```sh
# 1. The tables. Lists what is pending and asks first.
pnpm exec wrangler d1 migrations apply novastack-decks --remote

# 2. The one meta. (Not in the migration: test databases run every migration and expect no metas.)
#    $BUMP is the cache-key bump `pnpm melee` appends to its own writes; a hand-run write must carry it.
BUMP="INSERT INTO meta_version (id, version) VALUES (1, 1) ON CONFLICT (id) DO UPDATE SET version = version + 1"
pnpm exec wrangler d1 execute novastack-decks --remote \
  --command "INSERT INTO metas (name, starts_on, ends_on) VALUES ('WNC', 1793923200000, NULL); $BUMP"

# 3. The events: copy what the local database already holds. No requests to Melee. It shows what
#    differs, then asks once; --yes skips the question.
pnpm melee --promote
#    (Or fetch them fresh into both databases, about 114 requests to Melee, instead:
#     pnpm melee 485070 477190 495716 487802 478979 --remote)

# 4. Prove it: exits 0 when production holds exactly what local does. Free.
pnpm melee --promote --check
#    Stricter, and fetches Melee again: exits 0 when both are what a fresh fetch would write.
#     pnpm melee 485070 477190 495716 487802 478979 --check --remote
```

Then spot-check the totals against local: 5 events, 32 decks (30 with a RAM), 71 standings, 174 matches.

```sh
pnpm exec wrangler d1 execute novastack-decks --remote --command \
  "select (select count(*) from tournaments) events, (select count(*) from tournament_decks) decks, (select count(*) from tournament_decks where ram is not null) with_ram, (select count(*) from standings) standings, (select count(*) from tournament_matches) matches"
```

5. Push. Open `/meta/tournaments` and a few pages (the period menu should default to WNC).

## If something goes wrong

- **A step 3 write fails part-way:** run the same id again; it deletes the event and writes it whole. The
  remote all-or-nothing behaviour was only ever tested locally, which is why "Before you start" takes a restore point.
- **Back the whole thing out:** it is additive and nothing else uses the tables, so drop them rather than
  restoring (a Time Travel restore also rewinds every other table, including anything written since):

  ```sh
  pnpm exec wrangler d1 execute novastack-decks --remote --command \
    "DROP TABLE tournament_matches; DROP TABLE standings; DROP TABLE tournament_deck_cards; DROP TABLE tournament_decks; DROP TABLE tournament_rounds; DROP TABLE tournaments; DROP TABLE players; DROP TABLE metas; DROP TABLE meta_version; DELETE FROM d1_migrations WHERE name IN ('0014_conscious_sunfire.sql', '0015_meta_version.sql')"
  ```

## Later

- An event that isn't ready (still running, results or lists not up) is refused and remembered in
  `scripts/melee-pending.json`; `pnpm melee --pending --remote` later tries every one again, so its id
  is only ever looked up once. `pnpm melee --list` shows what is waiting and why.
- Adding an event: `pnpm melee <id> --remote` writes the local and the production database together,
  then `--check --remote` proves both. To push what the local database already holds (events you ingested
  or `--reparse`d locally) without asking Melee again: `pnpm melee --promote --check` to see the
  difference, `pnpm melee --promote` to apply it. Ids already in the database are
  skipped, so a pasted batch is safe; add `--force` to fetch and rewrite one anyway (a repair, or decks
  that arrived late). The id is the number in
  `melee.gg/Tournament/View/<id>`; `/meta/tournaments/add` hosts a bookmarklet that copies the command from
  that page, or from a `/Decklists` search page, where it copies one command for every event listed
  (`src/lib/tournaments/bookmarklet.ts`). It only reads the page and writes the clipboard.
  Or let the job find them: `pnpm melee --discover [--search words] [--pages N] [--min-players N]
[--since YYYY-MM-DD]` lists ended events the local database lacks, newest first, until it reaches ones it
  already holds, and prints the command that ingests them; it writes nothing. Add `--ingest` (with
  `--check`, or `--remote`) to ingest them in the same run.
- A new meta is one `INSERT INTO metas` (name, start in ms UTC, end or NULL), plus the `$BUMP` from step 2 in the
  same command: the pages cache query results by `meta_version` (`src/lib/server/query-cache.ts`), so a write
  that skips it is not seen until the entries expire (a day). `pnpm melee` does this itself.
- To show the pages to everyone: `meta-launch.md` (the header link, `noindex`, the sitemap, in stages).
