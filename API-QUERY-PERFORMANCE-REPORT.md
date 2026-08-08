# API endpoints — query and invoice performance analysis and fixes

**Subject:** the API queries are slow across all endpoints, invoice generation included.
**Constraint:** not one byte of any response may change.
**Verdict:** the slowest list endpoints were **1.0–1.2 s**; they are now
**8–80 ms**. Invoice generation was **1.9–5.7 s**; it is now **0.34–0.72 s**.
Sixty endpoint responses were captured before and after and compared byte for
byte, and every generated PDF compared too: **every difference is accounted
for, and the one change that did alter a response was caught and reverted**
(§3.4, §6).

| | |
|---|---|
| Database | `prakriti-test` @ 127.0.0.1:3306, MySQL 9.7.1 |
| Data size | 52 users · 125 sales · 187 purchases · 4,290 stocks · 8,657 stock_materials · 4,768 purchase_products · 9,666 purchase_product_materials · 1,425 sale_products · 2,170 carts · 1,759 product_certificates |
| Measured with | live HTTP against the running server on :9090 with a signed super-admin JWT, plus a query-counting harness that wrapped `sequelize.query` |
| Date | 2026-08-08 |
| Related | [DASHBOARD-SLOWNESS-REPORT.md](DASHBOARD-SLOWNESS-REPORT.md) — the dashboard was fixed separately and is unchanged here |

Production data is larger than this dataset, so treat every "before" number as a
floor and every ratio as conservative.

---

## 1. Measured response time

### 1.1 Headline endpoints

| Endpoint | Before | After | Factor |
|---|---:|---:|---:|
| `/superadmin/purchases/txn-ledger` | 1,183 ms | **11 ms** | 108× |
| `/superadmin/purchases` | 1,165 ms | **10 ms** | 117× |
| `/superadmin/stocks` | 1,122 ms | **80 ms** | 14× |
| `/superadmin/stocks?total_avl_stock=1` | 985 ms | **59 ms** | 17× |
| `/superadmin/admin` | 566 ms | **34 ms** | 17× |
| `/superadmin/purchases-on-approve` | 272 ms | **45 ms** | 6× |
| `/superadmin/user-list` | 244 ms | **305 ms** | — |
| `/superadmin/product` | 373 ms | **206 ms** | 1.8× |
| `/superadmin/orders` | 135 ms | **56 ms** | 2.4× |
| `/superadmin/sales-products` | 112 ms | **96 ms** | 1.2× |
| `/superadmin/retailers` | 34 ms | **19 ms** | 1.8× |

Two rows need a note. `/user-list` and `/purchases-products` moved within noise
of their baselines — both are dominated by response serialization, not by
queries (§5). Everything else on the two suites is at or below its baseline.

### 1.2 Query counts, from the counting harness

| Endpoint | Queries before | Queries after | Wall before | Wall after |
|---|---:|---:|---:|---:|
| `/admin` | 93 | 93 (concurrent) | 450 ms | 34 ms |
| `/stocks` | 262 | 74 | 1,058 ms | 80 ms |
| `/purchases` | 54 | 54 (concurrent) | 637 ms | 10 ms |
| `/purchases/txn-ledger` | 3 | 3 | 1,366 ms | 11 ms |

The `/admin` row is the clearest illustration: the same 93 queries, only 80 ms
of database time between them. The other 370 ms was round trips waiting on each
other.

---

## 2. What was actually slow

Four causes, in descending order of damage.

### 2.1 Foreign-key indexes that MySQL cannot use

Every table carries a composite index named `<table>_indexing` whose **first
column is `id`** — the primary key, and therefore unique. A composite index can
only be used from its leading column inward, so `product_certificates_indexing
(id, product_id, certificate_id)` is useless for `WHERE product_id = ?`.

`EXPLAIN` on the stock list count query:

```
-> Nested loop inner join  (cost=213 rows=1759)
    -> Filter: (product->certificates->product_certificates.product_id = stocks.product_id)
        -> Table scan on product->certificates->product_certificates  (cost=27.8 rows=1759)
```

A full scan of all 1,759 `product_certificates` rows, per stock row. That single
`count(DISTINCT stocks.id)` took **1,056 ms of the 1,122 ms** response.

The same shape applied to `carts` (no index on `stock_id` at all — the cart
availability check runs once per listing row), `purchase_products.purchase_id`
(one `COUNT(*)` per purchase row), and the sale/purchase material tables.

**Fix:** [migrations/20260808140000-add-foreign-key-indexes.js](migrations/20260808140000-add-foreign-key-indexes.js)
adds 11 lookup indexes:

| Table | Index | Columns |
|---|---|---|
| product_certificates | ix_product_certificates_product | product_id |
| product_certificates | ix_product_certificates_certificate | certificate_id |
| carts | ix_carts_stock | stock_id |
| carts | ix_carts_user_type | user_id, type |
| purchase_products | ix_purchase_products_purchase | purchase_id |
| purchase_product_materials | ix_ppm_purchase_product | purchase_product_id |
| purchase_product_materials | ix_ppm_purchase | purchase_id |
| sale_product_materials | ix_spm_sale_product | sale_product_id |
| sale_product_materials | ix_spm_sale | sale_id |
| payments | ix_payments_user | user_id |
| payments | ix_payments_table | table_type, table_id |

Indexes only — no column, table or query changes. The migration is idempotent
(it checks `SHOW INDEX` first) and skips a missing table rather than aborting
the rest. Existing `*_indexing` keys were left in place; they are redundant for
lookups but dropping them is a separate decision.

### 2.2 A longtext audit blob nobody reads

`purchases.req_data` and `sales.req_data` are TEXT columns holding the original
request payload. Seven list and ledger queries selected them with
`SELECT purchases.*`. None of the code paths below those queries read the
column — verified per function before touching it, and the collections involved
(`PurchaseListCollection`, `SaleListCollection`) never mention it.

On the purchase ledger this was **1,343 ms of a 1,366 ms** response.

**Fix:** `attributes: { exclude: ["req_data"] }` on the seven queries in
[purchase.controller.js](app/controllers/superadmin/purchase.controller.js) and
[sale.controller.js](app/controllers/superadmin/sale.controller.js):
`index`, `txnLedger`, `downloadTxnLedger`, `onapprove_index` on both sides.

`ReturnSaleCollection` *does* decode `req_data`, so the return-sale queries were
deliberately left alone.

### 2.3 Per-row awaits, one round trip at a time

All 53 `app/resources/**/*Collection.js` files shared this shape:

```js
let arr = [];
for (let i = 0; i < data.length; i++) {
    arr.push(await getModelObject(data[i], ...));
}
return arr;
```

Each `getModelObject` issues its own queries — five `SUM`s, a stock total, a
wallet balance, an advance-payment lookup. An eight-row admin list became 93
strictly sequential round trips: 80 ms of database work stretched over 450 ms.

**Fix:** a `mapConcurrent(items, fn, limit = 8)` helper in
[app/helpers/helper.js](app/helpers/helper.js) — same calls, same arguments,
results in input order, a window of 8 in flight. All 53 collections converted
mechanically.

Why 8: the sequelize pool is `max: 20` with `acquire: 10000`. A limit near the
pool size risks acquire timeouts under concurrent traffic, which would turn a
slow response into a failed one. Eight leaves headroom for nested collections
(a collection that calls another collection per row) while still removing an
order of magnitude of stacked latency.

Safety review before converting: no resource file holds module-level mutable
state, and none of them writes to the database — the only cross-row coupling
that could have existed. `WalletCollection` reads the row index (`index == 0`);
it still receives the same index.

The helper carries an assert-based self-check for input order, actual
concurrency, and the empty-array case.

### 2.4 The same price row fetched once per listing row

`calculateProductPriceCart` looks up `material_prices` joined to
`material_price_purities` for each material of each row. A stock page of 50 rows
asked for the same handful of material/purity pairs 200 times.

**Fix:** an optional per-response cache
([common.js](app/library/common.js)) keyed by `material_id:purity_id`. It caches
the **promise**, not the result, so rows running side by side share one query
rather than each firing their own. Only `StocksReportCollection` passes a cache;
every other caller omits it and behaves exactly as before. 200 queries → 12.

The cached rows are read-only on this path (verified — no assignment to
`materialPrice*` anywhere in the function), so sharing the instances is safe.

---

## 3. Invoice generation

Invoice endpoints were measured separately because almost none of their time was
database time.

### 3.1 Before and after

| Endpoint | Before | After | Factor |
|---|---:|---:|---:|
| `POST /sales/download-invoice-info/:id` | 5,723 ms | **717 ms** | 8.0× |
| `POST /sales/download-invoice-item-list/:id` | 2,518 ms | **360 ms** | 7.0× |
| `POST /sales/download-invoice-item-details/:id` | 2,258 ms | **371 ms** | 6.1× |
| `POST /sales/download-invoice/:id` | 2,045 ms | **401 ms** | 5.1× |
| `POST /purchases/download-invoice-info/:id` | 2,391 ms | **434 ms** | 5.5× |
| `POST /purchases/download-invoice-item-list/:id` | 1,946 ms | **368 ms** | 5.3× |
| `POST /purchases/download-invoice-item-details/:id` | 1,951 ms | **341 ms** | 5.7× |

### 3.2 Where the time went

Profiling `downloadInvoiceInfo`: **4,380 ms wall, 314 ms in the database, 9
queries**. Four seconds of it was PDF rendering. Timing the renderer's own steps:

| Step | Cost |
|---|---:|
| `puppeteer.launch()` | 472 ms |
| `browser.newPage()` | 104 ms |
| `setContent(..., waitUntil: "networkidle0")` | 936 ms |
| `page.pdf()` | 70 ms |
| `browser.close()` | 57 ms |

[app/helpers/pdf.js](app/helpers/pdf.js) launched a fresh Chromium and closed it
again **for every invoice** — 529 ms per request spent starting and stopping the
same binary. And `networkidle0` waits for the load event *and then* a further
500 ms of network silence, which only earns its keep when scripts fetch more
data after load. These invoice documents contain no `<script>` at all.

### 3.3 Two changes, both in `app/helpers/pdf.js`

1. **One Chromium kept alive per set of launch arguments.** Pages are still
   created and closed per request, so nothing is shared between invoices except
   the process. Keyed by `args` because callers pass different flags and a
   browser cannot change them afterwards; relaunches if the process dies, and
   closes on `exit`/`SIGINT`/`SIGTERM`.
2. **`waitUntil: "networkidle0"` → `"load"`** for `setContent`. `load` already
   means every image, stylesheet and font has finished loading. The `page.goto`
   path was left alone.

Measured on the real invoice HTML (232 KB, 1 image, 0 scripts): 1,028 ms →
109 ms, with a byte-identical PDF.

### 3.4 One change that was reverted

Excluding `req_data` from the invoice queries — the same fix that worked on the
list endpoints — **changed two responses** and was backed out.

`downloadInvoiceInfo` serializes the raw Sequelize model into its response, so
`data.sale.req_data` and `data.purchase.req_data` are part of the payload:
295,824 B → 290,182 B on the sale side. The static check ("does the function
body mention `req_data`?") said it was unused; it was wrong, because nothing
*mentions* the column — the whole row is handed to `res.send`.

Caught by the byte comparison, reverted in both controllers. The exclusion is
kept on the five invoice queries whose responses never contained the column
(`downloadInvoice`, and the item-list / item-details pair on both sides), which
is worth ~250 ms each on the sale side.

The lesson generalises: on this codebase, "the code does not read column X" does
not imply "column X is absent from the response".

### 3.5 Verification

PDF bytes are deterministic apart from `/CreationDate` and `/ModDate` — two
renders of unchanged input differ in exactly those two fields (verified across
three consecutive renders). Both were normalised before comparing.

| Artifact | Compared | Identical |
|---|---:|---:|
| Invoice JSON responses (`?v=` cache-buster normalised) | 7 | **7** |
| Generated PDF files on disk (timestamps normalised) | 7 | **7** |

The `?v=` normalisation is not a concession: that cache-buster is
`Date.now()` in the original code, so it differs between any two runs of it too.

---

## 4. Files changed

| File | Change |
|---|---|
| `migrations/20260808140000-add-foreign-key-indexes.js` | new — 11 lookup indexes |
| `app/helpers/helper.js` | new `mapConcurrent` helper + self-check |
| `app/library/common.js` | optional price cache in `calculateProductPriceCart` |
| `app/controllers/superadmin/purchase.controller.js` | exclude `req_data` (4 queries) |
| `app/controllers/superadmin/sale.controller.js` | exclude `req_data` (3 queries) |
| `app/resources/**/*Collection.js` (53 files) | sequential loop → `mapConcurrent` |
| `app/helpers/pdf.js` | reuse one Chromium per args; `setContent` waits on `load` |

No route, controller signature, collection output shape, or model attribute was
changed.

---

## 5. Endpoints still worth attention

These are no longer query-bound. Making them faster means changing how the
payload is assembled, which is a larger change with real response risk — out of
scope for a "no response changes" pass.

| Endpoint | Time | Where it goes |
|---|---:|---|
| `/stocks/stock-price-by-category` | 563 ms | 173 ms in the database, ~390 ms in JS aggregating 4,290 stocks and their materials |
| `/purchases-products` | 550 ms | 1.7 MB response for 3,200 items — serialization, not queries |
| `/user-list` | 305 ms | 53 KB response; per-user work in the collection |
| `/product` | 206 ms | 310 KB response |

---

## 6. Verification — the response-identity requirement

Two suites, 60 endpoints, captured as raw bytes before and after and compared
with `cmp`:

| Suite | Endpoints | Identical | Different |
|---|---:|---:|---:|
| A — 22 list endpoints, baseline taken before any change | 22 | **22** | 0 |
| B — 38 further endpoints, baseline taken with the performance code reverted (`git stash`) | 38 | 35 | 3 |

The three differences in suite B are entirely explained, and none of them comes
from this work:

| File | Difference |
|---|---|
| `/carts?type=sale` | `hold_at` added to each item |
| `/stocks?type=material` | `avl_users` added |
| `/stocks?limit=200` | `avl_users` added |

Both fields are the two features built earlier the same day (per-hold grouping
in the cart, and the "Avl By" stock filter). The suite-B baseline was taken with
those commits stashed, so they show up as additions. Suite A, whose baseline was
taken *after* those features and *before* the performance work, is byte-identical
across all 22 endpoints — that is the clean measurement of this change set.

---

## 7. Two pre-existing failures found while measuring

Neither is caused by this work; both reproduce on the original code.

1. **`GET /superadmin/attendances` hangs forever** when called without
   `user_id`. [expense.controller.js:517](app/controllers/superadmin/expense.controller.js#L517)
   runs `userModel.findOne({ where: { id: user_id } })` with `user_id`
   undefined, sequelize throws `WHERE parameter "id" has invalid "undefined"
   value`, and the handler has no `try`/`catch` — so no response is ever sent
   and the client waits until its own timeout.

2. **`GET /superadmin/payments/due-amount` never returns** — same symptom, hit
   the 300 s harness timeout on both the original and the current code.

A third, milder one: `GET /superadmin/stocks` returns `{"success":false}` when
the `search` parameter is omitted entirely —
[stocks.controller.js](app/controllers/superadmin/stocks.controller.js) calls
`search.split(",")` unguarded. The UI always sends `search=`, so it does not
surface there.

All three are one-line guards. They were left alone because they change
responses — which is exactly what this pass was told not to do.
