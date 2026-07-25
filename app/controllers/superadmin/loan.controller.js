const config = require("@config/auth.config");
const { errorCodes, formatErrorResponse, formatResponse } = require("@utils/response.config");
const db = require("@models");
const moment = require('moment');
const { base64FileUpload, base64VideoFileUpload, removeFile, filterFilesFromRemove } = require('@helpers/upload');
const { isEmpty, isArray, priceFormat, getLoanEMI } = require("@helpers/helper");
const { updateOrCreate, insertLoanEMI, getWorkingUserID, updateWalletRemainingBalance, getWalletBalance, getRoleId } = require("@library/common");
const { getPaginationOptions } = require('@helpers/paginator')
const { LoanCollection } = require("@resources/superadmin/LoanCollection");
const { LoanListCollection } = require("@resources/superadmin/LoanListCollection");
const { Op, QueryTypes } = require("sequelize");
const sequelize = db.sequelize;
const paymentModel = db.payments;
const LoanModel = db.loans;
const LoanDetailModel = db.loan_details;
const UserModel = db.users;

/**
 * Retrieve all categories
 * @param req
 * @param res
 */
exports.index = async (req, res) => {
  let { page, limit, investor_id } = req.query;
  // Scope loans to the owner: a loan is only visible to the user who owns the
  // linked investor (investor.parent_id). Loans have no owner column of their
  // own, so we filter through the investor association.
  let currentUserId = await getWorkingUserID(req);
  let conditions = {};
  if (!isEmpty(investor_id)) {
    conditions.user_id = investor_id;
  }

  const paginatorOptions = getPaginationOptions(page, limit);
  LoanModel.findAndCountAll({
    order: [
      ['id', 'DESC']
    ],
    where: conditions,
    offset: paginatorOptions.offset,
    limit: paginatorOptions.limit,
    include: [
      {
        model: UserModel,
        as: 'investor',
        required: true,
        where: { parent_id: currentUserId }
      }
    ],
    distinct: true
  }).then(async (data) => {
    let result = {
      items: LoanListCollection(data.rows),
      total: data.count,
    }
    res.send(formatResponse(result, 'Loan List'));
  })
    .catch(err => {
      res.status(errorCodes.default).send(formatErrorResponse(err));
    });
};

/**
 * Create loan
 * 
 * @param {*} req 
 * @param {*} res 
 */
exports.store = async (req, res) => {
  let data = req.body;

  let userID = await getWorkingUserID(req);

  // Ensure the loan is created only against an investor owned by this user.
  let investor = await UserModel.findOne({
    where: { id: data.user_id, role_id: getRoleId("investor"), parent_id: userID }
  });
  if (!investor) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Investor not found"));
  }

  try {
    //const trans = await sequelize.transaction(async (t) => {

    //insert into load table
    let total_month = parseInt(data.duration);
    let total_year = total_month / 12;
    let amount = priceFormat(data.amount);
    let interest = priceFormat(data.interest);
    let emi = getLoanEMI(interest, total_year, amount, 'emi', data.interest_display_type);

    //let due_amount = Math.round(amount + ((amount * interest*total_year) / 100));
    let due_amount = getLoanEMI(interest, total_year, amount, 'total_pay', data.interest_display_type);
    //let total_interset_amount = Math.round(((amount * interest*total_year) / 100));
    let total_interset_amount = getLoanEMI(interest, total_year, amount, 'total_interest', data.interest_display_type);
    let loanObj = {
      user_id: data.user_id,
      loan_amount: amount,
      principal_amount: amount,
      interest: data.interest_display_type == "monthly" ? parseFloat(interest * 100 * 12) : interest,
      interest_display: data.interest,
      interest_display_type: data.interest_display_type,
      monthly_emi: emi.toFixed(0),
      interest_amount: total_interset_amount.toFixed(0),
      total_months: data.duration,
      due_amount: due_amount,
      total_paid: 0,
      payment_mode: data.payment_mode,
      start_date: moment().format('YYYY-MM-DD'), //moment(data.start_date).format('YYYY-MM-DD'),
      status: 'pending'
    }
    let loan = await LoanModel.create(loanObj);

    //insert into loan detail table
    //let result = await insertLoanEMI(loan, moment(), emi, amount);

    // await LoanModel.update({
    //   due_date: result.first_due_date
    // }, { where: { id: loan.id } });

    /**
     * add loan amount to wallet
     */
    let payment = await paymentModel.create({
      payment_mode: data.payment_mode,
      amount: amount,
      user_id: data.user_id,
      payment_by: req.userId,
      payment_date: moment().format('YYYY-MM-DD'),
      //txn_id: data.transaction_no,
      //cheque_no: data.cheque_no,
      status: 'success',
      type: 'credit',
      table_type: 'loan',
      table_id: loan.id,
      payment_belongs: userID,
      purpose: 'loan',
      can_accept: true
    });
    await updateWalletRemainingBalance(userID, payment.id);

    res.send(formatResponse([], "Loan created successfully!"));
    //});
  } catch (error) {
    compactLog(error)
    return res.status(errorCodes.default).send(formatErrorResponse('Loan does not created due to some error'));
  }

};


/**
 * View Loan
 * 
 * @param {*} req 
 * @param {*} res 
 */
exports.view = async (req, res) => {
  let currentUserId = await getWorkingUserID(req);
  let loan = await LoanModel.findOne({
    where: { id: req.params.id },
    include: [
      {
        model: LoanDetailModel,
        as: 'loanDetails',
        separate: true
      },
      {
        model: UserModel,
        as: 'investor',
        required: true,
        where: { parent_id: currentUserId }
      }
    ]
  });
  if (!loan) {
    return res.status(errorCodes.default).send(formatErrorResponse('Loan not found'));
  }
  res.send(formatResponse(LoanCollection(loan), "Loan details successfully!"));
};

/**
 * Loan Payment
 * 
 * @param {*} req 
 * @param {*} res 
 */
exports.payment = async (req, res) => {
  let currentUserId = await getWorkingUserID(req);
  let loan = await LoanModel.findOne({
    where: { id: req.params.id },
    include: [{ model: UserModel, as: 'investor', required: true, where: { parent_id: currentUserId } }]
  });
  if (!loan) {
    return res.status(errorCodes.default).send(formatErrorResponse('Loan not found'));
  }
  let data = req.body;
  let amount = priceFormat(data.amount);
  if (amount > loan.due_amount) {
    return res.status(errorCodes.default).send(formatErrorResponse('Payment Amount Higher Than Due Amount..!'));
  }

  /**
   * Client said pay will be normal not like emi
   */
  // let pendingEmi = await LoanDetailModel.findOne({
  //   where: {
  //     loan_id: loan.id,
  //     status: 'pending',
  //     interest_due_date: {
  //       [Op.lte]:  moment().toDate()
  //     }
  //   },
  //   order: [['id', 'ASC']]
  // });
  // if(!pendingEmi){
  //   return res.status(errorCodes.default).send(formatErrorResponse('No pending EMI found.'));
  // }

  // if(amount < pendingEmi.emi){
  //   return res.status(errorCodes.default).send(formatErrorResponse('Payment Amount Lower Than EMI Amount.'));
  // }

  //check is wallet have ballance or not
  let userID = await getWorkingUserID(req);
  let walletBalance = await getWalletBalance(userID, data.payment_mode);
  if (amount > 0 && walletBalance < amount) {
    return res.status(errorCodes.default).send(formatErrorResponse("Insufficient wallet balance."));
  }

  /**
   * Client said pay will be normal not like emi
   */
  //IF EMI Pay
  // if(amount == pendingEmi.emi){
  //   await LoanDetailModel.update({
  //     status: 'paid',
  //     payment_receive_date: moment().format('YYYY-MM-DD HH:mm:ss'),
  //     amount: amount,
  //     payment_mode: data.payment_mode
  //   }, { where: { id: pendingEmi.id } });

  //   pendingEmi = await LoanDetailModel.findOne({
  //     where: {
  //       loan_id: loan.id,
  //       status: 'pending'
  //     },
  //     order: [['id', 'ASC']]
  //   });

  //   await LoanModel.update({
  //     due_amount: parseFloat(loan.due_amount) - amount,
  //     total_paid: parseFloat(loan.total_paid) + amount,
  //     due_date: pendingEmi.interest_due_date
  //   }, { where: { id: loan.id } });

  // }else{

  //   //check if one emi paid or not
  //   let paidEmi = await LoanDetailModel.findOne({
  //     where: {
  //       loan_id: loan.id,
  //       status: 'paid'
  //     }
  //   });
  //   if(!paidEmi){
  //     return res.status(errorCodes.default).send(formatErrorResponse('Please paid at least one EMI.'));
  //   }

  //   let pendingDetails = await LoanDetailModel.findAll({
  //     where: {
  //       loan_id: loan.id,
  //       status: 'pending',
  //       interest_due_date: {
  //         [Op.lte]:  moment().toDate()
  //       }
  //     },
  //     order: [['id', 'ASC']]
  //   });
  //   let payAmount = amount, advance = 0, last_month = moment();
  //   for(let i = 0; i < pendingDetails.length; i++){
  //     let item = pendingDetails[i];

  //     if(payAmount < parseFloat(item.emi)){
  //       advance = amount - payAmount;
  //       last_month = moment(item.interest_due_date);
  //       break;
  //     }

  //     await LoanDetailModel.update({
  //       status: 'paid',
  //       payment_receive_date: moment().format('YYYY-MM-DD HH:mm:ss'),
  //       amount: item.emi,
  //       payment_mode: data.payment_mode
  //     }, { where: { id: item.id } });

  //     let pendingEmi = await LoanDetailModel.findOne({
  //       where: {
  //         loan_id: loan.id,
  //         status: 'pending'
  //       },
  //       order: [['id', 'ASC']]
  //     });

  //     await LoanModel.update({
  //       due_amount: loan.due_amount - parseFloat(item.emi),
  //       total_paid: loan.total_paid + parseFloat(item.emi),
  //       due_date: pendingEmi.interest_due_date
  //     }, { where: { id: loan.id } });

  //     payAmount -= parseFloat(item.emi);

  //   }

  //   if(advance > 0){
  //     loan = await LoanModel.findOne({ where: { id: req.params.id }});
  //     let query = `SELECT SUM(principal_amount) AS total_principal_amount, COUNT(id) AS total_paid FROM loan_details WHERE loan_id = ${loan.id} AND status = 'paid' AND deleted_at IS NULL`;
  //     const paymentObj = await sequelize.query(query, { type: QueryTypes.SELECT });
  //     let total_principal_amount = 0, total_paid = 0;
  //     if(paymentObj.length){
  //       total_principal_amount = paymentObj[0].total_principal_amount;
  //       total_paid = paymentObj[0].total_paid;
  //     }
  //     let amount = parseFloat(loan.loan_amount) - parseFloat(total_principal_amount) - advance;
  //     let total_year = (loan.total_months - total_paid)/12;
  //     let emi = getLoanEMI(loan.interest_display, total_year, amount, 'emi', loan.interest_display_type);
  //     await LoanDetailModel.destroy({ where: {loan_id: loan.id, status: 'pending'} });

  //     let result = await insertLoanEMI(loan, last_month, emi, amount);

  //     await LoanModel.update({
  //       due_amount: parseFloat(loan.due_amount) - parseFloat(advance),
  //       total_paid: parseFloat(loan.total_paid) + parseFloat(advance),
  //       due_date: result.first_due_date,
  //       monthly_emi: emi.toFixed(0)
  //     }, { where: { id: loan.id } });
  //   }

  // }


  /**
   * Start - Client said pay will be normal not like emi
   */
  let loanDetailObj = {
    loan_id: loan.id,
    type: 'payment',
    status: 'paid',
    payment_receive_date: moment().format('YYYY-MM-DD HH:mm:ss'),
    amount: amount,
    payment_mode: data.payment_mode
  }
  await LoanDetailModel.create(loanDetailObj);

  await LoanModel.update({
    due_amount: parseFloat(loan.due_amount) - amount,
    total_paid: parseFloat(loan.total_paid) + amount,
    status: (parseFloat(loan.due_amount) - amount <= 0) ? 'paid' : 'pending'
  }, { where: { id: loan.id } });
  //END

  /**
   * debit amount from wallet
   */
  let payment = await paymentModel.create({
    payment_mode: data.payment_mode,
    amount: amount,
    user_id: loan.user_id,
    payment_by: req.userId,
    payment_date: moment().format('YYYY-MM-DD'),
    //txn_id: data.transaction_no,
    //cheque_no: data.cheque_no,
    status: 'success',
    type: 'debit',
    table_type: 'loan',
    table_id: loan.id,
    payment_belongs: userID,
    purpose: 'loan',
    can_accept: true
  });
  await updateWalletRemainingBalance(userID, payment.id);


  res.send(formatResponse("", "Payment successfully!"));

}

/**
 * Delete Loan
 * 
 * @param {*} req 
 * @param {*} res 
 */
exports.delete = async (req, res) => {
  let currentUserId = await getWorkingUserID(req);
  let loan = await LoanModel.findOne({
    where: { id: req.params.id },
    include: [{ model: UserModel, as: 'investor', required: true, where: { parent_id: currentUserId } }]
  });
  if (!loan) {
    return res.status(errorCodes.default).send(formatErrorResponse('Loan not found.'));
  }
  try {
    const trans = await sequelize.transaction(async (t) => {
      await LoanDetailModel.destroy({ where: { loan_id: req.params.id }, transaction: t });
      await LoanModel.destroy({ where: { id: req.params.id }, transaction: t });
      await paymentModel.destroy({ where: { table_id: req.params.id, table_type: 'loan' }, transaction: t });
      res.send(formatResponse([], "Loan deleted successfully!"));
    });
  } catch (error) {
    return res.status(errorCodes.default).send(formatErrorResponse('Loan does not delete due to some error'));
  }

}

