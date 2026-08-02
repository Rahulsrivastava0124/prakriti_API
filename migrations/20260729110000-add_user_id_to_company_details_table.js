'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('company_details');
    if (tableDesc.user_id) return; // column already exists — nothing to do
    await queryInterface.addColumn('company_details', 'user_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      after: 'id',
    });
  },

  async down(queryInterface) {
    const tableDesc = await queryInterface.describeTable('company_details');
    if (!tableDesc.user_id) return;
    await queryInterface.removeColumn('company_details', 'user_id');
  },
};
