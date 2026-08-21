const { formatResponse } = require("@utils/response.config");
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

    res.send(formatResponse(UserCollection(user), "Dashboard"));
}