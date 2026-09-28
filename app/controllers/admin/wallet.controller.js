const { errorCodes, formatErrorResponse, formatResponse } = require("@utils/response.config");
const { getPaginationOptions } = require('@helpers/paginator');
const db = require("@models");
const { Op } = require("sequelize");
const moment = require('moment');
const { isEmpty, getDateFromToWhere, displayAmount, priceFormat } = require("@helpers/helper");
const sequelize = db.sequelize;
const {
  getWalletBalance,
  getSuperAdminId,
  supersededPaymentRowIds,
} = require("@library/common");
const {WalletCollection} = require("@resources/superadmin/WalletCollection");
const PaymentModel = db.payments;
const SaleModel = db.sales;
const UserModel = db.users;

/**
 * Wallet History
 * @param req
 * @param res
 */
exports.index = async (req, res) => {
  let { page, limit, date_from, date_to, table_type, table_id, payment_mode } = req.query;
  let conditions = {payment_belongs: req.userId};
 /* if(!isEmpty(table_type)){
    conditions.table_type = table_type;
  }
  if(!isEmpty(table_id)){
    conditions.table_id = table_id;
  }*/
  if(!isEmpty(payment_mode)){
    conditions.payment_mode = payment_mode;
  }
  conditions = {...conditions, ...getDateFromToWhere(date_from, date_to, 'payment_date')}
  // Superseded originals belong under their accepted row, not beside it.
  conditions.id = { [Op.notIn]: supersededPaymentRowIds(req.userId) };
  const paginatorOptions = getPaginationOptions(page, limit);
  PaymentModel.findAndCountAll({ 
    order:[['id', 'DESC']],
    where: conditions,
    offset: paginatorOptions.offset,
    limit: paginatorOptions.limit,
    include: [
      {
        model: UserModel,
        as: 'user'
      }
    ]
   }).then(async (data) => {
    let result = {
      items: await WalletCollection(data.rows),
      total: data.count,
      balance_by_mode: {
        cash: displayAmount(await getWalletBalance(req.userId, 'cash')),
        cheque: displayAmount(await getWalletBalance(req.userId, 'cheque')),
        imps_neft: displayAmount(await getWalletBalance(req.userId, 'imps_neft')),
        online: displayAmount(await getWalletBalance(req.userId, 'online')),
      }
    }
    res.send(formatResponse(result, 'All Payments'));
  })
  .catch(err => {
    res.status(errorCodes.default).send(formatErrorResponse(err));
  });
}

