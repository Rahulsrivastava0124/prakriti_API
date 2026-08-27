const {
  errorCodes,
  formatErrorResponse,
  formatResponse,
} = require("@utils/response.config");
const { getPaginationOptions } = require("@helpers/paginator");
const {
  validateNewPassword,
  changePasswordAndNotify,
} = require("@library/passwordChange");
const {
  isEmpty,
  getFileAbsulatePath,
  defaultProfileImage,
  getDateFromToWhere,
  isWeeklyHoliday,
} = require("@helpers/helper");
const { base64FileUpload, removeFile } = require("@helpers/upload");
const db = require("@models");
const moment = require("moment");
const { Op } = require("sequelize");
const { filter, map } = require("lodash");
const { getRoleId, haveLeave, emailExists, normalizeEmail } = require("@library/common");
const { UserCollection } = require("@resources/sales_executive/UserCollection");
const {
  AttendanceCollection,
} = require("@resources/superadmin/AttendanceCollection");
const {
  HolidayCollection,
} = require("@resources/superadmin/HolidayCollection");
const userModel = db.users;
const AttendanceModel = db.attendances;
const HolidayModel = db.holidays;
const _ = require("lodash");

var jwt = require("jsonwebtoken");
var bcrypt = require("bcryptjs");

/**
 * Change Password
 *
 * @param {*} req
 * @param {*} res
 */
exports.editProfile = async (req, res) => {
  let data = req.body;

  const existing_mobile = await userModel.findOne({
    where: { mobile: data.mobile, id: { [Op.ne]: req.userId } },
  });
  if (existing_mobile) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("User already exists"));
  }

  /* email doubles as a login identifier, so it must stay unique across every role */
  if (await emailExists(data.email, req.userId)) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("This email is already exists."));
  }

  const postData = {
    name: data.name,
    email: normalizeEmail(data.email),
    mobile: data.mobile,
  };

  userModel
    .update(postData, { where: { id: req.userId } })
    .then((result) => {
      res.send(formatResponse(null, "Profile updated successfully!"));
    })
    .catch((error) => {
      return res
        .status(errorCodes.default)
        .send(
          formatErrorResponse("Profile does not updated due to some error")
        );
    });
};

/**
 * Change Password
 *
 * @param {*} req
 * @param {*} res
 */
exports.changePassword = async (req, res) => {
  let user = await userModel.findOne({ where: { id: req.userId } });
  if (!user) {
    res.status(errorCodes.default).send(formatErrorResponse(err));
    return;
  }

  /*var passwordIsValid = bcrypt.compareSync(
    req.body.old_password,
    user.password
  );

  if (! passwordIsValid) {
    return res.status(errorCodes.default).send(formatErrorResponse("Current password does not matched."));
  }*/

  let invalid = validateNewPassword(req.body.password, req.body.confirm_password);
  if (invalid) {
    return res.status(errorCodes.default).send(formatErrorResponse(invalid));
  }

  let result = await changePasswordAndNotify({
    UserModel: userModel,
    user: user,
    newPassword: req.body.password,
    accountLabel: "Prakriti",
  });

  if (!result.ok) {
    return res.status(errorCodes.default).send(formatErrorResponse(result.message));
  }

  return res.send(formatResponse(null, "Password changed successfully!"));
};

/**
 * View Attendance
 *
 * @param {*} req
 * @param {*} res
 */
exports.attendance = async (req, res) => {
  let { month, year } = req.query;
  let conditions = { type: "login" };
  let attendance = {
    present: 0,
    absent: 0,
    days: [],
  };
  let user_id = req.userId;
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
 * Update Attendance
 *
 * @param {*} req
 * @param {*} res
 */
exports.attendanceUpdate = async (req, res) => {
  let data = req.body;
  let conditions = {
    ...getDateFromToWhere(data.date, data.date),
    user_id: req.userId,
    type: "login",
  };
  let attendence = await AttendanceModel.findOne({
    where: conditions,
  });
  if (!attendence) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Attendence not found."));
  }

  let image = attendence.image;
  if (!isEmpty(data.image)) {
    removeFile(attendence.image);
    let result2 = await base64FileUpload(data.image, "attendence");
    if (result2) {
      image = result2.path;
    }
  }

  let postData = {
    late_reason: data.explanation,
    image: image,
  };

  AttendanceModel.update(postData, { where: { id: attendence.id } })
    .then((result) => {
      res.send(formatResponse(null, "Updated successfully!"));
    })
    .catch((error) => {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse(errorCodes.defaultErrorMsg));
    });
};
