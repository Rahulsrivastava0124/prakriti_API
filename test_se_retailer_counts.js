/**
 * The executive list and the executive's own dashboard card must show the same
 * two retailer figures. They used to compute Total Retailer from two separate
 * copies of the admin-chain rule; this pins them to one.
 *
 *   node test_se_retailer_counts.js
 */
require('module-alias/register');
global.compactLog = () => {};
const assert = require('assert');
const db = require('@models');
const { Op } = require('sequelize');
const {
  getRoleId,
  getMyRetailerCount,
  getSalesExecutiveTotalRetailerCount,
} = require('@library/common');
const { EmployeeListCollection } = require('@resources/superadmin/EmployeeListCollection');

(async () => {
  const executives = await db.users.findAll({
    where: { role_id: getRoleId('sales_executive') },
    limit: 5,
  });
  assert.ok(executives.length, 'no sales executives to check against');

  const rows = await EmployeeListCollection(executives, true);

  for (const row of rows) {
    assert.strictEqual(
      row.total_retailer,
      await getSalesExecutiveTotalRetailerCount(row.id),
      `total_retailer disagrees with the dashboard rule for executive ${row.id}`
    );
    assert.strictEqual(
      row.own_retailer,
      await getMyRetailerCount(row.id),
      `own_retailer disagrees with the My Retailer rule for executive ${row.id}`
    );
  }

  /* the whole point of caching per parent: one team, one Total */
  const byParent = {};
  for (const row of rows) {
    if (!row.parent_id) continue;
    if (byParent[row.parent_id] === undefined) byParent[row.parent_id] = row.total_retailer;
    assert.strictEqual(
      row.total_retailer,
      byParent[row.parent_id],
      `two executives under parent ${row.parent_id} disagree on Total Retailer`
    );
  }

  console.log(`ok - ${rows.length} executives, list and card agree`);
  process.exit(0);
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
