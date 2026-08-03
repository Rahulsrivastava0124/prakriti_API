"use strict";

/**
 * Material stock used to be filed under a hardcoded purity id (22) that does
 * not exist in `purities`, so the material_price_purities lookup never matched
 * and every material stock valued at 0. Re-key those rows onto the material's
 * purest priced grade - the same purity the code now resolves at write time.
 */
const BEST_PURITY = `
  SELECT mp.material_id,
         CAST(SUBSTRING_INDEX(
           GROUP_CONCAT(mpp.purity_id ORDER BY CAST(NULLIF(p.value, '') AS DECIMAL(10,2)) DESC),
           ',', 1) AS UNSIGNED) AS purity_id
    FROM material_prices mp
    JOIN material_price_purities mpp ON mpp.material_price_id = mp.id
    JOIN purities p ON p.id = mpp.purity_id
   GROUP BY mp.material_id
`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE stocks s
        JOIN (${BEST_PURITY}) best ON best.material_id = s.material_id
         SET s.purity_id = best.purity_id
       WHERE s.type = 'material'
         AND s.purity_id NOT IN (SELECT id FROM purities)
    `);

    await queryInterface.sequelize.query(`
      UPDATE stock_materials sm
        JOIN stocks s ON s.id = sm.stock_id AND s.type = 'material'
         SET sm.purity_id = s.purity_id
       WHERE sm.purity_id NOT IN (SELECT id FROM purities)
    `);
  },

  async down() {
    // The old value was a dangling foreign key - nothing worth restoring.
  },
};
