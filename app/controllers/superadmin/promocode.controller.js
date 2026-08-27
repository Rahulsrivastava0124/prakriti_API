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
  PromocodeCollection,
} = require("@resources/superadmin/PromocodeCollection");
const PromocodeModel = db.promocodes;
const CategoryModel = db.categories;
const SubCategoryModel = db.sub_categories;
const { base64FileUpload, removeFile } = require("@helpers/upload");

/**
 * Retrieve all promocodes
 * @param req
 * @param res
 */
exports.index = async (req, res) => {
  let { page, limit, all, search } = req.query;
  let conditions = {};
  const paginatorOptions = getPaginationOptions(page, limit);
  PromocodeModel.findAndCountAll({
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
        items: await PromocodeCollection(data.rows),
        total: data.count,
      };
      res.send(formatResponse(result));
    })
    .catch((err) => {
      res.status(errorCodes.default).send(formatErrorResponse(err));
    });
};

/**
 * Create promocode
 *
 * @param {*} req
 * @param {*} res
 */
exports.store = async (req, res) => {
  let data = req.body;

  /**
   * make unique code
   */
  const haveCode = await PromocodeModel.findOne({ where: { code: data.code } });
  if (haveCode) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("This code is already exists."));
  }

  //upload banner
  let banner = null;
  let result = await base64FileUpload(data.banner, "promocodes");
  if (result) {
    banner = result.path;
  }

  const postData = {
    category_id: data.category_id,
    sub_category_id: data.sub_category_id || null,
    products: data.products.join(","),
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

  PromocodeModel.create(postData)
    .then((result) => {
      res.send(formatResponse("", "Promocode created successfully!"));
    })
    .catch((error) => {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse(error.toString()));
    });
};

/**
 * View promocode
 *
 * @param {*} req
 * @param {*} res
 */
exports.fetch = async (req, res) => {
  let promocode = await PromocodeModel.findOne({
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
  if (!promocode) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Promocode not found"));
  }
  res.send(formatResponse(await PromocodeCollection(promocode)));
};

/**
 * Update promocode
 *
 * @param {*} req
 * @param {*} res
 */
exports.update = async (req, res) => {
  let data = req.body;
  let promocode = await PromocodeModel.findOne({
    where: { id: req.params.id },
  });
  if (!promocode) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Promocode not found"));
  }

  /**
   * make unique code
   */
  const haveCode = await PromocodeModel.findOne({
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
    products: data.products.join(","),
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
    removeFile(promocode.banner);
    let result2 = await base64FileUpload(data.banner, "promocodes");
    if (result2) {
      postData.banner = result2.path;
    }
  }

  PromocodeModel.update(postData, { where: { id: req.params.id } })
    .then((result) => {
      res.send(formatResponse("", "Promocode updated successfully!"));
    })
    .catch((error) => {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse(errorCodes.defaultErrorMsg));
    });
};

/**
 * delete promocode
 *
 * @param {*} req
 * @param {*} res
 */
exports.delete = async (req, res) => {
  let promocode = await PromocodeModel.findOne({
    where: { id: req.params.id },
  });
  if (!promocode) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Promocode not found"));
  }

  if (promocode) {
    if (!isEmpty(promocode.banner)) {
      removeFile(promocode.banner);
    }
  }

  PromocodeModel.destroy({ where: { id: req.params.id } })
    .then((result) => {
      res.send(formatResponse("", "Promocode deleted successfully!"));
    })
    .catch((error) => {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse(errorCodes.defaultErrorMsg));
    });
};
