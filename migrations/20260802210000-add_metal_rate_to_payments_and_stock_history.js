'use strict';

/**
 * The gold rate was never stored - it was derived as amount / weight, where
 * `weight` is the FINE (24K) weight. That yields the 24K rate (14421.69),
 * not the purity rate the operator was actually quoted (24 Carat = 99.5% =
 * 14349.89). Store the quoted rate and the gross weight it applies to, so
 * amount = metal_rate x gross_weight holds exactly and nothing is inferred.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const payments = await queryInterface.describeTable('payments');
    if (!payments.metal_rate) {
      await queryInterface.addColumn('payments', 'metal_rate', {
        type: Sequelize.DECIMAL(15, 2),
        defaultValue: null,
        allowNull: true,
        after: 'weight',
      });
    }
    if (!payments.gross_weight) {
      await queryInterface.addColumn('payments', 'gross_weight', {
        type: Sequelize.DECIMAL(15, 4),
        defaultValue: null,
        allowNull: true,
        after: 'metal_rate',
      });
    }

    const history = await queryInterface.describeTable('stock_raw_material_histories');
    if (!history.metal_rate) {
      await queryInterface.addColumn('stock_raw_material_histories', 'metal_rate', {
        type: Sequelize.DECIMAL(15, 2),
        defaultValue: null,
        allowNull: true,
        after: 'amount',
      });
    }
  },

  async down(queryInterface) {
    const history = await queryInterface.describeTable('stock_raw_material_histories');
    if (history.metal_rate) await queryInterface.removeColumn('stock_raw_material_histories', 'metal_rate');
    const payments = await queryInterface.describeTable('payments');
    if (payments.gross_weight) await queryInterface.removeColumn('payments', 'gross_weight');
    if (payments.metal_rate)   await queryInterface.removeColumn('payments', 'metal_rate');
  },
};
