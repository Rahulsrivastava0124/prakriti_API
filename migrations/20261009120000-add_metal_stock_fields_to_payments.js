'use strict';

/**
 * A metal payment that waits for approval has to carry everything needed to
 * move the metal when it is accepted. The weights and rate were already stored
 * (weight = fine, gross_weight, metal_rate); the material, purity and unit were
 * not, so the accept step could not recreate the stock transfer. Nullable: only
 * metal payments set them.
 */
const COLUMNS = [
  ['material_id', 'gross_weight'],
  ['purity_id', 'material_id'],
  ['unit_id', 'purity_id'],
];

module.exports = {
  async up(queryInterface, Sequelize) {
    for (const [column, after] of COLUMNS) {
      const payments = await queryInterface.describeTable('payments');
      if (payments[column]) continue;
      await queryInterface.addColumn('payments', column, {
        type: Sequelize.INTEGER,
        defaultValue: null,
        allowNull: true,
        after,
      });
    }
  },

  async down(queryInterface) {
    const payments = await queryInterface.describeTable('payments');
    for (const [column] of [...COLUMNS].reverse()) {
      if (payments[column]) await queryInterface.removeColumn('payments', column);
    }
  },
};
