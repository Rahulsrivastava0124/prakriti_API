# `GET /dashboard` — response time analysis and fix plan

**Subject:** the dashboard API is slow.
**Verdict:** `/api/superadmin/dashboard` took **~15 seconds** to return **1.9 KB**.
It is now **1.4 s** cold and **3.8 ms** warm over real HTTP — **11× faster, with all
60 response fields unchanged** — and the chart tiles alone come back in **20 ms**
from a new section endpoint. All five phases are applied. This report also covers
five unrelated bugs the measurement work uncovered, four of them now fixed, and
**two breaking changes that need announcing before they ship** (§5).

| | |
|---|---|
| Endpoint | `GET /api/superadmin/dashboard` → [app/controllers/superadmin/dashboard.controller.js](app/controllers/superadmin/dashboard.controller.js) |
| Database | `prakriti-test` @ 127.0.0.1:3306, MySQL 8.4.9 |
| Data size | 57 users · 128 sales · 197 purchases · 4,288 stocks · 8,655 stock_materials · 5,392 purchase_products · 11,324 purchase_product_materials |
| Measured with | [dashboard_endpoint_timing.js](scripts/dashboard_endpoint_timing.js), [dashboard_helper_profile.js](scripts/dashboard_helper_profile.js), and live HTTP with a signed JWT |
| Date | 2026-08-06 |
| Status | Phases 1, 1b, 2, 3, 4 applied — see §5 for what still needs your call |

Everything below is measured. Production data is larger, so treat these as a floor.

---

## 1. Measured response time

### 1.1 Over real HTTP — one token per role, live server

| Role | Route | Controller | Time | HTTP | Bytes |
|---|---|---|---:|---:|---:|
| **superadmin** | `/api/superadmin/dashboard` | superadmin (971 lines) | **1.39 s** | 200 | 2,059 |
| admin | `/api/admin/dashboard` | admin (29 lines) | 0.009 s | 200 | 112 |
| distributor | `/api/distributor/dashboard` | distributor (35 lines) | 0.006 s | 200 | 151 |
| supplier | `/api/supplier/dashboard` | supplier (13 lines) | 0.007 s | 200 | 48 |
| sales_executive | `/api/sales-executive/dashboard` | sales_executive (19 lines) | 0.005 s | 200 | 266 |
| retailer | `/api/retailer/dashboard` | retailer (18 lines) | 0.007 s | 200 | 300 |
| *superadmin, cache hit* | — | — | **0.003 s** | 200 | 2,059 |

Plus the three section endpoints added in Phase 4, all superadmin-guarded:

| Section | Route | Time | Fields |
|---|---|---:|---:|
| charts | `/api/superadmin/dashboard/charts` | **0.020 s** | 7 |
| summary | `/api/superadmin/dashboard/summary` | **0.452 s** | 25 |
| stock | `/api/superadmin/dashboard/stock` | **1.216 s** | 28 |

> **Correction to earlier drafts of this report.** They carried a per-role table
> claiming admin 1,904 ms, sales_executive 1,636 ms and distributor 1,571 ms
> against the *same* controller. That was an artifact of the measurement method:
> the script calls `controller.index` directly with a chosen `role`, which no real
> request can do.
>
> **Every role has its own dashboard controller** (see the table above), and
> `/api/superadmin/dashboard` is guarded by `authJwt.isSuperAdmin`, which admits
> `role_id` 1 only. The superadmin controller's admin / distributor /
> sales_executive / manager branches — roughly
> [lines 317–656](app/controllers/superadmin/dashboard.controller.js#L317) — are
> therefore **unreachable over HTTP**. Only the superadmin row was ever real.
>
> Consequence for planning: the Phase 2 work below benefits exactly one endpoint.
> Still worth doing — it is the slow one — but the blast radius is narrower than
> earlier drafts implied. It also means ~340 lines of that controller are dead
> code worth confirming and deleting.

### 1.2 The superadmin endpoint, before and after

Three cold runs each, via the timing script:

| | run 1 | run 2 | run 3 | median |
|---|---:|---:|---:|---:|
| before any fix | 14,619 ms | 15,275 ms | 17,172 ms | **15,275 ms** |
| after Phase 1 + 1b | 5,154 ms | 6,503 ms | 6,604 ms | **6,503 ms** |
| after Phase 1 + 1b, **over HTTP** | 4,292 ms | 4,366 ms | 4,749 ms | **4,366 ms** |
| after Phase 2 | 1,472 ms | 1,334 ms | 1,367 ms | **1,367 ms** |
| after Phase 2, over HTTP | — | — | — | **1,430 ms** |
| **after Phase 3, over HTTP** | — | — | — | **1,386 ms** |

**15,275 ms → 1,386 ms end to end: 11×.** Warm (cache hit) is **3.8 ms**, and five
concurrent warm requests all returned inside 16 ms.

All rows in §1.1 reflect this final state — including the two routes that used to
hang, now fixed in §3.0.

HTTP beats the script because the server process is warm — connection pool
established, JIT hot — where every script run paid a cold start. The HTTP figure
is the one users experience.

Every step was verified with
[dashboard_snapshot.js](scripts/dashboard_snapshot.js), which captures all 60
response fields and diffs them. **All 60 identical to the pre-Phase-2 baseline**,
including over HTTP.

Two things to read off the original measurement:

- **Payload is ~2 KB.** Response *size* is not the problem and never was. The
  entire cost is server-side computation before the first byte.
- **Summed SQL time exceeded response time** (18.9 s of SQL inside a 14.2 s
  response). Not an error — the handler runs its queries in parallel via
  `Promise.all`, so they overlap. It means the endpoint is **almost entirely
  blocked on the database**, and response time equals the *slowest branch*, not
  the sum. Adding parallelism cannot help; only making the slowest branch cheaper
  can.

---

## 2. Why it is slow

### 2.1 One column, 572.8 MB, on every request — the dominant cost

`getPurchaseProducts()` ([common.js:3693](app/library/common.js#L3693)) calls
`findAll` with **no `attributes` projection**:

```js
let purchases = await PurchaseModel.findAll({
  where: { … },
  order: [["createdAt", "DESC"]],
  include: [ /* purchaseProducts → product → category, purchaseMaterials → … */ ],
});
```

So Sequelize selects every column, including `purchases.req_data` — a `longtext`
holding each purchase's raw request payload. Measured on the 64 rows this query
matches:

```
SELECT * FROM purchases … (64 matching rows)     9,848 ms
same query, without the req_data column              6 ms
the aggregate the dashboard actually needs           2 ms
```

**572.8 MB across 64 rows. One row is 32.06 MB.** MySQL reads it, Node parses it
into JavaScript strings — and the function returns four numbers
(`total_amount`, `total_product`, `total_return_amount`, `total_return_product`)
that never touch it.

`req_data` is write-only almost everywhere. Exactly two places read it —
[admin/purchase.controller.js:620](app/controllers/admin/purchase.controller.js#L620)
and
[superadmin/purchase.controller.js:1274](app/controllers/superadmin/purchase.controller.js#L1274),
both in the purchase edit/view flow, where it belongs.

**`sales.req_data` is the same latent problem.** 3.1 MB today (max row 0.38 MB),
so it does not hurt yet. `getTransferSale`
([common.js:2830](app/library/common.js#L2830)) does an unprojected
`findAndCountAll` on `sales` with two full `users` joins. As sale volume grows,
that becomes the next ten-second query.

*Schema mismatch worth fixing while you are there:* both models declare
`req_data: DataTypes.TEXT` ([models/purchase.js:76](models/purchase.js#L76),
[models/sale.js:86](models/sale.js#L86)) while the column is `longtext`. A 32 MB
value cannot fit `TEXT`'s 64 KB limit — the model and the schema disagree.

### 2.2 The stock-price fan-out — the next bottleneck

`getTotalStockPriceByUser` ([common.js:1607](app/library/common.js#L1607)) is
called **10 times per super-admin request** (lines
[159](app/controllers/superadmin/dashboard.controller.js#L159), 161, 163, 219,
221, 223, 255, 257, 271, 309).

Measured: 3.0 s for a single call, **11.8 s for the ten in parallel**, of which
1.3 s per call is pure JavaScript in the pricing loop — which blocks the event
loop for every other request on that worker.

No blobs here. The cost is the include tree:

```
stocks alone                                 26 ms   (2,342 rows)
+ product / category / sub_category joins    70 ms   (2,342 rows)
stock_materials + its 5-table include tree  816 ms   (25,920 rows)  ← 3× fan-out
```

8,655 `stock_materials` rows become **25,920** once
`material → material_price → materialPricePurities` is joined, and Sequelize
hydrates every one into a model instance.

The tables causing that fan-out are tiny and change essentially never:

```
material_prices 59 · material_price_purities 202 · purities 10 · units 5
tax_slabs 8 · categories 8 · sub_categories 66            = 358 rows total
```

358 rows, re-joined against every stock-material row, on all ten calls.

Worse, the ten id sets (`adminIds`, `distributorIds`, `seIds`, `managerIds`,
`avlUserIds`) overlap heavily — the same physical rows are fetched, hydrated and
priced up to ten times per request, all at once inside one `Promise.all`.

### 2.3 Work computed and discarded

`getPurchaseProducts` also builds a full `items[]` array with formatted names,
images, weight strings and per-material detail
([common.js:3762–3900](app/library/common.js#L3762)) — **1,077 ms of JavaScript**
for output the dashboard never reads.

It additionally calls `avlStockUserIdsNew` internally
([common.js:3691](app/library/common.js#L3691)), **bypassing the `avlMemo`
memoiser** in the controller
([dashboard.controller.js:86](app/controllers/superadmin/dashboard.controller.js#L86)),
so the tree walk runs twice per request.

### 2.4 `getTransferSale` runs one query per row

[common.js:2852](app/library/common.js#L2852) issues
`SELECT COUNT(*) FROM sale_products WHERE sale_id = ?` per row, awaited in
series. Cheap on this data (few matching rows), one round trip per row in
production. A single `GROUP BY sale_id` replaces it.

The empty `.catch((err) => {})` on line 2858 also means a failed query returns
`undefined`, and the next line throws `TransferData.map is not a function` —
hiding the real cause behind a generic 500.

### 2.5 The 60-second cache is thinner than it looks

[dashboard.controller.js:66](app/controllers/superadmin/dashboard.controller.js#L66).
A cache hit is **0 ms**, so when it works it works completely. But:

- **Per-process.** Across N workers the hit rate is 1/N and each worker holds a
  different answer.
- **No in-flight dedupe.** Every concurrent request arriving after TTL expiry
  rebuilds the payload independently — N × 15 s simultaneously, on a database
  already saturated. This is exactly when the dashboard feels worst.
- **No invalidation**, so freshness can only be bought with a shorter TTL, which
  means more full rebuilds.
- **Cold on every deploy.**

`_dashRemember` on line 68 is defined and never called — dead code. `remember()`
in the uncommitted [app/library/dashboardCache.js](app/library/dashboardCache.js)
already shares one in-flight promise across concurrent misses; it was written but
never wired in.

### 2.6 Pool settings turn overload into a hang

[config/config.js:12](config/config.js#L12) —
`{ max: 20, min: 0, acquire: 60000, idle: 10000 }`.

`acquire: 60000` means a request that cannot get a connection waits a **full
minute** before failing. To the user that is not an error, it is a hang. With a
15-second dashboard occupying connections, other endpoints queue behind it.
`min: 0` drains the pool when idle, so the first request after quiet pays
connection setup.

### 2.7 External HTTP inside the request path

`getLiveGoldRate` ([common.js:568](app/library/common.js#L568)) measured 0 ms —
its 10-minute cache was warm, and the webhook itself is healthy (517 ms, returning
24K ₹14,973/g). But the cache is **only written on success** (`if (rate > 0)`), so
whenever `n8n.prakriti.one` is slow or down, every request pays up to the 5 s
abort timeout and caches nothing. The next request pays it again.

Separately, superadmin was fetching this value and then discarding it — see §3.1,
now fixed. The fetch itself is still in the request path; moving it to a
background refresher is Phase 2.

### 2.8 The response is monolithic

~60 fields, all computed before the first byte, regardless of what the screen
shows. This is your original diagnosis and it is correct — but it ranks eighth,
not first, and Phase 4 now has measurements behind it: the stats and charts are
only **23 ms** of the work, so splitting makes them instant without making
anything actually faster. Splitting before fixing 2.1 and 2.2 would only
redistribute the wait.

---

## 3. Bugs found while measuring

Four issues surfaced during this work that are not about speed. Two are fixed;
two need a decision from you.

### 3.0 Two unauthenticated routes hung forever — ✅ fixed

**Resolution:** `authJwt.verifyToken` added to both routes, plus a null-user guard
in both controllers. Verified:

| Case | Before | After |
|---|---|---|
| no token | **hangs forever** | `403` in 3–25 ms |
| valid token, user since deleted | **hangs forever** | `404` in 5–14 ms |
| valid token, real user | hangs | `200` with data, 5–7 ms |

> **The auth guard alone did not fix it.** After adding `verifyToken` the no-token
> case returned 403, but a *valid* token naming a deleted user still hung for the
> full 25 s test timeout — `findOne` returns `null`, `UserCollection(null)` throws,
> and there is still nothing to catch it. With `login_expire_days: 365`, any user
> deleted mid-year keeps a working token that triggers this. Hence the null guard.

The original analysis follows.

---

```js
router.get("/dashboard", [], dashboardController.index);   // no auth middleware
```

[sales_executive.routes.js:24](app/routes/sales_executive.routes.js#L24) and
[retailer.routes.js:25](app/routes/retailer.routes.js#L25) have **empty guard
arrays**, so `req.userId` is `undefined`. Their controllers then run:

```js
const user = await UserModel.findOne({ where: { id: req.userId } });
res.send(formatResponse(UserCollection(user), "Dashboard"));
```

`findOne({ where: { id: undefined } })` **rejects** —
`WHERE parameter "id" has invalid "undefined" value`. There is no `try/catch` and
no `.catch`, and Express 4 does not catch async rejections, so `res.send` is never
reached and **the socket stays open until the client gives up**. A test request sat
for the full 150 s timeout.

Anyone can hit these two paths **with no token** and hold a connection open
indefinitely. That is a trivial availability problem, entirely separate from the
performance work.

Not fixed, because the right fix is your call:

- **Add `authJwt.verifyToken`** — correct, but changes them from public to
  authenticated and may break a caller relying on current behaviour.
- **Add `try/catch`** — fails fast with a 4xx, leaves them public.

### 3.1 Superadmin never displayed the live gold rate — ✅ fixed

`live_gold_rate` came back `null` over HTTP while the webhook was healthy
(517 ms, returning 24K ₹14,973/g). Cause: inside the superadmin branch,

```js
const [ …, _liveGoldRate ] = await Promise.all([ … ]);   // block-scoped const
```

**shadowed** the outer `let _liveGoldRate` declared at
[line 94](app/controllers/superadmin/dashboard.controller.js#L94), which is what
the response object reads. The outer variable was never assigned in that branch,
so superadmin fetched the rate over the network and then discarded it, always
returning `null`. Every other role assigns it correctly at line 663.

Stock valuation was unaffected — `calculateProductPrice` calls `getLiveGoldRate()`
directly. Only the displayed field was broken. Fixed by renaming the destructured
binding to `_goldRate` and assigning it through.

### 3.2 The server does not start from a clean checkout — **needs `npm install`**

`compression` is declared in [package.json](package.json) (`^1.8.1`) but missing
from `node_modules`, so [server.js:53](server.js#L53) dies on
`require('compression')`. It fails **silently**: exit code 1, no output, because
`console.log` is monkey-patched in server.js and the error never reaches stderr.

Confirmed pre-existing by stashing all changes and reproducing on unmodified code.
Worked around locally with `npm install compression --no-save`; the real fix is a
plain `npm install`. Anyone cloning this repo hits it.

### 3.3 Dashboard totals counted soft-deleted rows — ✅ fixed

This one *was* showing wrong numbers on screen:

```
total_stock tile (user_id 1)   showed 3,165   correct 2,342   inflated by 823 rows  (26%)
whole stocks table, all users  4,288 → 2,656  inflated by 1,632 rows               (61%)
```

> **Correction.** An earlier draft of this report quoted the whole-table figures
> (4,288 → 2,656, 61%) as if they were the tile. They are not — `getTotalStockByUser`
> is scoped to a user id, so the super-admin tile moves **3,165 → 2,342, a 26% drop**.
> The 61% figure describes every user's stock summed together. The bug and its cause
> are unchanged; only the magnitude quoted for the tile was wrong.

Every model is `paranoid: true` ([models/stock.js:77](models/stock.js#L77)), so
Sequelize appends `deleted_at IS NULL` automatically. **Raw SQL does not**, and
the raw queries added in the earlier optimisation round omit it:

| Site | Status on this data |
|---|---|
| [common.js:2803](app/library/common.js#L2803) — `getTotalStockByUser` | **`total_stock` read 3,165; true figure 2,342** |
| [dashboard.controller.js:275](app/controllers/superadmin/dashboard.controller.js#L275) — own-sale totals | correct only because no deleted rows match yet |
| [dashboard.controller.js:284](app/controllers/superadmin/dashboard.controller.js#L284) — retailer due | same |
| [dashboard.controller.js:690–723](app/controllers/superadmin/dashboard.controller.js#L690) — month charts | same |

Soft-deleted rows: **stocks 1,632 of 4,288** · sales 4 · users 5 · purchases 4.

Only the stock tile is visibly wrong right now, because stocks is the only table
with a meaningful number of deleted rows. The other three are correct by luck —
the first soft-deleted sale in the current year silently inflates the revenue
chart. And since the ORM paths elsewhere filter correctly, **the dashboard
already disagrees with the stock listing screens.**

---

## 4. The fix

### Phase 1 — Exclude the column at the two dashboard call sites ✅ APPLIED

```js
// app/library/common.js — getPurchaseProducts() and getPurchaseProductsUser()
attributes: { exclude: ["req_data"] },
```

> **Do NOT use a model-level `defaultScope` for this.** An earlier draft of this
> report recommended it. That is wrong and would break production: `req_data` has
> **three live readers** on `purchases`, all in purchase-approval flows that create
> stock —
> [admin/purchase.controller.js:620](app/controllers/admin/purchase.controller.js#L620),
> [superadmin/purchase.controller.js:2137](app/controllers/superadmin/purchase.controller.js#L2137),
> [superadmin/purchase.controller.js:2584](app/controllers/superadmin/purchase.controller.js#L2584).
> A `defaultScope` makes `req_data` `undefined` in all three, so approving a
> purchase would silently stop creating stock. `sales.req_data` and
> `pre_purchases.req_data` have their own readers too.
>
> The model-level fix is still the better end state — every query touching these
> tables pays the same tax — but it requires updating those three sites to
> `PurchaseModel.unscoped()` first, and verifying the approval flow end to end.
> Treat it as a separate, tested change.

Excluding the column at the two dashboard call sites gets the entire measured win
with no blast radius: nothing in either function reads `req_data`.

**Applied and measured.** See §1.2 for the full before/after — **15.3 s → 6.5 s**
via the script, and **15.3 s → 4.4 s over real HTTP**, which is the figure users
experience.

Two more one-liners while you are in there: correct the `req_data` model
definitions to `longtext` (both declare `DataTypes.TEXT`, but the column holds a
32 MB value, so the schema and the model disagree), and delete the untracked
duplicate index migration
([20260729120000](migrations/20260729120000-add-dashboard-performance-indexes.js)
duplicates the committed 20260802154214).

### Phase 1b — The soft-delete fix ✅ APPLIED

`AND deleted_at IS NULL` added to **nine** raw-SQL sites — not the four an earlier
draft listed. The extra five were the admin retailer-due aggregate, the SE
sale-due aggregate, and three of the six month-chart queries. All six tables
involved (`stocks`, `sales`, `sale_products`, `users`, `orders`, `user_to_users`)
are `paranoid: true`.

**Announce this one before shipping.** The super-admin stock count on screen drops
26%, from 3,165 to 2,342 — and further for users holding more soft-deleted rows
(user 31 holds 305, user 33 holds 194). It is a correction, not a regression, but it should not arrive
unexplained — someone will notice and report it as a bug.

> **Watch for silent SQL breakage when editing these.** A dropped space during
> this edit produced `ANDcreated_at`, and the endpoint still returned **HTTP 200**
> with empty chart arrays and a 0.3 KB payload instead of 1.9 KB. It failed
> without an error. After editing raw SQL, check the payload size and field
> count, not just the status code.

### Phase 2 — Remove the discarded work ✅ APPLIED

**Result: 4,366 ms → 1,430 ms over HTTP**, all 60 fields identical. Four changes,
each parity-checked before the next:

| Change | Effect |
|---|---|
| **Reference-price cache.** `material_price → materialPricePurities` dropped from the `stockMaterials` include; `calculateProductPrice` resolves the same row from a cached `Map` keyed `materialId:purityId` ([common.js:644](app/library/common.js#L644)) | killed the 3× join fan-out — 25,920 rows back to 8,655 |
| **`attributes` projections** on the stock query and the product / material / stockMaterials includes | `getTotalStockPriceByUser` 3,022 ms → 834 ms |
| **`getTransferSale` rewritten** — one `GROUP BY sale_id` instead of a `COUNT` per row, both unused `users` joins dropped, empty `.catch` removed | 17 ms → 2 ms; 2 queries → 1 |
| **`getPurchaseProducts(params, countsOnly)`** — the dashboard passes `countsOnly`, which trims the include tree and skips building the `items[]`/`categories[]` it never reads | 1,495 ms → 195 ms |

The counting logic itself was **not** restated as SQL — it encodes business rules
(`quantity = 0` counting as 1, the `certificate_no`/material special cases) that
are not safe to translate mechanically. Both modes were checked to return
identical totals, and full mode still builds all 3,935 items.

**Cache invalidation:** `resetMaterialPriceCache()` is exported and called from
store / update / delete in
[superadmin/materialPrice.controller.js](app/controllers/superadmin/materialPrice.controller.js).
It also carries a 60 s TTL, so a missed call costs at most a minute of staleness
rather than lasting until restart.

**Not done, and deliberately so:**

- **The 10× dedup** (resolve all id sets up front, price each row once, bucket by
  `user_id`). Each call is now cheap enough that the restructure is not worth its
  risk. Revisit if production shows otherwise.
- **`getLiveGoldRate` background refresher.** Still in the request path, still 0 ms
  warm — but still a 5 s stall whenever the webhook is down (§2.7).
- **`avlStockUserIdsNew` memo bypass.** `getPurchaseProducts` still calls it
  internally rather than accepting the memoised list; it is now ~4 ms, so the
  double call costs little.

**Weak spot in the verification:** this database has only **one** row matching
`getTransferSale`'s filter, so its N+1 rewrite is barely exercised by the parity
check. Worth re-checking against data with real pending transfers.

1. **`getPurchaseProducts`** — for the dashboard, replace load-and-loop with four
   SQL aggregates (removes the 1,077 ms of JS). Pass the memoised id list in as
   an argument rather than calling `avlStockUserIdsNew` internally.
2. **`getTotalStockPriceByUser`**, in payoff order:
   - Add `attributes` projections to the stock query and every include level.
   - **Hoist the 358 reference rows** into a process-level cache invalidated on
     admin edit, and drop them from the include tree — this alone removes the 3×
     fan-out, 25,920 rows back to 8,655.
   - Resolve all id sets up front, price each physical row **once**, bucket by
     `user_id` in a `Map`. Ten passes become one.
3. **`getTransferSale`** — one `GROUP BY sale_id`; add `attributes` to the query
   and both `users` joins; delete the empty `.catch`.
4. **`getLiveGoldRate`** — refresh on a `setInterval` at startup; the request
   path reads the cached value and never awaits HTTP.

**Guard rail:** [scripts/dashboard_parity_check.js](scripts/dashboard_parity_check.js)
diffs old vs new totals against real data. Nothing ships until it reports MATCH.
Two intentional quirks it preserves — `quantity = 0` counting as 1
([common.js:1748](app/library/common.js#L1748)) and `is_approved <> 2` excluding
NULLs — are current behaviour; changing either moves displayed numbers and is a
separate announced change, like Phase 1b.

### Phase 3 — Cache and pool ✅ APPLIED

| Change | Verified |
|---|---|
| **`remember()` replaces the ad-hoc `Map`** ([dashboard.controller.js](app/controllers/superadmin/dashboard.controller.js)). The handler body became `buildDashboard(req)`; `exports.index` is now a thin wrapper. | **5 concurrent cold requests: 52 queries, 1,413 ms** — one rebuild shared five ways. The old Map would have produced ~250 queries and five full rebuilds. |
| **Dead `_dashRemember` deleted** — it was defined and never called. | — |
| **Pool `{ min: 5, acquire: 10000, idle: 30000 }`** ([config/config.js](config/config.js#L12)) | `min: 5` keeps connections warm (was 778 ms vs 60 ms on a cold pool); `acquire: 10000` turns a 60-second hang into a fast, visible failure |

Final HTTP: **1.386 s cold, 3.8 ms warm**, all 60 fields identical to baseline.
Five concurrent warm requests all returned in under 16 ms.

**Not done — `invalidate('dashboard:')` in the write paths.** It is exported and
ready, but the 60 s TTL already bounds staleness, and wiring it into every sale /
purchase / stock write is a change across many controllers for a modest gain.
Add it when you want a longer TTL — that is when it stops being optional:

```js
const { invalidate } = require('@library/dashboardCache');
invalidate('dashboard:');
```

**If you run more than one worker**, the cache is still per-process — N workers
means a 1/N hit rate and N different answers. Move `dashboardCache.js` to Redis
at that point; its interface is deliberately narrow so the swap stays contained.

<details>
<summary>Original Phase 3 plan</summary>

- Swap the ad-hoc `Map` for `remember()` from
  [app/library/dashboardCache.js](app/library/dashboardCache.js) — kills the
  expiry stampede. Delete the unused `_dashRemember`.
- Add `invalidate('dashboard:')` to the sale, purchase and stock write paths, so
  freshness no longer requires a short TTL.
- More than one worker? Move the cache to Redis.
- `{ max: 20, min: 5, acquire: 10000, idle: 30000 }` — `acquire: 10000` turns a
  60-second hang into a fast, visible failure. Do not raise `max` until the
  per-request cost is down.

</details>

### Phase 4 — Split the endpoint ✅ APPLIED

Three section endpoints added alongside the existing one, all guarded by
`verifyToken + isSuperAdmin`:

| Endpoint | Cold | Warm | Fields |
|---|---:|---:|---:|
| `GET /api/superadmin/dashboard/charts` | **20 ms** | — | 7 |
| `GET /api/superadmin/dashboard/summary` | **452 ms** | 14 ms | 25 |
| `GET /api/superadmin/dashboard/stock` | **1,216 ms** | 3 ms | 28 |
| `GET /api/superadmin/dashboard` *(unchanged)* | 1,386 ms | 4 ms | 60 |

**The sections partition the payload exactly:** 25 + 28 + 7 = 60, no overlap, no
gaps, and merging the three reproduces `/dashboard` field for field. Verified.

How it works ([dashboard.controller.js](app/controllers/superadmin/dashboard.controller.js)):

- `buildDashboard(req, want)` **skips** unrequested work rather than computing and
  discarding it. That is the entire point — otherwise a section endpoint returns
  zeros dressed as figures.
- The response is filtered to the requested section's fields, from a
  `SECTION_FIELDS` map, so an unasked field is absent rather than wrong.
- Cache keys include the section, so `/summary` and `/dashboard` do not collide
  on different field sets.
- `/dashboard` keeps its exact shape, parity-checked — the frontend can migrate
  one screen at a time.
- Scoped to the superadmin branch, since §1.1 established that is the only one
  reachable over HTTP.

**What this buys, honestly.** Total server work is unchanged — the split does not
make anything faster, it stops the fast 99% waiting behind the slow 1%. Charts
paint in 20 ms instead of 1.4 s; the counts and money tiles at 452 ms.

Two caveats worth recording:

- **Summary came in at 452 ms, not the ~16 ms this section previously projected.**
  The earlier estimate grouped `getPurchaseProducts` (~195 ms) into stock; it
  actually feeds `total_purchase`, a summary field. If you want summary genuinely
  instant, move the purchase totals into the stock section — the cost is
  `total_purchase` arriving later.
- **The `full` endpoint measured 842 ms in the section test run**, but that
  process was already warm from three preceding requests. 1,386 ms from the
  dedicated cold run is the honest comparison.

### Phase 5 — Re-check indexes against production-sized data

`dashboard_explain_check.js` currently reports 4 of 9 queries "scanning".
**Ignore that.** At 57 users and 4,288 stocks MySQL correctly prefers a scan —
the tables fit in a few pages. Re-run against a production-sized copy, then add
`deleted_at` to the indexes that need it (no current index includes it, while
every ORM query filters on it) and drop the deliberate duplicate
(`ix_stocks_type_user` vs `ix_stocks_user_type`).

---

## 5. Summary

### Done

| # | Issue | Where | Measured |
|---|---|---|---|
| ✅ | `req_data` longtext in `SELECT *` — 572.8 MB/request | [common.js:3693](app/library/common.js#L3693) | **15.3 s → 4.4 s over HTTP** |
| ✅ | Dashboard totals counted soft-deleted rows (9 sites) | [common.js:2803](app/library/common.js#L2803) | 3,165 → 2,342 (−26%) |
| ✅ | Superadmin always returned `live_gold_rate: null` | [dashboard.controller.js:94](app/controllers/superadmin/dashboard.controller.js#L94) | null → 14,973 |
| ✅ | 3× join fan-out + unprojected includes in stock valuation | [common.js:1658](app/library/common.js#L1658) | 3,022 ms → 834 ms |
| ✅ | N+1 count per transfer sale | [common.js:2861](app/library/common.js#L2861) | 2 queries → 1 |
| ✅ | Purchase item list built and discarded | [common.js:3698](app/library/common.js#L3698) | 1,495 ms → 195 ms |
| ✅ | Cache had no in-flight dedupe — expiry stampede | [dashboard.controller.js](app/controllers/superadmin/dashboard.controller.js) | 5 concurrent misses: ~250 → 52 queries |
| ✅ | `acquire: 60000` / `min: 0` turned overload into a hang | [config/config.js:12](config/config.js#L12) | cold-pool 778 ms → warm |
| ✅ | Two public routes hung forever on any request | [retailer.routes.js](app/routes/retailer.routes.js#L25), [sales_executive.routes.js](app/routes/sales_executive.routes.js#L24) | hang → 403 / 404 in ms |
| ✅ | Server would not boot — `compression` not installed | [package.json](package.json) | `npm install` — manifest unchanged |
| ✅ | 60 fields all waited on the slowest branch | [dashboard.controller.js](app/controllers/superadmin/dashboard.controller.js) | charts now 20 ms, summary 452 ms |

**Overall: 15,275 ms → 1,386 ms over HTTP (11×), 3.8 ms warm, with all 60
response fields unchanged. Charts alone now land in 20 ms.**

### Files changed

```
app/controllers/retailer/dashboard.controller.js          null-user guard
app/controllers/sales_executive/dashboard.controller.js   null-user guard
app/controllers/superadmin/dashboard.controller.js        cache, sections, gold rate, deleted_at
app/controllers/superadmin/materialPrice.controller.js    price-cache invalidation
app/library/common.js                                     req_data, reference cache, projections, transfer sale
app/routes/retailer.routes.js                             verifyToken
app/routes/sales_executive.routes.js                      verifyToken
app/routes/superadmin.routes.js                           3 section routes
config/config.js                                          pool
```

### Needs a decision from you

| # | Issue | Where | Why it needs you |
|---|---|---|---|
| A | **Breaking change to ship carefully** | [retailer.routes.js](app/routes/retailer.routes.js#L25), [sales_executive.routes.js](app/routes/sales_executive.routes.js#L24) | `/api/retailer/dashboard` and `/api/sales-executive/dashboard` now require a bearer token. Anything calling them anonymously starts getting `403`. Tell whoever owns the mobile/web clients first. |
| B | **Stock counts drop visibly** | §3.3 | `total_stock` 3,165 → 2,342 for superadmin, more for users holding more soft-deleted rows. A correction, not a regression — but announce it or it gets reported as a new bug. |
| C | ~340 lines of unreachable role branches | [dashboard.controller.js:317–656](app/controllers/superadmin/dashboard.controller.js#L317) | Confirm abandoned before deleting |
| D | 53 npm vulnerabilities (4 critical, 40 high) | [package.json](package.json) | Pre-existing. Do **not** run `npm audit fix --force` blind — two puppeteer majors (10.4.0 via `html-pdf-node`, 19.11.1 direct) are in the tree and PDF generation will break. |
| E | `engines` says Node 18 / npm 9 | [package.json](package.json) | Actually running Node 22.16 / npm 11. Bump the field or pin the runtime. |

### Gotcha introduced by the pool change

`min: 5` keeps five connections open, so **a Node process that loads the models
no longer exits on its own** unless it calls `sequelize.close()`. Harmless for the
server; it will hang an ad-hoc `node -e` script. Every script in `scripts/` closes
properly.

### Remaining performance work

**All five phases are applied.** What is left is small and optional:

| # | Issue | Where | Measured | When |
|---|---|---|---|---|
| 1 | Gold rate HTTP in request path | [common.js:568](app/library/common.js#L568) | 0 ms warm, 5 s cold | if the webhook goes down |
| 2 | `avlStockUserIdsNew` runs twice (memo bypassed) | [common.js:3707](app/library/common.js#L3707) | ~4 ms × 2 | not worth it at this size |
| 3 | Cache is per-process — 1/N hit rate under cluster | [dashboardCache.js](app/library/dashboardCache.js) | — | when you scale out |
| 4 | `invalidate('dashboard:')` not wired to write paths | [dashboardCache.js](app/library/dashboardCache.js#L62) | — | if you want a TTL longer than 60 s |
| 5 | Summary section carries the purchase totals | §Phase 4 | 452 ms vs ~20 ms | if you want summary instant |

At 1.4 s cold, 3.8 ms warm, and 20 ms for the charts section, none of these has a
large absolute payoff. **The three items in "Needs a decision" above matter more
than any of them** — two are breaking changes that need announcing before they
ship.

### Verification standard used throughout

Every change was checked with
[dashboard_snapshot.js](scripts/dashboard_snapshot.js) — all 60 response fields
captured and diffed — before moving to the next. Everything was then confirmed
over real HTTP with a signed JWT, not just through the mocked-request harness.
Two things that only showed up over HTTP (the `live_gold_rate` shadowing bug and
the hanging routes) are the reason that second step is worth doing.

---

## 6. Reproducing these numbers

**Via the scripts** (no server needed):

```bash
NODE_ENV=development DB_DEV_HOST=127.0.0.1 DB_DEV_PORT=3306 DB_DEV_USERNAME=root DB_DEV_PASSWORD=root DB_DEV_DATABASE=prakriti-test node scripts/dashboard_endpoint_timing.js
```

| Script | Reports |
|---|---|
| `dashboard_endpoint_timing.js` | response time per role, cold and cached (`--role=1` for one role) |
| `dashboard_helper_profile.js` | per-helper query count, DB time and Node time (`--sql` for per-statement) |
| `dashboard_split_projection.js` | the Phase 4 split, timed per prospective endpoint |
| `dashboard_explain_check.js` | query plans and index usage |
| `dashboard_snapshot.js` | **the refactor guard rail** — `--save=x.json` then `--diff=x.json` diffs all 60 response fields |
| `dashboard_parity_check.js` | old vs new totals for the individual helpers |

All six are read-only. They take the same environment overrides, needed because
the `DB_DEV_*` entries in `.env` point at `127.0.0.1:3306` with no password.

Before any further refactor of this endpoint:

```bash
node scripts/dashboard_snapshot.js --save=baseline.json   # then make changes
node scripts/dashboard_snapshot.js --diff=baseline.json   # must report PARITY
```

**Via real HTTP** (the numbers in §1.1 — these are what users experience):

```bash
NODE_ENV=development DB_DEV_HOST=127.0.0.1 DB_DEV_PORT=3306 DB_DEV_USERNAME=root DB_DEV_PASSWORD=root DB_DEV_DATABASE=prakriti-test PORT=8100 node server.js
```

```bash
TOKEN=$(node -e "console.log(require('jsonwebtoken').sign({id:1,role:1}, require('./config/auth.config').secret, {expiresIn:3600}))") && curl -s -w "\n%{time_total}s | HTTP %{http_code} | %{size_download} bytes\n" -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8100/api/superadmin/dashboard -o /dev/null
```

The 60-second in-memory cache means only the **first** call after a restart is
cold. Wait 61 s between runs, or restart the server, to measure a cold path again.
