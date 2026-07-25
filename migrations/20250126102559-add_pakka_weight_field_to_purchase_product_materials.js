'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     */

    try {
      await queryInterface.addColumn('purchase_product_materials', 'pakka_weight', {
        type: Sequelize.DECIMAL,
        allowNull: true,
        defaultValue: 0.000,
        after: "weight"
      });
    } catch (e) {
      // column already exists, skip
    }
  },

  async down (queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    await queryInterface.removeColumn('purchase_product_materials', 'pakka_weight');
  }
};
