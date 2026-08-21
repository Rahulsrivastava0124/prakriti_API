const validator = require('@helpers/validate');
const { errorCodes, formatValidationResponse } = require("@utils/response.config");


/**
 * Validate Signup
 *
 * @param req
 * @param res
 * @param next
 */
const signup = (req, res, next) => {
  const validationRule = {
    "name": "required|string|max:255",
    //"password": "required|string|max:255",
    //"email": "required|email|string|max:255",
    "mobile": "required|integer|digits:10",
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
  signup
}