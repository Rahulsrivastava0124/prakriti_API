/**
 * What the sale page's Company Name picker gets for one sales executive:
 * the team's whole book, with is_my_retailer marking the ones that executive
 * brought in. Run it against whichever environment .env points at to see
 * whether the running API is serving the flag.
 *
 *   node check_retailer_ownership.js <sales_executive_user_id>
 */
require('module-alias/register');
global.compactLog = () => {};
const ctrl = require('@controllers/superadmin/retailer.controller');

const uid = Number(process.argv[2]);
if (!uid) {
  console.log('usage: node check_retailer_ownership.js <sales_executive_user_id>');
  process.exit(1);
}

const res = {
  send: (d) => {
    const items = d.data.items;
    const own = items.filter((i) => i.is_my_retailer).length;
    console.log(`${items.length} in the team book, ${own} owned by user ${uid}`);
    console.table(
      items.map((i) => ({ id: i.id, company: i.company_name, is_my_retailer: i.is_my_retailer }))
    );
    process.exit(own > 0 ? 0 : 1);
  },
  status: (c) => { console.log('HTTP', c); return res; },
};

ctrl.index({ userId: uid, role: 4, query: { all: '1' }, params: {}, body: {}, headers: {} }, res);
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000);
