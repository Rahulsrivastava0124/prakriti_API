require('module-alias/register');
const db = require('@models');
const Q = { type: require('sequelize').QueryTypes.SELECT };
(async () => {
  const rows = await db.sequelize.query(
    "SELECT id,table_type,table_id,user_id,amount,weight,payment_mode,payment_type,is_advance,notes,payment_date,created_at FROM payments WHERE payment_mode='metal' ORDER BY id DESC LIMIT 15", Q);
  rows.forEach(r => console.log(JSON.stringify({
    ...r,
    implied_rate: r.weight ? (parseFloat(r.amount) / parseFloat(r.weight)).toFixed(2) : null,
  })));
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
