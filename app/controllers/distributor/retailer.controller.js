const { errorCodes, formatErrorResponse, formatResponse } = require("@utils/response.config");
const { getPaginationOptions } = require('@helpers/paginator');
const { base64FileUpload, removeFile } = require('@helpers/upload');
const { isEmpty } = require("@helpers/helper");
const db = require("@models");
const { Op } = require("sequelize");
const { getRoleId, getUserColumnValue, getMyRetailerIdsForRequest } = require("@library/common");
const {RetailerCollection} = require("@resources/superadmin/RetailerCollection");
const userModel = db.users;
const stateModel = db.states;
const districtModel = db.districts;
const countryModel = db.countries;

var bcrypt = require("bcryptjs");

/**
 * Retrieve all admin
 * @param req
 * @param res
 */
exports.index = async (req, res) => {
  let { page, limit, all, my_retailer } = req.query;
  let district_id = await getUserColumnValue(req.userId, 'district_id');
  let roleId = getRoleId('retailer');

  // Build conditions based on my_retailer parameter
  let conditions = { role_id: roleId };
  
  if (my_retailer == 1) {
    // Show only retailers created by this distributor and their SEs
    const userIds = await getMyRetailerIdsForRequest(req);
    conditions.id = { [Op.in]: userIds || [] };
  } else {
    // Show all retailers in the district
    conditions.district_id = district_id;
  }

  if(all == 1 && my_retailer != 1){
    userModel.findAll({ 
      where: conditions,
      order:[['name', 'ASC']]
    }).then(async (data) => {
      let result = {
        items: await RetailerCollection(data, req),
        total: data.length
      }

      res.send(formatResponse(result, ' distributer------------------All Retailer'));
    })
    .catch(err => {
      res.status(errorCodes.default).send(formatErrorResponse(errorCodes.defaultErrorMsg));
    });
  }else{
    const paginatorOptions = all == 1 ? {} : getPaginationOptions(page, limit);
    userModel.findAndCountAll({ 
      where: conditions,
      order:[['id', 'DESC']],
      ...paginatorOptions,
      include: [
        {
          model: districtModel,
          as: 'district',
        },
        {
          model: stateModel,
          as: 'state',
        },
        {
          model: countryModel,
          as: 'country',
        },
        {
          model: userModel,
          as: 'createdBy',
        }
      ]
    }).then(async (data) => {
      let result = {
        items: await RetailerCollection(data.rows, req),
        total: data.count,
      }

      res.send(formatResponse(result, ' distributer----------------------------All Retailer'));
    })
    .catch(err => { 
      res.status(errorCodes.default).send(formatErrorResponse(errorCodes.defaultErrorMsg));
    });
  }
};
