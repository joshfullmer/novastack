/**
 * PROTOTYPE — throwaway route. Delete this folder once a variant wins.
 *
 * Not prerendered: the switcher reads `?variant=` from `url.searchParams`, and SvelteKit refuses
 * to expose `searchParams` at all on a prerendered page — same hard build error, and same fix, as
 * `sets/[id]/+page.server.ts` and `cards/[slug]/+page.server.ts`.
 */
export const prerender = false;
export const ssr = false;
