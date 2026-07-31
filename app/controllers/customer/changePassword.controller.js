const config = require("@config/auth.config");
const { errorCodes, formatErrorResponse, formatResponse } = require("@utils/response.config");
const { getPaginationOptions } = require('@helpers/paginator');
const { isEmpty } = require("@helpers/helper");
const db = require("@models");
const { Op } = require("sequelize");
const { getRoleId } = require("@library/common");
const { validateNewPassword, changePasswordAndNotify } = require("@library/passwordChange");
const userModel = db.users;

var bcrypt = require("bcryptjs");


/**
 * Change Password
 * 
 * @param {*} req 
 * @param {*} res 
 */
 exports.changePassword = async (req, res) => {
    let data = req.body;
    let customer = await userModel.findOne({ where: { id: req.userId } });
    if (!customer) {
      return res.status(errorCodes.default).send(formatErrorResponse('Customer not found'));
    }

    var passwordIsValid = bcrypt.compareSync(
      data.old_password,
      customer.password
    );
  
    if (! passwordIsValid) {
      return res.status(errorCodes.default).send(formatErrorResponse("Current password does not matched."));
    }

    let invalid = validateNewPassword(data.new_password, data.confirm_password);
    if (invalid) {
      return res.status(errorCodes.default).send(formatErrorResponse(invalid));
    }

    let result = await changePasswordAndNotify({
      UserModel: userModel,
      user: customer,
      newPassword: data.new_password,
      accountLabel: "Prakriti",
    });

    if (! result.ok) {
      return res.status(errorCodes.default).send(formatErrorResponse(result.message));
    }

    return res.send(formatResponse([], "Password updated successfully!"));
};

