#!/usr/bin/env node
/**
 * Answers: "would splitting /dashboard into separate stats + charts APIs be faster?"
 *
 * Times the three groups a split would create, in isolation, for a superadmin:
 *   summary  — counts, due amounts, wallet
 *   charts   — the 12-month series
 *   stock    — stock quantity + valuation tiles + purchase totals
 *
 * Read-only.
 */
require('module-alias/register');
require('dotenv').config();

const db = require('@models');
const common = require('@library/common');
const { Op, QueryTypes } = require('sequelize');
const moment = require('moment');
const sequelize = db.sequelize;
const U = db.users, S = db.sales, P = db.purchases;

let q = 0;
const orig = sequelize.dialect.Query.prototype.run;
sequelize.dialect.Query.prototype.run = function (...a) { q++; return orig.apply(this, a); };

const time = async (label, fn) => {
  q = 0;
  const t = process.hrtime.bigint();
  await fn();
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  console.log(`  ${label.padEnd(34)}${String(q).padStart(4)} q ${ms.toFixed(0).padStart(8)} ms`);
  return ms;
};

(async () => {
  await sequelize.authenticate();
  const uid = await common.getSuperAdminId();
  const superRole = common.getRoleId('superadmin');
  const customerRole = common.getRoleId('customer');
  const year = moment().format('YYYY');
  const yStart = `${year}-01-01 00:00:00`, yEnd = `${year}-12-31 23:59:59`;

  console.log('If GET /dashboard were split into three endpoints (superadmin):\n');

  const ids = await common.avlStockUserIdsNew(null, superRole);

  const tSummary = await time('GET /dashboard/summary', async () => {
    await Promise.all([
      U.count({ where: { role_id: customerRole } }),
      U.count({ where: { role_id: common.getRoleId('supplier'), parent_id: uid } }),
      U.findAll({ attributes: ['id'], where: { role_id: common.getRoleId('admin'), own: true } }),
      U.findAll({ attributes: ['id'], where: { role_id: common.getRoleId('distributor'), own: true } }),
      S.sum('due_amount', { where: { sale_by: uid, is_approved: { [Op.ne]: 2 }, is_assigned: false, is_approval: false } }),
      P.sum('due_amount', { where: { user_id: uid, is_approved: { [Op.ne]: 2 }, is_assigned: false, is_approval: false } }),
      common.getWalletBalance(uid),
    ]);
  });

  const tCharts = await time('GET /dashboard/charts', async () => {
    await Promise.all([
      sequelize.query(`SELECT MONTH(created_at) m, COUNT(*) v FROM users WHERE role_id = :r AND created_at >= :s AND created_at <= :e GROUP BY MONTH(created_at)`,
        { replacements: { r: customerRole, s: yStart, e: yEnd }, type: QueryTypes.SELECT }),
      sequelize.query(`SELECT MONTH(created_at) m, COALESCE(SUM(total_amount),0) v FROM orders WHERE order_from = 'front_website' AND created_at >= :s AND created_at <= :e GROUP BY MONTH(created_at)`,
        { replacements: { s: yStart, e: yEnd }, type: QueryTypes.SELECT }),
      ids.length ? sequelize.query(`SELECT MONTH(invoice_date) m, COALESCE(SUM(total_payable),0) v FROM sales WHERE sale_by IN (:ids) AND is_approved <> 2 AND is_assigned = 0 AND is_approval = 0 AND invoice_date >= :s AND invoice_date <= :e GROUP BY MONTH(invoice_date)`,
        { replacements: { ids, s: yStart, e: yEnd }, type: QueryTypes.SELECT }) : [],
    ]);
  });

  const tStock = await time('GET /dashboard/stock', async () => {
    await Promise.all([
      common.getTotalStockByUser(uid),
      common.getTotalStockPriceByUser(null, uid),
      common.getTotalStockPriceByUser(null, uid, 'material'),
      common.getTotalStockPriceByUser(null, uid, 'return'),
      ...Array(6).fill(0).map(() => common.getTotalStockPriceByUser(null, ids)),
      common.getPurchaseProducts(),
      common.getTransferSale(uid),
    ]);
  });

  console.log('\n  ' + '-'.repeat(52));
  console.log(`  what the user waits for (all 3 in parallel): ${Math.max(tSummary, tCharts, tStock).toFixed(0)} ms`);
  console.log(`  total server work across the 3 endpoints:     ${(tSummary + tCharts + tStock).toFixed(0)} ms`);
  console.log(`\n  stats + charts alone would land in:          ${Math.max(tSummary, tCharts).toFixed(0)} ms`);

  await sequelize.close();
})().catch((e) => { console.error(e); process.exit(1); });
