const config = require("@config/auth.config");
const { errorCodes, formatErrorResponse, formatResponse } = require("@utils/response.config");
const db = require("@models");
const { Op } = require("sequelize");
const { getPaginationOptions } = require('@helpers/paginator')
const {StocksCollection} = require("@resources/superadmin/StocksCollection");
const {getTotalStockPriceByUser} = require("@library/common");
const stocksModel = db.stocks;
const { isEmpty, priceFormat } = require("@helpers/helper");
const productsModel = db.products;
const sizesModel= db.sizes;
const stock_materialsModel =db.stock_materials;
const materialModel =db.materials
const UnitModel = db.units;
const PurityModel = db.purities;
const TaxSlabModel = db.tax_slabs;
const SubCategoryModel = db.sub_categories;
const CategoryModel = db.categories;
const CertificateModel = db.certificates;

/**
 * Retrieve all Unit
 * @param req
 * @param res
 */
exports.index = async (req, res) => {
  let { page, limit, all, search, total_weight } = req.query;
  let conditions = {user_id: req.userId};
  /* prefix match so "3.3" finds 3.310, "3.310" finds exactly that weight */
  if (!isEmpty(total_weight)) {
    conditions.total_weight = { [Op.like]: `${String(total_weight).trim()}%` };
  }
  if (!isEmpty(search)) {
    const s = String(search).trim();
    conditions[Op.or] = [
      { "$product.name$": { [Op.like]: `%${s}%` } },
      { "$product.product_code$": { [Op.like]: `%${s}%` } },
      { certificate_no: s },
    ];
  }
  const paginatorOptions = getPaginationOptions(page, limit);
  stocksModel.findAndCountAll({ 
    order:[['id', 'DESC']],
    where: conditions,
    distinct: true,
    offset: paginatorOptions.offset,
    limit: paginatorOptions.limit,
    include: [
      {
        model: productsModel,
        as: 'product',
        required: !isEmpty(search),
        include: [
          {
            model: CategoryModel,
            as: 'category'
          },
          {
            model: SubCategoryModel,
            as: 'sub_category'
          },
          {
            model: CertificateModel,
            as: 'certificates',
          }
        ]
      },
      {
        model:sizesModel,
        as: 'size'
      },
      {
        model: stock_materialsModel,
        as: 'stockMaterials',
        include:[
          {
            model: materialModel,
            as:'material'
          },
          {
            model:UnitModel,
            as: 'unit'
          },
          {
            model:PurityModel,
            as: 'purity'
          }
        ]
      }
      ]
  }).then(async (data) => {
    let result = {
      items: await StocksCollection(data.rows, req.userId),
      total: data.count,
    }
    res.send(formatResponse(result, 'stocks'));
  })
  .catch(err => {
    res.status(errorCodes.default).send(formatErrorResponse(err));
  });
}

/**
 * View Stock
 * 
 * @param {*} req 
 * @param {*} res 
 */
exports.view = async (req, res) => {
  let stock = await stocksModel.findOne({
    where: {user_id: req.userId, id: req.params.id},
    include: [
      {
        model: productsModel,
        as: 'product',
        include: [
          {
            model: CategoryModel,
            as: 'category'
          },
          {
            model: SubCategoryModel,
            as: 'sub_category'
          },
          {
            model: CertificateModel,
            as: 'certificates',
          }
        ]
      },
      {
        model:sizesModel,
        as: 'size'
      },
      {
        model: stock_materialsModel,
        as: 'stockMaterials',
        include:[
          {
            model: materialModel,
            as:'material'
          },
          {
            model:UnitModel,
            as: 'unit'
          },
          {
            model:PurityModel,
            as: 'purity'
          }
        ]
      },
      
    ]
  });

  if (!stock) {
    return res.status(errorCodes.default).send(formatErrorResponse('Stock not found'));
  }
  res.send(formatResponse(await StocksCollection(stock, req.userId), "Stock details"));

}


/**
 * Retrieve all products for sale
 * @param req
 * @param res
 */
exports.stockProducts = async (req, res) => {
  let { sub_category_id } = req.query;
  if(isEmpty(sub_category_id)){
    return res.send(formatResponse([], 'Stock Products'));
  }
  let stocks = await stocksModel.findAll({
    where: {user_id: req.userId},
    group: ['product_id'],
    include: [
      {
        model: productsModel,
        as: 'product',
        where: {sub_category_id: sub_category_id},
        include: [
          {
            model: TaxSlabModel,
            as: 'tax'
          }
        ]
      }
    ]
  });
  let products = [];
  for(let i = 0; i < stocks.length; i++){
    let stock = stocks[i];
    if(!isEmpty(stock.product)){
      let taxInfo = null;
      if('tax' in stock.product && stock.product.tax){
        taxInfo = {
          name: stock.product.tax.name,
          cgst: parseFloat(stock.product.tax.cgst),
          sgst: parseFloat(stock.product.tax.sgst),
          igst: parseFloat(stock.product.tax.igst),
        }
      }

      products.push({
        name: stock.product.name,
        id: stock.product.id,
        type: stock.product.type,
        tax_info: taxInfo
      });
    }

  }

  res.send(formatResponse(products, 'Stock Products'));


}

/**
 * Retrieve stock product details
 * @param req
 * @param res
 */
exports.stockProductDetails = async (req, res) => {
  let stocks = await stocksModel.findAll({
    where: {user_id: req.userId, product_id: req.query.product_id},
    include: [
      {
        model: productsModel,
        as: 'product'
      },
      {
        model:sizesModel,
        as: 'size'
      },
      {
        model: stock_materialsModel,
        as: 'stockMaterials',
        include:[
          {
            model: materialModel,
            as:'material'
          },
          {
            model:UnitModel,
            as: 'unit'
          },
          {
            model:PurityModel,
            as: 'purity'
          }
        ]
      },
      
    ]
  });

  let products = [];
  for(let i = 0; i < stocks.length; i++){
    let stock = stocks[i];
    if(!isEmpty(stock.product)){
      let thisObj = {
        stock_id: stock.id,
        product_name: stock.product.name,
        product_type: stock.product.type,
        product_id: stock.product.id,
        size_id: stock.size_id,
        size_name: stock.size ? stock.size.name : '',
        certificate_no: stock.certificate_no
      }
      let materials = [];
      for(let x = 0; x < stock.stockMaterials.length; x++){
        let stockM = stock.stockMaterials[x];
        let thisMObj = {
          material_id: stockM.material_id,
          weight: stockM.weight,
          quantity: stockM.quantity,
          material_name: stockM.material ? stockM.material.name : '',
          unit_id: stockM.unit_id,
          unit_name: (stockM.unit) ? stockM.unit.name : '',
          purity: stockM.purity ? stockM.purity.name : '',
          purity_id: stockM.purity_id
        }
        materials.push(thisMObj);
      }
      thisObj.materials = materials;
      products.push(thisObj);
    }

  }

  res.send(formatResponse(products, 'Stock product details'));
}

/**
 * Check duplicate certidicate no
 * @param req
 * @param res
 */
exports.checkDuplicateCertificateNo = async (req, res) => {
  let data = req.body;
  if(isEmpty(data.certificate_no)){
    return res.send(formatResponse({is_exist: false}));
  }

  let stock = await stocksModel.findOne({where: {certificate_no: data.certificate_no, user_id: req.userId}});
  let is_exist = stock ? true : false;
  return res.send(formatResponse({is_exist: is_exist}));

}

/**
 * Get category wise stock amount
 * @param req
 * @param res
 */
exports.getStockPriceByCategory = async (req, res) => {
  let result = await getTotalStockPriceByUser(true, req.userId);

  return res.send(formatResponse(result));
}
