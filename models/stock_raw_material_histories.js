'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class StockHistories extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      this.belongsTo(models.users, {
        foreignKey: "from_user_id",
        as: "fromUser"
      });

      this.belongsTo(models.users, {
        foreignKey: "to_user_id",
        as: "toUser"
      });

      this.belongsTo(models.materials, {
        foreignKey: "material_id",
        as: "material"
      });

      this.belongsTo(models.units, {
        foreignKey: "unit_id",
        as: "unit"
      });

      this.belongsTo(models.purities, {
        foreignKey: "purity_id",
        as: "purity"
      });

      this.hasMany(models.stock_raw_material_histories, {
        as: 'materials',
        foreignKey: 'batch_id',
        sourceKey: 'batch_id',
        useJunctionTable: false
      });
    }
  }
  StockHistories.init({
    order_id: DataTypes.INTEGER,
    order_product_id: DataTypes.INTEGER,
    parent_id: DataTypes.INTEGER,
    belongs_to: DataTypes.INTEGER,
    from_user_id: DataTypes.INTEGER,
    to_user_id: DataTypes.INTEGER,
    material_id: DataTypes.INTEGER,
    batch_id: DataTypes.INTEGER,
    purchase_id: DataTypes.INTEGER,
    weight: DataTypes.DECIMAL(15, 3),
    pakka_weight: DataTypes.DECIMAL(15, 3),
    outstanding_weight: DataTypes.DECIMAL(15, 3),
    outstanding_qty: DataTypes.INTEGER,
    outstanding_gram: DataTypes.DECIMAL(15, 3),
    unit_id: DataTypes.INTEGER,
    quantity: DataTypes.INTEGER,
    purity_id: DataTypes.INTEGER,
    status: DataTypes.STRING,
    date: DataTypes.DATE,
    type: DataTypes.STRING,
    can_accept: DataTypes.BOOLEAN,
    reason: DataTypes.TEXT,
    reason: DataTypes.TEXT,
    reason: DataTypes.TEXT,
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
    modelName: 'stock_raw_material_histories',
  });
  return StockHistories;
};