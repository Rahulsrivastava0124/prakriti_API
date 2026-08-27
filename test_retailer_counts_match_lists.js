/**
 * The Total Retailer and My Retailer cards must count exactly what the retailer
 * list shows the same user. They drifted before: the superadmin's Total counted
 * a stock-holder list, and My Retailer was only ever computed for distributors
 * and sales executives, so an admin's card read zero while its My Retailer page
 * listed a whole state.
 *
 *   node test_retailer_counts_match_lists.js
 */
require('module-alias/register');
global.compactLog = () => {};
const assert = require('assert');
const db = require('@models');
const { Op } = require('sequelize');
const { getRoleId } = require('@library/common');
const dashCtrl = require('@controllers/superadmin/dashboard.controller');
const retailerCtrl = require('@controllers/superadmin/retailer.controller');

const run = (ctrl, query, userId, role) =>
  new Promise((resolve, reject) => {
    const res = {
      send: (d) => (d.success === false ? reject(new Error(d.message)) : resolve(d.data)),
      status: () => res,
    };
    ctrl.index({ userId, role, query, params: {}, body: {}, headers: {} }, res);
  });

(async () => {
  /* one live user per role that owns the retailer figures */
  const roles = ['superadmin', 'admin', 'distributor', 'sales_executive'];
  const users = [];
  for (const name of roles) {
    const u = await db.users.findOne({ where: { role_id: getRoleId(name) } });
    if (u) users.push(u);
  }
  assert.ok(users.length, 'no users to check against');

  for (const u of users) {
    const card = await run(dashCtrl, {}, u.id, u.role_id);
    const total = await run(retailerCtrl, { all: '1' }, u.id, u.role_id);
    const own = await run(retailerCtrl, { all: '1', my_retailer: '1' }, u.id, u.role_id);

    assert.strictEqual(
      card.total_retailer,
      (total.items || []).length,
      `role ${u.role_id} user ${u.id}: Total Retailer card disagrees with the retailer list`
    );
    assert.strictEqual(
      card.my_retailer,
      (own.items || []).length,
      `role ${u.role_id} user ${u.id}: My Retailer card disagrees with the My Retailer list`
    );
    /* whatever is mine is also in the total */
    assert.ok(
      card.my_retailer <= card.total_retailer,
      `role ${u.role_id} user ${u.id}: My Retailer exceeds Total Retailer`
    );
  }

  console.log(`ok - ${users.length} roles, cards match their lists`);
  process.exit(0);
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
