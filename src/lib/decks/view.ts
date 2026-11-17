/**
 * How a deck's cards are drawn, as the visitor last chose it (the `deck-cards-view` cookie, shared by a
 * saved deck's page and a tournament deck): a table, art in a grid, or art piled the way a physical
 * deck is, copies overlapped. The deck editor only knows the first two and falls back to its own default
 * for a cookie that says `stacks`.
 */
export const DECK_VIEWS = ['gallery', 'stacks', 'list'] as const;
export type DeckView = (typeof DECK_VIEWS)[number];
