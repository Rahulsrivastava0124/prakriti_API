const config = require("@config/auth.config");
const { errorCodes, formatErrorResponse, formatResponse } = require("@utils/response.config");
const db = require("@models");
const { Op } = require("sequelize");
const { getPaginationOptions } = require('@helpers/paginator')
const {SaleCartCollection} = require("@resources/admin/SaleCartCollection");
const cartsModel = db.carts;
const { isEmpty, convertUnitToGram } = require("@helpers/helper");
const cartMaterialsModel =db.cart_materials;
const materialModel =db.materials
const UnitModel = db.units;
const productModel = db.products
const sizeModel = db.sizes
const stockModel = db.stocks
const TaxSlabModel = db.tax_slabs;
const productMaterialModel = db.product_materials;
const PurityModel = db.purities;
const SubCategoryModel = db.sub_categories;
const CategoryModel = db.categories;
const SaleModel = db.sales;

/**
 * Retrieve all Cart
 * @param req
 * @param res
 */
exports.index = async (req, res) => {
  let { page, limit, all } = req.query;
  let conditions = {user_id: req.userId, type: 'sale'};
  const paginatorOptions = getPaginationOptions(page, limit);
  cartsModel.findAndCountAll({ 
  order:[['id', 'ASC']],
  where: conditions,
  //offset: paginatorOptions.offset,
  //limit: paginatorOptions.limit,
  include: [
    {
      model: cartMaterialsModel,
      as: 'cartMaterial',
      include:[
        {
          model: materialModel,
          as:'material'
        },
        {
          model: UnitModel,
          as:'unit'
        },
        {
          model: PurityModel,
          as:'purity'
        }
      ]
    },
    {
      model: productModel,
      as: 'product',
      required: true,
      include: [
        {
          model: TaxSlabModel,
          as: 'tax'
        },
        {
          model: CategoryModel,
          as: 'category'
        },
        {
          model: SubCategoryModel,
          as: 'sub_category'
        },
      ]
    },
    {
      model: sizeModel,
      as: 'size'
    },
    {
      model: stockModel,
      as: 'stock',
      required: true
    }
  ]
}).then(async (data) => {
  let sale = await SaleModel.findOne({order:[['id', 'DESC']]});
  let next_invoice = 'RV-S-' + (sale ? (sale.id + 1) : 1);
  let result = {
    items: await SaleCartCollection(data.rows),
    total: data.rows.length,
    next_invoice: next_invoice
  }
  res.send(formatResponse(result, 'carts'));
})
.catch(err => {
  res.status(errorCodes.default).send(formatErrorResponse(err));
});
}

/**
 * Create Cart
 * 
 * @param {*} req 
 * @param {*} res 
 */
exports.store = async (req, res) => {
  let data = req.body;

  // Check for duplicate certificate number if provided
  if (!isEmpty(data.certificate_no)) {
    // Check if certificate already exists in current user's cart
    let existingCartWithCert = await cartsModel.findOne({
      where: {
        user_id: req.userId,
        certificate_no: data.certificate_no,
        type: 'sale'
      }
    });

    if (existingCartWithCert) {
      return res.status(errorCodes.default).send(formatErrorResponse("Certificate number " + data.certificate_no + " already exists in cart."));
    }

    // Check if certificate exists in stocks
    let existingStock = await stockModel.findOne({
      where: {
        certificate_no: data.certificate_no,
        user_id: req.userId
      }
    });

    if (existingStock) {
      return res.status(errorCodes.default).send(formatErrorResponse("Certificate number " + data.certificate_no + " already exists in stocks."));
    }
  }

  // Check if cart item already exists with same stock, product, and size
  let existingCart = await cartsModel.findOne({
    where: {
      user_id: req.userId,
      stock_id: data.stock_id,
      product_id: data.product_id,
      size_id: data.size_id || null,
      type: 'sale'
    }
  });

  if (existingCart) {
    // Update existing cart quantity
    let newQuantity = (existingCart.quantity || 0) + (data.quantity || 1);
    await cartsModel.update(
      { quantity: newQuantity },
      { where: { id: existingCart.id } }
    );
    return res.send(formatResponse([], "Cart updated successfully."));
  }

  let cart = await cartsModel.create({
    user_id: req.userId,
    stock_id: data.stock_id,
    product_id: data.product_id,
    size_id: data.size_id || null,
    quantity: data.quantity || null,
    total_weight: data.total_weight || null,
    certificate_no: data.certificate_no || null,
    type: 'sale'
  });
  
  for(let x = 0; x < data.materials.length; x++){
    let material = data.materials[x];
    await cartMaterialsModel.create({
      cart_id: cart.id,
      material_id: material.material_id,
      purity_id: material.purity_id,
      weight: material.weight,
      unit_id: material.unit_id,
      quantity: material.quantity
    });
  }

  res.send(formatResponse([], "Product added to cart successfully."));

}

    
 /**
 * Remove Cart
 * 
 * @param {*} req 
 * @param {*} res 
 */
exports.delete = async (req, res) => {
  await cartsModel.destroy({ where: { id: req.params.id, user_id: req.userId, type: 'sale'} });
  await cartMaterialsModel.destroy({ where: { cart_id: req.params.id} });

  res.send(formatResponse([], "Product removed from cart successfully."));

};

/**
 * Hold sale cart items
 * POST /admin/sale-carts/hold
 * Body: { cart_ids: [1,2,3], message: 'reason' }
 */
exports.hold = async (req, res) => {
  try {
    const { cart_ids, message } = req.body;
    if (!cart_ids || !cart_ids.length) {
      return res.status(errorCodes.default).send(formatErrorResponse('No cart items provided.'));
    }
    await cartsModel.update(
      { is_held: true, hold_message: message || '' },
      { where: { id: { [Op.in]: cart_ids }, user_id: req.userId, type: 'sale' } }
    );
    res.send(formatResponse([], 'Items held successfully.'));
  } catch (err) {
    res.status(errorCodes.default).send(formatErrorResponse(err));
  }
};

/**
 * Unhold a sale cart item
 * POST /admin/sale-carts/unhold/:id
 */
exports.unhold = async (req, res) => {
  try {
    await cartsModel.update(
      { is_held: false, hold_message: null },
      { where: { id: req.params.id, user_id: req.userId, type: 'sale' } }
    );
    res.send(formatResponse([], 'Item released from hold.'));
  } catch (err) {
    res.status(errorCodes.default).send(formatErrorResponse(err));
  }
};




