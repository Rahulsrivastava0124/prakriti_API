#!/usr/bin/env node
/**
 * Times each dashboard helper and counts / times the SQL it issues.
 * Read-only. Run against a non-production database:
 *
 *   NODE_ENV=test node scripts/dashboard_helper_profile.js
 *   NODE_ENV=test node scripts/dashboard_helper_profile.js --sql   # per-statement timings
 */
require('module-alias/register');
require('dotenv').config();

const db = require('@models');
const common = require('@library/common');
const sequelize = db.sequelize;

const SHOW_SQL = process.argv.includes('--sql');

let count = 0;
let sqlMs = 0;
const orig = sequelize.dialect.Query.prototype.run;
sequelize.dialect.Query.prototype.run = function (sql, ...rest) {
  count++;
  const t = process.hrtime.bigint();
  return orig.call(this, sql, ...rest).then((r) => {
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    sqlMs += ms;
    if (SHOW_SQL) console.log(`      [${ms.toFixed(0).padStart(6)} ms] ${String(sql).slice(0, 150)}`);
    return r;
  });
};

const time = async (label, fn) => {
  count = 0;
  sqlMs = 0;
  const t = process.hrtime.bigint();
  let err;
  let out;
  try { out = await fn(); } catch (e) { err = e.message; }
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  console.log(
    label.padEnd(42) +
      String(count).padStart(4) + ' q' +
      sqlMs.toFixed(0).padStart(9) + ' ms sql' +
      (ms - sqlMs).toFixed(0).padStart(9) + ' ms js' +
      ms.toFixed(0).padStart(9) + ' ms total' +
      (err ? '  ERR ' + err : '')
  );
  return out;
};

(async () => {
  await sequelize.authenticate();
  const superRole = common.getRoleId('superadmin');
  const uid = await common.getSuperAdminId();
  console.log(`superadmin id = ${uid}\n`);
  console.log('helper'.padEnd(42) + 'queries'.padStart(6) + 'in db'.padStart(12) + 'in node'.padStart(12) + 'wall'.padStart(15));
  console.log('-'.repeat(95));

  const ids = await time('avlStockUserIdsNew(superadmin)', () => common.avlStockUserIdsNew(null, superRole));
  console.log(`   -> ${(ids || []).length} user ids in tree\n`);

  await time('getTotalStockByUser(uid)        [SQL]', () => common.getTotalStockByUser(uid));
  await time('getTotalStockPriceByUser(uid)   [ORM]', () => common.getTotalStockPriceByUser(null, uid));
  await time('getTotalStockPriceByUser(material)', () => common.getTotalStockPriceByUser(null, uid, 'material'));
  await time('getTotalStockPriceByUser(return)', () => common.getTotalStockPriceByUser(null, uid, 'return'));
  await time('getTotalStockPriceByUser(WHOLE TREE)', () => common.getTotalStockPriceByUser(null, ids));
  await time('getPurchaseProducts()', () => common.getPurchaseProducts());
  await time('getTransferSale(uid)', () => common.getTransferSale(uid));
  await time('getWalletBalance(uid)', () => common.getWalletBalance(uid));
  await time('getLiveGoldRate() [warm]', () => common.getLiveGoldRate());

  console.log('\n--- superadmin batch-1..4 stock-price fan-out (10 parallel calls) ---');
  await time('10x getTotalStockPriceByUser', () =>
    Promise.all([
      common.getTotalStockPriceByUser(null, uid),
      common.getTotalStockPriceByUser(null, uid, 'material'),
      common.getTotalStockPriceByUser(null, uid, 'return'),
      ...Array(7).fill(0).map(() => common.getTotalStockPriceByUser(null, ids)),
    ])
  );

  await sequelize.close();
})().catch((e) => { console.error(e); process.exit(1); });
