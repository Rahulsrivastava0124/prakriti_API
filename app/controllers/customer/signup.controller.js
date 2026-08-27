const config = require("@config/auth.config");
const db = require("@models");
const { errorCodes, formatErrorResponse, formatResponse } = require("@utils/response.config");
const { getRoleId, updateCartByCookieID } = require("@library/common");
const { addActivityLog } = require("@library/activityLog");
const {UserCollection} = require("@resources/customer/UserCollection");
const userModel = db.users;

var jwt = require("jsonwebtoken");
var bcrypt = require("bcryptjs");

/**
 * sign up user
 *
 * @param req
 * @param res
 */
exports.signup = async (req, res) => {
  let data = req.body;
  let customerRoleId = getRoleId('customer');

  const existing_mobile = await userModel.findOne({where: { mobile: data.mobile, role_id: customerRoleId } });
  if (existing_mobile) {
    return res.status(errorCodes.default).send(formatErrorResponse('Mobile is already exists.'));
  }

  const postData = {
    name: data.name,
    email: data.email || null,
    mobile: data.mobile,
    password: bcrypt.hashSync(data.password, 8),
    role_id: customerRoleId
  };

  userModel.create(postData).then(async(result) => {
    var token = jwt.sign({ id: result.id, role: result.role_id}, config.secret, {
      expiresIn: 86400 * config.login_expire_days
    });

    //update cart from cookie id
    await updateCartByCookieID(data.cookie_id, result.id);

    res.send(formatResponse({user: UserCollection(result), access_token: token}, "Signup successfully!"));
  }).catch(error => { 
    return res.status(errorCodes.default).send(formatErrorResponse(errorCodes.defaultErrorMsg));
  });
};