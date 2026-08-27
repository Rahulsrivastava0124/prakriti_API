const config = require("@config/auth.config");
const {
  isEmpty,
  getDateFromToWhere,
  isWeeklyHoliday,
} = require("@helpers/helper");
const {
  errorCodes,
  formatErrorResponse,
  formatResponse,
} = require("@utils/response.config");
const db = require("@models");
const { Op } = require("sequelize");
const { getPaginationOptions } = require("@helpers/paginator");
const {
  getWorkingUserID,
  isSuperAdmin,
  updateWalletRemainingBalance,
  haveLeave,
  getWalletBalance,
  isDistributor,
  getUserColumnValue,
  sendNotification,
} = require("@library/common");
const { filter, map } = require("lodash");
const {
  base64FileUpload,
  removeFile,
  filterFilesFromRemove,
} = require("@helpers/upload");
const {
  ExpenseCollection,
} = require("@resources/superadmin/ExpenseCollection");
const {
  AttendanceCollection,
} = require("@resources/superadmin/AttendanceCollection");
const {
  AttendanceDetailCollection,
} = require("@resources/superadmin/AttendanceDetailCollection");
const {
  HolidayCollection,
} = require("@resources/superadmin/HolidayCollection");
const sequelize = db.sequelize;
const ReasonModel = db.reasons;
const ExpenseModel = db.expenses;
const AttendanceModel = db.attendances;
const userModel = db.users;
const HolidayModel = db.holidays;
const PaymentModel = db.payments;
const _ = require("lodash");
const moment = require("moment");
const { isSalesExecutive } = require("../../library/common");

/**
 * Retrieve all Expenses
 * @param req
 * @param res
 */
exports.index = async (req, res) => {
  let { page, limit, reason_id, search, from_date, to_date, user_id, type } =
    req.query;
  let userID = await getWorkingUserID(req);
  let conditions = {};
  if (!isSuperAdmin(req) && !isDistributor(req)) {
    conditions = { user_id: userID };
  }
  if (!isEmpty(search)) {
    conditions = {
      ...conditions,
      [Op.or]: [
        { description: { [Op.like]: "%" + search + "%" } },
        { amount: { [Op.like]: "%" + search + "%" } },
      ],
    };
  }
  if (!isEmpty(reason_id)) {
    conditions.reason_id = reason_id;
  }
  if (!isEmpty(user_id)) {
    conditions.user_id = user_id;
  }
  if (!isEmpty(type)) {
    conditions.type = type;
  }

  if (!isEmpty(from_date) && !isEmpty(to_date)) {
    from_date = moment(from_date).format("YYYY-MM-DD");
    to_date = moment(to_date).format("YYYY-MM-DD");
    conditions.date = { [Op.between]: [from_date, to_date] };
  }

  const paginatorOptions = getPaginationOptions(page, limit);
  ExpenseModel.findAndCountAll({
    order: [["id", "DESC"]],
    offset: paginatorOptions.offset,
    limit: paginatorOptions.limit,
    where: conditions,
    include: [
      {
        model: ReasonModel,
        as: "reason",
      },
      {
        model: userModel,
        as: "user",
      },
    ],
  }).then(async (data) => {
    let have_action = true;
    if (isDistributor(req)) {
      have_action = await getUserColumnValue(req.userId, "expense_action");
    }
    let wallet_balance =
      isSuperAdmin(req) || isDistributor(req)
        ? 0
        : await getWalletBalance(userID, null, "expense");
    if ((isSuperAdmin(req) || isDistributor(req)) && !isEmpty(user_id)) {
      wallet_balance = await getWalletBalance(user_id, null, "expense");
    }

    let result = {
      items: ExpenseCollection(data.rows, req, userID),
      total: data.count,
      wallet_balance: wallet_balance,
      have_action: have_action,
    };
    res.send(formatResponse(result, "Expense fetched successfully!"));
  });
};

/**
 * Create Expense
 *
 * @param {*} req
 * @param {*} res
 */
exports.store = async (req, res) => {
  let data = req.body;
  let userID = await getWorkingUserID(req);

  if (!isSuperAdmin(req) && !isDistributor(req)) {
    let wallet_balance = await getWalletBalance(userID, null, "expense");
    if (parseFloat(data.amount) > wallet_balance) {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse("Insufficient wallet balance."));
    }
  } else {
    let wallet_balance = await getWalletBalance(userID, data.payment_mode);
    if (parseFloat(data.amount) > wallet_balance) {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse("Insufficient wallet balance."));
    }
  }

  let expenseStatus = "pending";
  if ((isSuperAdmin(req) || isDistributor(req)) && isEmpty(data.user_id)) {
    expenseStatus = "Accepted";
  }

  let type = "";
  if ((isSuperAdmin(req) || isDistributor(req)) && !isEmpty(data.user_id)) {
    type = "issue";
  } else {
    type = "expense";
  }

  let postData = {
    user_id: isEmpty(data.user_id) ? userID : data.user_id,
    created_by: userID,
    date: !isEmpty(data.date)
      ? moment(data.date, "MM/DD/YYYY").format("YYYY-MM-DD")
      : "",
    reason_id: !isEmpty(data.reason_id) ? data.reason_id : null,
    description: !isEmpty(data.description) ? data.description : null,
    amount: !isEmpty(data.amount) ? data.amount : 0,
    explanation: !isEmpty(data.explanation) ? data.explanation : "",
    bill_image: "",
    status: expenseStatus,
    type: type,
  };

  if (!isEmpty(data.bill_image)) {
    let uploaded_bill_image = await base64FileUpload(
      data.bill_image,
      "expenses"
    );
    if (uploaded_bill_image) {
      postData.bill_image = uploaded_bill_image.path;
    }
  }

  const expense = await ExpenseModel.create(postData);

  if (!isEmpty(data.user_id) || isSalesExecutive(req)) {
    sendNotification("expense", req, {
      expense: expense,
      status: expense.status,
    });
  }

  /**
   * if superadmin then credit to user wallet & debit from superadmi wallet, else debit from user wallet
   */
  let reason = await ReasonModel.findOne({ where: { id: expense.reason_id } });
  let purpose = reason ? reason.name : "daily expense";
  if (isSuperAdmin(req) || isDistributor(req)) {
    let payment = await PaymentModel.create({
      user_id: isEmpty(data.user_id) ? userID : data.user_id,
      payment_by: userID,
      amount: expense.amount,
      payment_mode: data.payment_mode,
      table_type: "expenses",
      table_id: expense.id,
      remaining_balance: 0,
      notes: expense.description,
      status: "success",
      payment_date: moment().format("YYYY-MM-DD"),
      payment_belongs: userID,
      type: "debit",
      purpose: purpose,
    });
    await updateWalletRemainingBalance(userID, payment.id);
    if (!isEmpty(data.user_id)) {
      let payment2 = await PaymentModel.create({
        user_id: userID,
        payment_by: userID,
        amount: expense.amount,
        payment_mode: data.payment_mode,
        table_type: "expenses",
        table_id: expense.id,
        remaining_balance: 0,
        notes: expense.description,
        status: "pending",
        payment_date: moment().format("YYYY-MM-DD"),
        payment_belongs: data.user_id,
        type: "credit",
        purpose: purpose,
        payment_type: "expense",
      });
      await updateWalletRemainingBalance(data.user_id, payment2.id, "expense");
    }
  } else {
    let payment = await PaymentModel.create({
      user_id: userID,
      payment_by: userID,
      amount: expense.amount,
      payment_mode: data.payment_mode,
      table_type: "expenses",
      table_id: expense.id,
      remaining_balance: 0,
      notes: expense.description,
      status: "success",
      payment_date: moment().format("YYYY-MM-DD"),
      payment_belongs: userID,
      type: "debit",
      purpose: purpose,
      payment_type: "expense",
    });
    await updateWalletRemainingBalance(userID, payment.id, "expense");
  }

  res.send(formatResponse([], "Expense created successfully!"));
};

/**
 * View Expense
 *
 * @param {*} req
 * @param {*} res
 */
exports.fetch = async (req, res) => {
  let expense = await ExpenseModel.findOne({
    where: { id: req.params.id },
    include: [
      {
        model: ReasonModel,
        as: "reason",
      },
    ],
  });
  if (!expense) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Expense not found"));
  }
  res.send(
    formatResponse(
      ExpenseCollection(expense, req),
      "Expense fetched successfully!"
    )
  );
};

/**
 * Update Expense
 *
 * @param {*} req
 * @param {*} res
 */
exports.update = async (req, res) => {
  let data = req.body;
  let expense = await ExpenseModel.findOne({ where: { id: req.params.id } });
  if (!expense) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Expense not found"));
  }

  let userID = await getWorkingUserID(req);

  if (!isSuperAdmin(req) && !isDistributor(req)) {
    let wallet_balance = await getWalletBalance(userID, null, "expense");
    let moreAmt = parseFloat(data.amount) - parseFloat(expense.amount);
    if (moreAmt > 0 && moreAmt > wallet_balance) {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse("Insufficient wallet balance."));
    }
  }

  let postData = {
    user_id: isEmpty(data.user_id) ? userID : data.user_id,
    date: !isEmpty(data.date)
      ? moment(data.date, "MM/DD/YYYY").format("YYYY-MM-DD")
      : "",
    reason_id: !isEmpty(data.reason_id) ? data.reason_id : null,
    description: !isEmpty(data.description) ? data.description : null,
    amount: !isEmpty(data.amount) ? data.amount : null,
    explanation: !isEmpty(data.explanation) ? data.explanation : "",
  };

  if (!isEmpty(data.bill_image)) {
    if (!isEmpty(expense.bill_image)) {
      removeFile(expense.bill_image);
    }
    let uploaded_bill_image = await base64FileUpload(
      data.bill_image,
      "expenses"
    );
    if (uploaded_bill_image) {
      postData.bill_image = uploaded_bill_image.path;
    }
  }

  await ExpenseModel.update(postData, { where: { id: req.params.id } });

  /**
   * if superadmin then credit to user wallet & debit from superadmi wallet, else debit from user wallet
   */
  await PaymentModel.destroy({
    where: { table_type: "expenses", table_id: expense.id },
  });
  let reason = await ReasonModel.findOne({ where: { id: expense.reason_id } });
  let purpose = reason ? reason.name : "daily expense";
  let amount = postData.amount;
  if (isSuperAdmin(req) || isDistributor(req)) {
    let payment = await PaymentModel.create({
      user_id: isEmpty(data.user_id) ? userID : data.user_id,
      payment_by: userID,
      amount: amount,
      payment_mode: "cash",
      table_type: "expenses",
      table_id: expense.id,
      remaining_balance: 0,
      notes: expense.description,
      status: "success",
      payment_date: moment().format("YYYY-MM-DD"),
      payment_belongs: userID,
      type: "debit",
      purpose: purpose,
    });
    await updateWalletRemainingBalance(userID, payment.id);
    if (!isEmpty(data.user_id)) {
      let payment2 = await PaymentModel.create({
        user_id: userID,
        payment_by: userID,
        amount: amount,
        payment_mode: "cash",
        table_type: "expenses",
        table_id: expense.id,
        remaining_balance: 0,
        notes: expense.description,
        status: "success",
        payment_date: moment().format("YYYY-MM-DD"),
        payment_belongs: data.user_id,
        type: "credit",
        purpose: purpose,
        payment_type: "expense",
      });
      await updateWalletRemainingBalance(data.user_id, payment2.id, "expense");
    }
  } else {
    let payment = await PaymentModel.create({
      user_id: userID,
      payment_by: userID,
      amount: amount,
      payment_mode: "cash",
      table_type: "expenses",
      table_id: expense.id,
      remaining_balance: 0,
      notes: expense.description,
      status: "success",
      payment_date: moment().format("YYYY-MM-DD"),
      payment_belongs: userID,
      type: "debit",
      purpose: purpose,
      payment_type: "expense",
    });
    await updateWalletRemainingBalance(userID, payment.id, "expense");
  }

  res.send(formatResponse([], "Expense updated successfully!"));
};

/**
 * Update Expense Status
 *
 * @param {*} req
 * @param {*} res
 */
exports.statusUpdate = async (req, res) => {
  let expense = await ExpenseModel.findOne({ where: { id: req.params.id } });
  if (!expense) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Expense not found"));
  }

  if (req.body.status == "declined") {
    await PaymentModel.destroy({
      where: { table_type: "expenses", table_id: expense.id },
    });
  } else {
    let pendingPayments = await PaymentModel.findAll({
      where: {
        table_type: "expenses",
        table_id: expense.id,
        status: "pending",
      },
    });
    for (let i = 0; i < pendingPayments.length; i++) {
      await PaymentModel.update(
        { status: "success" },
        { where: { id: pendingPayments[i].id } }
      );
      await updateWalletRemainingBalance(
        pendingPayments[i].payment_belongs,
        pendingPayments[i].id,
        pendingPayments[i].payment_type
      );
    }
  }
  await ExpenseModel.update(
    { status: req.body.status },
    { where: { id: req.params.id } }
  );

  sendNotification("expense", req, {
    expense: expense,
    status: req.body.status,
  });

  res.send(formatResponse([], "Updated successfully!"));
};

/**
 * delete Expense
 *
 * @param {*} req
 * @param {*} res
 */
exports.delete = async (req, res) => {
  let expense = await ExpenseModel.findOne({ where: { id: req.params.id } });
  if (!expense) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Expense not found"));
  }
  try {
    const trans = await sequelize.transaction(async (t) => {
      await ExpenseModel.destroy({
        where: { id: req.params.id },
        transaction: t,
      });
      if (!isEmpty(expense.bill_image)) {
        removeFile(expense.bill_image);
      }
      await PaymentModel.destroy({
        where: { table_type: "expenses", table_id: expense.id },
        transaction: t,
      });
      res.send(formatResponse([], "Expense deleted successfully!"));
    });
  } catch (error) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Expense does not delete due to some error"));
  }
};

/**
 * View Attendance List
 *
 * @param {*} req
 * @param {*} res
 */
exports.attendanceList = async (req, res) => {
  let { user_id, month, year } = req.query;
  let conditions = { type: "login" };
  let attendance = {
    present: 0,
    absent: 0,
    days: [],
  };
  let user = await userModel.findOne({ where: { id: user_id } });

  if (
    !isEmpty(month) &&
    !isEmpty(year) &&
    !isEmpty(user_id) &&
    !isEmpty(user)
  ) {
    let current_month = month < 10 ? "0" + month : month;
    let last_day = moment(year + "-" + month, "YYYY-MM").daysInMonth();
    let first_date = moment().format(year + "-" + current_month + "-01");
    //let end_date = moment().format(year + "-" + current_month + "-") + last_day;
    let next_month = current_month < 12 ? parseInt(current_month) + 1 : 1;
    let formatted_next_month = next_month < 10 ? "0" + next_month : next_month;
    let next_year = month > next_month ? parseInt(year) + 1 : year;
    let end_date =
      moment().format(next_year + "-" + formatted_next_month + "-") + "01";

    conditions.created_at = { [Op.between]: [first_date, end_date] };
    conditions.user_id = user_id;
    conditions.status = "present";

    //let present = await AttendanceModel.count({ where: conditions });
    //attendance.present = present;

    conditions.status = "absent";
    let absent = await AttendanceModel.count({ where: conditions });
    attendance.absent = absent;

    conditions = {
      created_at: { [Op.between]: [first_date, end_date] },
      user_id: user_id,
      [Op.or]: [{ status: "present" }, { status: "absent" }],
    };

    let all_attendances = await AttendanceModel.findAll({ where: conditions });
    let attendance_arr = AttendanceCollection(all_attendances);
    let total_absent = 0;
    let total_present = 0;

    let holidays = await HolidayModel.findAll({
      where: { date: { [Op.between]: [first_date, end_date] } },
    });
    holidays = HolidayCollection(holidays);

    //if(attendance_arr.length > 0){
    for (let i = 1; i <= last_day; i++) {
      let j = i < 10 ? "0" + i : i;
      let current_date = moment(year + "-" + current_month + "-" + j);
      let status_arr = map(
        filter(attendance_arr, { date: current_date.format("YYYY-MM-DD") }),
        "status"
      );
      let main_status = !isEmpty(status_arr) ? status_arr[0] : "";
      let status = !isEmpty(status_arr) ? status_arr[0] : "";
      if (isEmpty(status)) {
        if (
          current_date.isAfter(moment(user.createdAt)) &&
          !current_date.isAfter(moment())
        ) {
          status = "absent";
        }
      }
      if (status == "absent" || isEmpty(status)) {
        let index = _.findIndex(
          holidays,
          (i) => i.date_display == current_date.format("DD/MM/YYYY")
        );
        let leave = await haveLeave(user.id, current_date.format("YYYY-MM-DD"));
        if (
          !leave &&
          (moment(current_date).isSame(moment().format("YYYY-MM-DD"), "day") ||
            moment(current_date).isBefore(moment().format("YYYY-MM-DD"))) &&
          (isWeeklyHoliday(
            current_date.format("YYYY-MM-DD"),
            user.weekly_holidays
          ) ||
            index != -1)
        ) {
          status = "present";
        }
      }

      if (status == "absent") {
        total_absent++;
      } else if (status == "present") {
        total_present++;
      }
      attendance.days.push({
        status: status,
        date: current_date.format("YYYY-MM-DD"),
      });
      /*if(!isEmpty(status_arr)){
          attendance.days.push(status_arr[0]);
        }*/
    }
    //}
    attendance.absent = total_absent;
    attendance.present = total_present;
  }
  res.send(formatResponse(attendance, "Attendances fetched successfully!"));
};

/**
 * Fetch Attendance Details
 *
 * @param {*} req
 * @param {*} res
 */
exports.attendanceFetch = async (req, res) => {
  let { user_id, date } = req.query;

  if (!isEmpty(user_id) && !isEmpty(date)) {
    let conditions = { user_id: user_id };
    conditions = { ...conditions, ...getDateFromToWhere(date, date) };

    let attendance = await AttendanceModel.findOne({
      where: conditions,
      include: [
        {
          model: userModel,
          as: "user",
          required: true,
        },
      ],
    });
    if (!attendance) {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse("Attendance not found"));
    }
    res.send(
      formatResponse(
        await AttendanceDetailCollection(attendance),
        "Attendance fetched successfully!"
      )
    );
  } else {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Attendance not found"));
  }
};

/**
 * Update Expense
 *
 * @param {*} req
 * @param {*} res
 */
exports.attendanceUpdate = async (req, res) => {
  let data = req.body;
  let attendance = await AttendanceModel.findOne({
    where: { id: req.params.id },
  });
  if (!attendance) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Attendance not found"));
  }

  try {
    const trans = await sequelize.transaction(async (t) => {
      let postData = {
        status: attendance.status == "absent" ? "present" : "absent",
      };

      await AttendanceModel.update(postData, {
        where: { id: req.params.id },
        transaction: t,
      });
      res.send(formatResponse([], "Attendance updated successfully!"));
    });
  } catch (error) {
    return res
      .status(errorCodes.default)
      .send(
        formatErrorResponse(
          "Attendance does not updated due to some error" + error
        )
      );
  }
};

/**
 * Attendance Data List
 *
 * @param {*} req
 * @param {*} res
 */
exports.attendanceDataList = async (req, res) => {
  let { page, limit, user_id } = req.query;
  const paginatorOptions = getPaginationOptions(page, limit);
  AttendanceModel.findAndCountAll({
    order: [["id", "DESC"]],
    offset: paginatorOptions.offset,
    limit: paginatorOptions.limit,
    where: { user_id: user_id },
  }).then(async (data) => {
    let result = {
      items: AttendanceCollection(data.rows),
      total: data.count,
    };
    res.send(formatResponse(result));
  });
};
