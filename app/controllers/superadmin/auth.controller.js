const config = require("@config/auth.config");
const db = require("@models");
const { Op } = require("sequelize");
const { errorCodes, formatErrorResponse, formatResponse } = require("@utils/response.config");
const { getRoleId, sendEmail } = require("@library/common");
const {
  generateRawToken,
  hashToken,
  buildResetUrl,
  sendPasswordResetEmail,
  RESET_TOKEN_EXPIRES_MINUTES,
} = require("@library/passwordReset");
const { isEmpty, addLog } = require("@helpers/helper");
const { addActivityLog } = require("@library/activityLog");
const {UserCollection} = require("@resources/superadmin/UserCollection");
const UserModel = db.users;

var jwt = require("jsonwebtoken");
var bcrypt = require("bcryptjs");

/**
 * sign in user
 *
 * @param req
 * @param res
 */
exports.signin = async (req, res) => {
  try {
    
  
  let adminRoleId = getRoleId('superadmin');
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
} catch (error) {
  return res.status(errorCodes.default).send(formatErrorResponse(error.toString()));
}

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

/**
 * Forgot Password send otp
 * 
 * @param req
 * @param res
 */
exports.forgotPasswordSendOtp = async(req, res) => {
  let roleId = getRoleId('superadmin');
  const user = await UserModel.findOne({
    where: { 
      mobile: req.body.user_name,
      role_id: roleId
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
  let result = await sendEmail({to: 'abhiram.webappssol@gmail.com', subject: 'Reset password otp', message: message});
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
  let roleId = getRoleId('superadmin');
  const user = await UserModel.findOne({
    where: { 
      mobile: req.body.user_name,
      role_id: roleId,
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
  let roleId = getRoleId('superadmin');
  const user = await UserModel.findOne({
    where: { 
      mobile: req.body.user_name,
      role_id: roleId,
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

/**
 * Forgot Password — send a reset link to the registered email (link-based flow)
 *
 * @param req
 * @param res
 */
exports.forgotPasswordSendLink = async(req, res) => {
  try {
    let roleId = getRoleId('superadmin');
    let email = (req.body.email || '').toString().toLowerCase().trim();

    if (isEmpty(email)) {
      return res.status(errorCodes.default).send(formatErrorResponse("Email is required."));
    }

    const user = await UserModel.findOne({ where: { email, role_id: roleId } });

    // Only proceed for a real user with an email, but always return the same
    // generic response so we never reveal whether an account exists. Log the
    // no-match case though: without it a typo'd/unregistered address is
    // indistinguishable from a broken mail server — both answer "sent".
    if (!user || isEmpty(user.email)) {
      addLog(`forgot-password (superadmin): no account with a registered email matches "${email}" — no mail sent`);
    }

    if (user && !isEmpty(user.email)) {
      let rawToken = generateRawToken();
      let expiry = new Date(Date.now() + RESET_TOKEN_EXPIRES_MINUTES * 60 * 1000);

      await UserModel.update(
        { reset_token: hashToken(rawToken), reset_token_expiry: expiry },
        { where: { id: user.id } }
      );

      let resetUrl = buildResetUrl('superadmin', rawToken, user.email);

      try {
        await sendPasswordResetEmail({
          to: user.email,
          name: user.name,
          resetUrl,
          expiresMinutes: RESET_TOKEN_EXPIRES_MINUTES,
        });
      } catch (mailErr) {
        addLog(`forgot-password (superadmin): sending to ${user.email} failed — ${mailErr}`);
        // Roll back the token so a failed send doesn't leave a dangling token.
        await UserModel.update(
          { reset_token: null, reset_token_expiry: null },
          { where: { id: user.id } }
        );
        return res.status(errorCodes.default).send(formatErrorResponse("Could not send the reset email. Please try again later."));
      }
    }

    return res.send(formatResponse("", "Reset password link has been successfully sent."));
  } catch (error) {
    return res.status(errorCodes.default).send(formatErrorResponse(error.toString()));
  }
}

/**
 * Reset Password — set a new password using the emailed token
 *
 * @param req
 * @param res
 */
exports.resetPassword = async(req, res) => {
  try {
    let roleId = getRoleId('superadmin');
    let email = (req.body.email || '').toString().toLowerCase().trim();
    let { token, new_password, confirm_new_password } = req.body;

    if (isEmpty(email) || isEmpty(token) || isEmpty(new_password) || isEmpty(confirm_new_password)) {
      return res.status(errorCodes.default).send(formatErrorResponse("All fields are required."));
    }
    if (new_password.length < 8) {
      return res.status(errorCodes.default).send(formatErrorResponse("Password must be at least 8 characters."));
    }
    if (new_password != confirm_new_password) {
      return res.status(errorCodes.default).send(formatErrorResponse("Password and confirm password doesn't match"));
    }

    const user = await UserModel.findOne({
      where: {
        email,
        role_id: roleId,
        reset_token: hashToken(token),
        reset_token_expiry: { [Op.gt]: new Date() },
      }
    });

    if (!user) {
      return res.status(errorCodes.default).send(formatErrorResponse("This password reset link is invalid or has expired. Please request a new one."));
    }

    await UserModel.update(
      {
        password: bcrypt.hashSync(new_password, 8),
        reset_token: null,
        reset_token_expiry: null,
      },
      { where: { id: user.id } }
    );

    return res.send(formatResponse("", "Your password has been reset. You can now log in with your new password."));
  } catch (error) {
    return res.status(errorCodes.default).send(formatErrorResponse(error.toString()));
  }
}