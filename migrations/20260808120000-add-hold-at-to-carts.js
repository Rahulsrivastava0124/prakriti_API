'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('carts');
    if (!table.hold_at) {
      // stamps one hold action, so items held together stay together
      await queryInterface.addColumn('carts', 'hold_at', {
        type: Sequelize.DATE,
        defaultValue: null,
        allowNull: true,
        after: 'hold_message',
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('carts');
    if (table.hold_at) await queryInterface.removeColumn('carts', 'hold_at');
  },
};
