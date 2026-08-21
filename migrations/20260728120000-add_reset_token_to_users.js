'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('users');
    if (!table.reset_token) {
      await queryInterface.addColumn('users', 'reset_token', {
        type: Sequelize.STRING,
        after: 'reset_otp',
        allowNull: true,
        defaultValue: null,
      });
    }
    if (!table.reset_token_expiry) {
      await queryInterface.addColumn('users', 'reset_token_expiry', {
        type: Sequelize.DATE,
        after: 'reset_token',
        allowNull: true,
        defaultValue: null,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('users');
    if (table.reset_token_expiry) await queryInterface.removeColumn('users', 'reset_token_expiry');
    if (table.reset_token)        await queryInterface.removeColumn('users', 'reset_token');
  },
};
