'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('company_details', 'user_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      after: 'id',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('company_details', 'user_id');
  },
};
