# Dashboard performance — what to change

Companion to `Dashboard-API-Issues-and-Fixes.docx`. Everything here is either a
new file already added to the repo, or a small edit to an existing file written
out in full so you can apply it by hand.

**Nothing existing has been modified.** Six new files were added:

| File | What it is |
|---|---|
| `migrations/20260729120000-add-dashboard-performance-indexes.js` | The indexes. Additive, reversible. |
| `app/middlewares/requestTimer.js` | Working replacement for `requestLogger.js`. |
| `app/library/dashboardStats.js` | SQL aggregates replacing the JS summing helpers. |
| `app/library/dashboardCache.js` | TTL cache + per-request memoisation. |
| `scripts/dashboard_explain_check.js` | Confirms the indexes are used. |
| `scripts/dashboard_parity_check.js` | Confirms the new SQL returns identical numbers. |

---

## Correction to the report

The `.docx` index script used `createdAt` as a column name. That is wrong for
raw SQL. Every model remaps it:

```js
createdAt: { field: 'created_at', type: DataTypes.DATE }
```

The physical column is `created_at`. An index built on `createdAt` would fail
outright; SQL referencing it would error. The migration in this repo uses the
correct names.

Second correction, and a more consequential one: **every model is
`paranoid: true`**. Sequelize silently appends `deleted_at IS NULL` to every
query. So:

- Every index needs `deleted_at` in it, or MySQL must read the row to evaluate
  the predicate. The migration accounts for this.
- Every raw SQL query you write must add `AND deleted_at IS NULL` by hand —
  you do not get it for free outside the ORM. `dashboardStats.js` does this
  throughout. If you write your own queries, this is the easiest thing to forget
  and it silently inflates every total by including deleted rows.

---

## Order of work

Do these in order. Steps 1–2 change no behaviour and are the safest and
highest-return work available.

### Step 1 — make it measurable (20 minutes)

Without this you cannot tell whether anything else worked.

**`server.js`** — find these two lines (around line 134):

```js
const { demoLogger } = require('./app/middlewares');
app.use(demoLogger);
```

Replace with:

```js
const requestTimer = require('./app/middlewares/requestTimer');
app.use(requestTimer());
```

`requestLogger.js` is left in place, so rolling back is reverting these two
lines.

**`config/config.js`** — inside `createMySqlConfig`, change:

```js
logging: false,
```

to:

```js
logging:
  process.env.SQL_LOG === 'on'
    ? (sql, timing) => {
        if (timing > 100) console.warn(`[SLOW SQL ${timing}ms] ${sql.slice(0, 200)}`);
      }
    : false,
benchmark: true,
```

Now `SQL_LOG=on npm run dev` shows you slow statements, and production is
unchanged by default.

**Capture the baseline before touching anything else:**

```bash
node scripts/dashboard_explain_check.js > baseline-explain.txt
```

That prints your round-trip latency, table sizes, and the query plan for every
dashboard query. Load the dashboard a few times, then check the timer output.

### Step 2 — indexes (1 hour, no code change)

```bash
npx sequelize-cli db:migrate --env development
node scripts/dashboard_explain_check.js > after-explain.txt
diff baseline-explain.txt after-explain.txt
```

Every query should move from `type: ALL` to `type: ref` or `range`. Anything
still reporting `SCAN` needs its index reviewed — the migration file has notes
on column-order choices at the bottom.

Then measure the dashboard again. On most datasets this alone is the single
largest improvement, and you have changed no application code.

**Prune afterwards.** The migration deliberately adds both column orders for
`stocks` (`ix_stocks_type_user` and `ix_stocks_user_type`). Keep whichever the
optimiser picks in `after-explain.txt` and drop the other — a redundant index
costs write throughput on every insert for no read benefit.

### Step 3 — prove the SQL rewrites match (30 minutes)

```bash
node scripts/dashboard_parity_check.js
```

This runs the old JavaScript helper and the new SQL side by side against your
real data and reports MATCH or MISMATCH for each, with timings.

Do not proceed to step 4 for any check that does not match. Three known causes:

**`quantity = 0` counts as 1.** The original is:

```js
qty += stocks[i].quantity ? parseInt(stocks[i].quantity) : 1;
```

`0` is falsy in JavaScript, so a stock row with quantity 0 contributes **1**.
That is almost certainly not intended, but it is what your current numbers
reflect. `getStockQuantity` reproduces it exactly. If you want to fix it, do so
as a separate announced change — the displayed totals will drop.

**`is_approved <> 2` excludes NULLs.** `NULL <> 2` evaluates to NULL, not true,
so rows with a NULL `is_approved` are excluded from every due-amount total
today. Sequelize's `Op.ne` behaves identically, so the new SQL matches. Worth
checking whether you have any:

```sql
SELECT COUNT(*) FROM sales WHERE is_approved IS NULL;
```

**Month boundaries.** The original built bounds as `'YYYY-MM-DD 23:59:59'`
inclusive. `getMonthlySeries` uses a half-open range (`>= Jan 1`, `< next Jan 1`),
which is both correct and sargable. The only rows that could differ are ones
landing in the final second of 31 December — which the original would have
missed.

### Step 4 — swap the call sites

Only after step 3 is green.

#### 4a. Month chart — 36 queries becomes 3

**`app/controllers/superadmin/dashboard.controller.js`**, lines 910–1055.
Delete the entire `while (month < 13) { ... }` loop and the four
`push` statements at its end, then replace with:

```js
const { getMonthlySeries, getMonthlySeriesForAdmin } = require('@library/dashboardStats');

avl_stockUser_ids.push(userID);

let customerMonthwise = [];
let retailerMonthwise = Array(12).fill(0);
let orderMonthwise = [];
let salesMonthwise = [];

if (isSuperAdmin(req)) {
  const series = await getMonthlySeries({
    customerRoleId: customerRoleId,
    saleByIds: avl_stockUser_ids,
  });
  customerMonthwise = series.customer;
  orderMonthwise = series.order;
  salesMonthwise = series.sales;
} else if (isAdmin(req)) {
  const series = await getMonthlySeriesForAdmin({
    customerRoleId: customerRoleId,
    stateId: state_id,
    toUserId: req.userId,
    saleByIds: adminSaleByIds,
  });
  customerMonthwise = series.customer;
  orderMonthwise = series.order;
  salesMonthwise = series.sales;
} else {
  customerMonthwise = Array(12).fill(0);
  orderMonthwise = Array(12).fill(0);
  salesMonthwise = Array(12).fill(0);
}
```

The distributor and sales-executive branches of the original loop are not
covered by the two helpers above. Add equivalents to `dashboardStats.js` when
you get to those roles — the pattern is identical, only the `WHERE` clause on
users and orders changes. Until then, leaving those roles on the old loop is
fine; it is the super-admin path that is slow.

`retailerMonthwise` is only populated on the sales-executive branch in the
original. The zero-filled array above preserves the response shape for the
other roles, which is what the old loop produced anyway.

#### 4b. Stock totals — 7 scans becomes 1 grouped query

In `@library/common`, `getTotalStockByUser` stays where it is. Change the
**call sites** in `dashboard.controller.js` to use the new helper:

```js
const { getStockQuantity } = require('@library/dashboardStats');

totalStock = await getStockQuantity(userID);
materialTotalStock = await getStockQuantity(userID, 'material');
```

Once those are proven, collapse the seven calls into one bucketed query:

```js
const { getStockQuantityBuckets } = require('@library/dashboardStats');

const allIds = [
  ...new Set([userID, ...distributorIds, ...otherdistributorIds,
              ...adminIds, ...otheradminIds, ...seIds].flat().filter(Boolean)),
];
const buckets = await getStockQuantityBuckets(allIds, ['product', 'material']);
const sumFor = (ids, type = 'product') =>
  (Array.isArray(ids) ? ids : [ids])
    .reduce((acc, id) => acc + (buckets.get(`${id}:${type}`) || 0), 0);

totalStock              = sumFor(userID);
materialTotalStock      = sumFor(userID, 'material');
totalDistributorStock   = sumFor(distributorIds);
totalAdminStock         = sumFor(adminIds);
totalSeStock            = sumFor(seIds);
```

#### 4c. Super admin id — 4 queries becomes 0

```js
const { getSuperAdminIdCached } = require('@library/dashboardStats');

let superAdminId = await getSuperAdminIdCached();
```

If any admin flow can change which user is the super admin, call
`resetSuperAdminId()` from that write path.

#### 4d. Memoise the tree walk — 12 queries becomes 6

`avlStockUserIdsNew` is called twice per request with identical arguments.

```js
const { requestScope } = require('@library/dashboardCache');

const scope = requestScope(req);
const avlIds = await scope(`avl:${superAdminRoleId}`,
  () => avlStockUserIdsNew(null, superAdminRoleId));
```

Use `scope(...)` everywhere `avlStockUserIdsNew` is called with the same
arguments — including inside `getOwnUserSaleProducts`, which calls it again
internally.

### Step 5 — response cache

Wrap the whole handler body once everything above is stable:

```js
const { remember } = require('@library/dashboardCache');

exports.index = async (req, res) => {
  try {
    const key = `dashboard:${req.userId}:${req.role}`;
    const result = await remember(key, 60 * 1000, async () => {
      // ... the existing body, returning `result` instead of sending it
    });
    res.send(formatResponse(result, 'Dashboard'));
  } catch (error) {
    compactLog(error);
    return res.status(errorCodes.default).send(formatErrorResponse(error.toString()));
  }
};
```

`remember` shares one in-flight promise across concurrent misses, so a cold
cache under load does not produce N × 134 queries at once.

Add `invalidate('dashboard:')` to sale, purchase and stock write handlers if 60
seconds of staleness is too much.

### Step 6 — pool settings

**`config/config.js`**:

```js
pool: { max: 20, min: 5, acquire: 10000, idle: 30000 },
```

`min: 0` today means the pool drains when idle, so the first dashboard load of
the morning pays full connection setup to a remote host. `acquire: 60000` means
a request that cannot get a connection waits a full minute before failing —
which presents as a hang. Do not raise `max` until the query count is down.

---

## What is deliberately not done here

These are real fixes but they change how numbers are computed, so they need
reconciling against current output rather than a mechanical swap:

- **`getTotalStockPriceByUser`** (Q-3) — loads a five-level object graph and
  runs `calculateProductPrice` per row. The pricing arithmetic encodes business
  rules. Stage it: add `attributes` projections first (safe, ~80% less data),
  then dedupe the shared material-price lookups, then precompute a `unit_value`
  column on stock maintained on write.
- **`getOwnUserSaleProducts`** (Q-4) — the JS loop has special-case handling for
  material-type products and rows with an empty `certificate_no`. The SQL shape
  is in the `.docx`, section Q-4, but it needs reading against the original
  before use.
- **Splitting `exports.index` per role** (P-4) — a prerequisite for safely
  batching independent awaits, not something to do at the same time.
- **Deleting `indexNew`** (P-7, lines 1155–1886) — 731 lines not referenced by
  any route. Confirm with your team that it is abandoned rather than in
  progress, then remove it.

---

## Rollback

| Step | To undo |
|---|---|
| 1 | Revert the two lines in `server.js` and the `logging` change |
| 2 | `npx sequelize-cli db:migrate:undo --env development` |
| 3 | Nothing — read-only script |
| 4 | Revert the call-site edits; the old helpers are untouched |
| 5 | Remove the `remember` wrapper |
| 6 | Restore the previous `pool` block |

No step modifies data. The migration is additive and its `down` drops only the
indexes it created.
