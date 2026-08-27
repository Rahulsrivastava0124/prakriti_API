const {
  errorCodes,
  formatErrorResponse,
  formatResponse,
} = require("@utils/response.config");
const { getPaginationOptions } = require("@helpers/paginator");
const {
  base64FileUpload,
  removeFile,
  filterFilesFromRemove,
} = require("@helpers/upload");
const {
  isEmpty,
  isArray,
  priceFormat,
  arrayColumn,
} = require("@helpers/helper");
const db = require("@models");
const { Op } = require("sequelize");
const {
  getRoleId,
  getNextUserName,
  getWorkingUserID,
  getUserColumnValue,
  isSuperAdmin,
  isAdmin,
  isDistributor,
  isSalesExecutive,
  avlStockUserIdsNew,
} = require("@library/common");
const {
  DistributorCollection,
} = require("@resources/superadmin/DistributorCollection");
const userModel = db.users;
const stateModel = db.states;
const districtModel = db.districts;
const countryModel = db.countries;
const SaleModel = db.sales;
const PurchaseModel = db.purchases;
const StockModel = db.stocks;
var bcrypt = require("bcryptjs");

/**
 * Retrieve all distributor
 * @param req
 * @param res
 */
exports.index = async (req, res) => {
  let { page, limit, all, own } = req.query;
  let roleId = getRoleId("distributor");
  let superAdminRoleId = getRoleId("superadmin");
  let adminRoleId = getRoleId("admin");
  let distributorRoleId = getRoleId("distributor");
  let retailerRoleId = getRoleId("retailer");
  let supplierRoleId = getRoleId("supplier");
  let customerRoleId = getRoleId("customer");
  let sales_executiveRoleId = getRoleId("sales_executive");

  let conditions = await getCommonCondition(req);
  if (own == "1") {
    // user leg own distributors
    conditions.own = true;
  } else if (own == "0") {
    // user leg other distributors
    conditions.own = false;
  }

  /* get all leg users */
  let avl_User_ids = [];
  if (isSuperAdmin(req)) {
    avl_User_ids = await avlStockUserIdsNew(null, superAdminRoleId);
    conditions.parent_id = { [Op.in]: avl_User_ids };
  } else if (isAdmin(req)) {
    avl_User_ids = await avlStockUserIdsNew(req, adminRoleId);
    conditions.parent_id = { [Op.in]: avl_User_ids };
  }

  /*if (!isSuperAdmin(req) && !isSalesExecutive(req)){
    let userID = await getWorkingUserID(req);
    conditions.parent_id = userID;
  }*/

  if (all == 1) {
    userModel
      .findAll({
        where: { role_id: roleId, ...conditions },
        order: [["company_name", "ASC"]],
        include: [
          {
            model: districtModel,
            as: "district",
          },
          {
            model: stateModel,
            as: "state",
          },
          {
            model: countryModel,
            as: "country",
          },
          {
            model: userModel,
            required: false,
            as: "parent",
          },
          {
            model: userModel,
            required: false,
            as: "createdBy",
          },
        ],
      })
      .then(async (data) => {
        let result = {
          items: await DistributorCollection(data),
          total: data.length,
        };
        res.send(formatResponse(result, "All distributor"));
      })
      .catch((err) => {
        res
          .status(errorCodes.default)
          .send(formatErrorResponse(errorCodes.defaultErrorMsg));
      });
  } else {
    const paginatorOptions = getPaginationOptions(page, limit);
    userModel
      .findAndCountAll({
        where: { role_id: roleId, ...conditions },
        order: [["id", "DESC"]],
        offset: paginatorOptions.offset,
        limit: paginatorOptions.limit,
        include: [
          {
            model: districtModel,
            as: "district",
          },
          {
            model: stateModel,
            as: "state",
          },
          {
            model: countryModel,
            as: "country",
          },
          {
            model: userModel,
            required: false,
            as: "parent",
          },
          {
            model: userModel,
            required: false,
            as: "createdBy",
          },
        ],
      })
      .then(async (data) => {
        let distrIds = arrayColumn(data.rows, "id");
        let conditions = {
          is_approved: { [Op.ne]: 2 },
          is_assigned: false,
          is_approval: false,
        };
        //if(!isSuperAdmin(req)){
        conditions.user_id = { [Op.in]: distrIds }; //req.userId;
        //}
        let total_sale = await SaleModel.sum("bill_amount", {
          where: conditions,
        });
        let total_sale_due = await SaleModel.sum("due_amount", {
          where: conditions,
        });
        let total_sale_paid = await SaleModel.sum("paid_amount", {
          where: conditions,
        });
        let total_sale_return = await SaleModel.sum("return_amount", {
          where: conditions,
        });

        let result = {
          rows: data.rows,
          items: await DistributorCollection(data.rows),
          total: data.count,
          total_sale: priceFormat(total_sale),
          total_sale_due: priceFormat(total_sale_due),
          total_sale_paid: priceFormat(total_sale_paid),
          total_sale_return: priceFormat(total_sale_return),
        };

        res.send(formatResponse(result, "All distributor"));
      })
      .catch((err) => {
        res
          .status(errorCodes.default)
          .send(formatErrorResponse(errorCodes.defaultErrorMsg));
      });
  }
};

/**
 * Create distributor
 *
 * @param {*} req
 * @param {*} res
 */
exports.store = async (req, res) => {
  let data = req.body;
  let roleId = getRoleId("distributor");

  /**
   * check if mobile is exist or not
   */
  const existing_mobile = await userModel.findOne({
    where: { mobile: data.mobile /*, role_id: roleId*/ },
  });
  if (existing_mobile) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("This mobile is already exists."));
  }

  /**
   * check unique distributor based on district
   */
  const existOwnDistributer = await userModel.findOne({
    where: {
      country_id: data.country_id,
      state_id: data.state_id,
      district_id: data.district_id,
      role_id: roleId,
      own: 1,
    },
  });
  if (existOwnDistributer && data.own == 1) {
    return res
      .status(errorCodes.default)
      .send(
        formatErrorResponse("Distributor is already exist on this district.")
      );
  }

  //upload profile image
  let profile_image = null;
  let result = await base64FileUpload(data.profile_image, "users");
  if (result) {
    profile_image = result.path;
  }

  //upload pan image
  let pan_image = null;
  result = await base64FileUpload(data.pan_image, "users");
  if (result) {
    pan_image = result.path;
  }

  //upload adhar image
  let adhar_image = null;
  result = await base64FileUpload(data.adhar_image, "users");
  if (result) {
    adhar_image = result.path;
  }

  //upload company logo
  let company_logo = null;
  result = await base64FileUpload(data.company_logo, "users");
  if (result) {
    company_logo = result.path;
  }

  let user_name = await getNextUserName("distributor");

  //upload documents
  let documents = [];
  for (let i = 0; i < data.documents.length; i++) {
    let result = await base64FileUpload(data.documents[i], "users");
    if (result) {
      documents.push(result);
    }
  }

  const postData = {
    role_id: roleId,
    parent_id: req.userId,
    user_name: user_name,
    name: data.name,
    email: data.email,
    mobile: data.mobile,
    adhar: data.adhar || null,
    pan: data.pan || null,
    password: bcrypt.hashSync(data.password, 8),
    address: data.address || null,
    city: data.city || null,
    landmark: data.landmark || null,
    pincode: data.pincode || null,
    district_id: data.district_id || null,
    state_id: data.state_id || null,
    country_id: data.country_id || null,
    p_address: data.p_address || null,
    p_city: data.p_city || null,
    p_pincode: data.p_pincode || null,
    p_district_id: data.p_district_id || null,
    p_state_id: data.p_state_id || null,
    p_country_id: data.p_country_id || null,
    company_name: data.company_name || null,
    gst: data.gst || null,
    bank_name: data.bank_name || null,
    bank_account_no: data.bank_account_no || null,
    bank_ifsc: data.bank_ifsc || null,
    profile_image: profile_image,
    pan_image: pan_image,
    adhar_image: adhar_image,
    company_logo: company_logo,
    status: data.status ? true : false,
    own: data.own ? true : false,
    expense: data.expense ? true : false,
    expense_action: data.expense_action ? true : false,
    created_by: req.userId,
    documents: documents,
  };

  userModel
    .create(postData)
    .then((result) => {
      res.send(formatResponse("", "Distributor created successfully!"));
    })
    .catch((error) => {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse(errorCodes.defaultErrorMsg));
    });
};

/**
 * Update distributor
 *
 * @param {*} req
 * @param {*} res
 */
exports.update = async (req, res) => {
  let data = req.body;
  let roleId = getRoleId("distributor");
  let conditions = await getCommonCondition(req);
  let admin = await userModel.findOne({
    where: { id: req.params.id, role_id: roleId, ...conditions },
  });
  if (!admin) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Distributor not found"));
  }

  /**
   * check if mobile is exist or not
   */
  const existing_mobile = await userModel.findOne({
    where: {
      mobile: data.mobile,
      role_id: roleId,
      id: { [Op.ne]: req.params.id },
    },
  });
  if (existing_mobile) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("This mobile is already exists."));
  }

  /**
   * check unique admin based on state
   */
  const existUser = await userModel.findOne({
    where: {
      role_id: roleId,
      country_id: data.country_id,
      state_id: data.state_id,
      district_id: data.district_id,
      own: 1,
      id: { [Op.ne]: req.params.id },
    },
  });
  if (existUser && data.own == 1) {
    return res
      .status(errorCodes.default)
      .send(
        formatErrorResponse("Distributor is already exist on this district.")
      );
  }

  //upload profile image
  let profile_image = admin.profile_image;
  if (!isEmpty(data.profile_image) || data.remove_profile_image) {
    //remove old
    removeFile(admin.profile_image);
    if (data.remove_profile_image) {
      profile_image = null;
    }

    //upload new
    if (!isEmpty(data.profile_image)) {
      let result = await base64FileUpload(data.profile_image, "users");
      if (result) {
        profile_image = result.path;
      }
    }
  }

  //upload pan image
  let pan_image = admin.pan_image;
  if (!isEmpty(data.pan_image) || data.remove_pan_image) {
    //remove old
    removeFile(admin.pan_image);
    if (data.remove_pan_image) {
      pan_image = null;
    }

    //upload new
    if (!isEmpty(data.pan_image)) {
      let result = await base64FileUpload(data.pan_image, "users");
      if (result) {
        pan_image = result.path;
      }
    }
  }

  //upload adhar image
  let adhar_image = admin.adhar_image;
  if (!isEmpty(data.adhar_image) || data.remove_adhar_image) {
    //remove old
    removeFile(admin.adhar_image);
    if (data.remove_adhar_image) {
      adhar_image = null;
    }

    //upload new
    if (!isEmpty(data.adhar_image)) {
      let result = await base64FileUpload(data.adhar_image, "users");
      if (result) {
        adhar_image = result.path;
      }
    }
  }

  //upload company logo
  let company_logo = admin.company_logo;
  if (!isEmpty(data.company_logo) || data.remove_company_logo) {
    //remove old
    removeFile(admin.company_logo);
    if (data.remove_company_logo) {
      company_logo = null;
    }

    //upload new
    if (!isEmpty(data.company_logo)) {
      let result = await base64FileUpload(data.company_logo, "users");
      if (result) {
        company_logo = result.path;
      }
    }
  }

  let documents = [];
  let removeFiles = isArray(data.remove_documents) ? data.remove_documents : [];
  let oldFiles = filterFilesFromRemove(admin.documents, removeFiles);
  if (!isEmpty(data.documents)) {
    try {
      for (let i = 0; i < data.documents.length; i++) {
        let result = await base64FileUpload(data.documents[i], "users");
        if (result) {
          documents.push(result);
        }
      }
    } catch (error) {}
  }

  documents = [...documents, ...oldFiles];
  

  let user_name = admin.user_name;
  if (isEmpty(user_name)) {
    user_name = await getNextUserName("distributor", admin.id);
  }

  let postData = {
    user_name: user_name,
    name: data.name,
    email: data.email,
    mobile: data.mobile,
    adhar: data.adhar || null,
    pan: data.pan || null,
    address: data.address || null,
    city: data.city || null,
    landmark: data.landmark || null,
    pincode: data.pincode || null,
    district_id: data.district_id || null,
    state_id: data.state_id || null,
    country_id: data.country_id || null,
    p_address: data.p_address || null,
    p_city: data.p_city || null,
    p_pincode: data.p_pincode || null,
    p_district_id: data.p_district_id || null,
    p_state_id: data.p_state_id || null,
    p_country_id: data.p_country_id || null,
    company_name: data.company_name || null,
    gst: data.gst || null,
    bank_name: data.bank_name || null,
    bank_account_no: data.bank_account_no || null,
    bank_ifsc: data.bank_ifsc || null,
    profile_image: profile_image,
    pan_image: pan_image,
    adhar_image: adhar_image,
    company_logo: company_logo,
    status: data.status ? true : false,
    own: data.own ? true : false,
    expense: data.expense ? true : false,
    expense_action: data.expense_action ? true : false,
    documents: documents,
  };
  if (!isEmpty(data.password)) {
    postData.password = bcrypt.hashSync(data.password, 8);
  }

  userModel
    .update(postData, { where: { id: req.params.id } })
    .then((result) => {
      res.send(formatResponse("", "Distributor updated successfully!"));
      let prevExpense = admin.expense ? true : false;
      let newExpense = data.expense ? true : false;
      if (prevExpense != newExpense) {
        req.pusher.trigger("Prakriti_channel", "permission_updated", {});
      }
    })
    .catch((error) => {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse(errorCodes.defaultErrorMsg));
    });
};

/**
 * View distributor
 *
 * @param {*} req
 * @param {*} res
 */
exports.fetch = async (req, res) => {
  let roleId = getRoleId("distributor");
  let conditions = await getCommonCondition(req);
  let user = await userModel.findOne({
    where: { id: req.params.id, role_id: roleId, ...conditions },
    include: [
      {
        model: districtModel,
        as: "district",
      },
      {
        model: stateModel,
        as: "state",
      },
      {
        model: countryModel,
        as: "country",
      },
      {
        model: userModel,
        required: false,
        as: "parent",
      },
      {
        model: userModel,
        required: false,
        as: "createdBy",
      },
    ],
  });
  if (!user) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Distributor not found"));
  }
  res.send(
    formatResponse(
      await DistributorCollection(user),
      "Distributor fetched successfully!"
    )
  );
};

/**
 * delete distributor
 *
 * @param {*} req
 * @param {*} res
 */
exports.delete = async (req, res) => {
  let roleId = getRoleId("distributor");
  let conditions = await getCommonCondition(req);
  let admin = await userModel.findOne({
    where: { id: req.params.id, role_id: roleId, ...conditions },
  });
  if (!admin) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Distributor not found"));
  }

  /* check if any purchase or sales records exists */
  let PurchaseExists = await PurchaseModel.findOne({
    where: {
      user_id: req.params.id,
    },
  });
  if (PurchaseExists) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Distributor has purchase record(s)."));
  }

  let SaleExists = await SaleModel.findOne({
    where: {
      [Op.or]: [{ user_id: req.params.id }, { sale_by: req.params.id }],
    },
  });
  if (SaleExists) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Distributor has sale record(s)."));
  }

  let StockExists = await StockModel.findOne({
    where: {
      user_id: req.params.id,
    },
  });
  if (StockExists) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Distributor has stock record(s)."));
  }

  if (!isEmpty(admin.profile_image)) {
    removeFile(admin.profile_image);
  }

  if (!isEmpty(admin.pan_image)) {
    removeFile(admin.pan_image);
  }

  if (!isEmpty(admin.adhar_image)) {
    removeFile(admin.adhar_image);
  }

  if (!isEmpty(admin.company_logo)) {
    removeFile(admin.company_logo);
  }

  if (isArray(admin.documents)) {
    for (let i = 0; i < admin.documents.length; i++) {
      removeFile(admin.documents[i].path);
    }
  }

  userModel
    .destroy({ where: { id: req.params.id } })
    .then((result) => {
      res.send(formatResponse("", "Distributor deleted Successfully!"));
    })
    .catch((error) => {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse(errorCodes.defaultErrorMsg));
    });
};

const getCommonCondition = async (req) => {
  if (isSuperAdmin(req)) {
    return {};
  } else if (isSalesExecutive(req)) {
    let parent_id = await getUserColumnValue(req.userId, "parent_id");
    return { id: parent_id };
  } else {
    let state_id = await getUserColumnValue(req.userId, "state_id");
    return { state_id: state_id };
  }
};
