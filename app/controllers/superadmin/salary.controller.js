const config = require("@config/auth.config");
const {
  isEmpty,
  getFileAbsulatePath,
  getFileAbsulatePathPDF,
  convertToSlug,
  removeCurrency,
  ucWords,
  getDateFromToWhere,
} = require("@helpers/helper");
const {
  errorCodes,
  formatErrorResponse,
  formatResponse,
} = require("@utils/response.config");
const db = require("@models");
const { Op, QueryTypes, Sequelize } = require("sequelize");
const { getPaginationOptions } = require("@helpers/paginator");
const {
  getWorkingUserID,
  isSuperAdmin,
  updateWalletRemainingBalance,
  haveLeave,
  getRoleId,
  getCustomRoleIds,
  getTotalAbsent,
  getWalletBalance,
  hasWalletFunds,
} = require("@library/common");
const { filter, map } = require("lodash");
const {
  base64FileUpload,
  removeFile,
  filterFilesFromRemove,
} = require("@helpers/upload");
const {
  AttendanceCollection,
} = require("@resources/superadmin/AttendanceCollection");
const { SalaryCollection } = require("@resources/superadmin/SalaryCollection");
const {
  SalaryHistoryCollection,
} = require("@resources/superadmin/SalaryHistoryCollection");
const {
  EmployeeListCollection,
} = require("@resources/superadmin/EmployeeListCollection");
const sequelize = db.sequelize;
const ReasonModel = db.reasons;
const SalaryStructureModel = db.salary_structures;
const RoleModel = db.roles;
const userModel = db.users;
const HolidayModel = db.holidays;
const SalaryModel = db.salaries;
const stateModel = db.states;
const districtModel = db.districts;
const countryModel = db.countries;
const SalaryStructure = db.salary_structures;
const paymentModel = db.payments;
const SaleModel = db.sales;
const dbSequelize = db.sequelize;
const _ = require("lodash");
const moment = require("moment");
const { generatePdf } = require("@helpers/pdf");
const fs = require("fs");
const { priceFormat, displayAmount } = require("../../helpers/helper");

/**
 * Retrieve all salaries
 * @param req
 * @param res
 */
exports.index = async (req, res) => {
  const { month, year, user_id, status, type } = req.query;
  let conditions = {};
  if (!isEmpty(user_id)) {
    conditions.user_id = user_id;
  }
  if (!isEmpty(status)) {
    conditions.status = status;
  }
  if (!isEmpty(type)) {
    conditions.type = type;
  }
  let monthYear = [];
  if (!isEmpty(month)) {
    monthYear.push(
      sequelize.where(
        sequelize.fn("MONTH", sequelize.col("salary_date")),
        month
      )
    );
  }
  if (!isEmpty(year)) {
    monthYear.push(
      sequelize.where(sequelize.fn("YEAR", sequelize.col("salary_date")), year)
    );
  }
  if (monthYear.length) {
    conditions = {
      ...conditions,
      ...{
        [Op.and]: monthYear,
      },
    };
  }

  SalaryModel.findAll({
    where: conditions,
    order: [["id", "DESC"]],
    include: [
      {
        model: userModel,
        as: "user",
        include: [
          {
            model: RoleModel,
            as: "role",
          },
        ],
      },
    ],
  })
    .then(async (data) => {
      let result = {
        items: SalaryCollection(data),
        total: data.length,
      };
      res.send(formatResponse(result, "Salary List"));
    })
    .catch((err) => {
      res.status(errorCodes.default).send(formatErrorResponse(err.toString()));
    });
};

/**
 * Generate all salaries
 *
 * @param req
 * @param res
 */
exports.store = async (req, res) => {
  let isGenerated = false;
  let willGenerate = true; //moment().isSame(moment().startOf('month'), 'day');
  if (willGenerate) {
    //check is salary generated or not
    let month = moment().subtract(1, "months").format("MM");
    let year = moment().subtract(1, "months").format("YYYY");
    let salary = await SalaryModel.findOne({
      where: {
        [Op.and]: [
          sequelize.where(
            sequelize.fn("MONTH", sequelize.col("salary_date")),
            month
          ),
          sequelize.where(
            sequelize.fn("YEAR", sequelize.col("salary_date")),
            year
          ),
        ],
        type: "salary",
      },
    });
    if (!salary) {
      let mangerRoleId = getRoleId("manager");
      let workerRoleId = getRoleId("worker");
      let seRoleId = getRoleId("sales_executive");
      let roleIds = await getCustomRoleIds();
      roleIds.push(mangerRoleId);
      roleIds.push(workerRoleId);
      roleIds.push(seRoleId);

      let users = await userModel.findAll({
        where: { role_id: { [Op.in]: roleIds } },
      });
      let date = `${year}-${month}-01`;
      let work_days = moment(date, "YYYY-MM-DD").daysInMonth();
      for (let i = 0; i < users.length; i++) {
        let salaryStruct = await SalaryStructureModel.findOne({
          where: {
            user_id: users[i].id,
            eff_date: {
              [Op.lte]: date,
            },
          },
          order: [["eff_date", "DESC"]],
        });
        if (!salaryStruct) continue;

        let total_absent = await getTotalAbsent(users[i], month, year);
        let actual_basic = salaryStruct.basic_salary;
        let actual_gross = salaryStruct.gross_salary;
        let is_epf = salaryStruct.is_epf ? true : false;
        let is_medical = salaryStruct.is_medical ? true : false;
        let gross = salaryStruct.gross_salary;

        //wages
        let wages = Math.ceil((gross / work_days) * (work_days - total_absent));
        //basic
        let basic = Math.ceil(
          (actual_basic / work_days) * (work_days - total_absent)
        );
        //hra
        let hra = Math.ceil(
          (basic * parseFloat(salaryStruct.hra_percent)) / 100
        );
        //conv
        let conv = Math.ceil(
          (basic * parseFloat(salaryStruct.conv_percent)) / 100
        );
        //special
        let special = Math.ceil(wages - (basic + conv + hra));
        //epf employee
        let epf_employee = is_epf
          ? Math.ceil(
              (basic * parseFloat(salaryStruct.epf_employee_percent)) / 100
            )
          : 0;
        //epf employeer
        let epf_employer = is_epf
          ? Math.ceil(
              (basic * parseFloat(salaryStruct.epf_employer_percent)) / 100
            )
          : 0;
        //medical employee
        let medical_employee = is_medical
          ? Math.ceil(
              (gross * parseFloat(salaryStruct.medical_employee_percent)) / 100
            )
          : 0;
        //medical employeer
        let medical_employer = is_medical
          ? Math.ceil(
              (gross * parseFloat(salaryStruct.medical_employer_percent)) / 100
            )
          : 0;
        //absent amount
        let absent_amount = Math.ceil((gross / work_days) * total_absent);
        //total
        let total = Math.ceil(gross - absent_amount);
        //ptax
        let ptax = 0;
        if (total >= 10001 && total <= 15000) {
          ptax = 110;
        } else if (total >= 15001 && total <= 25000) {
          ptax = 130;
        } else if (total >= 25001 && total <= 40000) {
          ptax = 150;
        } else if (total >= 40001) {
          ptax = 200;
        }
        //net
        let net = Math.ceil(total - ptax - epf_employee - medical_employee);

        /** START - Calculate incentive */
        let incentive = 0,
          incentive_on = 0;
        let sale_target = salaryStruct.target
          ? parseFloat(salaryStruct.target)
          : 0;
        let incentive_percent =
          salaryStruct.target && parseFloat(salaryStruct.target) > 0
            ? parseFloat(salaryStruct.incentive)
            : 0;

        let sale_achived = await SaleModel.sum("paid_amount", {
          where: {
            is_approved: { [Op.ne]: 2 },
            is_assigned: false,
            is_approval: false,
            sale_by: users[i].id,
            ...getDateFromToWhere(
              moment(date).startOf("month").format("YYYY-MM-DD"),
              moment(date).endOf("month").format("YYYY-MM-DD")
            ),
          },
        });
        sale_achived = sale_achived ? parseFloat(sale_achived) : 0;
        if (
          sale_target > 0 &&
          sale_achived > sale_target &&
          incentive_percent > 0
        ) {
          incentive_on = priceFormat(sale_achived - sale_target);
          incentive = priceFormat((incentive_on * incentive_percent) / 100);
        }
        net = Math.ceil(net + incentive);
        /** END - Calculate incentive */

        //generate salary
        let salary = await SalaryModel.create({
          user_id: users[i].id,
          absent: total_absent,
          work_days: work_days,
          gross: gross,
          wages: wages,
          basic: basic,
          hra: hra,
          conveyance: conv,
          special: special,
          ptax: ptax,
          epf_employee: epf_employee,
          epf_employer: epf_employer,
          medical_employee: medical_employee,
          medical_employer: medical_employer,
          actual_gross: actual_gross,
          actual_basic: actual_basic,
          absent_amount: absent_amount,
          net: net,
          total: total,
          is_epf: is_epf,
          is_medical: is_medical,
          salary_date: date,
          status: "pending",
          incentive: incentive,
          incentive_percent: incentive_percent,
          incentive_on: incentive_on,
          type: "salary",
        });

        await updateSalaryBalance(salary.id, salary.user_id);

        isGenerated = true;
      }
    }
  }

  res.send(formatResponse({ is_generated: isGenerated }));
};

/**
 * Pay salaries
 *
 * @param req
 * @param res
 */
exports.pay = async (req, res) => {
  let data = req.body;

  let salary = await SalaryModel.findOne({ where: { id: data.id } });
  if (!salary) {
    return res.status(errorCodes.default).send(formatErrorResponse());
  }

  let userID = await getWorkingUserID(req);
  let user = await userModel.findOne({ where: { id: salary.user_id } });
  let due_amount = user.due_amount ? parseFloat(user.due_amount) : 0;
  let advance_amount = user.advance_amount
    ? parseFloat(user.advance_amount)
    : 0;
  let amount = parseFloat(data.amount);

  if (!(await hasWalletFunds(userID, data.payment_mode, amount))) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Insufficient wallet balance."));
  }

  let net = parseFloat(salary.net);
  if (amount > net) {
    let extra = priceFormat(amount - net);
    if (extra >= due_amount) {
      due_amount = 0;
      advance_amount = priceFormat(advance_amount + (extra - due_amount));
    } else {
      due_amount = priceFormat(due_amount - extra);
    }
  } else if (amount < net) {
    let less = priceFormat(net - amount);
    if (less >= advance_amount) {
      advance_amount = 0;
      due_amount = priceFormat(due_amount + (less - advance_amount));
    } else {
      advance_amount = priceFormat(advance_amount - less);
    }
  }

  await userModel.update(
    {
      due_amount: due_amount,
      advance_amount: advance_amount,
    },
    { where: { id: salary.user_id } }
  );

  let paid_amount = salary.paid_amount ? parseFloat(salary.paid_amount) : 0;
  paid_amount += parseFloat(data.amount);

  await SalaryModel.update(
    {
      paid_amount: paid_amount,
      payment_mode: data.payment_mode,
      cheque_no: data.cheque_no || null,
      status: paid_amount >= parseFloat(salary.total) ? "paid" : "due",
    },
    { where: { id: data.id } }
  );

  await updateSalaryBalance(salary.id, salary.user_id);

  let newRecords = await SalaryModel.findAll({
    where: { user_id: salary.user_id, id: { [Op.gt]: salary.id } },
  });
  for (let item of newRecords) {
    await updateSalaryBalance(item.id, salary.user_id);
  }

  let salary2 = await SalaryModel.create({
    user_id: salary.user_id,
    net: data.amount,
    total: data.amount,
    salary_date: moment().format("YYYY-MM-DD"),
    status: "paid",
    type: "salary_paid",
  });

  await updateSalaryBalance(salary2.id, salary2.user_id);

  let payment = await paymentModel.create({
    payment_mode: data.payment_mode,
    amount: data.amount,
    user_id: salary.user_id,
    payment_by: req.userId,
    payment_date: moment().format("YYYY-MM-DD"),
    cheque_no: data.cheque_no,
    table_type: "salary",
    table_id: salary.id,
    status: "success", //data.payment_mode == 'cheque' ? 'pending' : 'success',
    type: "debit",
    payment_belongs: userID,
    purpose: "salary paid to emaployee",
    can_accept: true,
  });

  await updateWalletRemainingBalance(userID, payment.id);

  res.send(formatResponse("", "Paid successfully."));
};

/**
 * Employees
 *
 * @param req
 * @param res
 */
exports.employees = async (req, res) => {
  let mangerRoleId = getRoleId("manager");
  let workerRoleId = getRoleId("worker");
  let seRoleId = getRoleId("sales_executive");
  let roleIds = await getCustomRoleIds();
  roleIds.push(mangerRoleId);
  roleIds.push(workerRoleId);
  roleIds.push(seRoleId);

  let users = await userModel.findAll({
    where: { role_id: { [Op.in]: roleIds } },
  });

  res.send(formatResponse(await EmployeeListCollection(users)));
};

/**
 * Advance Pay
 *
 * @param req
 * @param res
 */
exports.advanceStore = async (req, res) => {
  let data = req.body;
  let user = await userModel.findOne({
    attributes: ["advance_amount", "id"],
    where: { id: data.user_id },
  });
  if (user) {
    if (data.payment_type == "advance") {
      let amount = parseFloat(data.amount);
      let advance_amount = user.advance_amount
        ? parseFloat(user.advance_amount)
        : 0;
      advance_amount = priceFormat(advance_amount + amount);
      await userModel.update(
        {
          advance_amount: advance_amount,
        },
        { where: { id: data.user_id } }
      );

      let salary = await SalaryModel.create({
        user_id: data.user_id,
        net: data.amount,
        total: data.amount,
        salary_date: moment().format("YYYY-MM-DD"),
        status: "paid",
        type: "advance",
      });

      await updateSalaryBalance(salary.id, salary.user_id);

      let userID = await getWorkingUserID(req);
      let payment = await paymentModel.create({
        payment_mode: data.payment_mode,
        amount: amount,
        user_id: data.user_id,
        payment_by: req.userId,
        payment_date: moment().format("YYYY-MM-DD"),
        cheque_no: data.cheque_no,
        table_type: "salary",
        table_id: salary.id,
        status: "success", //data.payment_mode == 'cheque' ? 'pending' : 'success',
        type: "debit",
        payment_belongs: userID,
        purpose: "advanced paid to emaployee",
        can_accept: true,
      });

      await updateWalletRemainingBalance(userID, payment.id);
    } else {
      let advance_amount = user.advance_amount
        ? parseFloat(user.advance_amount)
        : 0;
      let amount = parseFloat(data.amount);
      if (amount > advance_amount) {
        return res
          .status(errorCodes.default)
          .send(
            formatErrorResponse(
              "Repayment must be equal or less than due amount"
            )
          );
      }

      advance_amount = priceFormat(advance_amount - amount);
      await userModel.update(
        {
          advance_amount: advance_amount,
        },
        { where: { id: data.user_id } }
      );

      let salary = await SalaryModel.create({
        user_id: data.user_id,
        net: amount,
        total: amount,
        salary_date: moment().format("YYYY-MM-DD"),
        status: "paid",
        type: "repayment",
      });

      await updateSalaryBalance(salary.id, salary.user_id);

      let userID = await getWorkingUserID(req);
      let payment = await paymentModel.create({
        payment_mode: data.payment_mode,
        amount: data.amount,
        user_id: data.user_id,
        payment_by: req.userId,
        payment_date: moment().format("YYYY-MM-DD"),
        cheque_no: data.cheque_no,
        table_type: "salary",
        table_id: salary.id,
        status: "success",
        type: "credit",
        payment_belongs: userID,
        purpose: "repayment from emaployee",
        can_accept: true,
      });

      await updateWalletRemainingBalance(userID, payment.id);
    }
  }

  res.send(
    formatResponse("", ucWords(data.payment_type) + " paid successfully.")
  );
};

/**
 * Hustory
 *
 * @param req
 * @param res
 */
exports.history = async (req, res) => {
  let user = await userModel.findOne({ where: { id: req.params.id } });
  if (!user) {
    return res.status(errorCodes.default).send(formatErrorResponse());
  }

  let historydata = await SalaryModel.findAll({
    order: [["id", "DESC"]],
    where: { user_id: req.params.id },
  });

  let result = {
    name: user.name,
    mobile: user.mobile,
    email: user.email,
    address: user.address,
    advance_amount: displayAmount(user.advance_amount),
    due_amount: displayAmount(user.due_amount),
    history: SalaryHistoryCollection(historydata),
  };

  res.send(formatResponse(result));
};

/**
 * Download Salary
 *
 * @param req
 * @param res
 */
exports.download = async (req, res) => {
  let salary = await SalaryModel.findOne({
    where: { id: req.params.id },
    include: [
      {
        model: userModel,
        as: "user",
        include: [
          {
            model: RoleModel,
            as: "role",
          },
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
      },
    ],
  });
  if (!salary) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Salary not found."));
  }
  let salaryData = SalaryCollection(salary);

  // let html = `<!DOCTYPE html>
  // <html lang="en">
  // <head>
  //     <meta charset="utf-8">
  //     <meta http-equiv="X-UA-Compatible" content="IE=edge">
  //     <meta name="viewport" content="width=device-width, initial-scale=1">
  //     <title>Salary</title>
  //     <style>
  //       thead {
  //         display: table-header-group;
  //       }
  //       tr { page-break-inside: avoid }
  //       tr:nth-child(even) {background-color: #f2f2f2;}
  //       th, td {
  //         text-align: left;
  //         font-size: 14px;
  //       }

  //       th {
  //         line-height: 30px;
  //       }

  //       td {
  //         font-size: 12px;
  //       }
  //       .date-align{
  //         text-align: right;
  //       }
  //       td span.color-code {
  //         width: 20px;
  //         height: 20px;
  //         margin: 0px 7px;
  //         padding: 0px 10px;
  //       }
  //     </style>

  // </head>
  // <body>
  //     <div id="auth">
  //         <div style="font-size: 30px;margin-bottom:20px; font-weight:bold">RATAN VIHAR</div>
  //             <div style="font-size:  16px;margin-bottom:10px">Payslip - ${salaryData.salary_date}</div>
  //         </div>
  //         <table class="table_1" border="1" cellpadding="10" cellspacing="0" width="100%">
  //             <tbody>
  //                 <tr>
  //                     <td style="font-size:  16px"><strong>Name</strong></td>
  //                     <td style="font-size:  16px"><strong>Designation</strong></td>
  //                     <td style="font-size:  16px"><strong>Net (Rs)</strong></td>
  //                     <td style="font-size:  16px"><strong>Days</strong></td>
  //                     <td style="font-size:  16px"><strong>Absent</strong></td>
  //                 </tr>
  //                 <tr>
  //                     <td>${salaryData.user_name}</td>
  //                     <td>${salaryData.role_name}</td>
  //                     <td>${salaryData.net}</td>
  //                     <td>${salaryData.work_days}</td>
  //                     <td>${salaryData.absent}</td>
  //                 </tr>
  //                 <tr>

  //                     <td colspan="2"> <strong style="font-size:  18px">Additions</strong></td>
  //                     <td colspan="3"> <strong style="font-size:  18px">Deductions</strong></td>
  //                 </tr>
  //                 <tr>
  //                     <td style="font-size:  16px"><strong>Description</strong></td>
  //                     <td style="font-size:  16px"><strong>Amount (Rs)</strong></td>
  //                     <td colspan="2" style="font-size:  16px"><strong>Description</strong></td>
  //                     <td style="font-size:  16px"><strong>Amount (Rs)</strong></td>
  //                 </tr>
  //                 <tr>
  //                     <td>Basic</td>
  //                     <td>${salaryData.basic}</td>
  //                     <td colspan="2">Leave without pay </td>
  //                     <td>${salaryData.absent_amount}</td>
  //                 </tr>
  //                 <tr>
  //                     <td>HRA</td>
  //                     <td>${salaryData.hra}</td>
  //                     <td colspan="2">PTAX</td>
  //                     <td>${salaryData.ptax}</td>
  //                 </tr>
  //                 <tr>
  //                     <td>Conveyance</td>
  //                     <td>${salaryData.conveyance}</td>
  //                     <td colspan="2">PF</td>
  //                     <td>${salaryData.epf_employee}</td>
  //                 </tr>
  //                 <tr>
  //                     <td>Special</td>
  //                     <td>${salaryData.special}</td>
  //                     <td colspan="2">Medical</td>
  //                     <td>${salaryData.medical_employee}</td>
  //                 </tr>
  //                 <tr>
  //                     <td><b>Gross</b></td>
  //                     <td>${salaryData.gross}</td>
  //                     <td colspan="2"><b>Total deduction</b></td>
  //                     <td>${salaryData.total_deduction}</td>
  //                 </tr>
  //             </tbody>
  //         </table>
  //     </div>
  // </body>
  // </html>`;

  //     const logoUrl = `public/images/logo.png`;
  //     const bitmap = fs.readFileSync(logoUrl);
  //     const logo = bitmap.toString('base64');
  //     html = `
  //     <!DOCTYPE html>
  // <html lang="en">
  //     <head>
  //         <meta charset="UTF-8">
  //         <meta http-equiv="X-UA-Compatible" content="IE=edge">
  //         <meta name="viewport" content="width=device-width, initial-scale=1.0">
  //         <title>Salary Slip</title>
  //         <link
  //             href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap"
  //             rel="stylesheet">
  //         <style>

  //     </style>
  //     </head>
  //     <body style="box-sizing: border-box; padding: 0px; margin: 0px; font-family:
  //         'Poppins', sans-serif;">
  //         <div class="invoice" style="max-width: 1000px; margin: auto; padding:
  //             15px;
  //             background-color: #f9f9f9;">
  //             <table cellpadding="0" cellspacing="0" width="100%">
  //                 <tbody>
  //                     <tr>
  //                         <td>
  //                             <table cellspacing="0" cellpadding="0" border="0"
  //                                 align="center" width="100%">
  //                                 <h1 style="font-size: 24px; text-align:
  //                                     center;">Salary Slip</h1>
  //                             </table>
  //                             <table cellspacing="0" cellpadding="0" border="0"
  //                                 align="center" width="100%">
  //                                 <div style="display: table; width: 100%;">
  //                                     <div style="width: 65%; display: table-cell;
  //                                         vertical-align: middle;">
  //                                         <img src="data:image/png;base64,${logo}" style="width:
  //                                             160px;">
  //                                         <h3 style="margin: 0; font-weight: 400;
  //                                             font-size: 16px;">Head Office P210
  //                                             Strand Bank Road Brabzar Kolkata 700
  //                                             011</h3>
  //                                         <h3 style="margin: 0; font-weight: 400;
  //                                             font-size: 16px;"> Contact
  //                                             9038377730</h3>
  //                                     </div>
  //                                     <div style="width: 35%; display: table-cell;
  //                                         vertical-align: middle; text-align:
  //                                         right;">
  //                                         <h3 style="margin: 0; font-weight: 400;
  //                                             font-size: 16px;">Payslip - <span style="font-weight: 600;">${salaryData.salary_date}</span>
  //                                         </h3>

  //                                     </div>
  //                                 </div>
  //                             </table>
  //                             <table cellspacing="0" cellpadding="5" border="0"
  //                                 align="center" width="100%">
  //                                 <tbody>
  //                                     <tr>
  //                                         <hr style="border: 1px dashed #ddd">
  //                                     </tr>
  //                                 </tbody>
  //                             </table>
  //                             <table cellspacing="0" cellpadding="5" border="0"
  //                                 align="center" width="100%">
  //                                 <tbody>
  //                                     <tr>
  //                                         <h3 style="margin: 0; font-weight: 400;
  //                                             font-size: 16px;"><strong>${salaryData.user_name}</strong></h3>
  //                                         <h3 style="margin: 0; font-weight: 400;
  //                                             font-size: 16px;">${salaryData.role_name}, ${salaryData.user_mobile}, ${salaryData.user_address}</h3>
  //                                     </tr>
  //                                 </tbody>
  //                             </table>
  //                             <table cellspacing="0" cellpadding="5" border="0"
  //                                 align="center" width="100%">
  //                                 <tbody>
  //                                     <tr>
  //                                         <hr style="border: 1px dashed #ddd">
  //                                     </tr>
  //                                 </tbody>
  //                             </table>
  //                             <table cellspacing="0" cellpadding="5" border="0"
  //                                 align="center" width="100%">
  //                                 <tbody>
  //                                     <tr>
  //                                         <div style="display: table; width: 100%;">
  //                                             <div style="display: table-cell; width: 50%;">
  //                                                 <div style="display: inline-block; gap: 20px;">
  //                                                     <p style="margin: 0;">Basic Salary <span>${salaryData.basic}</span></p>
  //                                                 </div>
  //                                             </div>
  //                                             <div style="display: table-cell; width: 50%; text-align: right;">
  //                                                 <div style="display: inline-block; gap: 20px;">
  //                                                     <p style="margin: 0;"> ${salaryData.work_days} Days= <span>${salaryData.basic}</span></p>
  //                                                 </div>
  //                                             </div>
  //                                         </div>
  //                                     </tr>
  //                                     <tr>
  //                                         <div style="display: table; width: 100%;">
  //                                             <div style="display: table-cell; width: 50%;">
  //                                                 <div style="display: inline-block; gap: 20px;">
  //                                                     <p style="margin: 0;">HRA <span></span></p>
  //                                                 </div>
  //                                             </div>
  //                                             <div style="display: table-cell; width: 50%; text-align: right;">
  //                                                 <div style="display: inline-block; gap: 20px;">
  //                                                     <p style="margin: 0;"> <span>${salaryData.hra}</span></p>
  //                                                 </div>
  //                                             </div>
  //                                         </div>
  //                                     </tr>
  //                                     <tr>
  //                                         <div style="display: table; width: 100%;">
  //                                             <div style="display: table-cell; width: 50%;">
  //                                                 <div style="display: inline-block; gap: 20px;">
  //                                                     <p style="margin: 0;">Conveyance <span></span></p>
  //                                                 </div>
  //                                             </div>
  //                                             <div style="display: table-cell; width: 50%; text-align: right;">
  //                                                 <div style="display: inline-block; gap: 20px;">
  //                                                     <p style="margin: 0;"> <span>${salaryData.conveyance} </span></p>
  //                                                 </div>
  //                                             </div>
  //                                         </div>
  //                                     </tr>
  //                                     <tr>
  //                                         <div style="display: table; width: 100%;">
  //                                             <div style="display: table-cell; width: 50%;">
  //                                                 <div style="display: inline-block; gap: 20px;">
  //                                                     <p style="margin: 0;">Special <span></span></p>
  //                                                 </div>
  //                                             </div>
  //                                             <div style="display: table-cell; width: 50%; text-align: right;">
  //                                                 <div style="display: inline-block; gap: 20px;">
  //                                                     <p style="margin: 0;"> <span> ${salaryData.special}</span></p>
  //                                                 </div>
  //                                             </div>
  //                                         </div>
  //                                     </tr>
  //                                     <tr>
  //                                         <div style="display: table; width: 100%;">
  //                                             <div style="display: table-cell; width: 50%;">
  //                                                 <div style="display: inline-block; gap: 20px;">
  //                                                     <p style="margin: 0;">Gross Salary <span></span></p>
  //                                                 </div>
  //                                             </div>
  //                                             <div style="display: table-cell; width: 50%; text-align: right;">
  //                                                 <div style="display: inline-block; gap: 20px;">
  //                                                     <p style="margin: 0;"> <span> ${salaryData.gross}</span></p>
  //                                                 </div>
  //                                             </div>
  //                                         </div>
  //                                     </tr>
  //                                     <tr>
  //                                         <div style="display: table; width: 100%;">
  //                                             <div style="display: table-cell; width: 50%;">
  //                                                 <div style="display: inline-block; gap: 20px;">
  //                                                     <p style="margin: 0;">Leave without pay <span></span></p>
  //                                                 </div>
  //                                             </div>
  //                                             <div style="display: table-cell; width: 50%; text-align: right;">
  //                                                 <div style="display: inline-block; gap: 20px;">
  //                                                     <p style="margin: 0;"> ${salaryData.absent} Days= <span>${salaryData.absent_amount}</span></p>
  //                                                 </div>
  //                                             </div>
  //                                         </div>
  //                                     </tr>
  //                                     <tr>
  //                                         <div style="display: table; width: 100%;">
  //                                             <div style="display: table-cell; width: 50%;">
  //                                                 <div style="display: inline-block; gap: 20px;">
  //                                                     <p style="margin: 0;">P Tax <span></span></p>
  //                                                 </div>
  //                                             </div>
  //                                             <div style="display: table-cell; width: 50%; text-align: right;">
  //                                                 <div style="display: inline-block; gap: 20px;">
  //                                                     <p style="margin: 0;"><span>${salaryData.ptax}</span></p>
  //                                                 </div>
  //                                             </div>
  //                                         </div>
  //                                     </tr>
  //                                     <tr>
  //                                         <div style="display: table; width: 100%;">
  //                                             <div style="display: table-cell; width: 50%;">
  //                                                 <div style="display: inline-block; gap: 20px;">
  //                                                     <p style="margin: 0;">PF <span></span></p>
  //                                                 </div>
  //                                             </div>
  //                                             <div style="display: table-cell; width: 50%; text-align: right;">
  //                                                 <div style="display: inline-block; gap: 20px;">
  //                                                     <p style="margin: 0;"> <span>${salaryData.epf_employee}</span></p>
  //                                                 </div>
  //                                             </div>
  //                                         </div>
  //                                     </tr>
  //                                     <tr>
  //                                         <div style="display: table; width: 100%;">
  //                                             <div style="display: table-cell; width: 50%;">
  //                                                 <div style="display: inline-block; gap: 20px;">
  //                                                     <p style="margin: 0;">Medical <span></span></p>
  //                                                 </div>
  //                                             </div>
  //                                             <div style="display: table-cell; width: 50%; text-align: right;">
  //                                                 <div style="display: inline-block; gap: 20px;">
  //                                                     <p style="margin: 0;">  <span>${salaryData.medical_employee}</span></p>
  //                                                 </div>
  //                                             </div>
  //                                         </div>
  //                                     </tr>
  //                                     <tr>
  //                                         <div style="display: table; width: 100%;">
  //                                             <div style="display: table-cell; width: 50%;">
  //                                                 <div style="display: inline-block; gap: 20px;">
  //                                                     <p style="margin: 0;">Net Salary For ${salaryData.salary_date} <span></span></p>
  //                                                 </div>
  //                                             </div>
  //                                             <div style="display: table-cell; width: 50%; text-align: right;">
  //                                                 <div style="display: inline-block; gap: 20px;">
  //                                                     <p style="margin: 0;">  <span>${salaryData.net}</span></p>
  //                                                 </div>
  //                                             </div>
  //                                         </div>
  //                                     </tr>
  //                                 </tbody>
  //                             </table>
  //                         </td>
  //                     </tr>

  //                 </tbody>
  //             </table>
  //         </div>
  //     </body>
  // </html>
  //     `;

  const logoUrl = `public/images/logo.png`;
  const bitmap = fs.readFileSync(logoUrl);
  const logo = bitmap.toString("base64");
  let html = `<!DOCTYPE html>
    <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="X-UA-Compatible" content="IE=edge">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Salary Slip</title>
            <link
                href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap"
                rel="stylesheet">
            <style>
    
        </style>
        </head>
        <body style="box-sizing: border-box; padding: 0px; margin: 0px; font-family:
            'Poppins', sans-serif;">
            <div class="s_slip" style="max-width: 1000px; margin: auto; padding:
                15px;
                background-color: #f9f9f9;">
                <table cellpadding="0" cellspacing="0" width="100%">
                    <tbody>
                        <tr>
                            <td>
                                <table cellspacing="0" cellpadding="0" border="0"
                                    align="center" width="100%">
                                    <h1 style="font-size: 24px; text-align:
                                        center;">Salary Slip</h1>
                                </table>
                                <table cellspacing="0" cellpadding="0" border="0"
                                    align="center" width="100%">
                                    <div style="display: table; width: 100%;">
                                        <div style="width: 65%; display: table-cell;
                                            vertical-align: middle;">
                                            <img src="data:image/png;base64,${logo}" style="width:
                                                220px;">
                                            <h3 style="margin: 0; font-weight: 400;
                                                font-size: 16px;">Head Office P210
                                                Strand Bank Road Brabzar Kolkata 700
                                                011</h3>
                                            <h3 style="margin: 0; font-weight: 400;
                                                font-size: 16px;"> <span
                                                    style="font-weight: 600;">GST IN
                                                    19ABAFR4515L1ZZ </span> Contact
                                                9038377730</h3>
                                        </div>
                                        <div style="width: 35%; display: table-cell;
                                            vertical-align: middle; text-align:
                                            right;">
                                            <h3 style="margin: 0; font-weight: 700;
                                                font-size: 16px;">Salary For ${
                                                  salaryData.salary_date
                                                }
                                            </h3>
                                        </div>
                                    </div>
                                </table>
                                <!-- <table cellspacing="0" cellpadding="5" border="0"
                                    align="center" width="100%">
                                    <tbody>
                                        <tr>
                                            <hr style="border: 1px dashed #ddd">
                                        </tr>
                                    </tbody>
                                </table> -->
                                <table cellspacing="0" cellpadding="0" border="0"
                                    align="center" width="100%">
                                    <h1 style="font-size: 20px; text-align:
                                        center; margin-bottom: 8px;">Employee Details</h1>
                                </table>
                                <table cellspacing="0" cellpadding="5" border="1"
                                    align="center" width="100%">
                                    <thead>
                                        <tr style="background-color: #000;">
                                            <th style="text-align: left; color:
                                                #fff;">Employee Name
                                               </th>
                                            <th style="text-align: left; color:
                                                #fff;">Email Id</th>
                                            <th style="text-align: left; color:
                                                #fff;">Cont. Number</th>
                                            <th style="text-align: left; color:
                                                #fff;">City</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr style="background-color: #fff;">
                                            <td style="">
                                                <span> ${
                                                  salaryData.user_name
                                                } </span>
                                            </td>
                                            <td style="">
                                                ${salaryData.user_email}
                                            </td>
                                            <td style="">
                                                ${salaryData.user_mobile}
                                            </td>
                                            <td style="">
                                                ${salaryData.user_city}
                                            </td>
                                        </tr>
                                        <tr style="background-color: #fff;">
                                            <td colspan="3">Address: ${
                                              salaryData.user_address
                                            }</td>
                                            <td colspan="3">Pin Code: ${
                                              salaryData.user_pincode
                                            }</td>
                                        </tr>
    
                                    </tbody>
                                </table>
                                <div style="display: table; width: 100%;">
                                    <div style="display: table-cell; width: 33.33%;">
                                        <h4 style="margin: 6px 0; font-weight: normal;">Basic Salary</h4>
                                    </div>
                                    <div style="display: table-cell; width: 33.33%;">
                                    <h4 style="text-align: center; margin: 6px 0; font-weight: normal;">${
                                      salaryData.work_days
                                    } Days</h4>
                                    </div>
                                    <div style="display: table-cell; width: 15%;">
                                        <h4 style="text-align: right; margin: 6px 0; font-weight: normal;">₹ </h4>
                                    </div>
                                    <div style="display: table-cell; width: 12%;">
                                         <h4 style="text-align: right; margin: 6px 0; font-weight: normal;">${removeCurrency(
                                           salaryData.basic
                                         )}</h4>
                                    </div>
                                </div>
                                <div style="display: table; width: 100%;">
                                    <div style="display: table-cell; width: 33.33%;">
                                    <h4 style="margin: 6px 0; font-weight: normal;">HRA Allowance</h4>
                                    </div>
                                    <div style="display: table-cell; width: 33.33%;">
                                    <h4 style="text-align: center; margin: 6px 0; font-weight: normal;"> </h4>
                                    </div>
                                    <div style="display: table-cell; width: 15%;">
                                        <h4 style="text-align: right; margin: 6px 0; font-weight: normal;">₹ </h4>
                                    </div>
                                    <div style="display: table-cell; width: 12%;">
                                         <h4 style="text-align: right; margin: 6px 0; font-weight: normal;">${removeCurrency(
                                           salaryData.hra
                                         )}</h4>
                                    </div>
                                </div>
                                <div style="display: table; width: 100%;">
                                    <div style="display: table-cell; width: 33.33%;">
                                    <h4 style="margin: 6px 0; font-weight: normal;">Conveyance Allowance</h4>
                                    </div>
                                    <div style="display: table-cell; width: 33.33%;">
                                    <h4 style="text-align: center; margin: 6px 0; font-weight: normal;"> </h4>
                                    </div>
                                    <div style="display: table-cell; width: 15%;">
                                        <h4 style="text-align: right; margin: 6px 0; font-weight: normal;">₹ </h4>
                                    </div>
                                    <div style="display: table-cell; width: 12%;">
                                         <h4 style="text-align: right; margin: 6px 0; font-weight: normal;">${removeCurrency(
                                           salaryData.conveyance
                                         )}</h4>
                                    </div>
                                </div>
                                <div style="display: table; width: 100%;">
                                    <div style="display: table-cell; width: 33.33%;">
                                    <h4 style="margin: 6px 0; font-weight: normal;">Special Allowance</h4>
                                    </div>
                                    <div style="display: table-cell; width: 33.33%;">
                                    <h4 style="text-align: center; margin: 6px 0; font-weight: normal;"></h4>
                                    </div>
                                    <div style="display: table-cell; width: 15%;">
                                        <h4 style="text-align: right; margin: 6px 0; font-weight: normal;">₹ </h4>
                                    </div>
                                    <div style="display: table-cell; width: 12%;">
                                         <h4 style="text-align: right; margin: 6px 0; font-weight: normal;">${removeCurrency(
                                           salaryData.special
                                         )}</h4>
                                    </div>
                                </div>
                                <div style="display: table; width: 100%;">
                                    <div style="display: table-cell; width: 33.33%;">
                                    <h4 style="margin: 6px 0; font-weight: normal;">Leave without pay</h4>
                                    </div>
                                    <div style="display: table-cell; width: 33.33%;">
                                    <h4 style="text-align: center; margin: 6px 0; font-weight: normal;">${
                                      salaryData.absent
                                    } Days</h4>
                                    </div>
                                    <div style="display: table-cell; width: 15%;">
                                        <h4 style="text-align: right; margin: 6px 0; font-weight: normal;">₹ </h4>
                                    </div>
                                    <div style="display: table-cell; width: 12%;">
                                         <h4 style="text-align: right; margin: 6px 0; font-weight: normal;">${removeCurrency(
                                           salaryData.absent_amount
                                         )}</h4>
                                    </div>
                                </div>
                                <div style="display: table; width: 100%;">
                                    <div style="display: table-cell; width: 33.33%;">
                                    <h4 style="margin: 6px 0; font-weight: normal;">P Tax</h4>
                                    </div>
                                    <div style="display: table-cell; width: 33.33%;">
                                    <h4 style="text-align: center; margin: 6px 0; font-weight: normal;">${
                                      salaryData.work_days
                                    } Days</h4>
                                    </div>
                                    <div style="display: table-cell; width: 15%;">
                                        <h4 style="text-align: right; margin: 6px 0; font-weight: normal;">₹ </h4>
                                    </div>
                                    <div style="display: table-cell; width: 12%;">
                                         <h4 style="text-align: right; margin: 6px 0; font-weight: normal;">${removeCurrency(
                                           salaryData.ptax
                                         )}</h4>
                                    </div>
                                </div>
                                <div style="display: table; width: 100%;">
                                    <div style="display: table-cell; width: 33.33%;">
                                    <h4 style="margin: 6px 0; font-weight: normal;">PF</h4>
                                    </div>
                                    <div style="display: table-cell; width: 33.33%;">
                                    <h4 style="text-align: center; margin: 6px 0; font-weight: normal;"></h4>
                                    </div>
                                    <div style="display: table-cell; width: 15%;">
                                        <h4 style="text-align: right; margin: 6px 0; font-weight: normal;">₹ </h4>
                                    </div>
                                    <div style="display: table-cell; width: 12%;">
                                         <h4 style="text-align: right; margin: 6px 0; font-weight: normal;">${removeCurrency(
                                           salaryData.epf_employee
                                         )}</h4>
                                    </div>
                                </div>
                                <div style="display: table; width: 100%;">
                                    <div style="display: table-cell; width: 33.33%;">
                                    <h4 style="margin: 6px 0; font-weight: normal;">Medical Allowance</h4>
                                    </div>
                                    <div style="display: table-cell; width: 33.33%;">
                                    <h4 style="text-align: center; margin: 6px 0; font-weight: normal;"></h4>
                                    </div>
                                    <div style="display: table-cell; width: 15%;">
                                        <h4 style="text-align: right; margin: 6px 0; font-weight: normal;">₹ </h4>
                                    </div>
                                    <div style="display: table-cell; width: 12%;">
                                         <h4 style="text-align: right; margin: 6px 0; font-weight: normal;">${removeCurrency(
                                           salaryData.medical_employee
                                         )}</h4>
                                    </div>
                                </div>
                                <div style="display: table; width: 100%;">
                                    <div style="display: table-cell; width: 33.33%;">
                                    <h4 style="margin: 6px 0; font-weight: normal;">Gross Salary</h4>
                                    </div>
                                    <div style="display: table-cell; width: 33.33%;">
                                    <h4 style="text-align: center; margin: 6px 0; font-weight: normal;"></h4>
                                    </div>
                                    <div style="display: table-cell; width: 15%;">
                                        <h4 style="text-align: right; margin: 6px 0; font-weight: normal;">₹ </h4>
                                    </div>
                                    <div style="display: table-cell; width: 12%;">
                                         <h4 style="text-align: right; margin: 6px 0; font-weight: normal;">${removeCurrency(
                                           salaryData.gross
                                         )}</h4>
                                    </div>
                                </div>
                                <div style="display: table; width: 100%;">
                                    <div style="display: table-cell; width: 33.33%;">
                                    <h4 style="margin: 6px 0; font-weight: normal;">Incentive</h4>
                                    </div>
                                    <div style="display: table-cell; width: 33.33%;">
                                    <h4 style="text-align: center; margin: 6px 0; font-weight: normal;">${
                                      salaryData.incentive_on
                                    } / ${salaryData.incentive_percent}%</h4>
                                    </div>
                                    <div style="display: table-cell; width: 15%;">
                                        <h4 style="text-align: right; margin: 6px 0; font-weight: normal;">₹ </h4>
                                    </div>
                                    <div style="display: table-cell; width: 12%;">
                                         <h4 style="text-align: right; margin: 6px 0; font-weight: normal;">${
                                           salaryData.incentive
                                         }</h4>
                                    </div>
                                </div>
                                <!-- <div style="display: table; width: 100%;">
                                    <div style="display: table-cell; width: 33.33%;">
                                    <h4 style="margin: 6px 0; font-weight: normal;">Advance / Dues</h4>
                                    </div>
                                    <div style="display: table-cell; width: 33.33%;">
                                    <h4 style="text-align: center; margin: 6px 0; font-weight: normal;"></h4>
                                    </div>
                                    <div style="display: table-cell; width: 15%;">
                                        <h4 style="text-align: right; margin: 6px 0; font-weight: normal;">₹ </h4>
                                    </div>
                                    <div style="display: table-cell; width: 12%;">
                                         <h4 style="text-align: right; margin: 6px 0; font-weight: normal;">0.00</h4>
                                    </div>
                                    
    
                                </div> -->
                                <br>
                                    <br>
                                    <br>
                                    <br>
                                    <br>
                                    <div style="display: table; width: 100%;">
                                        <div style="display: table-cell; width: 33.33%;">
                                        <h4 style="margin: 6px 0;">Net Salary For ${
                                          salaryData.salary_date
                                        }</h4>
                                        </div>
                                        <div style="display: table-cell; width: 33.33%;">
                                        <h4 style="text-align: center; margin: 6px 0;"></h4>
                                        </div>
                                        <div style="display: table-cell; width: 15%;">
                                            <h4 style="text-align: right; margin: 6px 0;">₹ </h4>
                                        </div>
                                        <div style="display: table-cell; width: 12%;">
                                             <h4 style="text-align: right; margin: 6px 0;">${removeCurrency(
                                               salaryData.net
                                             )}</h4>
                                        </div>
                                    </div>
                                    <!--<div style="display: table; width: 100%;">
                                        <div style="display: table-cell; width: 33.33%;">
                                        <h4 style="margin: 6px 0;">Paid by ${
                                          salaryData.payment_mode
                                        }</h4>
                                        </div>
                                        <div style="display: table-cell; width: 33.33%;">
                                            <h4 style="text-align: center; margin: 6px 0;">Transaction Id #12363</h4>
                                        </div>
                                        <div style="display: table-cell; width: 15%;">
                                            <h4 style="text-align: right; margin: 6px 0;">₹ </h4>
                                        </div>
                                        <div style="display: table-cell; width: 12%;">
                                             <h4 style="text-align: right; margin: 6px 0;">${removeCurrency(
                                               salaryData.paid_amount
                                             )}</h4>
                                        </div>
                                    </div>-->
                                    <!--<div style="display: table; width: 100%;">
                                        <div style="display: table-cell; width: 33.33%;">
                                        <h4 style="margin: 6px 0;">Rest Amount</h4>
                                        </div>
                                        <div style="display: table-cell; width: 33.33%;">
                                        <h4 style="text-align: center; margin: 6px 0;"></h4>
                                        </div>
                                        <div style="display: table-cell; width: 15%;">
                                            <h4 style="text-align: right; margin: 6px 0;">₹ </h4>
                                        </div>
                                        <div style="display: table-cell; width: 12%;">
                                             <h4 style="text-align: right; margin: 6px 0;">0.00</h4>
                                        </div>
                                    </div>-->
    <!--                          
                                <table cellspacing="0" cellpadding="0" border="0"
                                    align="center" width="100%">
                                    <tbody>
                                        <tr>
                                            <hr style="border: 1px dashed #ddd">
                                        </tr>
                                    </tbody>
                                </table> -->
                                <br>
                                <table cellspacing="0" cellpadding="0" border="0"
                                    align="center" width="100%">
                                    <div style="display: table; width: 100%; border: 1px solid #000;">
                                        <div style="display: table-cell; width:100%; padding: 12px;">
                                            <ul style="margin: 0; padding-left: 20px; line-height: 2;">
                                                <li>Please quote employee codes and company on Loan Appl,LOU,IT inve Proofs , Leave Forms, Querries etc.</li>
                                                <li>Discrepancies if any should be notified in writting to HR Dept. In Head Office within 3 days of receipt of the salary slip ,Falling which will be considered as contents are accepted by you.</li>
                                                <li>This is Computer generated statement hence no signature required.</li>
                                                
                                            </ul>
                                        </div>
                                        
                                        
                                    </div>
                                   
                                </table>
                            </td>
                        </tr>
    
                    </tbody>
                </table>
            </div>
        </body>
    </html>`;

  try {
    let file_name = convertToSlug(
      `${salaryData.user_name}-${salaryData.salary_date}`
    );
    let file_path = "public/salaries/" + file_name + ".pdf";

    const pdfBuffer = await generatePdf(
      { content: html },
      { format: "A4", margin: { top: "0px", right: "0px", bottom: "10mm", left: "0px" }, printBackground: true }
    );
    fs.mkdirSync("public/salaries", { recursive: true });
    fs.writeFileSync(file_path, pdfBuffer);

    res.send(
      formatResponse(
        {
          file_name: file_name + ".pdf",
          url: getFileAbsulatePathPDF(file_path),
        },
        "salary pdf"
      )
    );
  } catch (error) {
    return res.status(errorCodes.default).send(formatErrorResponse());
  }
};

const updateSalaryBalance = async (salary_id, user_id) => {
  let query =
    "SELECT SUM(CASE WHEN (type = 'repayment') THEN net ELSE 0 END) AS total_credit, SUM(CASE WHEN (type != 'repayment') THEN net ELSE 0 END) AS total_debit FROM salaries WHERE status = 'paid' AND user_id = " +
    user_id +
    " AND deleted_at IS NULL AND id <= " +
    salary_id;
  const paymentObj = await dbSequelize.query(query, {
    type: QueryTypes.SELECT,
  });
  let total_debit = 0,
    total_credit = 0;
  if (paymentObj.length) {
    total_debit = parseFloat(paymentObj[0].total_debit);
    total_credit = parseFloat(paymentObj[0].total_credit);
  }
  let balance = priceFormat(total_credit - total_debit);

  await SalaryModel.update(
    {
      balance: balance,
    },
    { where: { id: salary_id } }
  );
};
