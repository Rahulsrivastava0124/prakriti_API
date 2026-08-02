// Throwaway check: proves unit_id:"" is what breaks the transfer insert,
// and that the material-unit fallback fixes it. Everything is rolled back.
require('module-alias/register');
const db = require('@models');
const { isEmpty } = require('@helpers/helper');
const H = db.stock_raw_material_histories;
const M = db.materials;

const body = {
  from_user_id: 71, to_user_id: 1, material_id: "1", quantity: 0,
  payment_mode: "metal", amount: 100000, purity_id: 3,
  unit_id: "", weight: 6.9687, effective_weight: 6.9339,
};

const row = (d) => ({
  belongs_to: d.from_user_id, from_user_id: d.from_user_id, to_user_id: d.to_user_id,
  material_id: d.material_id, weight: d.weight, pakka_weight: d.effective_weight,
  unit_id: d.unit_id, quantity: d.quantity, purity_id: d.purity_id,
  status: "accepted", type: "debit", can_accept: false,
});

(async () => {
  // before the fix
  let t = await db.sequelize.transaction();
  try {
    await H.create(row(body), { transaction: t });
    console.log('BEFORE fix: inserted (unexpected)');
  } catch (e) {
    console.log('BEFORE fix: FAILED ->', e.message);
  }
  await t.rollback();

  // after the fix: same normalisation the controller now does
  const d = { ...body };
  d.purity_id = isEmpty(d.purity_id) ? null : parseInt(d.purity_id);
  if (isEmpty(d.unit_id)) {
    const material = await M.findByPk(d.material_id);
    d.unit_id = material ? material.unit_id : null;
  }
  console.log('resolved unit_id:', d.unit_id);
  t = await db.sequelize.transaction();
  try {
    const r = await H.create(row(d), { transaction: t });
    console.log('AFTER fix: inserted id', r.id, 'unit_id', r.unit_id);
  } catch (e) {
    console.log('AFTER fix: FAILED ->', e.message);
  }
  await t.rollback();
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
