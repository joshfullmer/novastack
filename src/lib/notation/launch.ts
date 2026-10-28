/**
 * The one switch between "deployed" and "launched" for search engines.
 *
 * Every push to `main` ships, so the Notation section went to prod before it was announced. Until
 * this is `true` its routes are `noindex` and absent from the sitemap. The nav links to it
 * regardless (that is the section being *findable*, not *indexed*); flipping this is what asks
 * search engines to list it. The `novanotation.net` redirect is switched on in Cloudflare, not here.
 */
export const NOTATION_LAUNCHED = false;
