const config = require("@config/auth.config");
const { errorCodes, formatErrorResponse, formatResponse } = require("@utils/response.config");
const db = require("@models");
const { Op, QueryTypes } = require("sequelize");
const sequelize = db.sequelize;
const { getPaginationOptions } = require('@helpers/paginator')
const {CartCollection} = require("@resources/superadmin/CartCollection");
const cartsModel = db.carts;
const { isEmpty, convertUnitToGram, arrayColumn } = require("@helpers/helper");
const { getWorkingUserID, isManager } = require("@library/common");
const { findIndex } = require("lodash");
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
const SaleProductModel = db.sale_products;

/**
 * Retrieve all Cart
 * @param req
 * @param res
 */
exports.index = async (req, res) => {
  let { page, limit, all, order_id, current_price } = req.query;
  let superAdminId = isManager(req) ? req.userId : await getWorkingUserID(req);
  let conditions = {user_id: superAdminId, type: 'sale'};
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
      separate: true,
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
      //required: true
    }
  ]
}).then(async (data) => {
  let sale = await SaleModel.findOne({order:[['id', 'DESC']]});
  let next_invoice = 'RV-S-' + (sale ? (sale.id + 1) : 1);
  let result = {
    items: await CartCollection(data.rows, req),
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

  let product = await productModel.findOne({where: {id: data.product_id}});
  if(!product){
    return res.status(errorCodes.default).send(formatErrorResponse('Product not found.'));
  }
  let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
  compactLog("cart store data:", data && data.product_id ? `product_id=${data.product_id}` : (data && typeof data === 'object' ? `keys=${Object.keys(data).length}` : typeof data));
  let stock = await stockModel.findOne({where: {id: data.stock_id, user_id: userID}});
  if(product.type == "material" || isEmpty(stock.certificate_no)){
    
    let query = "SELECT SUM(quantity) as total_quantity FROM carts WHERE stock_id = " + data.stock_id + " AND deleted_at IS NULL";
    const cart = await sequelize.query(query, { type: QueryTypes.SELECT });
    if(!(!stock || !cart.length || cart[0].total_quantity == null || parseInt(cart[0].total_quantity) < parseInt(stock.quantity))){
      return res.status(errorCodes.default).send(formatErrorResponse('Quantity must be less then from stock quantity.'));
    }
  }

  /**
   * Clear cart if have item from sale on approval
   */
  let haveSalecart = await cartsModel.findOne({where: {user_id: userID, type: 'sale', sale_product_id: {[Op.ne]: null }}});
  if(haveSalecart){
    let carts = await cartsModel.findAll({where: {user_id: userID}});
    let cartIds = arrayColumn(carts, 'id');
    await cartMaterialsModel.destroy({ where: { cart_id: {[Op.in]: cartIds} }});
    await cartsModel.destroy({ where: { user_id: userID }});
  }

  let cart = await cartsModel.create({
    user_id: userID,
    stock_id: data.stock_id,
    product_id: data.product_id,
    size_id: data.size_id || null,
    quantity: data.quantity || null,
    total_weight: data.total_weight || null,
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
  let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
  await cartsModel.destroy({ where: { id: req.params.id, user_id: userID} });
  await cartMaterialsModel.destroy({ where: { cart_id: req.params.id} });

  res.send(formatResponse([], "Product removed from cart successfully."));

}

/**
 * get item by id
 */

exports.getCartItem = async (req, res) => {
  let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
  let conditions = {user_id: userID}
  if(!isEmpty(req.query.product_id)){
    conditions.product_id = req.query.product_id;
  }
  if(!isEmpty(req.query.stock_id)){
    conditions.stock_id = req.query.stock_id;
  }
  
  const certificate_no = req.query.certificate_no?req.query.certificate_no:null;
  
  let stock = await stockModel.findOne({where: {id: req.query.stock_id, user_id: userID}});
  if(!stock){
    return res.status(errorCodes.default).send(formatErrorResponse('Stock not found.'));
  }

  let product = null, product_type = '';
  if(stock.type == "product"){
    product = await productModel.findOne({where: {id: req.query.product_id}});
    if(!product){
      return res.status(errorCodes.default).send(formatErrorResponse('Product not found.'));
    }
    product_type = product.type;
  }else{
    product_type = 'material';
  }

  /* get all sale on approval sale ids by user */
  const sales = await SaleModel.findAll({
    attributes: ["id"],
    where: { 
      is_approval: "1",
      sale_by: userID,
      is_approved: "3"
    }
  });
  let saleIds = arrayColumn(sales, "id");
  const saleProductExists = await SaleProductModel.findOne({
    where: { 
      certificate_no: certificate_no,
      sale_id: { [Op.in]: saleIds }, 
    },
  });
  if(saleProductExists){
    return res.status(errorCodes.default).send(formatErrorResponse('Sale record exists.'));
  }

  if(product_type == "material"){
    let query = "SELECT SUM(quantity) as total_quantity FROM carts WHERE stock_id = "+req.query.stock_id + " AND deleted_at IS NULL";
    const cart = await sequelize.query(query, { type: QueryTypes.SELECT });
    if(!stock || !cart.length || cart[0].total_quantity < stock.quantity){
      res.send(formatResponse("", 'Can add to cart.'));
    }else{
      res.status(errorCodes.default).send(formatErrorResponse("Can't add to cart."));
    }
  }else{
    let cart = await cartsModel.findOne({
      where: {stock_id: req.query.stock_id, user_id: userID}
    });
    if(!cart){
      res.send(formatResponse("", 'Can add to cart.'));
    }else{
      res.status(errorCodes.default).send(formatErrorResponse("Can't add to cart."));
    }
  }
}

/**
 * Hold cart items
 * POST /superadmin/carts/hold
 * Body: { cart_ids: [1,2,3], message: 'reason' }
 */
exports.hold = async (req, res) => {
  try {
    const { cart_ids, message } = req.body;
    if (!cart_ids || !cart_ids.length) {
      return res.status(errorCodes.default).send(formatErrorResponse('No cart items provided.'));
    }
    const userID = isManager(req) ? req.userId : await getWorkingUserID(req);
    await cartsModel.update(
      { is_held: true, hold_message: message || '' },
      { where: { id: { [Op.in]: cart_ids }, user_id: userID, type: 'sale' } }
    );
    res.send(formatResponse([], 'Items held successfully.'));
  } catch (err) {
    res.status(errorCodes.default).send(formatErrorResponse(err));
  }
};

/**
 * Unhold a cart item
 * POST /superadmin/carts/unhold/:id
 */
exports.unhold = async (req, res) => {
  try {
    const userID = isManager(req) ? req.userId : await getWorkingUserID(req);
    await cartsModel.update(
      { is_held: false, hold_message: null },
      { where: { id: req.params.id, user_id: userID, type: 'sale' } }
    );
    res.send(formatResponse([], 'Item released from hold.'));
  } catch (err) {
    res.status(errorCodes.default).send(formatErrorResponse(err));
  }
};




