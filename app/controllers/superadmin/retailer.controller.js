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
  getDateFromToWhere,
  arrayColumn,
} = require("@helpers/helper");
const db = require("@models");
const { Op } = require("sequelize");
const {
  getRoleId,
  getNextUserName,
  isSuperAdmin,
  isAdmin,
  getUserColumnValue,
  getWorkingUserID,
  isDistributor,
  isSalesExecutive,
  getMyRetailerIds,
  updateRetailerAvgReview,
  getAdminDistributorIds,
  getAdminSEWhereCondition,
} = require("@library/common");
const {
  RetailerCollection,
} = require("@resources/superadmin/RetailerCollection");
const {
  RetailerReviewCollection,
} = require("@resources/superadmin/RetailerReviewCollection");
const userModel = db.users;
const stateModel = db.states;
const districtModel = db.districts;
const countryModel = db.countries;
const SaleModel = db.sales;
const UserToUserModel = db.user_to_users;
const RetailerReviewModel = db.retailer_reviews;
const AddressModel = db.addresses;

var bcrypt = require("bcryptjs");
const e = require("cors");

/**
 * Retrieve all admin
 * @param req
 * @param res
 */
exports.index = async (req, res) => {
  let roleId = getRoleId("retailer");
  let sales_executiveRoleId = getRoleId("sales_executive");
  /**
   * add default address
   */
  // let retailers = await userModel.findAll({where: {role_id: roleId}});
  // for(let i = 0; i < retailers.length; i++){
  //   let address = await AddressModel.findOne({where: {user_id: retailers[i].id}});
  //   if(!address){
  //     await AddressModel.create({
  //       user_id: retailers[i].id,
  //       type: "home",
  //       name: retailers[i].name,
  //       landmark: retailers[i].landmark,
  //       city: retailers[i].city,
  //       zipcode: retailers[i].pincode,
  //       contact: retailers[i].mobile,
  //       country_id: retailers[i].country_id,
  //       state_id: retailers[i].state_id,
  //       district_id: retailers[i].district_id
  //     })
  //   }
  // }

  let { page, limit, all, my_retailer, search, date_from, date_to } = req.query;
  if (all == 1 && my_retailer != 1) {
    let conditions = await getCommonCondition(req);
    userModel
      .findAll({
        where: { role_id: roleId, ...conditions },
        order: [["company_name", "ASC"]],
      })
      .then(async (data) => {
        let result = {
          items: await RetailerCollection(data, req),
          total: data.length,
        };

        res.send(
          formatResponse(
            result,
            "superadmin -------------------------- All Retailer"
          )
        );
      })
      .catch((err) => {
        res
          .status(errorCodes.default)
          .send(formatErrorResponse(errorCodes.defaultErrorMsg));
      });
  } else {
    let userIds = await getMyRetailerIds(req.userId);
    userIds = [...new Set(userIds)];
    let conditions = await getCommonCondition(req, my_retailer, userIds);
    if (!isEmpty(search)) {
      search = search.trim();
      let seachkeyArr = search.split(" ");
      let searchCon = [];
      for (let key of seachkeyArr) {
        let orArr = [];
        orArr.push({ name: { [Op.like]: `%${key}%` } });
        orArr.push({ company_name: { [Op.like]: `%${key}%` } });
        orArr.push({ mobile: key });
        orArr.push({ city: key });
        orArr.push({ pincode: key });
        orArr.push({ "$district.name$": key });
        orArr.push({ "$createdBy.name$": key });
        searchCon.push({
          [Op.or]: orArr,
        });
      }
      conditions = { ...conditions, [Op.and]: searchCon };
    }
    conditions = { ...conditions, ...getDateFromToWhere(date_from, date_to) };

    const paginatorOptions = all == 1 ? {} : getPaginationOptions(page, limit);
    userModel
      .findAndCountAll({
        where: { role_id: roleId, ...conditions },
        order: [["id", "DESC"]],
        ...paginatorOptions,
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
            as: "createdBy",
          },
        ],
      })
      .then(async (data) => {
        let conditions = {
          is_approved: { [Op.ne]: 2 },
          is_assigned: false,
          is_approval: false,
        };
        let adminSaleByIds = [];
        if (!isSuperAdmin(req)) {
          if (isAdmin(req)) {
            let allDstIds = await getAdminDistributorIds(req.userId);
            allDstIds = [...new Set(allDstIds)];
            let _cond = await getAdminSEWhereCondition(allDstIds, null, true);
            let se = await userModel.findAll({
              attributes: ["id"],
              where: _cond,
            });
            let seIds = arrayColumn(se, "id");
            adminSaleByIds = seIds.concat(allDstIds);
            /* get admin own SE's */
            const adminSE = await userModel.findAll({
              attributes: ["id"],
              where: {
                parent_id: { [Op.in]: [req.userId] },
                role_id: sales_executiveRoleId,
              },
            });
            const adminSEIds = arrayColumn(adminSE, "id");
            adminSaleByIds = adminSaleByIds.concat(adminSEIds);
            compactLog("adminSaleByIds : ", adminSaleByIds);
            conditions.sale_by = { [Op.in]: adminSaleByIds };
          } else {
            conditions.sale_by = req.userId;
          }
        }
        let userWhere = { role_id: roleId };
        if (isSalesExecutive(req)) {
          if (my_retailer == 1) {
            userWhere.id = { [Op.in]: userIds };
          } else {
            let state_id = await getUserColumnValue(req.userId, "state_id");
            userWhere.state_id = state_id;
          }
        }
        if (isDistributor(req)) {
          if (my_retailer == 1) {
            userWhere.id = { [Op.in]: userIds };
          } else {
            let district_id = await getUserColumnValue(
              req.userId,
              "district_id"
            );
            userWhere.district_id = district_id;
          }
        }
        let includes = [
          /* {
            model: userModel,
            as: "user",
            where: userWhere,
          }, */
        ];

        let whereObj = {
          where: conditions,
          include: includes /*, group: ['user_id']*/,
        };
        //compactLog("userWhere : ", userWhere);
        compactLog("whereObj keys:", Object.keys(whereObj || {}).length);
        let total_sale = await SaleModel.sum("bill_amount", whereObj);
        let total_sale_due = await SaleModel.sum("sales.due_amount", whereObj);
        let total_sale_paid = await SaleModel.sum("paid_amount", whereObj);
        let total_sale_return = await SaleModel.sum("return_amount", whereObj);

        // compactLog("-------data req.rol ", req.role);
        // compactLog("-------data userID ", req.userid);
        // compactLog("-------data admin_sales_by_userIDs ", adminSaleByIds);
        let result = {
          items: await RetailerCollection(data.rows, {
            role: req.role,
            userId: req.userId,
            admin_sale_by_userids: adminSaleByIds,
          }),
          total: data.count,
          total_sale: priceFormat(total_sale),
          total_sale_due: priceFormat(total_sale_due),
          total_sale_paid: priceFormat(total_sale_paid),
          total_sale_return: priceFormat(total_sale_return),
        };

        res.send(
          formatResponse(
            result,
            "superadmin -------------------------------- All Retailer"
          )
        );
      })
      .catch((err) => {
        compactLog(err);
        res
          .status(errorCodes.default)
          .send(formatErrorResponse(errorCodes.defaultErrorMsg));
      });
  }
};

/**
 * Create Retailer
 *
 * @param {*} req
 * @param {*} res
 */
exports.store = async (req, res) => {
  let data = req.body;
  let roleId = getRoleId("retailer");

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
  let user_name = await getNextUserName("retailer");

  const postData = {
    role_id: roleId,
    parent_id: req.userId, //isSalesExecutive(req) || isDistributor(req) ? req.userId : null,
    created_by: req.userId,
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
    documents: documents,
    partner: data.partner || null
  };

  userModel
    .create(postData)
    .then(async (result) => {
      if (isSalesExecutive(req)) {
        await UserToUserModel.create({
          user_id: req.userId,
          to_user_id: result.id,
          to_role_id: roleId,
        });
      } else if (isDistributor(req)) {
        await UserToUserModel.create({
          user_id: req.userId,
          to_user_id: result.id,
          to_role_id: roleId,
        });
      }

      /**
       * Create default address
       */
      await AddressModel.create({
        user_id: result.id,
        type: "home",
        name: data.name,
        landmark: data.landmark || null,
        city: data.city,
        zipcode: data.pincode,
        contact: data.mobile,
        country_id: !isEmpty(data.country_id) ? data.country_id : null,
        state_id: !isEmpty(data.state_id) ? data.state_id : null,
        district_id: !isEmpty(data.district_id) ? data.district_id : null,
      });

      res.send(formatResponse("", "Retailer created successfully!"));
    })
    .catch((error) => {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse(errorCodes.defaultErrorMsg));
    });
};

/**
 * Update Retailer
 *
 * @param {*} req
 * @param {*} res
 */
exports.update = async (req, res) => {
  let data = req.body;
  let roleId = getRoleId("retailer");
  let conditions = {}; //await getCommonCondition(req);
  let admin = await userModel.findOne({
    where: { id: req.params.id, role_id: roleId, ...conditions },
  });
  if (!admin) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Retailer not found"));
  }

  /**
   * check if mobile is exist or not
   */
  const existing_mobile = await userModel.findOne({
    where: {
      mobile: data.mobile,
      /*role_id: roleId,*/ id: { [Op.ne]: req.params.id },
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
    user_name = await getNextUserName("retailer", admin.id);
  }

  let postData = {
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
    documents: documents,
    partner: data.partner || null
  };
  if (!isEmpty(data.password)) {
    postData.password = bcrypt.hashSync(data.password, 8);
  }

  userModel
    .update(postData, { where: { id: req.params.id } })
    .then((result) => {
      res.send(formatResponse("", "Retailer updated successfully!"));
    })
    .catch((error) => {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse(errorCodes.defaultErrorMsg));
    });
};

/**
 * View Retailer
 *
 * @param {*} req
 * @param {*} res
 */
exports.fetch = async (req, res) => {
  let roleId = getRoleId("retailer");
  let admin = await userModel.findOne({
    where: { id: req.params.id, role_id: roleId },
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
  if (!admin) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Retailer not found"));
  }
  let userIds = await getMyRetailerIds(req.userId);
  res.send(
    formatResponse(
      await RetailerCollection(admin, req, userIds),
      "Retailer fetched successfully!"
    )
  );
};

/**
 * delete Retailer
 *
 * @param {*} req
 * @param {*} res
 */
exports.delete = async (req, res) => {
  let roleId = getRoleId("retailer");
  let admin = await userModel.findOne({
    where: { id: req.params.id, role_id: roleId },
  });

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
      res.send(formatResponse("", "Retailer deleted Successfully!"));
    })
    .catch((error) => {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse(errorCodes.defaultErrorMsg));
    });
};

/**
 * Retailer Reviews
 *
 * @param {*} req
 * @param {*} res
 */
exports.reviews = async (req, res) => {
  let { page, limit, retailer_id } = req.query;
  const paginatorOptions = getPaginationOptions(page, limit);
  RetailerReviewModel.findAndCountAll({
    where: { retailer_id: retailer_id, user_id: { [Op.ne]: req.userId } },
    order: [["id", "DESC"]],
    offset: paginatorOptions.offset,
    limit: paginatorOptions.limit,
    include: [
      {
        model: userModel,
        as: "user",
      },
    ],
  })
    .then(async (data) => {
      let result = {
        items: RetailerReviewCollection(data.rows),
        total: data.count,
      };
      res.send(formatResponse(result));
    })
    .catch((err) => {
      res
        .status(errorCodes.default)
        .send(formatErrorResponse(errorCodes.defaultErrorMsg));
    });
};

/**
 * Retailer My Review
 *
 * @param {*} req
 * @param {*} res
 */
exports.myReview = async (req, res) => {
  let myReview = await RetailerReviewModel.findOne({
    where: { retailer_id: req.params.id, user_id: req.userId },
  });
  if (myReview) {
    myReview = RetailerReviewCollection(myReview);
  }
  res.send(formatResponse(myReview ? myReview : null));
};

/**
 * Create Retailer Review
 *
 * @param {*} req
 * @param {*} res
 */
exports.reviewStore = async (req, res) => {
  let data = req.body;
  let postData = {
    user_id: req.userId,
    retailer_id: data.user_id,
    review: data.review,
    rating: data.rating,
  };
  RetailerReviewModel.create(postData)
    .then(async (result) => {
      await updateRetailerAvgReview(data.user_id);

      res.send(formatResponse("", "Review successfully!"));
    })
    .catch((error) => {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse(errorCodes.defaultErrorMsg));
    });
};

/**
 * Update Retailer Review
 *
 * @param {*} req
 * @param {*} res
 */
exports.reviewUpdate = async (req, res) => {
  let data = req.body;
  RetailerReviewModel.update(
    { review: data.review, rating: data.rating },
    { where: { id: req.params.id } }
  )
    .then(async (result) => {
      await updateRetailerAvgReview(data.user_id);

      res.send(formatResponse("", "Updated successfully!"));
    })
    .catch((error) => {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse(errorCodes.defaultErrorMsg));
    });
};

const getCommonCondition = async (req, my_retailer, userIds) => {
  if (isSuperAdmin(req)) {
    return {};
  } else if (isAdmin(req)) {
    let state_id = await getUserColumnValue(req.userId, "state_id");
    return { state_id: state_id };
  } else {
    if (isSalesExecutive(req)) {
      if (my_retailer == 1) {
        userIds = !userIds ? await getMyRetailerIds(req.userId) : userIds;
        return { id: { [Op.in]: userIds } };
      } else {
        let state_id = await getUserColumnValue(req.userId, "state_id");
        return { state_id: state_id };
      }
      /*if(my_retailer == 'all'){
        return {[Op.or]: [{parent_id: req.userId}, {parent_id: {[Op.eq]: null}, district_id: district_id}]};
      }
      return my_retailer == 1 ? {parent_id: req.userId} : {district_id: district_id, parent_id: {[Op.eq]: null}};*/
    }
    if (isDistributor(req)) {
      if (my_retailer == 1) {
        userIds = !userIds ? await getMyRetailerIds(req.userId) : userIds;
        return { id: { [Op.in]: userIds } };
      } else {
        let district_id = await getUserColumnValue(req.userId, "district_id");
        return { district_id: district_id };
      }
      /*if(my_retailer == 'all'){
        return {[Op.or]: [{parent_id: req.userId}, {parent_id: {[Op.eq]: null}, district_id: district_id}]};
      }
      return my_retailer == 1 ? {parent_id: req.userId} : {district_id: district_id, parent_id: {[Op.eq]: null}};*/
    } else {
      let district_id = await getUserColumnValue(req.userId, "district_id");
      return { district_id: district_id };
    }
  }
};
