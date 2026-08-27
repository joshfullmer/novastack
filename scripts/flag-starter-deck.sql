-- Marks a deck as an official Starter Deck. No admin UI sets this — see .scratch/starter-decks/map.md
-- for why: it happens a handful of times total, for the one person who runs this app.
--
-- Replace <deckId> below with the deck's real id, then run:
--   pnpm exec wrangler d1 execute DB --remote --file scripts/flag-starter-deck.sql
-- (drop --remote to flag a deck in the local dev database instead)
--
-- `visibility` is forced to 'public' in the same statement — a Starter Deck is always public,
-- and this script is the only path that ever sets the flag, so there's nowhere else to enforce it.
UPDATE decks
SET is_starter_deck = 1, visibility = 'public'
WHERE id = '<deckId>';
