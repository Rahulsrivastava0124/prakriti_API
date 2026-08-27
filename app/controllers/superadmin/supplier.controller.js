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
const { isEmpty, isArray, priceFormat } = require("@helpers/helper");
const db = require("@models");
const { Op } = require("sequelize");
const {
  getRoleId,
  getNextUserName,
  getWorkingUserID,
  isAdmin,
  getSuperAdminId,
  getDistributorAdmin,
  isDistributor,
} = require("@library/common");
const {
  SupplierCollection,
} = require("@resources/superadmin/SupplierCollection");
const userModel = db.users;
const stateModel = db.states;
const districtModel = db.districts;
const countryModel = db.countries;
const PurchaseModel = db.purchases;

var bcrypt = require("bcryptjs");

/**
 * Retrieve all admin
 * @param req
 * @param res
 */
exports.index = async (req, res) => {
  let { page, limit, all, all_purchase } = req.query;
  let currentUserId = await getWorkingUserID(req);
  let roleId = getRoleId("supplier");
  let conditions = { role_id: roleId };
  if (all_purchase != 1) {
    conditions.parent_id = currentUserId;
  }
  if (all == 1) {
    userModel
      .findAll({
        where: conditions,
        order: [["company_name", "ASC"]],
      })
      .then(async (data) => {
        let items = await SupplierCollection(data, currentUserId);
        if (isAdmin(req)/*  && page == 1 */) {
          let user = await userModel.findOne({
            where: { role_id: getRoleId("superadmin") },
          });
          let superAdminItem = await SupplierCollection(
            user,
            currentUserId,
            false
          );
          //compactLog("------------------loged superAdminItem",superAdminItem);
          items = [superAdminItem].concat(items);

          /* Other admin who sale item to current user */
          const otherAdmins = await PurchaseModel.findAll({
            where: {
              user_id: currentUserId,
              is_approved: { [Op.ne]: 2 },
              is_assigned: false,
              is_approval: false,
            },
            attributes: [
              "supplier_id",
            ],
          });

          if (otherAdmins.length > 0) {
            
            const otherAdminObjList = await userModel.findAll({
              where: {
                id: { [Op.in]: otherAdmins.map(p => p.supplier_id) },
                role_id: getRoleId("admin"),
              },
            });
            //compactLog("------------------loged otherAdminObjList",otherAdminObjList);
            
            const adminItem = await SupplierCollection(otherAdminObjList, currentUserId, false);
            //compactLog("------------------loged adminItem",adminItem);
            items = [...adminItem].concat(items);
          }
        } else if (isDistributor(req)/*  && page == 1 */) {
          let user = await getDistributorAdmin(req.userId, null, true);
          let adminItem = await SupplierCollection(user, currentUserId, false);
          items = [adminItem].concat(items);
        }

        let result = {
          items: items,
          total: items.length,
        };
        res.send(formatResponse(result, "All Supplier"));
      })
      .catch((err) => {
        compactLog(err);
        res
          .status(errorCodes.default)
          .send(formatErrorResponse(errorCodes.defaultErrorMsg));
      });
  } else {
    const paginatorOptions = getPaginationOptions(page, limit);
    userModel
      .findAndCountAll({
        where: conditions,
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
        ],
      })
      .then(async (data) => {
        let total_purchase = await PurchaseModel.sum("bill_amount", {
          where: {
            user_id: req.userId,
            is_approved: { [Op.ne]: 2 },
            is_assigned: false,
            is_approval: false,
          },
        });
        let total_purchase_due = await PurchaseModel.sum("due_amount", {
          where: {
            user_id: req.userId,
            is_approved: { [Op.ne]: 2 },
            is_assigned: false,
            is_approval: false,
          },
        });
        let total_purchase_paid = await PurchaseModel.sum("paid_amount", {
          where: {
            user_id: req.userId,
            is_approved: { [Op.ne]: 2 },
            is_assigned: false,
            is_approval: false,
            status: { [Op.ne]: "returned" },
          },
        });
        let total_purchase_return = await PurchaseModel.sum("return_amount", {
          where: {
            user_id: req.userId,
            is_approved: { [Op.ne]: 2 },
            is_assigned: false,
            is_approval: false,
          },
        });

        let items = await SupplierCollection(data.rows, currentUserId);
        if (isAdmin(req) && page == 1) {
          let user = await userModel.findOne({
            where: { role_id: getRoleId("superadmin") },
          });
          let superAdminItem = await SupplierCollection(
            user,
            currentUserId,
            false
          );
          items = [superAdminItem].concat(items);

          /* Other admin who sale item to current user */
          const otherAdmins = await PurchaseModel.findAll({
            where: {
              user_id: currentUserId,
              is_approved: { [Op.ne]: 2 },
              is_assigned: false,
              is_approval: false,
            },
            attributes: [
              "supplier_id",
            ],
          });

          if (otherAdmins.length > 0) {
            
            const otherAdminObjList = await userModel.findAll({
              where: {
                id: { [Op.in]: otherAdmins.map(p => p.supplier_id) },
                role_id: getRoleId("admin"),
              },
            });
            //compactLog("------------------loged otherAdminObjList",otherAdminObjList);
            
            const adminItem = await SupplierCollection(otherAdminObjList, currentUserId, false);
            //compactLog("------------------loged adminItem",adminItem);
            items = [...adminItem].concat(items);
          }

        } else if (isDistributor(req) && page == 1) {
          let user = await getDistributorAdmin(req.userId, null, true);
          let adminItem = await SupplierCollection(user, currentUserId, false);
          items = [adminItem].concat(items);
        }

        let result = {
          items: items,
          total: items.length, /* data.count */
          total_purchase: priceFormat(total_purchase),
          total_purchase_due: priceFormat(total_purchase_due),
          total_purchase_paid: priceFormat(total_purchase_paid),
          total_purchase_return: priceFormat(total_purchase_return),
        };
        res.send(formatResponse(result, "All Supplier"));
      })
      .catch((err) => {
        res
          .status(errorCodes.default)
          .send(formatErrorResponse(errorCodes.defaultErrorMsg));
      });
  }
};

/**
 * Create Supplier
 *
 * @param {*} req
 * @param {*} res
 */
exports.store = async (req, res) => {
  let data = req.body;
  let roleId = getRoleId("supplier");

  /**
   * check if mobile is exist or not
   */
  const existing_mobile = await userModel.findOne({
    where: { mobile: data.mobile, role_id: roleId },
  });
  if (existing_mobile) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("This mobile is already exists."));
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

  //upload documents
  let documents = [];
  for (let i = 0; i < data.documents.length; i++) {
    let result = await base64FileUpload(data.documents[i], "users");
    if (result) {
      documents.push(result);
    }
  }
  let user_name = await getNextUserName("supplier");
  let superAdminId = await getWorkingUserID(req);

  const postData = {
    parent_id: superAdminId,
    role_id: roleId,
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
    created_by: req.userId,
    documents: documents,
  };

  userModel
    .create(postData)
    .then((result) => {
      res.send(formatResponse("", "Supplier created successfully!"));
    })
    .catch((error) => {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse(errorCodes.defaultErrorMsg));
    });
};

/**
 * Update Supplier
 *
 * @param {*} req
 * @param {*} res
 */
exports.update = async (req, res) => {
  let data = req.body;
  let roleId = getRoleId("supplier");
  let admin = await userModel.findOne({
    where: { id: req.params.id, role_id: roleId },
  });
  if (!admin) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Supplier not found"));
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
    user_name = await getNextUserName("supplier", admin.id);
  }

  const postData = {
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
    documents: documents,
  };

  userModel
    .update(postData, { where: { id: req.params.id } })
    .then((result) => {
      res.send(formatResponse("", "Supplier updated successfully!"));
    })
    .catch((error) => {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse(errorCodes.defaultErrorMsg));
    });
};

/**
 * View Supplier
 *
 * @param {*} req
 * @param {*} res
 */
exports.fetch = async (req, res) => {
  //let superAdminId = await getWorkingUserID(req);
  //let roleId = getRoleId('supplier');
  let conditions = { id: req.params.id };
  let user = await userModel.findOne({
    where: conditions,
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
    ],
  });
  if (!user) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Supplier not found"));
  }
  let currentUserId = await getWorkingUserID(req);
  res.send(
    formatResponse(
      await SupplierCollection(user, currentUserId),
      "Supplier fetched successfully!"
    )
  );
};

/**
 * delete Supplier
 *
 * @param {*} req
 * @param {*} res
 */
exports.delete = async (req, res) => {
  let roleId = getRoleId("supplier");
  let admin = await userModel.findOne({
    where: { id: req.params.id, role_id: roleId },
  });
  if (!admin) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Supplier not found"));
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
      res.send(formatResponse("", "Supplier deleted Successfully!"));
    })
    .catch((error) => {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse(errorCodes.defaultErrorMsg));
    });
};
