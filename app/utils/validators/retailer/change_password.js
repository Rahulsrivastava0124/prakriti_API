const validator = require('@helpers/validate');
const { errorCodes, formatValidationResponse } = require("@utils/response.config");


/**
 * Validate change Password
 *
 * @param req
 * @param res
 * @param next
 */
const changePassword = (req, res, next) => {
  const validationRule = {
    "old_password": "required|string|min:4|max:255",
    "new_password": "required|string|min:8|max:255",
    "confirm_password": "required|string|min:8|max:255"
  }
  validator(req.body, validationRule, {}, (err, status) => {
    if (!status) {
      res.status(errorCodes.default).send(formatValidationResponse(err));
    } else {
      next();
    }
  });
}


module.exports = {
  changePassword
}