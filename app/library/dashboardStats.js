/**
 * SQL-side aggregates for the super-admin dashboard.
 *
 * These replace helpers in @library/common that select rows and then add them
 * up in JavaScript. Each function here returns the same number the original
 * produced — including its quirks, which are documented where they matter —
 * but computes it in MySQL and transfers one row instead of thousands.
 *
 * Nothing in this file is wired up automatically. See
 * DASHBOARD-PERFORMANCE-CHANGES.md for the call-site edits, and run
 * scripts/dashboard_parity_check.js to confirm the numbers match before you
 * switch anything over.
 *
 * Column naming
 * -------------
 * Sequelize remaps timestamps (`createdAt` -> `created_at`). Raw SQL must use
 * the physical names. Every model here is `paranoid: true`, so Sequelize
 * normally appends `deleted_at IS NULL` for you — raw SQL does not get that for
 * free and every query below includes it explicitly.
 */

const db = require('@models');
const { QueryTypes } = require('sequelize');

const sequelize = db.sequelize;

const toIdArray = (value) => {
  if (value === null || value === undefined) return [];
  const list = Array.isArray(value) ? value : [value];
  return [...new Set(list.map(Number).filter((n) => Number.isFinite(n)))];
};

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/* ────────────────────────────────────────────────────────────────────────────
 * Stock quantity — replaces getTotalStockByUser
 * ──────────────────────────────────────────────────────────────────────────*/

/**
 * The original is:
 *
 *   let stocks = await StockModel.findAll({ where: conditions });
 *   for (let i = 0; i < stocks.length; i++) {
 *     qty += stocks[i].quantity ? parseInt(stocks[i].quantity) : 1;
 *   }
 *
 * Note the ternary carefully. `stocks[i].quantity` is falsy when the value is
 * null, undefined, 0 or ''. So a stock row with quantity = 0 contributes 1,
 * not 0. That is almost certainly unintended, but it is the behaviour your
 * current dashboard numbers reflect, so the SQL below reproduces it exactly.
 *
 * If you decide zero should mean zero, change the CASE to
 *   `SUM(COALESCE(quantity, 1))`
 * and expect the displayed totals to drop. Do that as a separate, announced
 * change — not silently as part of a performance fix.
 */
const getStockQuantity = async (userId, type = 'product') => {
  const ids = toIdArray(userId);
  if (!ids.length) return 0;

  const [row] = await sequelize.query(
    `SELECT COALESCE(SUM(CASE WHEN quantity IS NULL OR quantity = 0 THEN 1 ELSE quantity END), 0) AS qty
       FROM stocks
      WHERE type = :type
        AND user_id IN (:ids)
        AND deleted_at IS NULL`,
    { replacements: { type, ids }, type: QueryTypes.SELECT }
  );

  return num(row && row.qty);
};

/**
 * The dashboard calls getTotalStockByUser seven times per request with
 * different id sets and types. This returns every bucket in one query, so the
 * controller can read them from a Map instead.
 *
 * Returns: Map keyed `${user_id}:${type}` -> quantity
 *
 *   const buckets = await getStockQuantityBuckets(allUserIds, ['product', 'material']);
 *   const sumFor = (ids, type) =>
 *     ids.reduce((acc, id) => acc + (buckets.get(`${id}:${type}`) || 0), 0);
 */
const getStockQuantityBuckets = async (userIds, types = ['product', 'material', 'return']) => {
  const ids = toIdArray(userIds);
  const map = new Map();
  if (!ids.length) return map;

  const rows = await sequelize.query(
    `SELECT user_id,
            type,
            COALESCE(SUM(CASE WHEN quantity IS NULL OR quantity = 0 THEN 1 ELSE quantity END), 0) AS qty
       FROM stocks
      WHERE user_id IN (:ids)
        AND type IN (:types)
        AND deleted_at IS NULL
      GROUP BY user_id, type`,
    { replacements: { ids, types }, type: QueryTypes.SELECT }
  );

  rows.forEach((r) => map.set(`${r.user_id}:${r.type}`, num(r.qty)));
  return map;
};

/* ────────────────────────────────────────────────────────────────────────────
 * Sale and purchase due amounts
 * ──────────────────────────────────────────────────────────────────────────*/

/**
 * Replaces the repeated `saleModel.sum('due_amount', { where: {...} })` calls.
 * Identical predicate, but callable for several id sets at once.
 *
 * The `is_approved <> 2` predicate does not match rows where is_approved is
 * NULL, because NULL <> 2 is NULL, not true. Sequelize's Op.ne behaves the
 * same way, so this matches the current output — but if you have NULL
 * is_approved rows they are being excluded from your due totals today. Worth
 * checking:  SELECT COUNT(*) FROM sales WHERE is_approved IS NULL;
 */
const getSaleDueAmount = async (saleByIds) => {
  const ids = toIdArray(saleByIds);
  if (!ids.length) return 0;

  const [row] = await sequelize.query(
    `SELECT COALESCE(SUM(due_amount), 0) AS total
       FROM sales
      WHERE sale_by IN (:ids)
        AND is_approved <> 2
        AND is_assigned = 0
        AND is_approval = 0
        AND deleted_at IS NULL`,
    { replacements: { ids }, type: QueryTypes.SELECT }
  );

  return num(row && row.total);
};

const getSaleDueAmountByUser = async (userIds) => {
  const ids = toIdArray(userIds);
  if (!ids.length) return 0;

  const [row] = await sequelize.query(
    `SELECT COALESCE(SUM(due_amount), 0) AS total
       FROM sales
      WHERE user_id IN (:ids)
        AND is_approved <> 2
        AND is_assigned = 0
        AND is_approval = 0
        AND deleted_at IS NULL`,
    { replacements: { ids }, type: QueryTypes.SELECT }
  );

  return num(row && row.total);
};

const getPurchaseDueAmount = async (userIds) => {
  const ids = toIdArray(userIds);
  if (!ids.length) return 0;

  const [row] = await sequelize.query(
    `SELECT COALESCE(SUM(due_amount), 0) AS total
       FROM purchases
      WHERE user_id IN (:ids)
        AND is_approved <> 2
        AND is_assigned = 0
        AND is_approval = 0
        AND deleted_at IS NULL`,
    { replacements: { ids }, type: QueryTypes.SELECT }
  );

  return num(row && row.total);
};

/* ────────────────────────────────────────────────────────────────────────────
 * User counts by role — replaces repeated UserModel.count() calls
 * ──────────────────────────────────────────────────────────────────────────*/

/**
 * One query instead of one per role.
 *
 * Returns: Map keyed `${role_id}:${own ? 1 : 0}` -> count
 */
const getUserCountsByRole = async (parentIds = null) => {
  const ids = toIdArray(parentIds);
  const map = new Map();

  const where = ['deleted_at IS NULL'];
  const replacements = {};
  if (ids.length) {
    where.push('parent_id IN (:ids)');
    replacements.ids = ids;
  }

  const rows = await sequelize.query(
    `SELECT role_id, COALESCE(own, 0) AS own, COUNT(*) AS n
       FROM users
      WHERE ${where.join(' AND ')}
      GROUP BY role_id, COALESCE(own, 0)`,
    { replacements, type: QueryTypes.SELECT }
  );

  rows.forEach((r) => map.set(`${r.role_id}:${num(r.own)}`, num(r.n)));
  return map;
};

/* ────────────────────────────────────────────────────────────────────────────
 * Month chart — replaces the 12-iteration while loop (36 sequential queries)
 * ──────────────────────────────────────────────────────────────────────────*/

const emptySeries = () => Array(12).fill(0);

/**
 * GROUP BY returns no row for a month with no data, whereas the original loop
 * pushed a 0 for every month. This fills the gaps so the chart keeps its
 * twelve points and the array indices still map to January..December.
 */
const toSeries = (rows, valueKey = 'v') => {
  const out = emptySeries();
  rows.forEach((r) => {
    const idx = Number(r.m) - 1;
    if (idx >= 0 && idx < 12) out[idx] = num(r[valueKey]);
  });
  return out;
};

/**
 * The original loop built its bounds with getMonthDateRange(year, month) and
 * formatted them as 'YYYY-MM-DD 00:00:00' / 'YYYY-MM-DD 23:59:59'. Using a
 * half-open year range here instead of YEAR(created_at) keeps the predicate
 * sargable, so ix_users_role_created and ix_orders_from_created can serve it.
 *
 * A half-open upper bound (< next year) is also correct for the 23:59:59 case,
 * which the original would have missed for rows landing in the final second of
 * 31 December.
 *
 * @param {object} opts
 * @param {number} opts.customerRoleId
 * @param {number[]} opts.saleByIds     users whose sales count toward the chart
 * @param {number} [opts.year]          defaults to the current year
 * @returns {Promise<{customer:number[], order:number[], sales:number[]}>}
 */
const getMonthlySeries = async ({ customerRoleId, saleByIds, year }) => {
  const y = Number(year) || new Date().getFullYear();
  const from = `${y}-01-01 00:00:00`;
  const to = `${y + 1}-01-01 00:00:00`;
  const dFrom = `${y}-01-01`;
  const dTo = `${y + 1}-01-01`;

  const ids = toIdArray(saleByIds);

  const [customerRows, orderRows, salesRows] = await Promise.all([
    sequelize.query(
      `SELECT MONTH(created_at) AS m, COUNT(*) AS v
         FROM users
        WHERE role_id = :roleId
          AND created_at >= :from AND created_at < :to
          AND deleted_at IS NULL
        GROUP BY MONTH(created_at)`,
      { replacements: { roleId: customerRoleId, from, to }, type: QueryTypes.SELECT }
    ),

    sequelize.query(
      `SELECT MONTH(created_at) AS m, COALESCE(SUM(total_amount), 0) AS v
         FROM orders
        WHERE order_from = 'front_website'
          AND created_at >= :from AND created_at < :to
          AND deleted_at IS NULL
        GROUP BY MONTH(created_at)`,
      { replacements: { from, to }, type: QueryTypes.SELECT }
    ),

    ids.length
      ? sequelize.query(
          `SELECT MONTH(invoice_date) AS m, COALESCE(SUM(total_payable), 0) AS v
             FROM sales
            WHERE sale_by IN (:ids)
              AND is_approved <> 2
              AND is_assigned = 0
              AND is_approval = 0
              AND invoice_date >= :dFrom AND invoice_date < :dTo
              AND deleted_at IS NULL
            GROUP BY MONTH(invoice_date)`,
          { replacements: { ids, dFrom, dTo }, type: QueryTypes.SELECT }
        )
      : Promise.resolve([]),
  ]);

  return {
    customer: toSeries(customerRows),
    order: toSeries(orderRows),
    sales: toSeries(salesRows),
  };
};

/**
 * Admin variant — customers scoped by state, orders by to_user_id.
 */
const getMonthlySeriesForAdmin = async ({ customerRoleId, stateId, toUserId, saleByIds, year }) => {
  const y = Number(year) || new Date().getFullYear();
  const from = `${y}-01-01 00:00:00`;
  const to = `${y + 1}-01-01 00:00:00`;
  const ids = toIdArray(saleByIds);

  const [customerRows, orderRows, salesRows] = await Promise.all([
    sequelize.query(
      `SELECT MONTH(created_at) AS m, COUNT(*) AS v
         FROM users
        WHERE role_id = :roleId AND state_id = :stateId
          AND created_at >= :from AND created_at < :to
          AND deleted_at IS NULL
        GROUP BY MONTH(created_at)`,
      { replacements: { roleId: customerRoleId, stateId, from, to }, type: QueryTypes.SELECT }
    ),

    sequelize.query(
      `SELECT MONTH(created_at) AS m, COALESCE(SUM(total_amount), 0) AS v
         FROM orders
        WHERE order_from = 'front_website' AND to_user_id = :toUserId
          AND created_at >= :from AND created_at < :to
          AND deleted_at IS NULL
        GROUP BY MONTH(created_at)`,
      { replacements: { toUserId, from, to }, type: QueryTypes.SELECT }
    ),

    ids.length
      ? sequelize.query(
          `SELECT MONTH(invoice_date) AS m, COALESCE(SUM(total_payable), 0) AS v
             FROM sales
            WHERE sale_by IN (:ids) AND is_approved <> 2
              AND is_assigned = 0 AND is_approval = 0
              AND invoice_date >= :dFrom AND invoice_date < :dTo
              AND deleted_at IS NULL
            GROUP BY MONTH(invoice_date)`,
          { replacements: { ids, dFrom: `${y}-01-01`, dTo: `${y + 1}-01-01` }, type: QueryTypes.SELECT }
        )
      : Promise.resolve([]),
  ]);

  return {
    customer: toSeries(customerRows),
    order: toSeries(orderRows),
    sales: toSeries(salesRows),
  };
};

/* ────────────────────────────────────────────────────────────────────────────
 * User hierarchy — reduces avlStockUserIdsNew's six round-trips
 * ──────────────────────────────────────────────────────────────────────────*/

/**
 * Resolves the descendant tree in a single statement using a recursive CTE.
 *
 * REQUIRES MySQL 8.0+. Check with: SELECT VERSION();
 * On 5.7 this throws a syntax error — use getDescendantIdsIterative below,
 * which is the same shape as the existing code but batched by level instead of
 * by role, so it is 2–3 queries rather than 6.
 *
 * @param {number} rootId
 * @param {object} [filter]
 * @param {boolean} [filter.own]      only rows with own = 1
 * @param {number[]} [filter.roleIds] only these roles
 */
const getDescendantIds = async (rootId, filter = {}) => {
  const root = Number(rootId);
  if (!Number.isFinite(root)) return [];

  const conditions = ['deleted_at IS NULL'];
  const replacements = { root };

  if (filter.own === true) conditions.push('own = 1');
  if (filter.own === false) conditions.push('(own = 0 OR own IS NULL)');
  if (Array.isArray(filter.roleIds) && filter.roleIds.length) {
    conditions.push('role_id IN (:roleIds)');
    replacements.roleIds = toIdArray(filter.roleIds);
  }

  const rows = await sequelize.query(
    `WITH RECURSIVE tree AS (
       SELECT id, role_id, own, parent_id, 0 AS depth
         FROM users
        WHERE id = :root AND deleted_at IS NULL
       UNION ALL
       SELECT u.id, u.role_id, u.own, u.parent_id, t.depth + 1
         FROM users u
         JOIN tree t ON u.parent_id = t.id
        WHERE u.deleted_at IS NULL AND t.depth < 10
     )
     SELECT id FROM tree WHERE ${conditions.join(' AND ')}`,
    { replacements, type: QueryTypes.SELECT }
  );

  return rows.map((r) => Number(r.id));
};

/**
 * MySQL 5.7-safe fallback. Walks the tree level by level — typically 3–4
 * queries for this org structure rather than the 6 the current helper issues,
 * and it does not depend on knowing the role sequence in advance.
 */
const getDescendantIdsIterative = async (rootId, filter = {}, maxDepth = 10) => {
  const root = Number(rootId);
  if (!Number.isFinite(root)) return [];

  const all = new Map();
  let frontier = [root];
  let depth = 0;

  while (frontier.length && depth < maxDepth) {
    const rows = await sequelize.query(
      `SELECT id, role_id, own
         FROM users
        WHERE parent_id IN (:ids) AND deleted_at IS NULL`,
      { replacements: { ids: frontier }, type: QueryTypes.SELECT }
    );

    frontier = [];
    rows.forEach((r) => {
      const id = Number(r.id);
      if (all.has(id)) return;
      all.set(id, r);
      frontier.push(id);
    });
    depth += 1;
  }

  let result = [...all.values()];
  if (filter.own === true) result = result.filter((r) => num(r.own) === 1);
  if (filter.own === false) result = result.filter((r) => num(r.own) !== 1);
  if (Array.isArray(filter.roleIds) && filter.roleIds.length) {
    const roleSet = new Set(toIdArray(filter.roleIds));
    result = result.filter((r) => roleSet.has(Number(r.role_id)));
  }

  return result.map((r) => Number(r.id));
};

/* ────────────────────────────────────────────────────────────────────────────
 * Super admin id — replaces the uncached SELECT * in getSuperAdminId
 * ──────────────────────────────────────────────────────────────────────────*/

let _superAdminId = null;

/**
 * The original selects every column of the user row to read one integer, has
 * no index on role_id to find it, throws if no super admin exists, and is
 * called four or more times per dashboard request.
 *
 * Cached at module scope: the super admin's id does not change at runtime.
 * Call resetSuperAdminId() from any code path that could change it.
 */
const getSuperAdminIdCached = async (superAdminRoleId = 1) => {
  if (_superAdminId !== null) return _superAdminId;

  const [row] = await sequelize.query(
    `SELECT id FROM users
      WHERE role_id = :roleId AND deleted_at IS NULL
      ORDER BY id ASC
      LIMIT 1`,
    { replacements: { roleId: superAdminRoleId }, type: QueryTypes.SELECT }
  );

  if (!row) throw new Error('dashboardStats: no superadmin user found');

  _superAdminId = Number(row.id);
  return _superAdminId;
};

const resetSuperAdminId = () => {
  _superAdminId = null;
};

module.exports = {
  getStockQuantity,
  getStockQuantityBuckets,
  getSaleDueAmount,
  getSaleDueAmountByUser,
  getPurchaseDueAmount,
  getUserCountsByRole,
  getMonthlySeries,
  getMonthlySeriesForAdmin,
  getDescendantIds,
  getDescendantIdsIterative,
  getSuperAdminIdCached,
  resetSuperAdminId,
  toSeries,
};
