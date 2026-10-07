# Research: price data for Cyberpunk TCG (TCGplayer and Cardmarket)

Gathered **2026-10-07**. Every "observed" fact below was read live that day, with `curl` (public
GETs, a handful per host, identifying User-Agent) or, where Cloudflare gated the page, a real browser
(TCGplayer's help-centre ToS, Cardmarket's GTC and data pages). Nothing was registered, applied for,
or called with credentials. Per the standing rule, `/llms.txt` was checked first on every host:
`docs.tcgplayer.com`, `justtcg.com`, `tcgapi.dev`, `tcgpricelookup.com` and `developers.cloudflare.com`
serve one and were used; `tcgcsv.com`, `scrydex.com`, `cyberdecktools.com`, `api.netdeck.gg` 404;
`cardmarket.com` 403s (Cloudflare); `netdeck.gg/llms.txt` returns the SPA shell with 200 (not a real
file). Anything dated before ~2025-10 is marked **(stale?)**. Facts from search snippets or third-party
pages are labelled **SECONDARY**; facts I could not reach are **UNVERIFIED**. The mapping numbers in
section 4 come from a real script run against live TCGCSV and Cardmarket files and
`src/lib/cards/cards.json` (720 printings, generated 2026-10-07T10:41Z).

## Verdict

- **TCGplayer official API: no.** Their own docs say "We are no longer granting new API access at
  this time." There is no application path to take.
- **Cardmarket official API: no.** Their help page says "Currently, we are not accepting applications
  for access to the Cardmarket API." Dedicated credentials may not be shared with third-party software.
- **Cardmarket price-guide / product-catalogue files: yes, technically; conditional legally.**
  Cyberpunk is game id 23, both files are public, unauthenticated, ~115 KB total, rebuilt daily
  (observed build 2026-10-07). No terms are attached to the files; the GTC's API clause (section 9)
  requires "prior written agreement" for presenting cards and prices, and it is unclear whether that
  reaches the downloads. Only **~36% of our printings** are reachable through it today (name +
  expansion, no collector numbers).
- **TCGCSV (TCGplayer mirror): yes, technically; conditional legally; fragile.** Free, Cyberpunk is
  category 92 with 13 groups / 475 products, refreshed once a day. But it is a one-person hobby
  service, its own maintainer pulled the price archive in September 2026 pending "further
  clarification from TCGplayer", and TCGplayer's ToS reserves "pricing information and card
  databases" as its property and bans scraping. Best mapping quality of anything found: **458 of 720
  printings map by number, 230 have a live price today**.
- **Paid aggregators: conditional.** `tcgapi.dev` (475 Cyberpunk cards, TCGplayer-sourced) and JustTCG
  (437 Cyberpunk cards per its games page) both list Cyberpunk. Both put the free tier at
  non-commercial / personal, and both forbid public bulk redistribution. They launder the same
  TCGplayer data; they buy contract clarity, not new data.
- **netdeck.gg / api.netdeck.gg: no prices at all** (measured, section 3.4). cyberdecktools.com does
  show prices, from TCGplayer market (USD) and Cardmarket trend (EUR).
- **Two things cap what any source can do right now:** TCGplayer and Cardmarket both list English
  _retail_ as presale (release **2026-11-06**), and **neither has a French run at all**. 202 of our
  720 printings have no TCGplayer group to map to.

## Recommended next step

**Build a `scripts/prices.ts` that joins TCGCSV category 92 (USD, TCGplayer market) and Cardmarket's
`price_guide_23.json` (EUR, trend) onto Printing ids, and writes one static `prices.json`.** Start
with the 218 beta printings, where the join is exact and every price exists (section 4). Ship it as
a static asset, not a Worker route (section 5).

**Only the owner can do this part, and it should happen before the feature is public:**

1. Email `affiliates@tcgplayer.com` and `contact@cardmarket.com` (both addresses are in the primary
   sources below) describing the site and asking for written confirmation that displaying derived
   market prices is acceptable. TCGCSV's own FAQ recommends exactly this order: "try to build out as
   much of your application as possible without a key. Once you have an app started you can contact
   them about their affiliate program and show off what you're building."
2. Optionally apply to TCGplayer's Impact affiliate program (form linked from
   `docs.tcgplayer.com/docs/tcgplayer-affiliate-program`) so the "buy" links earn something.
   I did not and must not submit it for you.

---

## 1. Official APIs

### 1.1 TCGplayer API

| question                         | answer                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accepting new keys?              | **No.** `docs.tcgplayer.com/docs/getting-started` (observed 2026-10-07): "**An API Developer Key** — _We are no longer granting new API access at this time. Existing users must adhere to the terms of service that govern the use of our API, including, but not limited to important restrictions and attributions required by you._"                                                                                         |
| Is the page current?             | Docs say "The current version of the API is v1.39.0" (released 2023; the FAQ's deprecation notices are all 2023, **stale?**). The closure sentence is undated.                                                                                                                                                                                                                                                                   |
| Auth                             | OAuth2 client-credentials. `POST https://api.tcgplayer.com/token` with `grant_type=client_credentials&client_id=PUBLIC_KEY&client_secret=PRIVATE_KEY`; returns a bearer token, `expires_in` 1209599 s (about 14 days) in the doc's example.                                                                                                                                                                                      |
| Rate limits                      | Docs: "There is no limit to the number of requests that can be made with a single key". No published per-minute cap found. **UNVERIFIED** what is enforced in practice.                                                                                                                                                                                                                                                          |
| Cyberpunk supported?             | The API itself would serve it: the same catalogue is what TCGCSV mirrors, and category 92 is `Cyberpunk TCG` (section 3.1). I could not call the API to confirm.                                                                                                                                                                                                                                                                 |
| Price fields                     | `GET /pricing/group/{groupId}` and `/pricing/product/{ids}` return per product and per sub-type: `lowPrice`, `midPrice`, `highPrice`, `marketPrice`, `directLowPrice`, `subTypeName` (docs `reference/pricing_getgroupprices`, OpenAPI v1.39.0). `/pricing/sku/*` adds per-condition market price; buylist price endpoints also exist.                                                                                           |
| Sub-types for Cyberpunk          | Observed in TCGCSV: `Normal` and `Foil` only, and **exactly one per product** (section 3.1).                                                                                                                                                                                                                                                                                                                                     |
| ToS on caching/storage/redisplay | **UNVERIFIED.** The API-specific terms are not published on `docs.tcgplayer.com`, and `developer.tcgplayer.com` redirects to the docs. SECONDARY (search snippets of Proxyon/ScrapingBee): API terms ban combining TCGplayer pricing with your own data, rebranding, and commercial redistribution. An old sgtFloyd README says to store prices in your own DB and serve from it within a 24 h window (**stale?**, unconfirmed). |
| Affiliate rules                  | See 2.2.                                                                                                                                                                                                                                                                                                                                                                                                                         |

Verdict: **closed.** The only route to a key is a relationship with TCGplayer, and their guidance (via
TCGCSV's FAQ, SECONDARY) is that they "hasn't been readily handing out new API Keys."

### 1.2 Cardmarket API

| question             | answer                                                                                                                                                                                                                                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accepting new apps?  | **No.** `help.cardmarket.com/en/cardmarket-api` (observed 2026-10-07): "The API provides an interface for users to create their own apps for using Cardmarket. **Currently, we are not accepting applications for access to the Cardmarket API.**"                                                                                             |
| Credential sharing   | "you are not allowed to share your dedicated API credentials with a third party or third-party app/software... We reserve the right to take immediate action in the event that your API credentials are misused". So even a friend's key cannot power a public site.                                                                           |
| Domain               | Moved. `api.cardmarket.com` now answers **410** "Please switch to https://apiv2.cardmarket.com" (observed). Docs news, 2026-01-30: switch "no later than May 1st 2026". Docs at `apiv2.cardmarket.com/ws/documentation` (200).                                                                                                                 |
| Auth / app types     | Docs mention `Dedicated`, `Widget`, `Personal`-style access via an "Access to the Cardmarket API" page; that page returned an empty body to curl, so the **app-type definitions are UNVERIFIED**. SECONDARY (pymkm README): OAuth1, "Dedicated app". GTC section 9 says app developers "may receive a special App Key if requested" (see 6.2). |
| Rate limits          | Docs news: **600 requests/min** (503 "Slow Down", 2020-11-25); marketplace group capped at 30,000/day and "professionals have a request limit of 100.000 requests per [day]" (2020-12-15). **Stale?** (2020). The default limit for non-professional accounts is **UNVERIFIED** (commonly quoted as 5,000/day, not in what I read).            |
| Cyberpunk supported? | The catalogue exists (game id 23 in the downloads), so presumably yes via `/games`; **UNVERIFIED** without a key.                                                                                                                                                                                                                              |
| Price fields         | Observed in the price-guide download (same entity the API calls `PriceGuide`): `avg`, `low`, `trend`, `avg1`, `avg7`, `avg30`, plus the same six with a `-foil` suffix (section 2.1).                                                                                                                                                          |

Verdict: **closed to new applicants, and the licence is for managing your own stock** (GTC section 9:
"The API may only be used for managing your own contents").

---

## 2. Official non-API routes

### 2.1 Cardmarket downloads (the real find)

Linked from `https://www.cardmarket.com/en/Magic/Data/Price-Guide` and `/Product-List` (observed
2026-10-07 in a real browser; plain `curl` of those HTML pages is 403 by Cloudflare, but the files
themselves are not gated).

| file                        | URL                                                                                          | size     | auth | CORS                  |
| --------------------------- | -------------------------------------------------------------------------------------------- | -------- | ---- | --------------------- |
| Cyberpunk price guide       | `https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_23.json`          | 62,565 B | none | none (no ACAO header) |
| Cyberpunk singles catalogue | `https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_23.json`    | 52,906 B | none | none                  |
| Cyberpunk non-singles       | `https://downloads.s3.cardmarket.com/productCatalog/productList/products_nonsingles_23.json` | 4,181 B  | none | none                  |

Game id **23 = Cyberpunk** (1 Magic, 6 Pokemon, 18 One Piece, 3 Yu-Gi-Oh!, 22 Riftbound, 19 Lorcana,
24 Gundam on the same pages). Each response is the whole game; no per-set files.

**Freshness.** `price_guide_23.json` has `createdAt: 2026-10-07T02:50:07+0200`, `Last-Modified:
Wed, 07 Oct 2026 00:50:08 GMT`. The product list has `createdAt 2026-10-07T12:59:52+0200`. Cardmarket
states no cadence on the page; **daily is INFERRED** from one build date and the file's own
timestamps (the Magic file was also modified 2026-10-07 00:49 GMT).

**Price-guide row** (317 rows: 295 singles + 22 non-singles):

```json
{
	"idProduct": 904772,
	"idCategory": 1661,
	"avg": null,
	"low": 239.99,
	"trend": 0,
	"avg1": null,
	"avg7": null,
	"avg30": null,
	"avg-foil": 220.81,
	"low-foil": 239.99,
	"trend-foil": 248.77,
	"avg1-foil": 230,
	"avg7-foil": 235.98,
	"avg30-foil": 224.72
}
```

Non-single rows carry only 8 keys (no foil variants). Currency is EUR (the owner's site and the GTC
say prices are shown in the user's local currency; the file has no currency field, so EUR is
**INFERRED**, consistent with the numbers tracking TCGplayer USD 1:1 almost exactly on the same
cards, section 4.3).

**Catalogue row:** `{ idProduct, name, idCategory: 1661 ("Cyberpunk Single"), categoryName,
idExpansion, idMetacard, dateAdded }`. **No collector number, no expansion name, no rarity.**
`idMetacard` is one id per _card_ across printings (140 distinct in the 172-product beta expansion),
i.e. it is the Card identity, not the Printing.

**Expansions** (names from `cardmarket.com/en/Cyberpunk/Expansions`, observed; ids inferred from
product counts and names):

| idExpansion | name                                                                                                | cards       | released       |
| ----------- | --------------------------------------------------------------------------------------------------- | ----------- | -------------- |
| 6714        | Welcome to Night City - Beta (MS01B)                                                                | 172         | 2026-09-08     |
| 6715 / 6716 | The Heist / Embracing Power - Beta Starter Deck                                                     | 20 / 20     | 2026-09-08     |
| 6717        | Box Toppers - Beta                                                                                  | 6           | 2026-09-08     |
| 6718        | Pre-Release Beta (PRR01)                                                                            | 11          | 2026-09-08     |
| 6719        | Set 1 Promos (PRM01)                                                                                | 2           | 2026-09-08     |
| 6720 / 6721 | The Heist / Embracing Power - Demo Deck (DD1/DD2)                                                   | 15 / 14     | 2026-09-08     |
| 6722        | Alpha                                                                                               | 35          | 2026-09-08     |
| (none)      | Welcome to Night City - Retail, both Retail starter decks, Box Toppers - Retail, Pre-Release Retail | **0 cards** | **2026-11-06** |

No Edgerunner Open Season, Night City Brawl, Showdown, or French expansion exists on Cardmarket.

### 2.2 TCGplayer affiliate and partner routes

From `docs.tcgplayer.com/docs/tcgplayer-affiliate-program` (observed 2026-10-07, undated):

> Our Affiliate Program currently operates through the Impact Affiliate Program. Through Impact,
> affiliates can create links to specific products or tools on TCGplayer and earn a commission from any
> purchase directly referred to TCGplayer. This is through first-click attribution... a purchase is
> then made within 48 hours... Payments are made 45 Days after the end of each month.

Sign-up is a form on Impact; "we reach out to you shortly." Contact: `affiliates@tcgplayer.com`.
There is also an hourly-pollable **External Kickbacks API**
(`kickbacks-api.tcgplayer.com/Kickbacks?api-version=1.0`) for active promo percentages.

What the program does **not** say (UNVERIFIED, the Impact terms are behind a login): whether
affiliates may display TCGplayer prices, cache a price feed, or whether prices are required alongside
links. The affiliate programme is a **linking** licence; nothing I read grants data rights. Impact
commission rate is not stated on the docs page. **No partner/data-licence programme is documented**
for hobby sites.

Cardmarket has **no** website-affiliate programme that I could find. SECONDARY (referral-code
aggregators): a user-to-user referral exists (50% of commission up to EUR 5, then 15%, EUR 10/month
cap). That is not a publisher programme. A "buy on Cardmarket" link is therefore plain, unpaid.

---

## 3. Aggregators and other sources

### 3.1 TCGCSV (`tcgcsv.com`) — measured

What it is (its own docs, observed): "The bulk of the information offered here from TCGplayer is a
direct export from their API endpoints", cached up to ~24 h, same JSON shape as TCGplayer's API.
Maintainer: CptSpaceToaster; FAQ: "This website is just a hobby and a one-man show." GitHub repo
`CptSpaceToaster/tcgcsv` has **no licence file** (`license: null`), last push 2026-07-04, 95 stars.

| fact (observed 2026-10-07) | value                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cyberpunk category         | `categoryId 92`, name `Cyberpunk TCG` (94 categories total)                                                                                                                                                                                                                                                                                                                                                                                        |
| Groups                     | 13 (`/tcgplayer/92/groups`)                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Products                   | **475** across 13 groups (includes sealed/display products)                                                                                                                                                                                                                                                                                                                                                                                        |
| Price rows                 | **243** (137 `Normal`, 106 `Foil`); each product has at most one row                                                                                                                                                                                                                                                                                                                                                                               |
| Update cadence             | `last-updated.txt` = `2026-10-06T20:04:45+0000`; price files `Last-Modified` 20:00 GMT. "updated exactly once per day"; docs: "Limit your pulls to once every 24 hours."                                                                                                                                                                                                                                                                           |
| Full-game sync cost        | 1 categories + 1 groups + 13 products + 13 prices = **28 requests**; products 609 KB, prices 37 KB raw                                                                                                                                                                                                                                                                                                                                             |
| Etiquette (docs)           | Custom `User-Agent` ("Requests with generic or missing User-Agents may be blocked"), 100 ms sleep, ">10,000 requests in 24 h may be banned", IP throttle 10 min                                                                                                                                                                                                                                                                                    |
| CORS                       | **Blocked on purpose**: "Standard client-side (browser) fetch or XHR requests will fail... intended to be pulled by back-end scripts". I confirmed no `Access-Control-Allow-Origin` header on a request with an `Origin`.                                                                                                                                                                                                                          |
| `robots.txt`               | `User-agent: * / Allow: /`                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Price archive              | **Gone.** `prices-YYYY-MM-DD.ppmd.7z` returns 403 for every date I tried (2024-02-08, 2026-09-15..17, 2026-10-01..07). GitHub issue #7 (2026-09-16, open) from the maintainer: "The price archive has been temporarily removed due to rising server costs and its growing moderation burden... My goal is to share the price archive once I can get further clarification from TCGplayer, and standup a reliable way to cover my operating costs." |
| No condition-level prices  | FAQ: "this project does not share information about SKUs. This means that you will not be able to get prices for each condition of a card."                                                                                                                                                                                                                                                                                                        |
| Known data bugs            | Open issues: `text/json` content-type on some products files (#5, 2026-09-03), an empty-price product bug (#4, 2026-07-05).                                                                                                                                                                                                                                                                                                                        |

**Groups for category 92** (all 13, observed):

| groupId       | name                                              | products | price rows | publishedOn        |
| ------------- | ------------------------------------------------- | -------- | ---------- | ------------------ |
| 24845         | Welcome to Night City - Beta                      | 175      | 175        | 2026-09-10         |
| 24855         | Welcome to Night City - Retail                    | 144      | **2**      | **2026-11-06**     |
| 24846 / 24847 | Embracing Power / The Heist - Beta Starter Deck   | 22 / 22  | 22 / 22    | 2026-09-10         |
| 24858 / 24859 | Embracing Power / The Heist - Retail Starter Deck | 22 / 22  | 2 / 1      | 2026-11-06         |
| 24848 / 24857 | Box Toppers - Beta / Retail                       | 6 / 6    | 6 / 0      | 2026-09-10 / 11-06 |
| 24880         | Pre-Release Beta (PRR)                            | 12       | 12         | 2026-09-10         |
| 24860         | Set 1 Promos                                      | 4        | 1          | 2026-11-06         |
| 24881         | Alpha Kit (AK)                                    | 1        | 1          | 2026-09-04         |
| 24883         | Edgerunner Open Season 1 (EOR01)                  | 21       | 0          | 2026-09-04         |
| 24884         | Night City Brawl Season 1 (NCB01)                 | 18       | 0          | 2026-09-11         |

Retail products carry `presaleInfo.isPresale: true` with the note "estimated shipping date of
11/6/2026... card details, including rarity and card name, may change up until release date." So a
retail "price" row is a presale listing at best; the few priced retail rows are sealed boxes/decks plus two singles.

**Product row** (beta example):

```json
{ "productId": 714167, "name": "V - Streetkid (b)", "cleanName": "V Streetkid b",
  "groupId": 24845, "url": "https://www.tcgplayer.com/product/714167/cyberpunk-tcg-welcome-to-night-city-beta-v-streetkid-b",
  "presaleInfo": { "isPresale": false, "releasedOn": "2026-09-10T00:00:00" },
  "extendedData": [ { "name": "Number", "value": "B005b" }, { "name": "Rarity", "value": "Rare" }, ... ] }
```

**Price row:** `{ productId, lowPrice, midPrice, highPrice, marketPrice, directLowPrice, subTypeName }`.
Beta group: no null `marketPrice` among 175 rows; median market 0.16 USD, max 1,576.50 USD.
`directLowPrice` is null throughout. `highPrice` is price-parking noise (FAQ: "the `highPrice` isn't
very useful"). **Foil follows rarity** in beta: Common/Uncommon are `Normal`, Rare and above are
`Foil`, so there is never a Normal-vs-Foil choice per Printing; the sub-type is a property of the
product.

**Reliability read (judgment).** Updates were on time the one day I could check. The risks are
structural: one maintainer, no licence, a Patreon-funded service that just removed a feature for cost
and moderation reasons, and an upstream (TCGplayer) whose ToS this republishes. Treat it as a source
you can lose with no notice; the design in section 5 survives that by degrading to the last committed
snapshot.

### 3.2 Other aggregators

| source                                           | Cyberpunk?                                                                                                                                                      | licence / terms (observed)                                                                                                                                                                                                                                                                                                                | cost                                                                                            | freshness                                                    |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **JustTCG**                                      | Yes on `justtcg.com/supported-games`: "Cyberpunk TCG, 437 cards, 2K+ variants, last updated 2 hours ago". Its `llms.txt` game list omits it (stale list).       | Paid plans carry a commercial licence (display, cache, derive; no resale, no bulk export, no competing API). Free tier "is for personal, non-commercial use... If you're putting a product in front of other people, you need a paid plan." Free keys from shared clouds (Workers named) can be blocked with `EXCESSIVE_FREE_TIER_USAGE`. | Free 1,000/mo; **Starter $19/mo** 10,000/mo; Pro $49                                            | "2 hours ago" (page)                                         |
| **tcgapi.dev**                                   | Yes: `tcgapi.dev/games/`: "Cyberpunk TCG, 475 cards, 13 sets, updated 12h ago". 475 equals TCGCSV's product count, so it is TCGplayer data.                     | "Hobby project or free community bot (no ads, sponsorships, or paid features)" fits Free/Hobby/Starter; "affiliate links" need Pro. Redistribution: "Don't offer public, unrestricted downloads of our records."                                                                                                                          | Free 100 req/day (non-commercial); Hobby $9.99; Starter $19.99; Pro $49.99 (commercial licence) | refreshed daily for major games, "every 3 days catalog-wide" |
| Scrydex                                          | Not seen on home, docs, or pricing pages (Pokemon, MTG, Lorcana, Gundam, One Piece, Riftbound, Yu-Gi-Oh!).                                                      | not read                                                                                                                                                                                                                                                                                                                                  | -                                                                                               | -                                                            |
| tcgpricelookup                                   | Not seen; "8 supported games".                                                                                                                                  | not read                                                                                                                                                                                                                                                                                                                                  | -                                                                                               | -                                                            |
| camwu/cyberpunk-tcg-market-data                  | It _is_ Cyberpunk: daily TCGCSV category-92 snapshots in git (`prices/latest.json`, `prices/YYYY-MM-DD.json`), 1 star, created 2026-09-12, last push 2026-10-06 | **GPL-3.0** (code; the data is still TCGplayer's)                                                                                                                                                                                                                                                                                         | free                                                                                            | daily 20:17-20:30 UTC                                        |
| MTGJSON / pokemontcg.io style dumps              | No Cyberpunk equivalent exists that I could find.                                                                                                               | -                                                                                                                                                                                                                                                                                                                                         | -                                                                                               | -                                                            |
| CardNexus (`cardnexus.com/en/explore/cyberpunk`) | Shows Cyberpunk prices, has a bearer-token "Public API" (SECONDARY, via the camwu README)                                                                       | **UNVERIFIED**, not read                                                                                                                                                                                                                                                                                                                  | -                                                                                               | -                                                            |

JustTCG and tcgapi.dev both resell a blend of TCGplayer-derived data under their own licence. That
buys contractual clarity _with them_; whether they hold redistribution rights _from TCGplayer_ is not
something either states. For a hobby site the realistic price of that clarity is $10-20/mo, i.e. more
than the Workers Paid plan it is being compared to.

### 3.3 Cyberpunk-specific sites that already show prices (SECONDARY, one search)

`ripperdeck.gg/market` ("231 priced printings", sourced from live TCGplayer listings), CardNexus,
`cyberpunkcollect.com` (live TCGplayer prices), `choom.gg`, `choomdex.com` (says retail singles have
no sales history before 2026-11-06), and the cyberdecktools tracker below. Several independent
Cyberpunk sites showing TCGplayer-derived prices is evidence the practice is tolerated; it is not a
licence. The "231 priced printings" figure is within one of my 230.

### 3.4 Where cyberdecktools and netdeck get theirs

**api.netdeck.gg: nothing.** Probed read-only 2026-10-07: list endpoint (`total: 151`, both pages of 100) and the detail endpoint for `v-streetkid`. Card keys: `id, external_id, name, subname,
display_name, slug, canonical_name, canonical_base_name, rules_text, official_rules_text_en,
printed_rules_text, official_rules_text, language, flavor_text, printing_id, set, rarity, image_url,
source_image_url, color, card_type, is_eddiable, classifications, keywords, cost, power, ram, artist,
print_number, printings, selected_printing_id, rulings, legalities, legality`. Printing keys: `id,
collector_number, image_url, source_image_url, set, rarity, finish, artist, language, localized_name,
printed_rules_text, official_rules_text`. A regex for `price|tcgplayer|cardmarket|market|usd|eur|
currency|product_id|sku|mkm` over both responses returned **nothing**. The `external_id` is a slug
(`cb-v-streetkid`), not a marketplace id; `finish` stays null. The 3.5 MB netdeck.gg frontend bundle
contains no `tcgplayer`, `cardmarket`, `tcgcsv` or price-feed strings either (its only "price" is
an events ticket filter). **So netdeck cannot be our join key to either marketplace.**

**cyberdecktools.com: TCGplayer market (USD) and Cardmarket trend (EUR), from a snapshot of their
own.** Read from their shipped `collectionPrices-*.js` (public asset, 2026-10-07):

```js
{ eu: { currency: 'EUR', provider: 'cardmarket', label: 'Cardmarket trend' },
  us: { currency: 'USD', provider: 'tcgplayer',  label: 'TCGplayer market' } }
```

Their client fetches `/api/collection/prices?market=eu|us` (`credentials: 'omit'`). **I did not
request it**: their `robots.txt` has `Disallow: /api/`. The snapshot shape they validate is useful as
a design reference: `{ schemaVersion, market, currency, provider, snapshotId, sourceUpdatedAt,
exchangeRate?, quotes: [{ printingId, artworkKey, setName, collectorNumber, providerVariant,
productId, availability: 'available'|'no_quote', amountMinor, observedAt, isPresale, sourceUrl }],
sealedQuotes }`, with `sourceUrl` being `tcgplayer.com/product/{productId}` or
`cardmarket.com/en/Cyberpunk/Products?idProduct={id}`. Their rules, from the same file: quotes older
than **48 h** are "stale" but still used up to **7 days** as "last known"; presale products are
excluded; a collection total uses "the lowest known printing price for each owned artwork" and
"exclude[s] unpriced copies" (their FAQ); USD gaps are filled from EUR using the **ECB daily
reference rate** (`eurofxref-daily.xml`) and labelled "USD conversion"; ranges render as
"$1.20-$3.40 - Beta reference". The homepage carries an `impact-site-verification` meta tag (Impact is
TCGplayer's affiliate network) and the tracker has a "Shop missing cards" action, so **affiliate links
are INFERRED**. How they obtain the data server-side (TCGCSV and Cardmarket's files fit exactly,
including the product-id URL patterns) is **UNVERIFIED**.

---

## 4. Mapping our Printings to marketplace products

Our identity (CONTEXT.md, `src/lib/cards/sets.ts`): a Printing is `{ setId, collectorNumber (beta
prefixed 'β'), locale, id (UUID) }`, retail and beta share one printed Set Identifier. 720 printings:
MS01-WNC 486 (172 beta, 157 retail, 157 French), EOR01 45, NCB01 37, SD01/SD02 40 each (20 beta + 20
retail), DD1 15, DD2 14, PRR01 11, PRR02 11, PRM-WNC 12 (6 + 6), NCS01 5, PRM01 4.

### 4.1 Keys available

| side                 | has                                                                                                                                     | lacks                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| TCGplayer (TCGCSV)   | `groupId` per run (retail and beta are **separate groups**), `extendedData.Number`, rarity, `url`, unique `productId` per art treatment | locale (no French groups), Set Identifier text, any netdeck id                     |
| Cardmarket (files)   | `idProduct`, `idExpansion` (retail and beta separate), `idMetacard` (= our Card), name                                                  | collector number, expansion name, rarity, any disambiguator between same-name arts |
| netdeck (our source) | printing UUID, collector number, set slug, locale                                                                                       | marketplace ids of any kind                                                        |

**TCGplayer Number format**: beta = `B001`, `B005a` (the `β` prefix is spelled `B`); retail = bare
`001`; promos and demo-style groups bare. Zero-padded three digits. Sealed products have no Number.
Our own data has one anomaly: `Over the Edge` in SD02-EBP is `collectorNumber "10"` (key
`SD02-EBP-10`), where every other number is zero-padded to 3; the join must pad before comparing.

**Group map (curated, 12 of 17 runs have a TCGplayer group)**: `(MS01-WNC, beta)` 24845, `(MS01-WNC,
retail, en)` 24855, `(SD01-HEI)` 24847 beta / 24859 retail, `(SD02-EBP)` 24846 / 24858,
`(PRM-WNC)` 24848 beta / 24857 retail, `PRR01-WNC` 24880, `PRM01` 24860, `EOR01-WNC` 24883,
`NCB01-WNC` 24884. **No group:** the French run, `PRM-DD1`, `PRM-DD2`, `PRR02-WNC` ("Pre-Release
Retail" exists on Cardmarket but not TCGplayer), `NCS01-WNC`.

### 4.2 TCGplayer: measured match rate (720 printings)

Join: curated group by (set, beta?, locale), then zero-padded `Number` equality, then a name
sanity check (colon-vs-dash and rarity-suffix tolerant).

| outcome                                                                               | printings                 |
| ------------------------------------------------------------------------------------- | ------------------------- |
| **Mapped, number and name agree**                                                     | 456                       |
| Mapped by number, name differs (TCGplayer typo "Tetratonic Rippler", beta and retail) | 2 (correct on inspection) |
| Group exists, no product with that number                                             | 60                        |
| No TCGplayer group at all                                                             | 202                       |
| **Total**                                                                             | **720**                   |

So **458 / 720 = 64% map**. Of the 456 clean maps, **230 have a price row today** (32% of all
printings). The unpriced 226 are almost all English retail presale.

The 202 no-group: French 157, DD1+DD2 29, PRR02 11, NCS01 5. The 60 no-product: retail WNC 17 (all
the high numbers 143-167 and `005b`; TCGplayer lists `005` where we have `005a`/`005b`, and its
retail listing is presale and incomplete), EOR01 24 of 45 and NCB01 19 of 37 (TCGplayer lists 21 and
18 products; the rest are not on TCGplayer yet).

By run, the part that matters: **every beta printing that exists on TCGplayer maps**, and all but
one of the clean maps is priced: WNC beta 172/172, Box Toppers beta 6/6, Embracing Power beta 20/20,
The Heist beta 19/20 clean (the 20th is `Tetratronic Rippler`, the typo case above, which maps by
number), PRR01 11/11. Priced English-retail printings: 2 singles (`Ruthless Lowlife`, which has a
low price but a null market price, and a promo `Rebecca - Having A Moment` at ~350 USD, presale)
plus sealed boxes and decks.

### 4.3 Cardmarket: measured match rate

Join: expansion by set and treatment, then normalised name (colon to " - "). No numbers exist, so
the best case is **name-unique**.

| outcome                                                              | printings |
| -------------------------------------------------------------------- | --------- |
| Name-unique within the expansion (certain)                           | 195       |
| Name ties we cannot break by name (2-way 60, 3-way 3)                | 63        |
| Expansion exists, name not found (2) / count mismatch (2)            | 4         |
| No Cardmarket expansion (retail 0 cards, French, EOR/NCB/NCS, PRR02) | 458       |
| **Total**                                                            | **720**   |

**195 / 720 = 27% certain, 258 / 720 = 36% if ties resolve.** The 4 misses are Cardmarket's own
spelling (`Tetratonic Rippler` in the Heist expansion vs `Tetratronic` in the base set) and PRM01,
which lists only 2 of our 4 promo printings. The 63 ties are all in the 172-product
beta expansion (31 duplicated names: the standard art vs the `Iconic Legend`/alt-art that reuses the
card name, plus `V - Streetkid` x3). Evidence that ties are breakable: pairing the lower Cardmarket `idProduct` with the lower
TCGplayer `Number` gives an agreeing price ordering (standard art cheap, alt-art expensive) in
**30 of 30** two-way ties, e.g.
Adam Smasher: CM trend 0.25 / 114.60 vs TCGplayer market 0.91 / 109.63. That is strong
corroboration, **not proof**: the safe form is "cross-check against the TCGplayer join and drop the
Cardmarket price if the two disagree by order of magnitude", never a blind positional match.

Cardmarket covers things TCGplayer does not: DD1 (15/15) and DD2 (14/14) are name-unique.

The two sources also agree on which beta cards are foil: Cardmarket has 80 products with only
`trend-foil` and 92 with only `trend`, TCGplayer has 80 `Foil` and 92 `Normal` for the same 172.

### 4.4 Failure modes (what will actually bite)

- **Retail has no price until after 2026-11-06.** Both marketplaces list it as presale; Cardmarket has
  0 cards. A retail Printing's honest state today is "no market price yet".
- **French run: no marketplace has it.** 157 printings (22% of the database) permanently unmappable
  until a French group appears. Do not borrow the English price; they are different products.
- **Beta vs retail must never be merged.** Same Set Identifier, different groups, different prices
  (beta Epic+ are foil rares worth 1-1,500 USD today; retail is empty).
- **Alt-art `a`/`b` suffixes.** TCGplayer keeps them (`B005a`, `B005b`) and puts "(b)" in the name;
  retail collapses to `005`. Cardmarket drops them entirely: three identical `V - Streetkid` names.
- **Card names:** TCGplayer uses `Name - Subtitle`, we use `Name: Subtitle` (netdeck's form).
  Rarity suffixes `(Epic)` appear on some TCGplayer beta names. Typos exist (`Tetratonic`).
- **Product lists are not stable pre-release:** TCGplayer's own note says "card details, including
  rarity and card name, may change up until release date." Key by `productId` once matched, and
  keep a curated override table (like `sets.ts`) for the handful that do not auto-match.
- **Promos/prerelease:** PRR01 (11) maps by bare numbers; PRR02 and NCS01 do not exist on TCGplayer.
- **Our set-up already asserts shape in ingest** (`assertions.ts`); a "every mapped printing has a
  unique productId" assertion belongs next to it.

---

## 5. Architecture on Cloudflare Workers + D1

### 5.1 Platform limits (verified from `developers.cloudflare.com` markdown, 2026-10-07)

| limit                             | Free            | Paid ($5/mo minimum)                                                                                      |
| --------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------- |
| Worker requests                   | 100,000/day     | 10M/mo included, +$0.30/M                                                                                 |
| CPU per HTTP request              | 10 ms           | 30 s default, up to 5 min                                                                                 |
| CPU per Cron Trigger              | 10 ms           | 30 s (interval < 1 h) / **15 min** (>= 1 h)                                                               |
| Subrequests per invocation        | 50              | 10,000                                                                                                    |
| Cron triggers per account         | 5               | 250                                                                                                       |
| D1 queries per invocation         | 50              | 1,000                                                                                                     |
| D1 bound parameters per statement | 100             | 100                                                                                                       |
| D1 statement length / row size    | 100 KB / 2 MB   | same                                                                                                      |
| Static-asset requests             | free, unlimited | free, unlimited (never set `run_worker_first`; never use Workers Caching on assets, per `wrangler.jsonc`) |

Waiting on `fetch()` does not count toward CPU. A full TCGCSV sync is 28 subrequests and ~650 KB of
JSON parsing; that fits Free's 10 ms CPU only barely and 50 subrequests with no margin, so a cron
Worker realistically means Paid. **UNVERIFIED:** whether `adapter-cloudflare` lets this project add a
`scheduled` handler without a custom worker entry (not tested); and whether TCGCSV throttles
Cloudflare's shared egress IPs (JustTCG documents this problem for its own free tier).

### 5.2 Options

| option                                                                | verdict         | why                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Build-time/CI snapshot written to a static `prices.json` asset** | **Recommended** | Asset hits are free and unlimited, no Worker, no D1, no CPU risk, no CORS problem (the sources forbid browsers; CI is a back end). Failure = stale file, never a broken page. Matches how `cards.json` already works.                                                                                                  |
| B. Cron Worker writes a `prices` table in D1                          | Overbuilt       | Paid plan needed; 100-param limit means ~20 rows per statement (5 columns) so ~36 statements per refresh; and every price read becomes a Worker + D1 hit, which is exactly the traffic the site is shaped to avoid. D1 is the right home for _user_ data, not a 720-row reference table that is the same for everyone. |
| C. Cron Worker writes JSON to R2, served via public bucket            | Viable, later   | Decouples price refresh from deploys. Costs the $5 plan plus an R2 binding and a custom bucket domain; only worth it if daily commits ever become annoying.                                                                                                                                                            |
| D. Client-side `fetch` of TCGCSV or Cardmarket                        | No              | TCGCSV blocks CORS deliberately; Cardmarket's S3 sends no CORS header either; both would also put every visitor on their servers.                                                                                                                                                                                      |
| E. Per-card API call to JustTCG / tcgapi.dev at request time          | No              | Per-visitor quota burn and a key on the Worker; a daily bulk pull to a static file is the only shape their tiers allow.                                                                                                                                                                                                |

### 5.3 Recommended shape

1. **`scripts/prices.ts`** (modelled on `scripts/ingest.ts`, same exit-code convention): fetches
   TCGCSV `last-updated.txt` (skip if unchanged), groups for category 92, `products` + `prices` per
   mapped group (26 requests, 100 ms apart, `User-Agent: novastack/1.0 (+https://novastack.gg)`),
   and the two Cardmarket files; joins to Printing ids using the curated group map plus an override
   table; asserts invariants; writes `static/prices.json` (or `src/lib/prices/prices.json` if it should
   be bundled).
2. **A new daily GitHub workflow at ~21:00 UTC** (an hour after TCGCSV's 20:00 build), same shape as
   `ingest.yml`, committing only when the file's content changed. Daily is right: TCGCSV and
   Cardmarket both rebuild daily, and a weekly Monday-only refresh would show prices up to 7 days old
   against sources that moved 6 times since. If daily commits to `main` are unwelcome, ride the
   existing Monday ingest first and add the daily job when staleness actually bothers someone.
3. **The page fetches `/prices.json` same-origin** (`Cache-Control` from the existing `_headers`),
   builds a `Map<printingId, Quote>` once, and **computes deck/collection value client-side**
   from entries it already has. No server code.

**Size estimate.** A key per Printing UUID plus four numbers (TCGplayer market, TCGplayer productId,
Cardmarket trend, Cardmarket idProduct) in integer minor units: measured **48,961 bytes raw /
16,604 bytes gzipped for all 720** printings. Today's priced-only subset (231 entries, two
numbers) is **11,908 B / 6,268 B gzipped**. Even with a snapshot timestamp and rate it stays under
20 KB on the wire. For comparison `cards.json` is 525 KB.

```jsonc
{ "v": 1, "tcgplayer": { "at": "2026-10-06T20:04:45Z" }, "cardmarket": { "at": "2026-10-07T00:50:08Z" },
  "ecb": { "usdPerEur": 1.0, "at": "..." },
  "q": { "<printingId>": { "u": [productId, marketCents], "e": [idProduct, trendCents] } } }
```

### 5.4 Display decisions and failure modes

| concern          | recommendation                                                                                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Which field      | **TCGplayer `marketPrice` (USD) and Cardmarket `trend` (EUR)**, labelled as such. cyberdecktools chose the same pair. `low` is the cheapest listing (noisy on thin markets), `highPrice` is price-parked noise, `directLowPrice` is always null. |
| Foil vs non-foil | Not a user choice: foil is fixed by rarity per product. Read `trend-foil` for foil rarities, `trend` otherwise (Cardmarket rows hold both); TCGplayer's single sub-type row already is the right one.                                            |
| Missing price    | Explicit state, never `0`: "No market price yet" (retail, French, no listing). `trend: 0` and `null` both occur in Cardmarket rows and mean "no data". Total counts as "N of M cards priced", like cyberdecktools' "Unpriced copies excluded".   |
| Stale price      | Carry the source timestamp; show "as of {date}"; grey out beyond ~48 h and drop beyond ~7 days (cyberdecktools' thresholds, a reasonable default). A broken refresh leaves the last file in place.                                               |
| Currency         | Show each market in its native currency; don't convert by default. If one figure is wanted, use ECB `eurofxref-daily.xml` and label the conversion. Never silently mix.                                                                          |
| Beta vs retail   | Always a separate quote; never fall back from retail to beta (different products). Showing "Beta price" next to a retail card is a UI choice, label it.                                                                                          |
| Collection value | `sum(qty * price)` over priced printings, reported with the priced/unpriced counts. A conservative "lowest known printing per artwork" (their rule) is an option for wishlists.                                                                  |
| Presale          | Treat `presaleInfo.isPresale` as no price (the handful of retail rows that have one are presale listings, not a market).                                                                                                                         |
| Source dies      | The file simply stops updating; the timestamp makes that visible. Fallback source: Cardmarket files (no key, more stable owner) for EUR, a paid aggregator for USD.                                                                              |

---

## 6. Legal and ToS

Not legal advice. The picture: **there is no clause I could find that grants a hobby site the right
to republish either marketplace's prices, and TCGplayer's ToS grants the opposite by default.** The
facts below are what decides the risk level, not a licence.

### 6.1 TCGplayer

`help.tcgplayer.com/hc/en-us/articles/205004918-Terms-of-Service`, header "**Updated: September 27,
2023**" (**stale?**, 3 years old; read in a browser 2026-10-07, curl gets a Cloudflare challenge).

_Copyright, Patents, Trademarks and Licenses:_

> All of the content found on TCGplayer.com and websites under the TCGplayer.com domain, including
> graphics, text, buttons, logos, video, audio, downloadable files, **pricing information and card
> databases**, are the property of TCGplayer, Inc. and protected by United States and international
> copyright laws.

> You agree not to crawl, scrape or spider any of our websites without express permission from us.
> If you want access to our APIs, please visit our Developer Portal.

_Web Services, Applications and APIs:_

> TCGplayer can supply you with pre-built APIs for use in your website or application upon request...
> TCGplayer provides APIs for the development of apps using our data to create third-party services.

_Community Guidelines_ (`.../204202153-TCGplayer-Community-Guidelines`): "Don't abuse our pricing
information by using a site scraper, code, script or other way of repeatedly taking shots at our
servers. Respect the information and it will always flow freely. Try to corrupt it or use it for your
own profit and use, and we'll frown at you. Hard."

What follows:

- **Scraping public pages is prohibited** ("any of our websites", no login exception). Do not scrape
  `tcgplayer.com`; that is not on the table.
- Prices are asserted as TCGplayer's copyrighted "pricing information". The route that is _blessed_ is
  the API, which is closed to new applicants. TCGCSV republishes that API's output. Whether that is
  authorised is **unknown**: TCGplayer has not objected publicly that I could find (searches found no
  C&D or takedown), but the maintainer's September 2026 issue ties resuming the archive to "further
  clarification from TCGplayer."
- The API's own terms (attribution, caching windows, "important restrictions and attributions
  required by you") **were not reachable**. Whatever attribution they require would have bound
  API key-holders, not downstream TCGCSV users.
- **Attribution if we show TCGplayer prices:** a plain "Prices from TCGplayer" credit with a link to
  the product page (TCGCSV's `url`) is the obviously safe minimum, and it doubles as the affiliate
  link slot. Required by no document I read, hence **a courtesy, not a clause**.
- **Affiliate links:** allowed and paid per the Impact programme (2.2). Required: no. Nothing
  conditions displaying prices on joining.

### 6.2 Cardmarket

General Terms and Conditions, `www.cardmarket.com/en/Policies/GeneralTermsAndConditions/D`: "a
translation... of the General Terms and Conditions from **20/02/2026** of Sammelkartenmarkt GmbH und
Co. KG" (fresh; "for informal purposes only... For all legal matters only the German version is to
be considered"). **§9 API use:**

> Users: ...a permanent Access Token which enables you to access and partly to edit your own
> inventory data as well as publicly accessible data via an application programming interface (API)...
> **The API may only be used for managing your own contents. The presentation of the trading cards and
> their respective prices require our prior written agreement. The use of the API and the transfer and
> use of data for any other purpose is prohibited.** ... We reserve the right in the future to
> discontinue to partially or completely put the API at your disposal or to exclude individual users...
>
> App Developers: Commercial developers of apps or similar application programmes may receive a
> special App Key if requested... The app developer shall keep the Provider fully indemnified at first
> request against any liability and costs...

Elsewhere in the content rules (section number not captured): "you are prohibited from disseminating or publicly reproducing contents of the online
platform or of other users, unless the dissemination and public reproduction is envisaged within the
use of the online platform or the other user agreed." I searched the GTC for `scrap`, `crawl`,
`database`, `extract`, `robot`, `bot`: **no scraping clause exists**, and the S3 files carry **no
terms at all** on the download pages. `robots.txt` on the download host is `AccessDenied`.

What follows:

- The §9 sentence about presenting cards and prices is written about API data. The downloads are a
  _separate, unauthenticated, advertised_ data product on a `downloads.s3` host; reading §9 as
  covering them is plausible but not stated. **UNVERIFIED either way**, so ask (next step).
- "Prior written agreement" is exactly what step 1 of the next step requests; get it in writing and
  keep the email.
- Hyperlinking out to Cardmarket product pages is unrestricted by anything read (and there is no
  publisher affiliate programme to be paid by, 2.2).

### 6.3 Aggregators

JustTCG, `docs/commercial-use`: free tier "personal, non-commercial use... If you're putting a product
in front of other people, you need a paid plan, regardless of how few requests it makes"; paid plans
permit display, caching and deriving; forbid "Resell, redistribute, or sub-license the raw data as a
standalone feed" and "Publish or sell bulk exports"; attribution "appreciated but not required".
tcgapi.dev: free-through-Starter are "Non-commercial use"; "Hobby project or free community bot (no
ads, sponsorships, or paid features)" fits; "affiliate links" count as commercial and need Pro;
"Don't offer public, unrestricted downloads of our records."

**A public `prices.json` is the sharp edge for every source here:** it is a downloadable file of the
prices, which is what the aggregator terms call a bulk export and what TCGplayer's ToS would call
republishing. The mitigation that fits all of them is to ship only _derived, minimal_ data (market
price per printing, no highs/lows/history, no raw product dump), keep it same-origin, and not
advertise it as a dataset. That reduces the exposure; it does not remove it.

### 6.4 Risk summary (judgment)

| source                     | enforcement likelihood against a small fan site                        | impact if it happens                                                 | mitigation                                                         |
| -------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| TCGCSV -> TCGplayer prices | low, but TCGplayer owns the data and the maintainer is visibly nervous | feed stops or a takedown request; no site breakage if snapshot-based | static snapshot, credit and link, email TCGplayer, keep a fallback |
| Cardmarket files           | low (public, advertised, no terms); the GTC wording is the unknown     | request to remove prices                                             | ask for written agreement; EUR only; link out                      |
| Paid aggregator            | lowest on paper, since there is a contract                             | costs $10-20/mo                                                      | only if the two above are refused                                  |

---

## 7. Decisions and open questions

**Decided (recommended, owner to confirm):**

1. **Source of truth:** TCGCSV for USD (joins by number, 458/720 mappable), Cardmarket files for EUR
   (name+expansion, 195-258/720), both snapshotted in CI. No official API route exists for either.
2. **Shape:** static `prices.json`, client-side valuation, no Worker, no D1 table for prices.
3. **Fields:** TCGplayer `marketPrice` and Cardmarket `trend` (foil-aware), native currencies.
4. **Scope v1:** beta printings (218), where mapping is exact and prices exist; everything else renders
   "No market price yet".

**Open questions (need the owner, or time):**

1. **Written permission.** Will TCGplayer or Cardmarket answer the email, and what do they say about
   displaying prices? Everything in section 6 stays a risk reading until they do.
2. **Is a hobby site with affiliate links "commercial"?** For tcgapi.dev and JustTCG it is, and
   changes the tier ($49.99 Pro on tcgapi.dev). Decide whether affiliate links are in scope before
   choosing any paid source.
3. **After 2026-11-06:** do retail groups gain full products and prices, and does TCGplayer add the
   missing retail numbers 143-167? Re-run the sample mapping the week after release.
4. **French run:** nothing exists to map. Is "no price" acceptable for 157 printings, or hide the
   price slot for `locale: 'fr'`?
5. **Ties:** are the 63 Cardmarket ties worth the order-based tie-break, or do we show Cardmarket
   prices only for name-unique printings and take the rest from TCGplayer? The latter is simpler and
   leaves ~36% coverage on EUR vs 64% on USD.
6. **`SD02-EBP-10`:** our own collector number `10` should presumably be `010`; check against the
   printed card and fix upstream in the mapper.
7. **`scheduled` handler under `adapter-cloudflare`:** not tested; irrelevant for option A, decisive
   for B and C.

---

## 8. Verified vs unverified

**VERIFIED** (observed live on 2026-10-07 or quoted from a primary page; source in brackets):

| fact                                                                                                                             | source                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| TCGplayer API is closed to new keys                                                                                              | `docs.tcgplayer.com/docs/getting-started`                                            |
| TCGplayer auth is OAuth2 client credentials, bearer token, ~14 day expiry                                                        | same page                                                                            |
| TCGplayer price fields and sub-types                                                                                             | `docs.tcgplayer.com/reference/pricing_getgroupprices`; TCGCSV rows                   |
| TCGplayer ToS bans crawl/scrape/spider; claims pricing info + card databases as its property                                     | `help.tcgplayer.com/.../205004918-Terms-of-Service` (Updated 2023-09-27, **stale?**) |
| TCGplayer affiliate = Impact, first click, 48 h window, paid 45 days after month end                                             | `docs.tcgplayer.com/docs/tcgplayer-affiliate-program`                                |
| Cardmarket API closed to applications; credential sharing prohibited; `api.` -> `apiv2.` (410)                                   | `help.cardmarket.com/en/cardmarket-api`; `api.cardmarket.com`                        |
| Cardmarket GTC 20/02/2026 section 9 text                                                                                         | `cardmarket.com/en/Policies/GeneralTermsAndConditions/D`                             |
| Cardmarket Cyberpunk = game 23; 3 public files, no auth, no CORS; build time; 317 / 295 / 22 rows                                | `downloads.s3.cardmarket.com/...`, Data pages                                        |
| Cardmarket expansions: beta 172/20/20/6/11/2, DD 15/14, Alpha 35; retail 0 cards, 2026-11-06                                     | `cardmarket.com/en/Cyberpunk/Expansions`; file counts                                |
| TCGCSV: category 92, 13 groups, 475 products, 243 price rows, daily 20:00 UTC, CORS blocked, archive 403, maintainer's statement | `tcgcsv.com/*`, `CptSpaceToaster/tcgcsv#7`                                           |
| TCGplayer retail groups are presale (2026-11-06) and almost unpriced                                                             | TCGCSV `presaleInfo`, price counts                                                   |
| Mapping rates: TCGplayer 458/720 (230 priced), Cardmarket 195 certain + 63 ties                                                  | script run, `/tmp/prices.B3TX/map_final.py`, `cards.json`                            |
| api.netdeck.gg exposes no price, marketplace id, or currency fields (151 cards)                                                  | live list + detail probe                                                             |
| cyberdecktools uses TCGplayer market (USD) / Cardmarket trend (EUR); `robots` disallows `/api/`                                  | their shipped JS and `robots.txt`                                                    |
| JustTCG and tcgapi.dev list Cyberpunk; their tiers and licence boundaries                                                        | their games pages, `llms.txt`, commercial-use docs                                   |
| Workers/D1/Cron limits and the $5 plan                                                                                           | `developers.cloudflare.com/.../limits`, `/pricing`, `/d1/platform/limits`            |

**UNVERIFIED / INFERRED / SECONDARY:**

| item                                                                                     | status                                                                    |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| TCGplayer API-specific ToS (caching, attribution, redistribution)                        | UNVERIFIED (not published; SECONDARY snippets only)                       |
| TCGplayer API rate limit in practice                                                     | UNVERIFIED                                                                |
| Whether TCGplayer authorises TCGCSV's republication                                      | UNVERIFIED; maintainer implies an open question                           |
| Cardmarket app types (Dedicated/Widget/Personal) and non-pro request caps                | UNVERIFIED (Access page empty to curl); pymkm README SECONDARY            |
| Whether GTC section 9 covers the downloadable files                                      | UNVERIFIED                                                                |
| Cardmarket file cadence is daily; currency is EUR                                        | INFERRED from timestamps and number agreement with TCGplayer              |
| Cardmarket tie-break by `idProduct` order                                                | INFERRED; corroborated by price order 30/30, not proven                   |
| cyberdecktools server-side source (TCGCSV/Cardmarket files) and use of Impact links      | INFERRED (product-id URL patterns, Impact meta tag, "Shop missing cards") |
| Impact programme terms on displaying prices; commission rate                             | UNVERIFIED (behind Impact login)                                          |
| Cardmarket "affiliate" programme                                                         | SECONDARY: only a user referral, no publisher programme found             |
| Scrydex / tcgpricelookup do not cover Cyberpunk                                          | Observed absence on home/docs/llms only                                   |
| CardNexus Public API terms and price access                                              | UNVERIFIED                                                                |
| `ripperdeck.gg`, `cyberpunkcollect.com`, `choom.gg` price sourcing                       | SECONDARY (search snippets)                                               |
| A `scheduled` handler under `adapter-cloudflare`; TCGCSV behaviour toward Cloudflare IPs | UNVERIFIED (not tested)                                                   |

## Appendix: reproduce

```bash
UA="novastack-research/1.0 (read-only)"
# TCGCSV: category 92, groups, one group's products + prices, freshness
curl -s -A "$UA" https://tcgcsv.com/last-updated.txt
curl -s -A "$UA" https://tcgcsv.com/tcgplayer/categories | jq '.results[] | select(.categoryId==92)'
curl -s -A "$UA" https://tcgcsv.com/tcgplayer/92/groups | jq '.results[] | {groupId,name,publishedOn}'
curl -s -A "$UA" https://tcgcsv.com/tcgplayer/92/24845/{products,prices} -o /tmp/g.json   # beta WNC

# Cardmarket: public files, no auth
curl -s https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_23.json | jq '.createdAt, (.priceGuides|length)'
curl -s https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_23.json | jq '.products|group_by(.idExpansion)|map({e:.[0].idExpansion,n:length})'

# netdeck: confirm no price fields
curl -s -A "$UA" "https://api.netdeck.gg/api/cards/cyberpunk?limit=100" | grep -ciE 'price|tcgplayer|cardmarket'   # 0
```

The join script is at `/tmp/prices.B3TX/map_final.py` (scratch, outside the repo; not committed; it reproduces both match tables). If it
is promoted to `scripts/prices.ts`, the group map in section 4.1 is the only hand-curated input.
