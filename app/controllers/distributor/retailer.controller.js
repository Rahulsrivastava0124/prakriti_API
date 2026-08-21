const { errorCodes, formatErrorResponse, formatResponse } = require("@utils/response.config");
const { getPaginationOptions } = require('@helpers/paginator');
const { base64FileUpload, removeFile } = require('@helpers/upload');
const { isEmpty } = require("@helpers/helper");
const db = require("@models");
const { Op } = require("sequelize");
const { getRoleId, getUserColumnValue } = require("@library/common");
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
  let { page, limit, all } = req.query;
  let district_id = await getUserColumnValue(req.userId, 'district_id');
  let roleId = getRoleId('retailer');

  if(all == 1){
    userModel.findAll({ 
      where: { role_id: roleId, district_id: district_id },
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
    const paginatorOptions = getPaginationOptions(page, limit);
    userModel.findAndCountAll({ 
      where: { role_id: roleId, district_id: district_id },
      order:[['id', 'DESC']],
      offset: paginatorOptions.offset,
      limit: paginatorOptions.limit,
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
