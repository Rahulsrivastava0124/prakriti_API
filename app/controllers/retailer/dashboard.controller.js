const { formatResponse, formatErrorResponse } = require("@utils/response.config");
const {UserCollection} = require("@resources/retailer/UserCollection");
const db = require("@models");
const UserModel = db.users;

/**
 * Customer Dashboard
 *
 * @param req
 * @param res
 */
exports.index = async (req, res) => {
    const user = await UserModel.findOne({
        where: { id: req.userId
        }
    });

    // A token outlives the user it names (login_expire_days is 365). Without this,
    // UserCollection(null) throws, nothing catches it, and the request hangs open
    // forever instead of returning.
    if (!user) {
        return res.status(404).send(formatErrorResponse("User not found"));
    }

    res.send(formatResponse(UserCollection(user), "Dashboard"));
}