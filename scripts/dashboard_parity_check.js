#!/usr/bin/env node

/**
 * Proves the new SQL aggregates return the same numbers as the existing
 * JavaScript helpers — before you change any call site.
 *
 *   node scripts/dashboard_parity_check.js
 *   node scripts/dashboard_parity_check.js --users=1,2,3
 *
 * Every check runs both implementations against the same inputs and reports
 * whether they agree. It also times each one, so you can see the improvement
 * on real data rather than trusting an estimate.
 *
 * This script only reads. It writes nothing and changes nothing.
 */

require('module-alias/register');
require('dotenv').config();

const db = require('@models');
const { QueryTypes } = require('sequelize');
const common = require('@library/common');
const stats = require('@library/dashboardStats');

const sequelize = db.sequelize;

const args = process.argv.slice(2).reduce((acc, item) => {
  if (!item.startsWith('--')) return acc;
  const [k, ...v] = item.slice(2).split('=');
  acc[k.trim()] = v.length ? v.join('=') : 'true';
  return acc;
}, {});

const CUSTOMER_ROLE = 6;

const time = async (label, fn) => {
  const t0 = process.hrtime.bigint();
  let value;
  let error = null;
  try {
    value = await fn();
  } catch (e) {
    error = e;
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { label, value, ms, error };
};

const same = (a, b) => {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) {
    // Money columns are DECIMAL(15,2); tolerate float representation noise.
    return Math.abs(na - nb) < 0.01;
  }
  return String(a) === String(b);
};

const report = (name, oldRun, newRun) => {
  console.log(`\n${name}`);

  if (oldRun.error) {
    console.log(`  old  ERROR  ${oldRun.error.message}`);
  } else {
    console.log(`  old  ${String(oldRun.value).padEnd(20)} ${oldRun.ms.toFixed(0)} ms`);
  }

  if (newRun.error) {
    console.log(`  new  ERROR  ${newRun.error.message}`);
    return false;
  }
  console.log(`  new  ${String(newRun.value).padEnd(20)} ${newRun.ms.toFixed(0)} ms`);

  if (oldRun.error) return false;

  const ok = same(oldRun.value, newRun.value);
  const speedup = newRun.ms > 0 ? oldRun.ms / newRun.ms : 0;
  console.log(
    ok
      ? `  MATCH${speedup > 1.2 ? `  (${speedup.toFixed(1)}× faster)` : ''}`
      : `  MISMATCH — investigate before switching this call site`
  );
  return ok;
};

const resolveUserIds = async () => {
  if (args.users) {
    return args.users.split(',').map(Number).filter(Number.isFinite);
  }
  const rows = await sequelize.query(
    `SELECT DISTINCT user_id FROM stocks WHERE deleted_at IS NULL LIMIT 20`,
    { type: QueryTypes.SELECT }
  );
  const ids = rows.map((r) => Number(r.user_id)).filter(Number.isFinite);
  if (ids.length) return ids;

  const fallback = await sequelize.query(
    `SELECT id FROM users WHERE deleted_at IS NULL ORDER BY id ASC LIMIT 10`,
    { type: QueryTypes.SELECT }
  );
  return fallback.map((r) => Number(r.id));
};

const resolveSaleByIds = async () => {
  const rows = await sequelize.query(
    `SELECT DISTINCT sale_by FROM sales WHERE deleted_at IS NULL AND sale_by IS NOT NULL LIMIT 20`,
    { type: QueryTypes.SELECT }
  );
  return rows.map((r) => Number(r.sale_by)).filter(Number.isFinite);
};

const main = async () => {
  await sequelize.authenticate();
  console.log('Dashboard parity check — comparing JS helpers against SQL aggregates');
  console.log('Reads only. Nothing is modified.\n');
  console.log('─'.repeat(60));

  const userIds = await resolveUserIds();
  const saleByIds = await resolveSaleByIds();

  console.log(`Sample stock user ids : ${userIds.slice(0, 10).join(', ')}${userIds.length > 10 ? ' …' : ''}`);
  console.log(`Sample sale_by ids    : ${saleByIds.slice(0, 10).join(', ')}${saleByIds.length > 10 ? ' …' : ''}`);

  const results = [];

  /* ── stock quantity, product ───────────────────────────────────────────── */
  results.push(
    report(
      'getTotalStockByUser(ids, "product")  vs  getStockQuantity',
      await time('old', () => common.getTotalStockByUser(userIds, 'product')),
      await time('new', () => stats.getStockQuantity(userIds, 'product'))
    )
  );

  /* ── stock quantity, material ──────────────────────────────────────────── */
  results.push(
    report(
      'getTotalStockByUser(ids, "material")  vs  getStockQuantity',
      await time('old', () => common.getTotalStockByUser(userIds, 'material')),
      await time('new', () => stats.getStockQuantity(userIds, 'material'))
    )
  );

  /* ── single-id form, the shape the controller uses most ────────────────── */
  if (userIds.length) {
    results.push(
      report(
        `getTotalStockByUser(${userIds[0]})  vs  getStockQuantity`,
        await time('old', () => common.getTotalStockByUser(userIds[0], 'product')),
        await time('new', () => stats.getStockQuantity(userIds[0], 'product'))
      )
    );
  }

  /* ── bucketed form: 2 calls collapsed into 1 query ─────────────────────── */
  const bucketRun = await time('new', async () => {
    const buckets = await stats.getStockQuantityBuckets(userIds, ['product', 'material']);
    const sumFor = (type) =>
      userIds.reduce((acc, id) => acc + (buckets.get(`${id}:${type}`) || 0), 0);
    return `${sumFor('product')} / ${sumFor('material')}`;
  });
  const pairRun = await time('old', async () => {
    const p = await common.getTotalStockByUser(userIds, 'product');
    const m = await common.getTotalStockByUser(userIds, 'material');
    return `${p} / ${m}`;
  });
  results.push(report('2 separate calls  vs  getStockQuantityBuckets (1 query)', pairRun, bucketRun));

  /* ── sale due amount ───────────────────────────────────────────────────── */
  if (saleByIds.length) {
    const SaleModel = db.sales;
    const { Op } = require('sequelize');
    results.push(
      report(
        'saleModel.sum("due_amount")  vs  getSaleDueAmount',
        await time('old', async () => {
          const v = await SaleModel.sum('due_amount', {
            where: {
              sale_by: { [Op.in]: saleByIds },
              is_approved: { [Op.ne]: 2 },
              is_assigned: false,
              is_approval: false,
            },
          });
          return v || 0;
        }),
        await time('new', () => stats.getSaleDueAmount(saleByIds))
      )
    );
  }

  /* ── month series: 36 queries vs 3 ─────────────────────────────────────── */
  const monthNew = await time('new', () =>
    stats.getMonthlySeries({ customerRoleId: CUSTOMER_ROLE, saleByIds })
  );
  const monthOld = await time('old', async () => {
    const UserModel = db.users;
    const OrderModel = db.orders;
    const SaleModel = db.sales;
    const { Op } = require('sequelize');
    const moment = require('moment');
    const { getMonthDateRange } = require('@helpers/helper');

    const customer = [];
    const order = [];
    const sales = [];

    for (let month = 1; month < 13; month += 1) {
      const r = getMonthDateRange(moment().format('YYYY'), month);
      const start = r.start.format('YYYY-MM-DD 00:00:00');
      const end = r.end.format('YYYY-MM-DD 23:59:59');

      customer.push(
        await UserModel.count({
          where: { role_id: CUSTOMER_ROLE, createdAt: { [Op.gte]: start, [Op.lte]: end } },
        })
      );
      order.push(
        (await OrderModel.sum('total_amount', {
          where: { order_from: 'front_website', createdAt: { [Op.gte]: start, [Op.lte]: end } },
        })) || 0
      );
      sales.push(
        saleByIds.length
          ? (await SaleModel.sum('total_payable', {
              where: {
                sale_by: { [Op.in]: saleByIds },
                is_approved: { [Op.ne]: 2 },
                is_assigned: false,
                is_approval: false,
                invoice_date: { [Op.gte]: start, [Op.lte]: end },
              },
            })) || 0
          : 0
      );
    }
    return { customer, order, sales };
  });

  console.log('\nMonth chart — 36 sequential queries vs 3 parallel');
  if (monthOld.error || monthNew.error) {
    console.log(`  ERROR: ${(monthOld.error || monthNew.error).message}`);
    results.push(false);
  } else {
    const keys = ['customer', 'order', 'sales'];
    let allMatch = true;
    keys.forEach((k) => {
      const a = monthOld.value[k];
      const b = monthNew.value[k];
      const match = a.every((v, i) => same(v, b[i]));
      if (!match) allMatch = false;
      console.log(`  ${k.padEnd(9)} ${match ? 'MATCH' : 'MISMATCH'}`);
      if (!match) {
        console.log(`    old ${JSON.stringify(a)}`);
        console.log(`    new ${JSON.stringify(b)}`);
      }
    });
    const speedup = monthNew.ms > 0 ? monthOld.ms / monthNew.ms : 0;
    console.log(`  old  ${monthOld.ms.toFixed(0)} ms   new  ${monthNew.ms.toFixed(0)} ms   (${speedup.toFixed(1)}× faster)`);
    results.push(allMatch);
  }

  /* ── super admin id ────────────────────────────────────────────────────── */
  results.push(
    report(
      'getSuperAdminId  vs  getSuperAdminIdCached',
      await time('old', () => common.getSuperAdminId()),
      await time('new', () => stats.getSuperAdminIdCached(1))
    )
  );

  console.log(`\n${'─'.repeat(60)}`);
  const failures = results.filter((r) => r === false).length;
  console.log(
    failures === 0
      ? 'All checks match. Safe to switch the call sites listed in DASHBOARD-PERFORMANCE-CHANGES.md.'
      : `${failures} check(s) did not match. Do NOT switch those call sites yet.`
  );
  console.log(
    '\nA mismatch is usually one of: NULL handling on is_approved, the quantity = 0\n' +
    'quirk documented in dashboardStats.js, or a timezone difference in the month\n' +
    'boundaries. All three are explained in DASHBOARD-PERFORMANCE-CHANGES.md.'
  );

  await sequelize.close();
};

main().catch((error) => {
  console.error('\ndashboard_parity_check failed:', error.message);
  console.error(error.stack);
  process.exit(1);
});
