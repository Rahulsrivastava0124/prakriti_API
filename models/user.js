'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
        // define association here
        this.belongsTo(models.roles, {
          foreignKey: "role_id",
          as: 'role'
        });
        this.belongsTo(models.designations, {
          foreignKey: "designation_id",
          as: "designation"
        });
        this.belongsTo(models.states, {
          foreignKey: "state_id",
          as: "state"
        });
        this.belongsTo(models.districts, {
          foreignKey: "district_id",
          as: "district"
        });
        this.belongsTo(models.countries, {
          foreignKey: "country_id",
          as: "country"
        });
        this.hasOne(models.bank_details, {
          foreignKey: "user_id",
          as: "bankDetails"
        });
        this.belongsTo(models.users, {
          foreignKey: "parent_id",
          as: "parent"
        });

        this.belongsTo(models.states, {
          foreignKey: "p_state_id",
          as: "pstate"
        });
        this.belongsTo(models.districts, {
          foreignKey: "p_district_id",
          as: "pdistrict"
        });
        this.belongsTo(models.countries, {
          foreignKey: "p_country_id",
          as: "pcountry"
        });
        this.belongsTo(models.users, {
          foreignKey: "created_by",
          as: "createdBy"
        });
      }
  }
  User.init({
    user_name: DataTypes.STRING,
    email: DataTypes.STRING,
    password: DataTypes.STRING,
    name: DataTypes.STRING,
    mobile: DataTypes.STRING,
    address:DataTypes.TEXT,
    pincode:DataTypes.STRING,
    role_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'roles',
        key: 'id'
      },
    },
    parent_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'parent_id'
      },
    },
    designation_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'designations',
        key: 'id'
      },
    },
    state_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'states',
        key: 'id'
      },
    },
    district_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'districts',
        key: 'id'
      },
    },
    country_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'countries',
        key: 'id'
      },
    },
    google_id: DataTypes.STRING,
    facebook_id: DataTypes.STRING,
    twitter_id: DataTypes.STRING,
    apple_id: DataTypes.STRING,
    profile_image: DataTypes.STRING,
    id_proof_image: DataTypes.STRING,
    address_proof_image: DataTypes.STRING,
    city: DataTypes.STRING,
    landmark: DataTypes.STRING,
    p_country_id: DataTypes.INTEGER,
    p_state_id: DataTypes.INTEGER,
    p_district_id: DataTypes.INTEGER,
    p_pincode: DataTypes.STRING,
    p_city: DataTypes.STRING,
    p_address: DataTypes.STRING,
    adhar: DataTypes.STRING,
    pan: DataTypes.STRING,
    company_name: DataTypes.STRING,
    gst: DataTypes.STRING,
    bank_name: DataTypes.STRING,
    bank_account_no: DataTypes.STRING,
    bank_ifsc: DataTypes.STRING,
    branch_name: DataTypes.STRING,
    pan_image: DataTypes.STRING,
    adhar_image: DataTypes.STRING,
    company_logo: DataTypes.STRING,
    blood_group: DataTypes.STRING,
    parents_name: DataTypes.STRING,
    parents_contact_no: DataTypes.STRING,
    advance_amount: DataTypes.DECIMAL(15, 2),
    due_amount: DataTypes.DECIMAL(15, 2),
    avg_rating: DataTypes.DECIMAL(15, 2),
    reset_otp: DataTypes.STRING,
    reset_token: DataTypes.STRING,
    reset_token_expiry: DataTypes.DATE,
    dob: DataTypes.DATEONLY,
    marital_status: DataTypes.STRING,
    own: DataTypes.BOOLEAN,
    partner: DataTypes.BOOLEAN,
    expense: DataTypes.BOOLEAN,
    expense_action: DataTypes.BOOLEAN,
    created_by: DataTypes.INTEGER,
    documents: {
      type: DataTypes.TEXT,
      get() {
        const data = this.getDataValue('documents');
        try { 
          return JSON.parse(data);
        } catch(err) { 
          return data;
        }
      },
      set(value) {
        this.setDataValue('documents', JSON.stringify(value));
      }
    },
    weekly_holidays: {
      type: DataTypes.TEXT,
      get() {
        const data = this.getDataValue('weekly_holidays');
        try { 
          return JSON.parse(data);
        } catch(err) { 
          return data;
        }
      },
      set(value) {
        this.setDataValue('weekly_holidays', JSON.stringify(value));
      }
    },
    status: DataTypes.BOOLEAN,
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
    modelName: 'users',
  });
  return User;
};