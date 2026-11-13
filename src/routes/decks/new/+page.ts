// A local draft lives in `localStorage`, which only exists in the browser — so this page renders
// there and nowhere else. Nothing is lost: there is no server state to render, and the shell
// (nav, layout) still arrives from the server. Overrides the root layout's `prerender = true`.
export const prerender = false;
export const ssr = false;
