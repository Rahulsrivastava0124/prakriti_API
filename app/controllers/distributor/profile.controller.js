
const config = require("@config/auth.config");
const db = require("@models");
const { Op } = require("sequelize");
const { errorCodes, formatErrorResponse, formatResponse } = require("@utils/response.config");
const { getRoleId, emailExists, normalizeEmail } = require("@library/common");
const { addActivityLog } = require("@library/activityLog");
const { validateNewPassword, changePasswordAndNotify } = require("@library/passwordChange");
const {UserCollection} = require("@resources/distributor/UserCollection");
const UserModel = db.users;

var jwt = require("jsonwebtoken");
var bcrypt = require("bcryptjs");

/**
 * Change Password
 * 
 * @param {*} req
 * @param {*} res
 */
exports.editProfile = async(req, res) => {
    let data = req.body;
    let roleId = getRoleId('distributor');

    const existing_mobile = await UserModel.findOne({where: { role_id: roleId, mobile: data.mobile, id: {[Op.ne]: req.userId } } });
    if (existing_mobile) {
      return res.status(errorCodes.default).send(formatErrorResponse('User already exists'));
    }

    /* email doubles as a login identifier, so it must stay unique across every role */
    if (await emailExists(data.email, req.userId)) {
      return res.status(errorCodes.default).send(formatErrorResponse('This email is already exists.'));
    }

    const postData = {
      name: data.name,
      email: normalizeEmail(data.email),
      mobile: data.mobile
    };

    UserModel.update(postData, { where: { id: req.userId } }).then(result => {
        res.send(formatResponse(null, 'Profile updated successfully!'));
    }).catch(error => {
        return res.status(errorCodes.default).send(formatErrorResponse('Profile does not updated due to some error' ));
    });

}


/**
 * Change Password
 * 
 * @param {*} req
 * @param {*} res
 */
exports.changePassword = async(req, res) => {
    let user = await UserModel.findOne({where: {id: req.userId}});
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
      UserModel: UserModel,
      user: user,
      newPassword: req.body.password,
      accountLabel: "Prakriti admin",
    });

    if (! result.ok) {
      return res.status(errorCodes.default).send(formatErrorResponse(result.message));
    }

    return res.send(formatResponse(null, 'Password changed successfully!'));
};