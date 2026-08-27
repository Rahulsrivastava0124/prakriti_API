const {
  errorCodes,
  formatErrorResponse,
  formatResponse,
} = require("@utils/response.config");
const { getPaginationOptions } = require("@helpers/paginator");
const db = require("@models");
const moment = require("moment");
const {
  isEmpty,
  generateOrderNo,
  getDateFromToWhere,
  displayAmount,
  priceFormat,
} = require("@helpers/helper");
const sequelize = db.sequelize;
const {
  PaymentCollection,
} = require("@resources/superadmin/PaymentCollection");
const { getWalletBalance } = require("@library/common");
const PaymentModel = db.payments;
const PurchaseModel = db.purchases;
const SaleModel = db.sales;
const UserModel = db.users;

/**
 * Retrieve all payments
 * @param req
 * @param res
 */
exports.index = async (req, res) => {
  let { page, limit, date_from, date_to, table_type, table_id } = req.query;
  let conditions = {
    ...getDateFromToWhere(date_from, date_to, "payment_date"),
  };
  if (!isEmpty(table_type)) {
    conditions.table_type = table_type;
  }
  if (!isEmpty(table_id)) {
    conditions.table_id = table_id;
  }

  const paginatorOptions = getPaginationOptions(page, limit);
  PaymentModel.findAndCountAll({
    order: [["id", "DESC"]],
    where: { payment_by: req.userId, ...conditions },
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
        items: await PaymentCollection(data.rows),
        total: data.count,
      };
      res.send(formatResponse(result, "All Payments"));
    })
    .catch((err) => {
      res.status(errorCodes.default).send(formatErrorResponse(err));
    });
};

/**
 * Create Payment
 *
 * @param {*} req
 * @param {*} res
 */
exports.store = async (req, res) => {
  let data = req.body;

  try {
    const trans = await sequelize.transaction(async (t) => {
      let amount = parseFloat(data.amount);
      let conditions = { status: "due" };
      let rm_balance = 0;
      if ("table_id" in data && !isEmpty(data.table_id)) {
        conditions.id = data.table_id;
      }
      //remaining balance
      rm_balance = data.remaining_balance;
      if ("payment_type" in data && data.payment_type == "advance") {
        let type = "";
        if (data.table_type == "sale") {
          type = "credit";
        } else {
          type = "debit";
        }
        let payment = await PaymentModel.create({
          user_id: data.user_id,
          payment_by: req.userId,
          amount: amount,
          payment_mode: data.payment_mode,
          remaining_balance: rm_balance,
          notes: data.notes || null,
          cheque_no: data.cheque_no || null,
          txn_id: data.txn_id || null,
          weight: data.weight || null,
          status: data.payment_mode != "cheque" ? "success" : "pending",
          payment_date: moment(data.payment_date).format("YYYY-MM-DD"),
          table_type: null,
          table_id: null,
          payment_belongs: req.userId,
          due_date: null,
          type: type,
          purpose: "Purchase Advance",
        });

        let remaining_balance = await getWalletBalance(req.userId);
        await PaymentModel.update(
          {
            remaining_balance: remaining_balance,
          },
          { where: { id: payment.id } },
        );

        // let user = await UserModel.findByPk(data.user_id);
        // if(user){
        //   let advance_amount = user.advance_amount ? priceFormat(parseFloat(user.advance_amount) + amount) : amount;
        //   await UserModel.update({advance_amount: advance_amount}, {where: {id: data.user_id}});
        // }
      } else {
        let tableData = [],
          type = "";
        if (data.table_type == "sale") {
          tableData = await SaleModel.findAll({
            order: [["id", "ASC"]],
            where: conditions,
          });
          type = "credit";
        } else {
          tableData = await PurchaseModel.findAll({
            order: [["id", "ASC"]],
            where: conditions,
          });
          type = "debit";
        }
        for (let i = 0; i < tableData.length; i++) {
          let item = tableData[i];
          let status = "due",
            due_amount = 0,
            paid_amount = 0,
            payment_amount = 0;
          if (parseFloat(item.due_amount) <= amount) {
            due_amount = 0;
            paid_amount = parseFloat(item.total_payable);
            amount = amount - parseFloat(item.due_amount);
            status = "paid";
            payment_amount = parseFloat(item.due_amount);
          } else {
            due_amount = parseFloat(item.due_amount) - amount;
            paid_amount = priceFormat(item.paid_amount) + amount;
            payment_amount = amount;
            amount = 0;
          }

          if (data.payment_mode != "cheque") {
            if (data.table_type == "sale") {
              await SaleModel.update(
                {
                  due_amount: due_amount,
                  paid_amount: paid_amount,
                  status: status,
                  due_date: moment(data.due_date).format("YYYY-MM-DD"),
                },
                { where: { id: item.id }, transaction: t },
              );
            } else {
              await PurchaseModel.update(
                {
                  due_amount: due_amount,
                  paid_amount: paid_amount,
                  status: status,
                  due_date: moment(data.due_date).format("YYYY-MM-DD"),
                },
                { where: { id: item.id }, transaction: t },
              );
            }
          }

          let payment = await PaymentModel.create({
            user_id: data.user_id,
            payment_by: req.userId,
            amount: payment_amount,
            payment_mode: data.payment_mode,
            remaining_balance: rm_balance,
            notes: data.notes || null,
            cheque_no: data.cheque_no || null,
            txn_id: data.txn_id || null,
            weight: data.weight || null,
            status: data.payment_mode != "cheque" ? "success" : "pending",
            payment_date: moment(data.payment_date).format("YYYY-MM-DD"),
            table_type: data.table_type,
            table_id: item.id,
            payment_belongs: req.userId,
            due_date: moment(data.due_date).format("YYYY-MM-DD"),
            type: type,
            purpose: type,
          });

          let remaining_balance = await getWalletBalance(req.userId);
          await PaymentModel.update(
            {
              remaining_balance: remaining_balance,
            },
            { where: { id: payment.id } },
          );

          if (amount == 0) {
            break;
          }
        }
      }
    });

    res.send(formatResponse("", "Payment successfully!"));
  } catch (error) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse(errorCodes.defaultErrorMsg));
  }
};

/**
 * get total due
 *
 * @param {*} req
 * @param {*} res
 */
exports.totalDue = async (req, res) => {
  let dueAmount = await PurchaseModel.sum("due_amount", {
    where: { supplier_id: req.query.user_id },
  });
  res.send(
    formatResponse({
      due_amount: priceFormat(dueAmount),
      due_amount_display: displayAmount(dueAmount),
    }),
  );
};

/**
 * get wallet balance
 *
 * @param {*} req
 * @param {*} res
 */
exports.walletBalance = async (req, res) => {
  let remaining_balance = await getWalletBalance(
    req.userId,
    req.query.payment_mode,
  );
  res.send(
    formatResponse({
      balance: remaining_balance,
    }),
  );
};

/**
 * Update payment status
 *
 * @param {*} req
 * @param {*} res
 */
exports.updateStatus = async (req, res) => {
  let data = req.body;

  let payment = await PaymentModel.findOne({ where: { id: req.params.id } });
  if (data.status == 1) {
    // Keep the original request status as 'pending' but mark it non-actionable (processed)
    const updateObj = { can_accept: false };
    if (data.ref_no) updateObj.ref_no = data.ref_no;
    await PaymentModel.update(updateObj, { where: { id: payment.id } });

    // create accepted ledger row so receiver sees an entry at top
    const acceptedPayment = await PaymentModel.create({
      parent_id: payment.id,
      user_id: payment.user_id,
      payment_by: payment.payment_by,
      amount: payment.amount,
      payment_mode: payment.payment_mode,
      remaining_balance: 0,
      notes: payment.notes || null,
      cheque_no: payment.cheque_no || null,
      txn_id: payment.txn_id || null,
      weight: payment.weight || null,
      status: "success",
      payment_date: moment().format("YYYY-MM-DD"),
      table_type: payment.table_type,
      table_id: payment.table_id,
      payment_belongs: req.userId,
      due_date: payment.due_date
        ? moment(payment.due_date).format("YYYY-MM-DD")
        : null,
      type: payment.type,
      purpose: payment.purpose,
    });

    await getWalletBalance(req.userId); // ensure balances computed
    await updateWalletRemainingBalance(
      acceptedPayment.payment_belongs,
      acceptedPayment.id,
    );

    // do not modify sender-side (original child) rows; receiver list will have the new accepted row
    // (original child left unchanged)

    let tableData = null;
    if (payment.table_type == "sale") {
      tableData = await SaleModel.findOne({ where: { id: payment.table_id } });
    } else {
      tableData = await PurchaseModel.findOne({
        where: { id: payment.table_id },
      });
    }
    if (tableData) {
      let amount = payment.amount;
      let status = "due",
        due_amount = 0,
        paid_amount = 0,
        payment_amount = 0;
      if (parseFloat(tableData.due_amount) <= amount) {
        due_amount = 0;
        paid_amount = parseFloat(tableData.total_payable);
        amount = amount - parseFloat(tableData.due_amount);
        status = "paid";
        payment_amount = parseFloat(tableData.due_amount);
      } else {
        due_amount = parseFloat(tableData.due_amount) - amount;
        paid_amount = priceFormat(tableData.paid_amount) + amount;
        amount = 0;
        payment_amount = amount;
      }

      if (payment.table_type == "sale") {
        await SaleModel.update(
          {
            due_amount: due_amount,
            paid_amount: paid_amount,
            status: status,
            due_date: moment(payment.due_date).format("YYYY-MM-DD"),
          },
          { where: { id: payment.table_id } },
        );
      } else {
        await PurchaseModel.update(
          {
            due_amount: due_amount,
            paid_amount: paid_amount,
            status: status,
            due_date: moment(payment.due_date).format("YYYY-MM-DD"),
          },
          { where: { id: payment.table_id } },
        );
      }
    }
  } else {
    // mark original request as processed and failed (disable accept)
    await PaymentModel.update(
      { status: "failed", reasons: data.reasons || null, can_accept: false },
      { where: { id: payment.id } },
    );
  }

  res.send(formatResponse("", "Updated successfully!"));
};
