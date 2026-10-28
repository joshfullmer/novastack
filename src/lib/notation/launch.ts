/**
 * The switch between "deployed" and "launched" for search engines.
 *
 * Every push to `main` ships, so the Notation section first went to prod before it was announced: while
 * this was `false` its routes were `noindex` and absent from the sitemap, though the nav already linked
 * to them. It was flipped to `true` on 2026-10-28, which is what asks search engines to list them.
 * Kept as a switch rather than deleted, so a section that needs pulling back out of search can be. The
 * `novanotation.net` redirect is switched on in Cloudflare, not here.
 */
export const NOTATION_LAUNCHED = true;
