'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Cart extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      this.belongsTo(models.products, {
        foreignKey: "product_id",
        as: "product"
      });

      this.belongsTo(models.sizes, {
        foreignKey: "size_id",
        as: "size"
      });

      this.belongsTo(models.stocks, {
        foreignKey: "stock_id",
        as: "stock"
      });

      this.hasMany(models.cart_materials, {
        foreignKey: {
          name: 'cart_id',
          allowNull: true
        },
        as: 'cartMaterial'
      });
    }
  }
  Cart.init({
    product_id: DataTypes.INTEGER,
    type: DataTypes.STRING,
    size_id: DataTypes.INTEGER,
    user_id: DataTypes.INTEGER,
    cookie_id: DataTypes.STRING,
    stock_id: DataTypes.INTEGER,
    sale_product_id: DataTypes.INTEGER,
    discount: DataTypes.DECIMAL(15, 2),
    total_weight: DataTypes.DECIMAL(15, 3),
      discount_type: DataTypes.STRING,
    current_image:DataTypes.STRING,
    certificate_no: DataTypes.STRING,
    rate: DataTypes.DECIMAL(15, 2),
    quantity: DataTypes.INTEGER,
    promocode_id: DataTypes.INTEGER,
    promocode: DataTypes.STRING,
    promocode_discount: DataTypes.DECIMAL(15, 2),
    is_manual: DataTypes.BOOLEAN,
    order_id: DataTypes.INTEGER,
    order_product_id: DataTypes.INTEGER,
    is_held: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    hold_message: DataTypes.STRING(500),
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
    modelName: 'carts',
  });
  return Cart;
};