'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('carts');
    if (!table.is_held) {
      await queryInterface.addColumn('carts', 'is_held', {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false,
        after: 'order_product_id',
      });
    }
    if (!table.hold_message) {
      await queryInterface.addColumn('carts', 'hold_message', {
        type: Sequelize.STRING(500),
        defaultValue: null,
        allowNull: true,
        after: 'is_held',
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('carts');
    if (table.hold_message) await queryInterface.removeColumn('carts', 'hold_message');
    if (table.is_held)      await queryInterface.removeColumn('carts', 'is_held');
  },
};
