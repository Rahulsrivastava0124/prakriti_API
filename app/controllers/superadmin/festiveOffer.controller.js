const config = require("@config/auth.config");
const {
  errorCodes,
  formatErrorResponse,
  formatResponse,
} = require("@utils/response.config");
const db = require("@models");
const { Op } = require("sequelize");
const moment = require("moment");
const { getPaginationOptions } = require("@helpers/paginator");
const { isEmpty } = require("@helpers/helper");
const {
  FestiveOfferCollection,
} = require("@resources/superadmin/FestiveOfferCollection");
const FestiveOfferModel = db.festive_offers;
const CategoryModel = db.categories;
const SubCategoryModel = db.sub_categories;
const { base64FileUpload, removeFile } = require("@helpers/upload");

/**
 * Retrieve all festiveoffers
 * @param req
 * @param res
 */
exports.index = async (req, res) => {
  let { page, limit, all, search } = req.query;
  let conditions = {};
  const paginatorOptions = getPaginationOptions(page, limit);
  FestiveOfferModel.findAndCountAll({
    order: [["id", "DESC"]],
    offset: paginatorOptions.offset,
    limit: paginatorOptions.limit,
    where: conditions,
    include: [
      {
        model: CategoryModel,
        as: "category",
        required: true,
      },
      {
        model: SubCategoryModel,
        as: "sub_category",
        //required: true
      },
    ],
  })
    .then(async (data) => {
      let result = {
        items: await FestiveOfferCollection(data.rows),
        total: data.count,
      };
      res.send(formatResponse(result));
    })
    .catch((err) => {
      res.status(errorCodes.default).send(formatErrorResponse(err));
    });
};

/**
 * Create festiveoffer
 *
 * @param {*} req
 * @param {*} res
 */
exports.store = async (req, res) => {
  let data = req.body;

  /**
   * make unique code
   */
  const haveCode = await FestiveOfferModel.findOne({
    where: { code: data.code },
  });
  if (haveCode) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("This code is already exists."));
  }

  //upload banner
  let banner = null;
  let result = await base64FileUpload(data.banner, "banners");
  if (result) {
    banner = result.path;
  }

  const postData = {
    category_id: data.category_id,
    sub_category_id: data.sub_category_id || null,
    products: (Array.isArray(data.products) ? data.products : [])
      .filter((p) => p !== "" && p !== null && p !== undefined)
      .join(","),
    title: data.title,
    description: data.description,
    discount: data.discount,
    discount_type: data.discount_type,
    code: data.code,
    status: data.status,
    start_date: moment(data.start_date).format("YYYY-MM-DD"),
    end_date: moment(data.end_date).format("YYYY-MM-DD"),
    banner: banner,
  };

  FestiveOfferModel.create(postData)
    .then((result) => {
      res.send(formatResponse("", "festiveoffer created successfully!"));
    })
    .catch((error) => {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse(error.toString()));
    });
};

/**
 * View festiveoffer
 *
 * @param {*} req
 * @param {*} res
 */
exports.fetch = async (req, res) => {
  let festiveoffer = await FestiveOfferModel.findOne({
    where: { id: req.params.id },
    include: [
      {
        model: CategoryModel,
        as: "category",
        required: true,
      },
      {
        model: SubCategoryModel,
        as: "sub_category",
        //required: true
      },
    ],
  });
  if (!festiveoffer) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("festiveoffer not found"));
  }
  res.send(formatResponse(await FestiveOfferCollection(festiveoffer)));
};

/**
 * Update festiveoffer
 *
 * @param {*} req
 * @param {*} res
 */
exports.update = async (req, res) => {
  let data = req.body;
  let festiveoffer = await FestiveOfferModel.findOne({
    where: { id: req.params.id },
  });
  if (!festiveoffer) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("festiveoffer not found"));
  }

  /**
   * make unique code
   */
  const haveCode = await FestiveOfferModel.findOne({
    where: { code: data.code, id: { [Op.ne]: req.params.id } },
  });
  if (haveCode) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("This code is already exists."));
  }

  const postData = {
    category_id: data.category_id,
    sub_category_id: data.sub_category_id || null,
    products: (Array.isArray(data.products) ? data.products : [])
      .filter((p) => p !== "" && p !== null && p !== undefined)
      .join(","),
    title: data.title,
    description: data.description,
    discount: data.discount,
    discount_type: data.discount_type,
    code: data.code,
    status: data.status,
    start_date: moment(data.start_date).format("YYYY-MM-DD"),
    end_date: moment(data.end_date).format("YYYY-MM-DD"),
  };

  if (!isEmpty(data.banner)) {
    removeFile(festiveoffer.banner);
    let result2 = await base64FileUpload(data.banner, "banners");
    if (result2) {
      postData.banner = result2.path;
    }
  }

  FestiveOfferModel.update(postData, { where: { id: req.params.id } })
    .then((result) => {
      res.send(formatResponse("", "festiveoffer updated successfully!"));
    })
    .catch((error) => {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse(errorCodes.defaultErrorMsg));
    });
};

/**
 * delete festiveoffer
 *
 * @param {*} req
 * @param {*} res
 */
exports.delete = async (req, res) => {
  let festiveoffer = await FestiveOfferModel.findOne({
    where: { id: req.params.id },
  });
  if (!festiveoffer) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("festiveoffer not found"));
  }

  if (festiveoffer) {
    if (!isEmpty(festiveoffer.banner)) {
      removeFile(festiveoffer.banner);
    }
  }

  FestiveOfferModel.destroy({ where: { id: req.params.id } })
    .then((result) => {
      res.send(formatResponse("", "festiveoffer deleted successfully!"));
    })
    .catch((error) => {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse(errorCodes.defaultErrorMsg));
    });
};
