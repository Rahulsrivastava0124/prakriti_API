'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class payment extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      this.belongsTo(models.users, {
        foreignKey: "user_id",
        as: 'user'
      });

      this.belongsTo(models.purchases, {
        foreignKey: "table_id",
        constraints: false,
        as: "purchase",
      });

      this.belongsTo(models.sales, {
        foreignKey: "table_id",
        constraints: false,
        as: "sale",
      });

    }
  }
  payment.init({
    parent_id: DataTypes.INTEGER,
    user_id: DataTypes.INTEGER,
    payment_by: DataTypes.INTEGER,
    payment_belongs: DataTypes.INTEGER,
    table_type: DataTypes.STRING,
    ref_no: DataTypes.STRING,
    table_id: DataTypes.INTEGER,
    reasons: DataTypes.TEXT,
    amount: DataTypes.DECIMAL(15, 2),
    remaining_balance: DataTypes.DECIMAL(15, 2),
    payment_date: DataTypes.DATE,
    payment_mode: DataTypes.STRING,
    notes: DataTypes.STRING,
    cheque_no: DataTypes.STRING,
    txn_id: DataTypes.STRING,
    weight: DataTypes.STRING,
    status: DataTypes.STRING,
    type: DataTypes.STRING,
    payment_type: DataTypes.STRING,
    purpose: DataTypes.STRING,
    due_date: DataTypes.DATEONLY,
    can_accept: DataTypes.BOOLEAN,
    is_advance: DataTypes.BOOLEAN,
    createdAt: {
      field: 'created_at',
      type: DataTypes.DATE,
    },
    updatedAt: {
        field: 'updated_at',
        type: DataTypes.DATE,
    },
    deletedAt: {
        field: 'deleted_at',
        type: DataTypes.DATE,
    }
  }, {
    sequelize,
    paranoid: true,
    modelName: 'payments',
  });
  return payment;
};