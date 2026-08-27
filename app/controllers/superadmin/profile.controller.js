
const config = require("@config/auth.config");
const db = require("@models");
const { Op } = require("sequelize");
const { errorCodes, formatErrorResponse, formatResponse } = require("@utils/response.config");
const { getRoleId } = require("@library/common");
const { addActivityLog } = require("@library/activityLog");
const { validateNewPassword, changePasswordAndNotify } = require("@library/passwordChange");
const {UserCollection} = require("@resources/superadmin/UserCollection");
const UserModel = db.users;
const orderProductModel = db.order_products;
const cartModel = db.carts;

var jwt = require("jsonwebtoken");
var bcrypt = require("bcryptjs");

/**
 * Get Profile
 * 
 * @param {*} req
 * @param {*} res
 */
exports.index = async(req, res) => {
  let user = await UserModel.findByPk(req.userId)
  res.send(formatResponse(UserCollection(user)));
}

/**
 * Update Profile
 * 
 * @param {*} req
 * @param {*} res
 */
exports.editProfile = async(req, res) => {
    let data = req.body;
    let roleId = getRoleId('superadmin');

    const existing_mobile = await UserModel.findOne({where: { role_id: roleId, mobile: data.mobile, id: {[Op.ne]: req.userId } } });
    if (existing_mobile) {
      return res.status(errorCodes.default).send(formatErrorResponse('User already exists'));
    }

    const existing_gst = await UserModel.findOne({where: { role_id: roleId, gst: data.gst, id: {[Op.ne]: req.userId } } });
    if (existing_gst) {
      return res.status(errorCodes.default).send(formatErrorResponse('User GST no. already exists'));
    }

    const postData = {
      name: data.name,
      email: data.email || null,
      mobile: data.mobile,
      gst: data.gst
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