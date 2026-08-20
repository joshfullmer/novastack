# Routes and rendering strategy

Type: grilling
Status: open
Blocked by: 03, 05

## Question

What are the routes, and how is each one rendered on `@sveltejs/adapter-cloudflare`?

There is a real tension to resolve: filter state in the URL versus prerendering. Notes §5
warns that Worker script invocations are the only metered thing — static asset requests are
free and unlimited — so every route that can be prerendered should be.

- **Route list.** `/cards` for the grid, `/cards/[slug]` for detail, and what else? Does the
  root redirect to `/cards` or is the grid the root? Is there a per-set route, or is set just
  a filter?
- **Prerender vs SSR vs CSR.** Can `/cards` prerender when its query params carry filter
  state — do query params even participate in prerendering? Are all 131 detail pages
  prerendered (cheap, and great for sharing) or rendered on demand?
- **Where the data loads.** Universal `load`, server `load`, or a plain module import in the
  component? If the snapshot is a build-time import, `load` may be unnecessary ceremony —
  but that decision follows from *Card data snapshot: shape, location, refresh*.
- **First paint with filters applied.** Someone opens a filtered link. Does the server render
  the filtered grid, or does the page paint everything and narrow on hydration? The second is
  simpler and probably fine at this scale — decide deliberately, not by accident.
- **Bundle shape.** If the whole dataset is imported into the client bundle, what does that
  do to the initial JS payload versus fetching a JSON asset after paint?
- **Adapter config.** Confirm the adapter is actually wired in `vite.config.ts` (notes §7 —
  the `sveltekit-adapter` add-on is broken and this was done by hand), and note anything the
  spec must say about `run_worker_first`, which would make asset requests billable.
