/**
 * How far Meta (`/meta/…`: the tier list, matchups, cards, decks and tournaments) has been launched —
 * `docs/runbooks/meta-launch.md`. Like `NOTATION_LAUNCHED`, one constant every dark-deployed surface reads,
 * so deploying and launching are separate steps. Two stages after dark, because linking and indexing are
 * different risks:
 *
 * | stage    | header link | `noindex` | in the sitemap |
 * | -------- | ----------- | --------- | -------------- |
 * | `dark`   | no          | yes       | no             |
 * | `linked` | yes         | yes       | no             |
 * | `public` | yes         | no        | yes            |
 *
 * `/meta/tournaments/add` (the bookmarklet page) is outside the stages: only `vite dev` serves it, and it is a 404
 * on the deployed site.
 * Pulling it back is setting this back.
 */
export type MetaStage = 'dark' | 'linked' | 'public';

// `as` so the comparisons below stay meaningful whichever stage this is set to.
export const META_STAGE = 'linked' as MetaStage;

/** Whether the site header links to Meta. */
export const META_LINKED = META_STAGE === 'linked' || META_STAGE === 'public';

/** Whether search engines are asked to list it. */
export const META_INDEXED = META_STAGE === 'public';

/**
 * Whether a Meta page asks to be kept out of search results: until it is public, and, once it is, when
 * a filter narrows it (`?kind=`, `?ram=`, `?line=`, …). A filtered view is one of thousands of near-copies of
 * the page without it, which is what the canonical link already says; this stops a crawler listing them.
 */
export const metaNoindex = (url: { search: string }) => !META_INDEXED || url.search !== '';
