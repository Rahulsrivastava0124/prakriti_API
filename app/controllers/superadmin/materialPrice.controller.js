const { errorCodes, formatErrorResponse, formatResponse } = require("@utils/response.config");
const db = require("@models");
const {priceFormat, addLog, priceConvertToGram} = require("@helpers/helper");
const {updateOrCreate} = require("@library/common");
const { getPaginationOptions } = require('@helpers/paginator')
const {MaterialPriceCollection} = require("@resources/superadmin/MaterialPriceCollection");
const { Op } = require("sequelize");
const { isEmpty } = require("lodash");
const sequelize = db.sequelize;
const PurityModel = db.purities;
const MaterialModel = db.materials;
const MaterialPricePurityModel = db.material_price_purities;
const MaterialPriceModel = db.material_prices;
const UnitModel = db.units;
const ProductModel = db.products;
const SubCategoryModel = db.sub_categories;
const CategoryModel = db.categories;

/**
 * Retrieve all product categories
 * @param req
 * @param res
 */
exports.index = async (req, res) => {
  let { page, limit, category_id, category_ids, material_id } = req.query;
  //const paginatorOptions = getPaginationOptions(page, limit);
  let conditions = {};
  if(!isEmpty(category_id)){
    conditions.category_id = category_id;
  }
  if(!isEmpty(material_id)){
    conditions.id = material_id;
  }
  if(!isEmpty(category_ids)){
    category_ids = category_ids.toString();
    conditions.category_id = {[Op.in]: category_ids.split(",")};
  }
  MaterialPriceModel.findAndCountAll({ 
    order:[['id', 'DESC']],
    //offset: paginatorOptions.offset,
    //limit: paginatorOptions.limit,
    include: [
      {
        model: MaterialPricePurityModel,
        as: 'materialPricePurities',
        separate: true,
        include: [
          {
            model: PurityModel,
            as: 'purity',
          }
        ]
      },
      {
        model: MaterialModel,
        as: 'material',
        where: conditions,
        include: [
          {
            model: UnitModel,
            as: 'unit',
          },
          {
            model: CategoryModel,
            as: 'category',
          },
          {
            model: PurityModel,
            as: 'purities',
          }
        ]
      }
    ]
  }).then(async (data) => {
    let result = {
      items: await MaterialPriceCollection(data.rows),
      total: data.count,
    }
    res.send(formatResponse(result, 'Price list'));
  })
  .catch(err => {
    res.status(errorCodes.default).send(formatErrorResponse(err));
  });
};


/**
 * Store material price
 * 
 * @param {*} req 
 * @param {*} res 
 */
exports.store = async (req, res) => {
  let data = req.body;

  let haMaterialPrice = await MaterialPriceModel.findOne({ where: { material_id: data.material_id }});
  if(haMaterialPrice){
    return res.status(errorCodes.default).send(formatErrorResponse('Price already setup by this material.'));
  }

  try {
    const trans = await sequelize.transaction(async (t) => {

      let material = await MaterialModel.findOne({
        where: {id: data.material_id},
        include: [
          {
            model: UnitModel,
            as: 'unit',
          }
        ]
      });
      let unit_name = (material && material.unit) ? material.unit.name : '';

      let dataObj = {
        material_id: data.material_id
      }
      let materialPrice = await MaterialPriceModel.create(dataObj, { transaction: t });

      for(let i = 0; i < data.purities.length; i++){
        let thisObj = {
          material_price_id: materialPrice.id,
          purity_id: data.purities[i].purity_id,
          price: priceFormat(data.purities[i].price),
          per_gram_price: priceConvertToGram(unit_name, data.purities[i].mrp),
          admin_discount: priceFormat(data.purities[i].admin_discount),
          distributor_discount: priceFormat(data.purities[i].distributor_discount),
          se_discount: priceFormat(data.purities[i].se_discount),
          retailer_max_discount: priceFormat(data.purities[i].retailer_max_discount),
          customer_discount: priceFormat(data.purities[i].customer_discount),
          increase: priceFormat(data.purities[i].increase),
          mrp: priceFormat(data.purities[i].mrp),
          admin_price: priceFormat(data.purities[i].admin_price),
          distributor_price: priceFormat(data.purities[i].distributor_price),
          se_price: priceFormat(data.purities[i].se_price),
          retailer_max_price: priceFormat(data.purities[i].retailer_max_price),
          customer_price: priceFormat(data.purities[i].customer_price)
        }

        await MaterialPricePurityModel.create(thisObj, { transaction: t });
      }

      res.send(formatResponse([], "Price added successfully!"));

    });
  } catch (error) {
    addLog('err:' + error.toString())
    return res.status(errorCodes.default).send(formatErrorResponse('Price does not added due to some error'));
  }

};


/**
 * View material price
 * 
 * @param {*} req 
 * @param {*} res 
 */
exports.view = async (req, res) => {
  let data = await MaterialPriceModel.findOne({ where: { id: req.params.id },
    include: [
      {
        model: MaterialPricePurityModel,
        as: 'materialPricePurities',
        separate: true,
        include: [
          {
            model: PurityModel,
            as: 'purity',
          }
        ]
      },
      {
        model: MaterialModel,
        as: 'material',
        include: [
          {
            model: UnitModel,
            as: 'unit',
          },
          {
            model: PurityModel,
            as: 'purities',
          }
        ]
      }
    ]
  });
  if (!data) {
    return res.status(errorCodes.default).send(formatErrorResponse('Price not found'));
  }
  res.send(formatResponse(await MaterialPriceCollection(data), "Price details"));
};



/**
 * Update price
 * 
 * @param {*} req 
 * @param {*} res 
 */
exports.update = async (req, res) => {
  let materialPrice = await MaterialPriceModel.findOne({ where: { id: req.params.id } });
  if (!materialPrice) {
    return res.status(errorCodes.default).send(formatErrorResponse('Price not found'));
  }

  let data = req.body;
  try {

    let material = await MaterialModel.findOne({
      where: {id: data.material_id},
      include: [
        {
          model: UnitModel,
          as: 'unit',
        }
      ]
    });
    let unit_name = (material && material.unit) ? material.unit.name : '';


    //const trans = await sequelize.transaction(async (t) => {

      let thisIds = [];
      for(let i = 0; i < data.purities.length; i++){
        let thisObj = {
          material_price_id: materialPrice.id,
          purity_id: data.purities[i].purity_id,
          price: priceFormat(data.purities[i].price),
          per_gram_price: priceConvertToGram(unit_name, data.purities[i].mrp),
          admin_discount: priceFormat(data.purities[i].admin_discount),
          distributor_discount: priceFormat(data.purities[i].distributor_discount),
          se_discount: priceFormat(data.purities[i].se_discount),
          retailer_max_discount: priceFormat(data.purities[i].retailer_max_discount),
          customer_discount: priceFormat(data.purities[i].customer_discount),
          increase: priceFormat(data.purities[i].increase),
          mrp: priceFormat(data.purities[i].mrp),
          admin_price: priceFormat(data.purities[i].admin_price),
          distributor_price: priceFormat(data.purities[i].distributor_price),
          se_price: priceFormat(data.purities[i].se_price),
          retailer_max_price: priceFormat(data.purities[i].retailer_max_price),
          customer_price: priceFormat(data.purities[i].customer_price)
        }
        let whereObj = {
          material_price_id: materialPrice.id,
          purity_id: data.purities[i].purity_id,
          id: data.purities[i].id || 0
        }
        let result = await updateOrCreate(MaterialPricePurityModel, whereObj, thisObj);
        thisIds.push(result.item.id);
      }
      await MaterialPricePurityModel.destroy({ where: { id: {[Op.notIn]: thisIds}, material_price_id: materialPrice.id}});

      res.send(formatResponse([], "Price updated successfully!"));
    //});
  } catch (error) {
    return res.status(errorCodes.default).send(formatErrorResponse('Price does not update due to some error'));
  }
};



  
/**
 * delete price
 * 
 * @param {*} req
 * @param {*} res 
 */
exports.delete = async (req, res) => {
  try {
    const trans = await sequelize.transaction(async (t) => {
      await MaterialPricePurityModel.destroy({ where: { material_price_id: req.params.id}, transaction: t});
      await MaterialPriceModel.destroy({ where: { id: req.params.id}, transaction: t});

      res.send(formatResponse([], "Price deleted successfully!"));
    });
  } catch (error) {
    return res.status(errorCodes.default).send(formatErrorResponse('Price does not delete due to some error'));
  }
};

/**
 * get price info
 * 
 * @param {*} req
 * @param {*} res 
 */
exports.productPriceInfo = async (req, res) => {
  let product = await ProductModel.findOne({ 
    where: { id: req.params.id },
    include: [
      {
        model: SubCategoryModel,
        as: 'sub_category',
      },
      {
        model: MaterialModel,
        as: 'materials',
        include: [
          {
            model: UnitModel,
            as: 'unit',
          }
        ]
      },
    ]
  });
  if (!product) {
    return res.status(errorCodes.default).send(formatErrorResponse('Product not found'));
  }

  let materialPrices = [];
  for(let i = 0; i < product.materials.length; i++){
    let data = await MaterialPriceModel.findOne({ where: { material_id: product.materials[i].id },
      include: [
        {
          model: MaterialPricePurityModel,
          as: 'materialPricePurities',
        },
      ]
    });
    if(data){
      let purities = [];
      for(let x = 0; x < data.materialPricePurities.length; x++){
        let item = data.materialPricePurities[x];
        let discounted_price = item.mrp - (item.mrp * item.admin_discount / 100);
        purities.push({
          purity_id: item.purity_id,
          rate: item.mrp,
          discount: item.admin_discount,
          discounted_price: discounted_price
        })
      }
      materialPrices.push({
        material_id: product.materials[i].id,
        purities: purities
      })
    }
  }

  let data = {
    material_prices: materialPrices,
    making_charge_type: product.sub_category.making_charge_type,
    making_charge: priceFormat(product.sub_category.making_charge),
  };
  res.send(formatResponse(data));
}