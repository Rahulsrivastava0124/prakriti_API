'use strict';

/**
 * Metal received as payment lands in stock history, but the row carried only
 * weight/purity - the amount it settled and the invoice it came from were lost.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('stock_raw_material_histories');
    if (!table.amount) {
      await queryInterface.addColumn('stock_raw_material_histories', 'amount', {
        type: Sequelize.DECIMAL(15, 2),
        defaultValue: null,
        allowNull: true,
        after: 'outstanding_gram',
      });
    }
    if (!table.payment_mode) {
      await queryInterface.addColumn('stock_raw_material_histories', 'payment_mode', {
        type: Sequelize.STRING(50),
        defaultValue: null,
        allowNull: true,
        after: 'amount',
      });
    }
    if (!table.ref_no) {
      await queryInterface.addColumn('stock_raw_material_histories', 'ref_no', {
        type: Sequelize.STRING(100),
        defaultValue: null,
        allowNull: true,
        after: 'payment_mode',
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('stock_raw_material_histories');
    if (table.ref_no)       await queryInterface.removeColumn('stock_raw_material_histories', 'ref_no');
    if (table.payment_mode) await queryInterface.removeColumn('stock_raw_material_histories', 'payment_mode');
    if (table.amount)       await queryInterface.removeColumn('stock_raw_material_histories', 'amount');
  },
};
