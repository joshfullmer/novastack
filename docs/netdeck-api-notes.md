# NetDeck API — Research Notes

Findings from probing `https://api.netdeck.gg` on **2026-08-20**. Everything below was
measured against the live API, not inferred from docs — there are no public docs and no
`/openapi.json`.

Target: a hobby-scale deckbuilder for the Cyberpunk TCG.

---

## 1. API surface

Base: `https://api.netdeck.gg/api/cards/{game}`

Games found: `cyberpunk` (131 cards), `mtg` (32,384 cards). Everything else tried
(`pokemon`, `lorcana`, `onepiece`, `riftbound`, `gundam`) → 404.

### Endpoints

| endpoint                               | notes                                     |
| -------------------------------------- | ----------------------------------------- |
| `GET /api/cards/cyberpunk`             | list, paginated, `printings` **stripped** |
| `GET /api/cards/cyberpunk/{slug}`      | detail, `printings` **populated**         |
| `GET /api/cards/cyberpunk/{uuid}`      | 404 — slug lookup only                    |
| `GET /api/games`                       | 401, needs bearer token                   |
| `/openapi.json`, `/api`, `/api/sets/*` | 404                                       |

Express backend (`X-Powered-By: Express`), CORS enabled, no auth on `/api/cards/*`.

### Pagination

Response envelope: `{ items, limit, offset, total }`.

- Default `limit` = **60**
- Max `limit` = **100** (asking for 9999 silently returns 100)
- `total` for cyberpunk = **131**

```bash
B="https://api.netdeck.gg/api/cards/cyberpunk"
for o in 0 100; do curl -s "$B?limit=100&offset=$o" | jq '.items[]'; done | jq -s '.' > cards.json
```

### Query params — verified

| param                                            | works | notes                                              |
| ------------------------------------------------ | ----- | -------------------------------------------------- |
| `limit`, `offset`                                | ✅    | limit capped at 100                                |
| `set=<code>`                                     | ✅    | matches **any** printing, not just the default one |
| `color=Red`                                      | ✅    | → 32                                               |
| `type=Legend`                                    | ✅    | → 25                                               |
| `q=Royce`                                        | ✅    | → 2                                                |
| `rarity=Rare`                                    | ✅    | → 27                                               |
| `card_type`, `colors`, `search`, `name`          | ❌    | ignored                                            |
| `sort`, `order`, `include_printings`, `group_by` | ❌    | ignored                                            |

> ⚠️ **Unknown params are ignored, not rejected.** `?card_type=Legend` returns all 131
> and looks like success. Always assert that `total` actually moved.

### Rate limits

None hit. 385 concurrent-ish image fetches at concurrency 24, and 131 detail
requests at concurrency 12, both completed with zero 429s. No published limit, so
be a good citizen and keep concurrency ≤ 24.

---

## 2. Data model — two tiers

**Card** = gameplay identity (one per card). **Printing** = physical object (N per card).

The card object also _flattens one chosen printing_ onto itself, which is the main trap.

```
Card
  id, external_id, slug                      ← identity
  name, subname, display_name
  rules_text, flavor_text                    ← same for every variant
  card_type, color, cost, power, ram
  classifications[], keywords[], is_eddiable
  legality

  selected_printing_id ─┐  (null in list responses)
  printing_id ──────────┤  same value
  set, rarity, print_number, artist  ←──── COPIED from selected printing
  image_url, source_image_url        ←────

  printings: [ { id, collector_number, set{code,name},
                 rarity, finish, artist,
                 image_url, source_image_url } ]
```

### Counts

- **131** cards — unique `id`, unique `slug`, zero duplicate names
- **385** printings across **12** sets
- Per-card spread: 75 cards ×2 printings, 17 ×3, 12 ×4, 26 ×5, 1 ×6

| set code                          | printings |
| --------------------------------- | --------- |
| `welcometonightcitybeta`          | 143       |
| `welcometonightcityretail`        | 121       |
| `theheistretailstarterdeck`       | 18        |
| `theheistbetastarterdeck`         | 18        |
| `mercdemodeck`                    | 15        |
| `embracingpowerretailstarterdeck` | 15        |
| `embracingpowerbetastarterdeck`   | 15        |
| `arasakademodeck`                 | 14        |
| `prereleasebeta`                  | 11        |
| `boxtoppersretail`                | 6         |
| `boxtoppersbeta`                  | 6         |
| `PRM01` (Set 1 Promos)            | 3         |

`card_type`: Unit 65, Program 26, Legend 25, Gear 15. `legality`: all 131 `legal`.
`color`: Yellow 35, Red 32, Blue 32, Green 32.

### Gotchas

1. **List and detail return different shapes**, not just different depth:

   | field                  | `?limit=60` | `/{slug}` |
   | ---------------------- | ----------- | --------- |
   | `printings`            | `[]`        | populated |
   | `selected_printing_id` | `null`      | UUID      |

   You cannot build a variant picker from the list response — no error, just an
   empty array.

2. **`rarity` / `artist` / `set` / `print_number` are printing-level.** The flattened
   copy on the card can disagree with the printings it contains. Example — V — StreetKid
   is card-level `rarity: "Rare"`, but its `β144` printing is `Iconic Legend`.
   Read those off `printings[]`; treat card-level copies as "what to show by default".

3. **Naming inconsistency:** `print_number` (card) vs `collector_number` (printing) hold
   the same kind of value. Normalize in a mapper.

4. `finish` is declared on every printing and is **`null` on all 385**. Foil/non-foil is
   not tracked. If foiling matters to the deckbuilder, that data isn't here.

### Worked example — V — StreetKid, 5 printings

| #       | rarity        | set                            | artist         |
| ------- | ------------- | ------------------------------ | -------------- |
| `005a`  | Rare          | Welcome to Night City — Retail | Olgierd Ciszak |
| `005b`  | Rare          | Welcome to Night City — Retail | Olgierd Ciszak |
| `β005a` | Rare          | Welcome to Night City — Beta   | Olgierd Ciszak |
| `β005b` | Rare          | Welcome to Night City — Beta   | Olgierd Ciszak |
| `β144`  | Iconic Legend | Welcome to Night City — Beta   | Pandart Studio |

`a`/`b` = two art treatments, mirrored across Retail and Beta. `β144` is the alt-art
Iconic Legend, different artist. `printings[0].id === selected_printing_id` — the default
is always inside the array, never a hidden extra.

### TypeScript

```ts
type SetRef = { code: string; name: string };

type Printing = {
	id: string;
	collector_number: string; // "005a" | "β144"
	set: SetRef;
	rarity: string; // varies per printing
	artist: string; // varies per printing
	finish: null; // always null across all 385
	image_url: string; // signed, ~24h
	source_image_url: string; // stable identity, NOT fetchable
};

type Card = {
	id: string;
	external_id: string; // "cb-v-streetkid"
	slug: string;
	name: string;
	subname: string | null;
	display_name: string;
	rules_text: string;
	flavor_text: string | null;
	card_type: 'Legend' | 'Unit' | 'Program' | 'Gear';
	color: 'Red' | 'Blue' | 'Green' | 'Yellow';
	cost: number;
	power: number;
	ram: number;
	classifications: string[];
	keywords: string[];
	is_eddiable: boolean;
	legality: string;

	selected_printing_id: string | null; // null in list responses
	printing_id: string;
	set: SetRef; // ⚠ default printing's
	rarity: string; // ⚠ default printing's
	print_number: string; // ⚠ default printing's collector_number
	artist: string; // ⚠ default printing's
	image_url: string;
	source_image_url: string;

	printings: Printing[]; // [] in list responses
};
```

---

## 3. Images

### The two URL fields

They point at **the same S3 object**. Not two sizes, not original-vs-derivative. The
difference is _identity vs capability_:

|                    | fetchable             | stable     |
| ------------------ | --------------------- | ---------- |
| `source_image_url` | ❌ **403 MissingKey** | ✅         |
| `image_url`        | ✅ 200                | ❌ 24h TTL |

```
source_image_url  https://…/portal/20debd66-…/render-mpxm5mbr.webp
                  → 403 <Code>MissingKey</Code>
image_url         …same path… ?Expires=…&Key-Pair-Id=…&Signature=…
                  → 200 image/webp
```

The CloudFront distribution has a trusted key group, so the unsigned URL is not a
fallback — it never reaches the origin. **You re-fetch by calling the API again**, not by
hitting `source_image_url`.

### Signature mechanics

- **CloudFront canned policy** — signature covers the entire final URL.
- **24h window** (`Expires` = request time + 86400).
- **Minted per request.** Two calls 3s apart return different `Expires` and different
  `Signature`. Both remain valid concurrently (signing is stateless).

Every mutation fails identically with `403 AccessDenied`:

| mutation                                | result |
| --------------------------------------- | ------ |
| as issued                               | `200`  |
| signature + a different printing's path | `403`  |
| `&foo=bar` appended                     | `403`  |
| `Expires` +1                            | `403`  |
| `Signature` last 2 chars changed        | `403`  |

Consequences:

- **No query params, ever.** No `?w=400`, no cache-buster. Resize yourself or proxy.
- **`Expires` is readable** — plain unix timestamp, so you know the death time without probing.
- **Response caching is poisoned.** Signature churn makes every API response
  byte-different even when nothing changed; the list endpoint's weak `ETag` will
  change every request. Diff on `id` / `source_image_url`, never on raw response bytes.

### Measurements (all 385)

|                   |                                          |
| ----------------- | ---------------------------------------- |
| images            | **385**                                  |
| total             | **46.0 MB**                              |
| per-image         | avg 122 KB, range 64–232 KB              |
| dimensions        | **733×1024, uniform — all 385**          |
| format            | `image/webp` only, single rendition      |
| **alpha channel** | **present on 385/385** (VP8X alpha flag) |
| unique sha256     | **385 / 385**                            |

Two conclusions:

- **No dedupe possible.** Retail `005a` and beta `β005a` are different bytes — set symbol
  and collector number are burned into the render. 385 printings = 385 files.
- **Aspect ratio is a constant 733:1024.** Safe to hardcode → zero layout shift.
- **The API ships no thumbnail.** Derivatives are entirely on you. A 60-card grid at
  full res is ~7 MB and 60 full-res decodes.

Default printings only (one per card) = 131 images ≈ 16 MB.

### Path structure

```
/prod/{env}/{game}/portal/{printing_id}/render-{hash}.webp
                          └─ == printings[].id, verified 385/385, 0 mismatches
```

385 unique source URLs ↔ 385 unique printing IDs, perfect 1:1, stable across calls.

---

## 4. Mirroring strategy

**Decision: mirror at build time. Never hotlink.** Four independent reasons:

1. Signed URLs can't live in your data — a saved deck would render broken tomorrow.
2. Can't resize on their CDN (canned policy) — you need derivatives regardless.
3. They ship one size only.
4. 46 MB is trivial. The usual objection to mirroring doesn't apply.

### Key by `printing_id`

```
static/cards/{printing_id}/{width}.webp
```

Not slug, not collector number. `printing_id` is already in their path, is 1:1 with
images, and survives renames and renumbering. `β005a` as a filename will break the first
time a set is reprinted.

DB stores `printing_id` + `source_image_url`. **Never** `image_url`.

### Two stages

```
stage 1  fetch  → mirror/{printing_id}.webp      (46 MB, gitignored)
stage 2  derive → static/cards/{id}/{244,488}.webp
```

```ts
// scripts/mirror-images.ts
const API = 'https://api.netdeck.gg/api/cards/cyberpunk';

// list strips printings[] — must hit detail per card
const slugs: string[] = [];
for (let offset = 0; ; offset += 100) {
	const page = await fetch(`${API}?limit=100&offset=${offset}`).then((r) => r.json());
	slugs.push(...page.items.map((c: any) => c.slug));
	if (slugs.length >= page.total) break;
}

const cards = await pool(slugs, 12, (s) => fetch(`${API}/${s}`).then((r) => r.json()));
const printings = cards.flatMap((c) => c.printings);

// manifest = last known source_image_url per printing
const manifest: Record<string, string> = JSON.parse(
	await readFile('mirror/manifest.json', 'utf8').catch(() => '{}')
);

const stale = printings.filter((p) => manifest[p.id] !== p.source_image_url);

await pool(stale, 12, async (p) => {
	// image_url is fresh here — use immediately, never store
	const buf = Buffer.from(await fetch(p.image_url).then((r) => r.arrayBuffer()));
	await writeFile(`mirror/${p.id}.webp`, buf);
	manifest[p.id] = p.source_image_url;
});
```

Derivatives with `sharp`:

```ts
await sharp(`mirror/${id}.webp`)
	.resize({ width: w })
	.webp({ quality: 82 })
	.toFile(`static/cards/${id}/${w}.webp`);
```

### Invalidation

`source_image_url` contains `render-{hash}.webp`. Diff it to detect changed art without
downloading 46 MB:

```
manifest[id] !== printing.source_image_url  → re-fetch
id not in manifest                          → new printing
id in manifest, absent from API             → delisted
```

⚠️ **Unverified:** the render hash was observed _stable_ over minutes, but not confirmed
to _rotate on re-render_. If it's static, silent art updates would be missed. Keep a
periodic full byte-hash reconcile as a backstop.

Cadence: on set releases + a weekly cron. Never per-request.

### Sizing decision

Ship **244w** (grid/search, 2× a ~120px tile) and **488w** (detail/zoom). Skip 733w —
488w renders fine at ~360 CSS px. That's ~37 MB instead of ~83 MB.

Keep 733w originals in gitignored `mirror/` so any tier can be regenerated offline
without re-hitting the API.

> Derivative byte sizes are **estimated** (~20–30 KB at 244w, ~60–80 KB at 488w).
> Could not measure — no `sharp`/`cwebp`/PIL available, and `sips` can't decode WebP.
> Verify when the pipeline is built.

---

## 5. Hosting — verified free tiers

Payload: **~770 files** (385 × 2 tiers), largest ~232 KB, **~37 MB** total.

| option                                 | free tier                                                                                                   | fits?              |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------ |
| **Cloudflare Workers** (static assets) | 20,000 files, 25 MiB/file; **static-asset requests free & unlimited**; 100k/day _Worker script_ invocations | ✅                 |
| **Cloudflare Pages**                   | 20,000 files, 25 MiB/file, 500 builds/mo, bandwidth not metered                                             | ✅                 |
| **Cloudflare R2**                      | 10 GB storage, 1M Class A, 10M Class B ops/mo, **egress free**                                              | ✅ 0.4% of storage |
| GitHub Pages                           | 1 GB site, 100 GB/mo _soft_ bandwidth                                                                       | ✅                 |
| Vercel Hobby                           | 100 GB/mo transfer, but **100 MB source upload cap**                                                        | ⚠️ too tight       |
| Netlify                                | now opaque "300 credits", no published GB                                                                   | ❓                 |

### Decision: Cloudflare Workers static assets

Chosen over Pages because `sv`'s Pages target is broken (see §7) and Cloudflare now
recommends Workers. Verified the important part: **requests to static assets are free and
unlimited on both free and paid plans** — the 100k/day cap only applies to requests that
invoke the Worker script (SSR). The 1,155 image requests don't count.

Caveats to remember:

- `run_worker_first` would make asset requests billable. Don't set it.
- Workers _Caching_ API requests are billed at the Worker rate. Don't route assets through it.
- Prerender pages where possible to keep script invocations near zero.

Cache headers — the `{printing_id}/{width}` path is content-addressed enough for:

```
Cache-Control: public, max-age=31536000, immutable
```

Fall back to **R2** if the repo passes ~100 MB of images, or to serve 733w originals
without committing them. Costs an upload step + CI credentials, and decouples image
versioning from code rollbacks.

> IP note: mirroring and redistributing card art is a legal question, not a technical
> one. Fan deckbuilders do it routinely, but the art belongs to the publisher and
> mirroring makes us the distributor. Worth reading their terms before shipping publicly.

---

## 6. Blur-up placeholders (LQIP)

**LQIP** = Low Quality Image Placeholder. The effect is called **blur-up**.

Mechanism: generate a tiny representation at build time → **ship it inline** in the card
JSON → render it upscaled (browser interpolation + a little CSS blur) → cross-fade to the
real image on `load`. If the placeholder is its own HTTP request, you've added a
round-trip and made things worse.

### Use ThumbHash, not BlurHash

| technique                 | wire cost                | alpha       |
| ------------------------- | ------------------------ | ----------- |
| dominant color            | 3 bytes                  | n/a         |
| BlurHash                  | ~30 chars                | ❌ **none** |
| **ThumbHash**             | ~25 bytes (33 b64 chars) | ✅          |
| inline tiny WebP data URI | ~400–800 B               | ✅          |

**All 385 images have an alpha channel** (transparent rounded corners). BlurHash has no
alpha support → you'd get an opaque blurred rectangle with square corners bleeding past
the card silhouette on every grid tile. ThumbHash encodes alpha.

Budget: 385 × 33 chars ≈ **13 KB for every printing in the game**. Inline WebP ≈ 230 KB.

### Tier 0 is free — use `color`

The API already gives every card a `color` (Yellow 35 / Red 32 / Blue 32 / Green 32).
That's a **zero-byte** placeholder needing no hash and no JS, and it's semantically
correct — the colour it flashes is the card's actual colour identity.

Layer: `color` background paints instantly → ThumbHash on hydration → real image fades in.

### Generation

```ts
import sharp from 'sharp';
import { rgbaToThumbHash } from 'thumbhash';

const { data, info } = await sharp(`mirror/${printingId}.webp`)
	.resize(100, 100, { fit: 'inside' }) // ThumbHash requires max 100×100
	.ensureAlpha()
	.raw()
	.toBuffer({ resolveWithObject: true });

const thumbhash = Buffer.from(rgbaToThumbHash(info.width, info.height, data)).toString('base64');
```

Store alongside the printing:

```jsonc
{ "id": "20debd66-…", "collector_number": "β144", "thumbhash": "3PcNNYSFeXh/d3eld0iHZoZgVwh2" }
```

### Component (Svelte 5)

```svelte
<script lang="ts">
	import { thumbHashToDataURL } from 'thumbhash';

	let {
		id,
		thumbhash,
		color,
		alt,
		width = 244
	}: {
		id: string;
		thumbhash: string;
		color: string;
		alt: string;
		width?: 244 | 488;
	} = $props();

	let img = $state<HTMLImageElement>();
	let loaded = $state(false);

	const placeholder = $derived(
		thumbHashToDataURL(Uint8Array.from(atob(thumbhash), (c) => c.charCodeAt(0)))
	);

	// cached images finish before hydration — onload never fires, blur sticks forever
	$effect(() => {
		if (img?.complete) loaded = true;
	});
</script>

<div class="relative aspect-[733/1024] {`bg-faction-${color.toLowerCase()}`}">
	<img
		src={placeholder}
		alt=""
		aria-hidden="true"
		class="absolute inset-0 size-full scale-105 blur-md transition-opacity duration-300"
		class:opacity-0={loaded}
	/>
	<img
		bind:this={img}
		src="/cards/{id}/{width}.webp"
		{alt}
		loading="lazy"
		decoding="async"
		onload={() => (loaded = true)}
		class="relative size-full transition-opacity duration-500"
		class:opacity-0={!loaded}
	/>
</div>
```

### Gotchas

- **The cached-image bug** — if the image is already cached, `load` fires before Svelte
  attaches the handler and the blur never clears. The `img.complete` check is the fix.
  Most common blur-up defect in the wild.
- **`scale-105` matters** — blurring samples past the element edge and produces a faded
  border; scaling up pushes the artifact outside the box.
- **Don't lazy-load above the fold** — first grid row should be eager, or you get a blur
  flash on immediately-visible cards.
- Blur-up is a **first-visit-only** effect given `immutable` caching.

---

## 7. Project setup notes

Scaffolded with `sv` v0.17.0 → SvelteKit 2.63, Svelte 5.56, Vite 8, TS 6, Tailwind 4.3,
Vitest 4.1. Runes forced on for non-`node_modules` files.

Two things that tripped us up:

1. **There is no `svelte.config.js` anymore.** Config lives in `vite.config.ts`, with the
   adapter passed to the `sveltekit()` plugin.
2. **The `sveltekit-adapter` add-on is broken in sv 0.17.0** — fails with
   `Cannot read properties of undefined (reading 'package')` for _both_ `cfTarget:workers`
   and `cfTarget:pages`, almost certainly because it tries to patch the now-nonexistent
   `svelte.config.js`. Workaround: scaffold without it, then
   `pnpm add -D @sveltejs/adapter-cloudflare` and swap the import in `vite.config.ts`
   manually. Worth filing upstream.

---

## 8. Open questions

- Does `render-{hash}` rotate when art is re-rendered? Determines whether
  `source_image_url` diffing is a sufficient invalidation signal. (§4)
- Actual derivative byte sizes at 244w / 488w. (§4)
- What `/api/games` returns and how tokens are issued — 401 today.
- Are there unreleased/upcoming sets not exposed via `set=`? `set=set1promos` → 0 while
  the list shows a `PRM01` card, so set-code discovery is incomplete.
- Does `mtg` (32,384 cards) share this schema? Relevant only if multi-game is ever a goal.

---

## Appendix — useful one-liners

```bash
B="https://api.netdeck.gg/api/cards/cyberpunk"

curl -s "$B?limit=1" | jq .total                   # 131
curl -s "$B/v-streetkid" | jq '.printings | length' # 5
curl -s "$B?limit=100" | jq -r '.items[].set.name' | sort | uniq -c

# every printing, all pages
for o in 0 100; do curl -s "$B?limit=100&offset=$o" | jq -r '.items[].slug'; done > slugs.txt
mkdir -p nd && xargs -P 12 -I{} sh -c "curl -s '$B/{}' -o nd/{}.json" < slugs.txt
jq -s '.' nd/*.json > full.json

jq '[.[].printings[]] | length' full.json          # 385
jq -r '.[].printings[].set.code' full.json | sort | uniq -c | sort -rn
```

> Quote the URL — an unquoted `&` backgrounds the command in zsh.
> Don't use `xargs -I{}` on signed URLs; they're long enough to blow the arg limit.
