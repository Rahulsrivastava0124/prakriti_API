const config = require("@config/auth.config");
const globalConfig = require("@config/global.config.js");
const db = require("@models");
const { Op } = require("sequelize");
const { errorCodes, formatErrorResponse, formatResponse } = require("@utils/response.config");
const { getRoleId, sendEmail, getCustomRoleIds } = require("@library/common");
const { getDateFromToWhere, isEmpty } = require("@helpers/helper");
const { addActivityLog } = require("@library/activityLog");
const {UserCollection} = require("@resources/team/UserCollection");
const {RoleCollection} = require("@resources/team/RoleCollection");
const UserModel = db.users;
const RoleModel = db.roles;
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
  let roleIds = await getRolesIds();
  const user = await UserModel.findOne({
    where: { 
      [Op.or]: [{mobile: req.body.user_name}, {user_name: req.body.user_name}, {email: req.body.user_name}],
      role_id: {[Op.in]: roleIds}
    },
    include: [
     {
      model: RoleModel,
      as: 'role'
     }
    ]
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

  if (! user.status) {
    return res.status(errorCodes.default).send(formatErrorResponse("Your account is currently deactivated."));
  }

  let distributor = getRoleId('distributor');
  if(req.body.step == 1 && user.role_id != distributor){
    return res.send(formatResponse({user: UserCollection(user)}));
  }

  /**
   * The token stays valid only until the next 9:00 AM (IST).
   * If it's already past today's 9 AM, it expires at tomorrow's 9 AM;
   * otherwise it expires at today's 9 AM. After that the token is rejected
   * by authJwt.verifyToken (401) and the user must log in again.
   */
  let tokenExpireAt = moment(
    moment().format(`YYYY-MM-DD ${globalConfig.employee_token_expire_at}`),
    'YYYY-MM-DD HH:mm:ss'
  );
  if (!moment().isBefore(tokenExpireAt)) {
    tokenExpireAt = tokenExpireAt.add(1, 'days');
  }
  let expiresInSeconds = tokenExpireAt.diff(moment(), 'seconds');

  var token = jwt.sign({ id: user.id, role: user.role_id}, config.secret, {
    expiresIn: expiresInSeconds
  });


  //add log
  await addActivityLog({
    ...req.body,
    role: user.role_id,
    user: user.id
  }, 'login')

  if(req.body.step == 2 && user.role_id != distributor){
    let now = moment();
    let from_time = moment(moment().format(`YYYY-MM-DD ${globalConfig.employee_login_from}`));
    if(now.isAfter(from_time)){
      let haveAttendence = await AttendanceModel.findOne({
        where: {...getDateFromToWhere(moment().format('YYYY-MM-DD'), moment().format('YYYY-MM-DD')), user_id: user.id, type: 'login'}
      });
      if(!haveAttendence){
        let to_time = moment(moment().format(`YYYY-MM-DD ${globalConfig.employee_login_to}`));
        let status = now.isBefore(to_time) ? "present" : "absent";
        await AttendanceModel.create({
          user_id: user.id,
          type: 'login',
          address: req.body.address,
          city: req.body.city,
          state: req.body.state,
          country: req.body.country,
          zipcode: req.body.zipcode,
          lat: req.body.lat,
          lng: req.body.lng,
          status: status
        });
      }
    }
  }

  res.send(formatResponse({
    user: UserCollection(user),
    access_token: token,
    expiresOn: tokenExpireAt.toDate().getTime()
  }, "Login successfully!"));

};

/**
 * Logout
 * 
 * @param req
 * @param res
 */
exports.logout = async(req, res) => {
  let distributor = getRoleId('distributor');
  if(req.role != distributor){
    // let conditions = {...getDateFromToWhere(moment().format('YYYY-MM-DD'), moment().format('YYYY-MM-DD')), user_id: req.userId, type: 'logout'};
    // let haveAttendence = await AttendanceModel.findOne({
    //   where: conditions
    // });
    //if(!haveAttendence){
      await AttendanceModel.create({
        user_id: req.userId,
        type: 'logout',
        city: req.body.city,
        state: req.body.state,
        country: req.body.country,
        zipcode: req.body.zipcode,
        lat: req.body.lat,
        lng: req.body.lng,
        status: ''
      })
    //}
  }

  //add log
  await addActivityLog({
   ...req.body,
   role: req.role,
   user: req.userId
 }, 'logout')

 res.send(formatResponse("", "Logout successfully!"));
};


/**
 * Get all team roles
 *
 * @param req
 * @param res
 */
exports.roles = async (req, res) => {
  let condition = {[Op.or]: [{is_custom: true}, {is_custom: false, id: {[Op.in]: [getRoleId('distributor'), getRoleId('sales_executive'), getRoleId('manager'), getRoleId('worker')]}}]};
  let roles = await RoleModel.findAll({where: condition});

  let result = {
    items: RoleCollection(roles),
    total: roles.length,
  }
  res.send(formatResponse(result, "All roles"));
}

/**
 * Forgot Password send otp
 * 
 * @param req
 * @param res
 */
 exports.forgotPasswordSendOtp = async(req, res) => {
  let roleIds = await getRolesIds();
  const user = await UserModel.findOne({
    where: { 
      [Op.or]: [{mobile: req.body.user_name}, {user_name: req.body.user_name}, {email: req.body.user_name}],
      role_id: {[Op.in]: roleIds},
    }
  });

  if (! user) {
    return res.status(errorCodes.default).send(formatErrorResponse("User not found."));
  }
  if(isEmpty(user.email)){
    return res.status(errorCodes.default).send(formatErrorResponse("Email not found."));
  }

  let otp = '0000'; //Math.floor(1000 + Math.random() * 9000);
  /*let message = 'Your reset password otp is: ' + otp;
  let result = await sendEmail({to: user.email, subject: 'Reset Password OTP', message: message});
  if(!result){
    return res.status(errorCodes.default).send(formatErrorResponse(errorCodes.defaultErrorMsg));
  }*/

  await UserModel.update({reset_otp: otp}, { where: { id: user.id } })

  res.send(formatResponse("", "Otp sent successfully!"));

}

/**
 * Forgot Password verify otp
 * 
 * @param req
 * @param res
 */
exports.forgotPasswordVerifyOtp = async(req, res) => {
  let roleIds = await getRolesIds();
  const user = await UserModel.findOne({
    where: { 
      [Op.or]: [{mobile: req.body.user_name}, {user_name: req.body.user_name}, {email: req.body.user_name}],
      role_id: {[Op.in]: roleIds},
      reset_otp: req.body.otp || ''
    }
  });

  if (! user) {
    return res.status(errorCodes.default).send(formatErrorResponse("OTP is invalid."));
  }

  res.send(formatResponse("", "OTP is verified successfully!"));

}

/**
 * Forgot Password update password
 * 
 * @param req
 * @param res
 */
exports.forgotPassword = async(req, res) => {
  let roleIds = await getRolesIds();
  const user = await UserModel.findOne({
    where: { 
      [Op.or]: [{mobile: req.body.user_name}, {user_name: req.body.user_name}, {email: req.body.user_name}],
      role_id: {[Op.in]: roleIds},
      reset_otp: req.body.otp || ''
    }
  });

  if (! user) {
    return res.status(errorCodes.default).send(formatErrorResponse("User not found."));
  }

  if(req.body.new_password != req.body.confirm_new_password){
    return res.status(errorCodes.default).send(formatErrorResponse("Password and confirm password doesn't match"));
  }

  let data = {
    password: bcrypt.hashSync(req.body.new_password, 8)
  }

  UserModel.update(data, { where: { id: user.id } }).then(result => {
    res.send(formatResponse("", 'Password changed successfully!'));
  }).catch(error => {
    return res.status(errorCodes.default).send(formatErrorResponse(errorCodes.defaultErrorMsg));
  });
}

const getRolesIds = async() => {
  let distributor = getRoleId('distributor');
  let sales_executive = getRoleId('sales_executive');
  let manager = getRoleId('manager');
  let worker = getRoleId('worker');
  let ids = await getCustomRoleIds();
  ids.push(distributor);
  ids.push(sales_executive);
  ids.push(manager);
  ids.push(worker);
  return ids;
}