'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('carts', 'is_held', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false,
      after: 'order_product_id',
    });
    await queryInterface.addColumn('carts', 'hold_message', {
      type: Sequelize.STRING(500),
      defaultValue: null,
      allowNull: true,
      after: 'is_held',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('carts', 'hold_message');
    await queryInterface.removeColumn('carts', 'is_held');
  }
};
