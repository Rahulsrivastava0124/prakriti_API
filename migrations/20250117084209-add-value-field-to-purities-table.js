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
      await queryInterface.addColumn('purities', 'value', {
        type: Sequelize.STRING,
        allowNull: true,
        after: "name"
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

    await queryInterface.removeColumn('purities', 'value');
  }
};
