'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CompanyDetail extends Model {
    static associate(models) {}
  }

  CompanyDetail.init({
    // owner of the row — null is the super admin's, used as the fallback
    user_id: DataTypes.INTEGER,
    logo: DataTypes.TEXT,
    company_name: DataTypes.STRING,
    corporate_office_address: DataTypes.TEXT,
    head_office_name: DataTypes.STRING,
    gst_no: DataTypes.STRING,
    address: DataTypes.TEXT,
    email: DataTypes.STRING,
    phone: DataTypes.STRING,
    createdAt: {
      field: 'created_at',
      type: DataTypes.DATE,
    },
    updatedAt: {
      field: 'updated_at',
      type: DataTypes.DATE,
    },
  }, {
    sequelize,
    paranoid: false,
    modelName: 'company_details',
  });

  return CompanyDetail;
};
