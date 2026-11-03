const config = require("@config/auth.config");
const { errorCodes, formatErrorResponse, formatResponse } = require("@utils/response.config");
const db = require("@models");
const { Op } = require("sequelize");
const moment = require('moment');
const { getPaginationOptions } = require('@helpers/paginator')
const {CartCollection} = require("@resources/customer/CartCollection");
const {ProductMaterialCollection} = require("@resources/customer/ProductMaterialCollection");
const cartsModel = db.carts;
const { isEmpty,priceFormat, displayAmount, convertUnitToGram, weightFormat } = require("@helpers/helper");
const { findIndex } = require("lodash");
const cartMaterialsModel =db.cart_materials;
const materialModel =db.materials
const UnitModel = db.units;
const productModel = db.products
const sizeModel = db.sizes
const PurityModel = db.purities
const productMaterialModel = db.product_materials
const SubCategoryModel = db.sub_categories;
const TaxSlabModel = db.tax_slabs;
const PromocodeModel = db.promocodes;

/**
 * Find a cart row only if it belongs to the caller (user_id when logged in, else guest cookie_id)
 */
const findOwnCart = (req) => {
  let user_id = req.userId || null;
  let cookie_id = req.query.cookie_id || null;
  if(!user_id && !cookie_id){
    return null;
  }
  let conditions = {id: req.params.id};
  if(user_id){
    conditions.user_id = user_id;
  }else{
    conditions.cookie_id = cookie_id;
  }
  return cartsModel.findOne({where: conditions});
}

/**
 * Retrieve all Cart
 * @param req
 * @param res
 */
exports.index = async (req, res) => {
  let {cookie_id} = req.query;

  let user_id = req.userId || null;
  cookie_id = cookie_id || null;
  let conditions = {};
  if(user_id){
    conditions.user_id = user_id;
  }else{
    conditions.cookie_id = cookie_id;
  }
  // let conditions = {[Op.or]: [{user_id: user_id}, {cookie_id: cookie_id}]};
  cartsModel.findAndCountAll({ 
    order:[['id', 'ASC']],
    where: conditions,
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
        include:[
          {
            model: SubCategoryModel,
            as: 'sub_category',
            required: true
          },
          {
            model: TaxSlabModel,
            as: 'tax',
          }
        ]
      },
      {
        model: sizeModel,
        as: 'size'
      }
    ]
  }).then(async (data) => {
    let result = {
      items: await CartCollection(data.rows, req.role),
      total: data.rows.length,
    }

    let item_total = 0, total_payable = 0, promocode_discount = 0, promocode = '', total_discount = 0, original_price = 0;
    for(let i = 0; i < result.items.length; i++){
      item_total += result.items[i].total_price;
      if(!isEmpty(result.items[i].promocode)){
        promocode = result.items[i].promocode;
        promocode_discount = parseFloat(result.items[i].promocode_discount);
      }
      total_discount += result.items[i].total_discount;
      original_price += result.items[i].total_price_without_dis;
    }
    total_payable = Math.round(priceFormat(item_total - promocode_discount));
    result.item_total = priceFormat(item_total);
    result.item_total_display = displayAmount(item_total);
    result.promocode = promocode;
    result.promocode_discount = promocode_discount;
    result.promocode_discount_display = displayAmount(promocode_discount);
    result.total_payable = total_payable;
    result.total_payable_display = displayAmount(total_payable);
    result.original_price = displayAmount(original_price);
      result.total_discount = displayAmount(total_discount);

    res.send(formatResponse(result, 'carts'));
  })
  .catch(err => {
    res.status(errorCodes.default).send(formatErrorResponse(err));
  });
}

/**
 * Retrieve all Cart
 * @param req
 * @param res
 */
exports.stockIndex = async (req, res) => {
  let {cookie_id} = req.query;

  let user_id = req.userId || null;
  cookie_id = cookie_id || null;
  let conditions = {};
  if(user_id){
    conditions.user_id = user_id;
  }else{
    conditions.cookie_id = cookie_id;
  }
  // let conditions = {[Op.or]: [{user_id: user_id}, {cookie_id: cookie_id}]};
  cartsModel.findAndCountAll({ 
    order:[['id', 'ASC']],
    where: conditions,
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
        include:[
          {
            model: SubCategoryModel,
            as: 'sub_category',
            required: true
          },
          {
            model: TaxSlabModel,
            as: 'tax',
          }
        ]
      },
      {
        model: sizeModel,
        as: 'size'
      }
    ]
  }).then(async (data) => {
    let result = {
      items: await CartCollection(data.rows, req.role),
      total: data.rows.length,
    }

    let item_total = 0, total_payable = 0, promocode_discount = 0, promocode = '', total_discount = 0, original_price = 0;
    for(let i = 0; i < result.items.length; i++){
      item_total += result.items[i].total_price;
      if(!isEmpty(result.items[i].promocode)){
        promocode = result.items[i].promocode;
        promocode_discount = parseFloat(result.items[i].promocode_discount);
      }
      total_discount += result.items[i].total_discount;
      original_price += result.items[i].total_price_without_dis;
    }
    total_payable = Math.round(priceFormat(item_total - promocode_discount));
    result.item_total = priceFormat(item_total);
    result.item_total_display = displayAmount(item_total);
    result.promocode = promocode;
    result.promocode_discount = promocode_discount;
    result.promocode_discount_display = displayAmount(promocode_discount);
    result.total_payable = total_payable;
    result.total_payable_display = displayAmount(total_payable);
    result.original_price = displayAmount(original_price);
      result.total_discount = displayAmount(total_discount);

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
  const maxEachProductQty = 10;

  //check if cart is exists
  let user_id = req.userId || null;
  let cookie_id = data.cookie_id || null;
  let quantity = 'quantity' in data && data.quantity ? parseInt(data.quantity) : 1;
  let is_manual = 'is_manual' in data && data.is_manual == 1 ? true : false;

  let uniqueCondition = [];
  if(user_id){
    uniqueCondition.push({user_id: user_id});
  }
  if(cookie_id){
    uniqueCondition.push({cookie_id: cookie_id});
  }
  if(uniqueCondition.length == 0){
    return res.status(errorCodes.default).send(formatErrorResponse('Invalid request. No cookie or user id found.'));
  }

  let cart = await cartsModel.findOne({
    where: {
      product_id: data.product_id, 
      size_id: data.size_id, 
      [Op.or]: uniqueCondition
    }
  });
  //let cart = await cartsModel.findOne({where: {certificate_no: data.certificate_no, size_id: data.size_id, [Op.or]: [{user_id: user_id}, {cookie_id: cookie_id}]}});
  
  let isCartUpdated = false;
  if(cart){

    //check if cart metarials is match
    let isMaterialsMatch = true;
    for(let i = 0; i < data.materials.length; i++){
      let cartMaterial = await cartMaterialsModel.findOne({
        where: {
          cart_id: cart.id, 
          material_id: data.materials[i].material_id,
          purity_id: data.materials[i].purity_id
        }
      });
      if(!cartMaterial){
        isMaterialsMatch = false;
      }
    }
    
    if(isMaterialsMatch){

      if(parseInt(cart.quantity) == maxEachProductQty){
        return res.status(errorCodes.default).send(formatErrorResponse("You can't add more than " + maxEachProductQty + "."));
      }

      await cartsModel.update({quantity: cart.is_manual ? quantity : (parseInt(cart.quantity) + quantity)}, { where: { id: cart.id} });
      if(cart.is_manual){
        let cartMaterial = await cartMaterialsModel.findOne({where: {cart_id: cart.id}});
        compactLog("cartMaterial id:", cartMaterial && cartMaterial.id);
        if(cartMaterial){
          //await cartMaterialsModel.update({quantity: quantity, weight: parseFloat(data.materials[0].weight)}, { where: { id: cartMaterial.id} });
          await cartMaterialsModel.update({quantity: parseInt(data.materials[0].quantity), weight: parseFloat(data.materials[0].weight)}, { where: { id: cartMaterial.id} });
        }
      }
      isCartUpdated = true;
    }
  }
  
  if(!isCartUpdated){
    let cart = await cartsModel.create({
      product_id: data.product_id,
      stock_id: null,
      current_image: null,
      user_id: user_id,
      cookie_id: cookie_id,
      quantity: quantity,
      total_weight: data.total_weight,
      size_id: data.size_id,
      rate: priceFormat(data.rate),
      certificate_no: 'certificate_no' in data ? data.certificate_no : null,
      is_manual: is_manual
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
  }

  res.send(formatResponse([], "Product added to cart successfully!"));
}

/**
 * Create Cart
 * 
 * @param {*} req 
 * @param {*} res 
 */
exports.storeStock = async (req, res) => {
  let data = req.body;
  const maxEachProductQty = 10;

  //check if cart is exists
  let user_id = req.userId || null;
  let cookie_id = data.cookie_id || null;
  let quantity = 'quantity' in data && data.quantity ? parseInt(data.quantity) : 1;
  let is_manual = 'is_manual' in data && data.is_manual == 1 ? true : false;

  let uniqueCondition = [];
  if(user_id){
    uniqueCondition.push({user_id: user_id});
  }
  if(cookie_id){
    uniqueCondition.push({cookie_id: cookie_id});
  }
  if(uniqueCondition.length == 0){
    return res.status(errorCodes.default).send(formatErrorResponse('Invalid request. No cookie or user id found.'));
  }

  //let cart = await cartsModel.findOne({where: {product_id: data.product_id, size_id: data.size_id, [Op.or]: [{user_id: user_id}, {cookie_id: cookie_id}]}});
  let cart = await cartsModel.findOne({
    where: {
      certificate_no: data.certificate_no, 
      size_id: data.size_id, 
      [Op.or]: uniqueCondition
    }
  });

  let isCartUpdated = false;
  if(cart){

    //check if cart metarials is match
    let isMaterialsMatch = true;
    for(let i = 0; i < data.materials.length; i++){
      let cartMaterial = await cartMaterialsModel.findOne({
        where: {
          cart_id: cart.id, 
          material_id: data.materials[i].material_id,
          purity_id: data.materials[i].purity_id
        }
      });
      if(!cartMaterial){
        isMaterialsMatch = false;
      }
    }

    if(isMaterialsMatch){

      if(parseInt(cart.quantity) == maxEachProductQty){
        return res.status(errorCodes.default).send(formatErrorResponse("You can't add more than " + maxEachProductQty + "."));
      }

      await cartsModel.update({quantity: cart.is_manual ? quantity : (parseInt(cart.quantity) + quantity)}, { where: { id: cart.id} });
      if(cart.is_manual){
        let cartMaterial = await cartMaterialsModel.findOne({where: {cart_id: cart.id}});
        if(cartMaterial){
          //await cartMaterialsModel.update({quantity: quantity, weight: parseFloat(data.materials[0].weight)}, { where: { id: cartMaterial.id} });
          await cartMaterialsModel.update({quantity: parseInt(data.materials[0].quantity), weight: parseFloat(data.materials[0].weight)}, { where: { id: cartMaterial.id} });
        }
      }
      isCartUpdated = true;
    }
  }

  if(!isCartUpdated){
    let cart = await cartsModel.create({
      product_id: data.product_id,
      stock_id: data.stock_id,
      current_image: data.current_image,
      user_id: user_id,
      cookie_id: cookie_id,
      quantity: quantity,
      total_weight: data.total_weight,
      size_id: data.size_id,
      rate: priceFormat(data.rate),
      certificate_no: 'certificate_no' in data ? data.certificate_no : null,
      is_manual: is_manual
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
  }

  res.send(formatResponse([], "Product added to cart successfully!"));
}    


 /**
 * Update Cart
 * 
 * @param {*} req 
 * @param {*} res 
 */
exports.update = async (req, res) => {
  let cart = await findOwnCart(req);
  let data = req.body;
  if(!cart){
    return res.status(errorCodes.default).send(formatErrorResponse('Cart does not exists.'));
  }

  let updateObj = {quantity: data.quantity};
  if(cart.is_manual){
    updateObj.total_weight = convertUnitToGram(data.unit_name, data.weight);
  }
  await cartsModel.update(updateObj, { where: { id: cart.id} });
  if(cart.is_manual){
    let cartMaterial = await cartMaterialsModel.findOne({where: {cart_id: cart.id}});
    if(cartMaterial){
      await cartMaterialsModel.update({quantity: data.quantity, weight: parseFloat(data.weight)}, { where: { id: cartMaterial.id} });
    }
  }

  res.send(formatResponse([], "Cart updated successfully"));

}

 /**
 * Remove Cart
 * 
 * @param {*} req 
 * @param {*} res 
 */

exports.delete = async (req, res) => {
  let existing_cart = await findOwnCart(req);
  
  if(!isEmpty(existing_cart)){
    cartsModel.destroy({ where: { id: existing_cart.id} }).then(async result => {
      await cartMaterialsModel.destroy({ where: { cart_id: existing_cart.id} });
      res.send(formatResponse([], "Product removed from cart successfully"));
    }).catch(error => {
      return res.status(errorCodes.default).send(formatErrorResponse('Cart does not deleted due to some error' + error));
    });
  }
  else{
    return res.status(errorCodes.default).send(formatErrorResponse('Cart does not exists'));
  }

}

/**
 * Update Cart Size & Material
 * 
 * @param {*} req 
 * @param {*} res 
 */
exports.updateSizeMaterial = async (req, res) => {
  let cart = await findOwnCart(req);
  if(!cart){
    return res.status(errorCodes.default).send(formatErrorResponse('Cart does not exists.'));
  }
  let data = req.body;
  let updateObj = {};
  if('total_weight' in data){
    updateObj.total_weight = data.total_weight;
  }
  if('size_id' in data){
    updateObj.size_id = data.size_id;
  }
  if(Object.keys(updateObj).length > 0){
    await cartsModel.update(updateObj, { where: { id: cart.id} });
  }

  if('materials' in data){
    await cartMaterialsModel.destroy({ where: { cart_id: cart.id} });

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
  }

  if('purity_id' in data && 'material_id' in data){
    await cartMaterialsModel.update({purity_id: data.purity_id}, { where: { cart_id: cart.id, material_id: data.material_id} });
  }

  res.send(formatResponse([], "Cart updated successfully"));


}

/**
 * Apply promocode
 * 
 * @param {*} req 
 * @param {*} res 
 */
exports.applyPromoCode = async (req, res) => {
  let today = moment().format('YYYY-MM-DD');
  let p_conditions = {
    start_date: {
      [Op.lte]: today
    },
    end_date: {
      [Op.gte]: today
    },
    code: req.body.promocode,
    status: true
  }
  let promocode = await PromocodeModel.findOne({where: p_conditions});
  if(!promocode){
    return res.status(errorCodes.default).send(formatErrorResponse('Invalid Voucher Code. Please use another code.'));
  }

  let {cookie_id} = req.query;
  let user_id = req.userId || null;
  cookie_id = cookie_id || null;
  let conditions = {[Op.or]: [{user_id: user_id}, {cookie_id: cookie_id}]};
  let cartData = await cartsModel.findAndCountAll({ 
    order:[['id', 'ASC']],
    where: conditions,
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
        include:[
          {
            model: SubCategoryModel,
            as: 'sub_category',
            required: true
          },
          {
            model: TaxSlabModel,
            as: 'tax',
          }
        ]
      },
      {
        model: sizeModel,
        as: 'size'
      }
    ]
  });

  let carts = await CartCollection(cartData.rows, req.role);
  let p_category_id = promocode.category_id;
  let sub_category_id = promocode.sub_category_id;
  let p_products = promocode.products.split(",");
  p_products = p_products.map(function(item) {
      return parseInt(item, 10);
  });
  let isApply = false;
  for(let item of carts){
    if(!isApply && item.category_id == p_category_id && item.sub_category_id == sub_category_id && p_products.includes(item.product_id)){
      let promocode_discount = promocode.discount_type == "flat" ? parseFloat(promocode.discount) : priceFormat(parseFloat(item.total_making_charge) * parseFloat(promocode.discount) / 100);

      await cartsModel.update({
        promocode_id: promocode.id,
        promocode: promocode.code,
        promocode_discount: promocode_discount
      }, { where: { id: item.id} });
      isApply = true;
    }else{
      await cartsModel.update({
        promocode_id: null,
        promocode: null,
        promocode_discount: null
      }, { where: { id: item.id} });
    }
  }

  if(!isApply){
    return res.status(errorCodes.default).send(formatErrorResponse('Invalid Voucher Code. Please use another code.'));
  }

  res.send(formatResponse('', "Voucher Code applied successfully."));

}




