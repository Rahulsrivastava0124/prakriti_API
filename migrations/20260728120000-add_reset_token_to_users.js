'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'reset_token', {
      type: Sequelize.STRING,
      after: 'reset_otp',
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.addColumn('users', 'reset_token_expiry', {
      type: Sequelize.DATE,
      after: 'reset_token',
      allowNull: true,
      defaultValue: null,
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('users', 'reset_token_expiry');
    await queryInterface.removeColumn('users', 'reset_token');
  }
};
