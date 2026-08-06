#!/usr/bin/env node

/**
 * Verifies that the dashboard's queries are actually using indexes.
 *
 * Run this BEFORE the index migration to capture a baseline, then AFTER to
 * confirm the indexes landed and the optimiser chose them:
 *
 *   node scripts/dashboard_explain_check.js > before.txt
 *   npx sequelize-cli db:migrate --env development
 *   node scripts/dashboard_explain_check.js > after.txt
 *   diff before.txt after.txt
 *
 * What to look for in the output
 * ------------------------------
 *   type: ALL          full table scan — the index is not being used
 *   type: index        full index scan — better than ALL, still reading everything
 *   type: range / ref  index seek — this is what you want
 *   key: NULL          no index chosen at all
 *   Extra: Using filesort / Using temporary
 *                      the sort is not covered by the index
 *
 * A row count in `rows` close to the table's total row count means a scan even
 * if `key` is populated.
 */

require('module-alias/register');
require('dotenv').config();

const db = require('@models');
const { QueryTypes } = require('sequelize');

const sequelize = db.sequelize;

const SUPERADMIN_ROLE = 1;
const ADMIN_ROLE = 2;
const DISTRIBUTOR_ROLE = 3;
const CUSTOMER_ROLE = 6;

const year = new Date().getFullYear();

/**
 * Sample ids are resolved at runtime so the EXPLAIN reflects a realistic
 * IN() list rather than a single literal, which the optimiser treats
 * differently.
 */
const resolveSampleIds = async () => {
  const rows = await sequelize.query(
    `SELECT id FROM users WHERE deleted_at IS NULL ORDER BY id ASC LIMIT 25`,
    { type: QueryTypes.SELECT }
  );
  const ids = rows.map((r) => Number(r.id));
  return ids.length ? ids : [1];
};

const buildQueries = (ids) => [
  {
    name: 'users — role + own + parent (branch id resolution)',
    sql: `SELECT id FROM users
           WHERE role_id = ${DISTRIBUTOR_ROLE} AND own = 1
             AND parent_id IN (${ids.join(',')})
             AND deleted_at IS NULL`,
    wants: 'ix_users_role_own_parent',
  },
  {
    name: 'users — count by role (totalCustomer)',
    sql: `SELECT COUNT(*) FROM users
           WHERE role_id = ${CUSTOMER_ROLE} AND deleted_at IS NULL`,
    wants: 'ix_users_role_own_parent or ix_users_role_created',
  },
  {
    name: 'users — month chart bucket',
    sql: `SELECT MONTH(created_at) m, COUNT(*) v FROM users
           WHERE role_id = ${CUSTOMER_ROLE}
             AND created_at >= '${year}-01-01 00:00:00'
             AND created_at <  '${year + 1}-01-01 00:00:00'
             AND deleted_at IS NULL
           GROUP BY MONTH(created_at)`,
    wants: 'ix_users_role_created',
  },
  {
    name: 'users — tree walk by parent',
    sql: `SELECT id, role_id, own FROM users
           WHERE parent_id IN (${ids.join(',')}) AND deleted_at IS NULL`,
    wants: 'ix_users_parent_role',
  },
  {
    name: 'stocks — quantity total by user + type',
    sql: `SELECT COALESCE(SUM(CASE WHEN quantity IS NULL OR quantity = 0 THEN 1 ELSE quantity END), 0)
            FROM stocks
           WHERE type = 'product' AND user_id IN (${ids.join(',')})
             AND deleted_at IS NULL`,
    wants: 'ix_stocks_type_user or ix_stocks_user_type',
  },
  {
    name: 'sales — due amount by sale_by',
    sql: `SELECT COALESCE(SUM(due_amount), 0) FROM sales
           WHERE sale_by IN (${ids.join(',')})
             AND is_approved <> 2 AND is_assigned = 0 AND is_approval = 0
             AND deleted_at IS NULL`,
    wants: 'ix_sales_flags_saleby',
  },
  {
    name: 'sales — month chart bucket',
    sql: `SELECT MONTH(invoice_date) m, COALESCE(SUM(total_payable), 0) v FROM sales
           WHERE sale_by IN (${ids.join(',')})
             AND is_approved <> 2 AND is_assigned = 0 AND is_approval = 0
             AND invoice_date >= '${year}-01-01' AND invoice_date < '${year + 1}-01-01'
             AND deleted_at IS NULL
           GROUP BY MONTH(invoice_date)`,
    wants: 'ix_sales_flags_saleby',
  },
  {
    name: 'purchases — due amount',
    sql: `SELECT COALESCE(SUM(due_amount), 0) FROM purchases
           WHERE user_id IN (${ids.join(',')})
             AND is_approved <> 2 AND is_assigned = 0 AND is_approval = 0
             AND deleted_at IS NULL`,
    wants: 'ix_purchases_user_flags',
  },
  {
    name: 'orders — month chart bucket',
    sql: `SELECT MONTH(created_at) m, COALESCE(SUM(total_amount), 0) v FROM orders
           WHERE order_from = 'front_website'
             AND created_at >= '${year}-01-01 00:00:00'
             AND created_at <  '${year + 1}-01-01 00:00:00'
             AND deleted_at IS NULL
           GROUP BY MONTH(created_at)`,
    wants: 'ix_orders_from_created',
  },
];

const TABLES = ['users', 'sales', 'stocks', 'purchases', 'orders'];

const tableSizes = async () => {
  const sizes = {};
  for (const t of TABLES) {
    try {
      const [row] = await sequelize.query(`SELECT COUNT(*) AS n FROM ${t}`, {
        type: QueryTypes.SELECT,
      });
      sizes[t] = Number(row.n);
    } catch (e) {
      sizes[t] = null;
    }
  }
  return sizes;
};

const verdict = (plan, tableRowCount) => {
  const type = String(plan.type || '').toLowerCase();
  const key = plan.key;
  const rows = Number(plan.rows) || 0;

  if (!key) return { mark: 'SCAN', note: 'no index chosen' };
  if (type === 'all') return { mark: 'SCAN', note: 'full table scan' };
  if (type === 'index') return { mark: 'WEAK', note: 'full index scan' };
  if (tableRowCount && rows > tableRowCount * 0.5) {
    return { mark: 'WEAK', note: `examining ${rows} of ~${tableRowCount} rows` };
  }
  return { mark: 'OK', note: `${type} on ${key}` };
};

const main = async () => {
  await sequelize.authenticate();

  const [versionRow] = await sequelize.query('SELECT VERSION() AS v', {
    type: QueryTypes.SELECT,
  });
  console.log(`MySQL version: ${versionRow.v}`);
  console.log(`(recursive CTEs in dashboardStats.getDescendantIds need 8.0+)\n`);

  const sizes = await tableSizes();
  console.log('Table sizes');
  Object.entries(sizes).forEach(([t, n]) =>
    console.log(`  ${t.padEnd(12)} ${n === null ? 'n/a' : n.toLocaleString()}`)
  );
  console.log('');

  const t0 = Date.now();
  await sequelize.query('SELECT 1', { type: QueryTypes.SELECT });
  const rtt = Date.now() - t0;
  console.log(`Round-trip to database: ~${rtt} ms`);
  console.log(`  At 134 sequential queries that alone is ~${((rtt * 134) / 1000).toFixed(1)} s\n`);

  const ids = await resolveSampleIds();
  const queries = buildQueries(ids);

  let scans = 0;
  for (const q of queries) {
    let plans;
    try {
      plans = await sequelize.query(`EXPLAIN ${q.sql}`, { type: QueryTypes.SELECT });
    } catch (error) {
      console.log(`\n${q.name}\n  ERROR: ${error.message}`);
      continue;
    }

    const plan = plans[0] || {};
    const size = sizes[plan.table] || null;
    const v = verdict(plan, size);
    if (v.mark !== 'OK') scans += 1;

    console.log(`\n${q.name}`);
    console.log(`  expected index : ${q.wants}`);
    console.log(`  chosen key     : ${plan.key || '(none)'}`);
    console.log(`  access type    : ${plan.type || '(none)'}`);
    console.log(`  rows examined  : ${plan.rows !== undefined ? plan.rows : '?'}`);
    if (plan.Extra) console.log(`  extra          : ${plan.Extra}`);
    console.log(`  verdict        : ${v.mark} — ${v.note}`);
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(
    scans === 0
      ? 'All queries are index-backed.'
      : `${scans} of ${queries.length} queries are still scanning. Review the indexes above.`
  );

  await sequelize.close();
};

main().catch((error) => {
  console.error('dashboard_explain_check failed:', error.message);
  process.exit(1);
});
