const config = require("@config/auth.config");
const db = require("@models");
const { Op } = require("sequelize");
const { errorCodes, formatErrorResponse, formatResponse } = require("@utils/response.config");
const { getRoleId } = require("@library/common");
const { getDateFromToWhere } = require("@helpers/helper");
const { addActivityLog } = require("@library/activityLog");
const {UserCollection} = require("@resources/sales_executive/UserCollection");
const UserModel = db.users;
const AttendanceModel = db.attendances;
const moment = require('moment');

var jwt = require("jsonwebtoken");
var bcrypt = require("bcryptjs");

/**
 * sign in user
 *
 * @param req
 * @param res
 */
exports.signin = async (req, res) => {
  let adminRoleId = getRoleId('sales_executive');
  const user = await UserModel.findOne({
    where: { mobile: req.body.mobile,
      role_id: adminRoleId
    }
  });

  if (! user) {
    return res.status(errorCodes.default).send(formatErrorResponse(config.validationMessages.usernameNotFound));
  }
  var passwordIsValid = bcrypt.compareSync(
    req.body.password,
    user.password
  );

  if (! passwordIsValid) {
    return res.status(errorCodes.default).send(formatErrorResponse(config.validationMessages.passwordError));
  }

  var token = jwt.sign({ id: user.id, role: user.role_id}, config.secret, {
    expiresIn: 86400 * config.login_expire_days
  });

  let conditions = {...getDateFromToWhere(moment().format('YYYY-MM-DD'), moment().format('YYYY-MM-DD')), user_id: user.id, type: 'login'};
  let haveAttendence = await AttendanceModel.findOne({
    where: conditions
  });
  if(!haveAttendence){
    let now = moment();
    let max_time = moment(moment().format('YYYY-MM-DD 12:00:00'));
    let status = now.isAfter(max_time) ? "absent" : "present";
    await AttendanceModel.create({
      user_id: user.id,
      type: 'login',
      city: req.body.city,
      state: req.body.state,
      country: req.body.country,
      zipcode: req.body.zipcode,
      lat: req.body.lat,
      lng: req.body.lng,
      status: status
    })
  }

  //add log
  await addActivityLog({
    ...req.body,
    role: user.role_id,
    user: user.id
  }, 'login')

  res.send(formatResponse({
    user: UserCollection(user),
    access_token: token
  }, "Login successfully!"));


};

/**
 * Logout
 * 
 * @param req
 * @param res
 */
exports.logout = async(req, res) => {

   //add log
   await addActivityLog({
    ...req.body,
    role: req.role,
    user: req.userId
  }, 'logout')

  res.send(formatResponse("", "Logout successfully!"));
};