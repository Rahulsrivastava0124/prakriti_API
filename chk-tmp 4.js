require('module-alias/register');
const db = require('@models');
const Q = { type: require('sequelize').QueryTypes.SELECT };
(async () => {
  const rows = await db.sequelize.query(
    "SELECT id,parent_id,belongs_to,from_user_id,to_user_id,material_id,weight,pakka_weight,unit_id,purity_id,status,type FROM stock_raw_material_histories ORDER BY id DESC LIMIT 10", Q);
  rows.forEach(r => console.log(JSON.stringify(r)));
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
