const { errorCodes, formatErrorResponse, formatResponse } = require("@utils/response.config");
const { getPaginationOptions } = require('@helpers/paginator');
const db = require("@models");
const moment = require('moment');
const { isEmpty, getDateFromToWhere, displayAmount, priceFormat, requiresPaymentApproval } = require("@helpers/helper");
const { getWorkingUserID, hasWalletFunds } = require("@library/common");
const sequelize = db.sequelize;
const {PaymentCollection} = require("@resources/superadmin/PaymentCollection");
const PaymentModel = db.payments;
const SaleModel = db.sales;
const UserModel = db.users;

/**
 * Retrieve all payments
 * @param req
 * @param res
 */
exports.index = async (req, res) => {
  let { page, limit, date_from, date_to, table_type, table_id } = req.query;
  let conditions = {...getDateFromToWhere(date_from, date_to, 'payment_date')};
  if(!isEmpty(table_type)){
    conditions.table_type = table_type;
  }
  if(!isEmpty(table_id)){
    conditions.table_id = table_id;
  }
  const paginatorOptions = getPaginationOptions(page, limit);
  PaymentModel.findAndCountAll({ 
    order:[['id', 'DESC']],
    where: {payment_by: req.userId, ...conditions},
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
      items: await PaymentCollection(data.rows),
      total: data.count,
    }
    res.send(formatResponse(result, 'All Payments'));
  })
  .catch(err => {
    res.status(errorCodes.default).send(formatErrorResponse(err));
  });
}

/**
 * Create Payment
 * 
 * @param {*} req 
 * @param {*} res 
 */
exports.store = async (req, res) => {
  let data = req.body;

  /*
   * This path used to create every payment as `status: "success"` with no
   * balance check at all, so a distributor could settle a cheque or RTGS
   * invoice instantly and overdraw the wallet. It now follows the same rule as
   * every other invoice payment: cash and UPI settle on the spot, cheque and
   * RTGS wait to be accepted, and the wallet has to cover the amount either
   * way.
   */
  let payerID = await getWorkingUserID(req);
  if (!(await hasWalletFunds(payerID, data.payment_mode, data.amount))) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Insufficient wallet balance."));
  }

  try {
    
    const trans = await sequelize.transaction(async (t) => {
      let amount = parseFloat(data.amount);
      let conditions = {status: 'due'};
      if('table_id' in data && !isEmpty(data.table_id)){
        conditions.id = data.table_id;
      }
      let tableData = [];
      if(data.table_type == "sale"){
        tableData = await SaleModel.findAll({order: [['id', 'ASC']], where: conditions});
      }
      for(let i = 0; i < tableData.length; i++){
        let item = tableData[i];
        let status = 'due', due_amount = 0, paid_amount = 0;
        if(parseFloat(item.due_amount) <= amount){
          due_amount = 0;
          paid_amount = parseFloat(item.total_payable);
          amount = amount - parseFloat(item.due_amount);
          status = "paid";
        }else{
          due_amount = parseFloat(item.due_amount) - amount;
          paid_amount = priceFormat(item.paid_amount) + amount;
          amount = 0;
        }

        if(data.table_type == "sale"){
          await SaleModel.update({
            due_amount: due_amount,
            paid_amount: paid_amount,
            status: status,
            due_date: moment(data.due_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD")
          },{where: {id: item.id}, transaction: t});
        }

        let payment = await PaymentModel.create({
          user_id: data.user_id,
          payment_by: req.userId,
          amount: data.amount,
          payment_mode: data.payment_mode,
          notes: data.notes || null,
          cheque_no: data.cheque_no || null,
          txn_id: data.txn_id || null,
          status: requiresPaymentApproval(data.payment_mode) ? "pending" : "success",
          payment_date: moment(data.payment_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD"),
          table_type: data.table_type,
          table_id: item.id
        }, { transaction: t });

        if(amount == 0){
          break;
        }
      }

    });

    res.send(formatResponse("", "Payment successfully!"));

  } catch (error) {
    return res.status(errorCodes.default).send(formatErrorResponse(errorCodes.defaultErrorMsg));
  }

};
