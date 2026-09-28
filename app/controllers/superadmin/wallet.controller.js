const {
  errorCodes,
  formatErrorResponse,
  formatResponse,
} = require("@utils/response.config");
const { getPaginationOptions } = require("@helpers/paginator");
const db = require("@models");
const { Op } = require("sequelize");
const moment = require("moment");
const {
  isEmpty,
  getDateFromToWhere,
  displayAmount,
  priceFormat,
} = require("@helpers/helper");
const sequelize = db.sequelize;
const {
  getWalletBalance,
  getWorkingUserID,
  isManager,
  supersededPaymentRowIds,
} = require("@library/common");
const { WalletCollection } = require("@resources/superadmin/WalletCollection");
const PaymentModel = db.payments;
const SaleModel = db.sales;
const UserModel = db.users;

/**
 * Wallet History
 * @param req
 * @param res
 */
exports.index = async (req, res) => {
  let { page, limit, date_from, date_to, table_type, table_id, payment_mode } =
    req.query;
  let superAdminId = isManager(req) ? req.userId : await getWorkingUserID(req);
  let conditions = { payment_belongs: superAdminId, payment_type: "wallet" };
  /* if(!isEmpty(table_type)){
    conditions.table_type = table_type;
  }
  if(!isEmpty(table_id)){
    conditions.table_id = table_id;
  }*/
  if (!isEmpty(payment_mode) && payment_mode !== "advance") {
    conditions.payment_mode = payment_mode;
  }

  if(!isEmpty(payment_mode) && payment_mode == "advance"){
    conditions.is_advance = "1";
    //conditions.type = "credit";
  }

  conditions = {
    ...conditions,
    ...getDateFromToWhere(date_from, date_to, "payment_date"),
  };
  /*
   * A request that was accepted after newer rows had arrived is represented by
   * the "Accepted" row written above it; the original folds away underneath as
   * history and must not also appear as a row of its own.
   */
  conditions.id = { [Op.notIn]: supersededPaymentRowIds(superAdminId) };
  const paginatorOptions = getPaginationOptions(page, limit);
  PaymentModel.findAndCountAll({
    order: [["id", "DESC"]],
    where: conditions,
    offset: paginatorOptions.offset,
    limit: paginatorOptions.limit,
    include: [
      {
        model: UserModel,
        as: "user",
      },
    ],
  })
    .then(async (data) => {
      let result = {
        items: await WalletCollection(data.rows, payment_mode),
        total: data.count,
        balance_by_mode: {
          cash: displayAmount(await getWalletBalance(superAdminId, "cash")),
          cheque: displayAmount(await getWalletBalance(superAdminId, "cheque")),
          imps_neft: displayAmount(
            await getWalletBalance(superAdminId, "imps_neft")
          ),
          online: displayAmount(await getWalletBalance(superAdminId, "online")),
          advance: displayAmount(
            await getWalletBalance(superAdminId, "Advance")
          ),
        },
      };
      res.send(formatResponse(result, "All Payments"));
    })
    .catch((err) => {
      res.status(errorCodes.default).send(formatErrorResponse(err));
    });
};
              