const config = require("@config/auth.config");
const { errorCodes, formatErrorResponse, formatResponse } = require("@utils/response.config");
const { AdminCollection } = require("@resources/superadmin/AdminCollection");
const db = require("@models");
const { Op } = require("sequelize");
const { getPaginationOptions } = require('@helpers/paginator')
const { OrderCollection } = require("@resources/distributor/OrderCollection");
const { CartCollection } = require("@resources/distributor/CartCollection");
const { CartMaterialCollection } = require("@resources/distributor/CartMaterialCollection");
const { getOrderCartData } = require("@library/orderCart");
const moment = require('moment');
const _ = require("lodash");
const orderModel = db.orders;
const { isEmpty, statusDisplay, getDateFromToWhere, convertUnitToGram, arrayColumn, priceFormat } = require("@helpers/helper");
const cartModel = db.carts;
const { getRoleId, getWorkingUserID, getStockUserID, canStockAddCart, sendNotification, updateWalletRemainingBalance, updateAdvanceAmount, getUserColumnValue } = require("@library/common");
const cartMaterialsModel = db.cart_materials;
const orderMaterialsModel = db.order_materials;
const materialPriceModel = db.material_prices
const materialPricePurityModel = db.material_price_purities
const materialModel = db.materials;
const orderProductModel = db.order_products;
const UnitModel = db.units;
const productModel = db.products;
const StockModel = db.stocks;
const sizeModel = db.sizes
const PurityModel = db.purities;
const UserModel = db.users;
const RoleModel = db.roles;
const CategoryModel = db.categories;
const stocksModel = db.stocks;
const stock_materialsModel = db.stock_materials;
const PaymentModel = db.payments;

/**
 * Retrieve all Unit
 * @param req
 * @param res
 */
exports.index = async (req, res) => {
  let { page, limit, status, date_from, date_to, order_from, user_id } = req.query;
  let conditions = {};

  if (!isEmpty(status)) {
    conditions.status = status;
  }
  if (!isEmpty(user_id)) {
    conditions.user_id = user_id;
  }
  let from_user_con = {};
  if (order_from == 'distributor') {
    from_user_con.id = getRoleId('distributor');
  } else if (order_from == 'retailer') {
    from_user_con.id = getRoleId('retailer');
  } else if (order_from == 'customer') {
    from_user_con.id = getRoleId('customer');
  } else if (order_from == 'admin') {
    from_user_con.id = getRoleId('admin');
  }

  conditions = { ...conditions, ...getDateFromToWhere(date_from, date_to) }

  const paginatorOptions = getPaginationOptions(page, limit);
  orderModel.findAndCountAll({
    order: [['id', 'DESC']],
    where: conditions,
    offset: paginatorOptions.offset,
    limit: paginatorOptions.limit,
    include: [
      {
        model: orderProductModel,
        as: 'orderProducts',
        separate: true
      },
      {
        model: UserModel,
        as: 'orderFrom',
        include: [
          {
            model: RoleModel,
            as: 'role',
            where: from_user_con
          }
        ]
      },
      {
        model: UserModel,
        as: 'saleExecutive'
      },
      {
        model: UserModel,
        as: 'orderBy'
      }
    ]
  }).then(async (data) => {
    let result = {
      items: await OrderCollection(data.rows),
      total: data.count,
    }
    res.send(formatResponse(result, 'orders'));
  })
    .catch(err => {
      res.status(errorCodes.default).send(formatErrorResponse(err));
    });
}

/**
 * Cancel Order
 * 
 * @param {*} req 
 * @param {*} res 
 */
exports.cancelOrder = async (req, res) => {
  let data = req.body;
  let order = await orderModel.findOne({ where: { id: req.params.id } });
  await orderModel.update({ status: 'cancelled' }, { where: { id: req.params.id } });

  sendNotification('order_cancel', req, { order: order });

  res.send(formatResponse([], "Order cancelled successfully!"));

}


/**
 * View Order
 * 
 * @param {*} req 
 * @param {*} res 
 */
exports.fetch = async (req, res) => {
  let order = await orderModel.findOne({
    where: { id: req.params.id },
    include: [
      {
        model: orderProductModel,
        as: 'orderProducts',
        separate: true,
        include: [
          {
            model: orderMaterialsModel,
            as: 'orderProductMaterials',
            separate: true,
            include: [
              {
                model: materialModel,
                as: 'material'
              },
              {
                model: UnitModel,
                as: 'unit'
              },
              {
                model: PurityModel,
                as: 'purity'
              }
            ]
          },
          {
            model: productModel,
            as: 'product',
            include: [
              {
                model: CategoryModel,
                as: 'category'
              }
            ]
          },
          {
            model: StockModel,
            as: 'stock',
            include: [
              
            ]
          },
          {
            model: sizeModel,
            as: 'size'
          },
          {
            model: UserModel,
            as: 'worker'
          }
        ]
      },
      {
        model: UserModel,
        as: 'orderFrom',
        include: [
          {
            model: RoleModel,
            as: 'role'
          }
        ]
      },
      {
        model: UserModel,
        as: 'saleExecutive'
      }
    ]
  });
  if (!order) {
    return res.status(errorCodes.default).send(formatErrorResponse('order not found'));
  }
  res.send(formatResponse(await OrderCollection(order), "order fetched successfully!"));
};

/**
 * Get User based on role
 *
 * @param req
 * @param res
 */
exports.userList = async (req, res) => {
  let { role } = req.query;
  let conditions = {};
  if (role == 'distributor') {
    conditions.role_id = getRoleId('distributor');
  } else if (role == 'retailer') {
    conditions.role_id = getRoleId('retailer');
  } else if (role == 'customer') {
    conditions.role_id = getRoleId('customer');
  } else if (role == 'admin') {
    conditions.role_id = getRoleId('admin');
  }

  UserModel.findAll({
    where: conditions,
    order: [['name', 'ASC']],
    include: [
      {
        model: RoleModel,
        as: 'role',
      }
    ]
  }).then(async (data) => {
    let result = {
      items: await AdminCollection(data),
      total: data.length
    }
    res.send(formatResponse(result, 'All Users'));
  })
    .catch(err => {
      res.status(errorCodes.default).send(formatErrorResponse(errorCodes.defaultErrorMsg));
    });

}

/**
 * Update Order Status
 * 
 * @param {*} req 
 * @param {*} res 
 */
exports.updateOrderStatus = async (req, res) => {
  let data = req.body;
  let obj = {
    status: data.status
  }
  if (data.status == "accepted") {
    obj.accepted_at = moment().format('YYYY-MM-DD HH:mm:ss')
    if ('notes' in data && data.notes) {
      obj.notes = data.notes;
    }
  } else if (data.status == "shipped") {
    obj.shipped_at = moment().format('YYYY-MM-DD HH:mm:ss')
  } else if (data.status == "out_for_delivery") {
    obj.out_for_delivery_at = moment().format('YYYY-MM-DD HH:mm:ss')
  } else if (data.status == "delivered") {
    obj.delivered_at = moment().format('YYYY-MM-DD HH:mm:ss')
  } else if (data.status == "cancelled") {
    obj.cancelled_at = moment().format('YYYY-MM-DD HH:mm:ss')
  } else if (data.status == "on_process") {
    obj.on_process_at = moment().format('YYYY-MM-DD HH:mm:ss');
    obj.expected_delivery_date = moment().add(4, 'days').format('YYYY-MM-DD');
  } else if (data.status == "is_ready") {
    obj.on_ready_at = moment().format('YYYY-MM-DD HH:mm:ss')
  }

  let order = await orderModel.findOne({ where: { id: req.params.id } });
  if ('advance_amount' in data && data.advance_amount) {
    if (order) {
      let role_id = await getUserColumnValue(order.user_id, 'role_id')
      let paid_amount = order.paid_amount ? parseFloat(order.paid_amount) : 0;
      if (data.payment_mode != "cheque") {
        paid_amount += parseFloat(data.advance_amount);
      }
      obj.paid_amount = paid_amount;
      let user_role = role_id == getRoleId('retailer') ? 'retailer' : 'customer';
      let payment = await PaymentModel.create({
        user_id: order.user_id,
        payment_by: order.user_id,
        amount: data.advance_amount,
        payment_mode: data.payment_mode,
        table_type: 'orders',
        table_id: order.id,
        remaining_balance: 0,
        notes: data.notes || null,
        cheque_no: data.cheque_no || null,
        status: (data.payment_mode != "cheque") ? "success" : "pending",
        payment_date: moment().format("YYYY-MM-DD"),
        payment_belongs: req.userId,
        due_date: null,
        type: 'credit',
        purpose: user_role + ' advance for order #' + order.order_no,
        can_accept: true,
        is_advance: true
      });

      if (data.payment_mode != "cheque") {
        await updateWalletRemainingBalance(payment.payment_belongs, payment.id);

        await updateAdvanceAmount(payment.user_id, payment.payment_belongs, payment.amount, true);
      }

    }
  }

  await orderModel.update(obj, { where: { id: req.params.id } });

  if (data.status == "cancelled") {
    sendNotification('order_cancel', req, { order: order });
  }

  res.send(formatResponse([], `Order ${statusDisplay(data.status)} Successfully.`));

}

/**
 * Update products
 * 
 * @param {*} req 
 * @param {*} res 
 */
exports.updateProducts = async (req, res) => {
  let data = req.body;
  let order = await orderModel.findOne({ where: { id: data.order_id } });

  let orderProduct = await orderProductModel.findOne({
    where: {
      order_id: data.order_id,
      id: data.id
    },
    include: [
      {
        model: orderMaterialsModel,
        as: 'orderProductMaterials',
        separate: true,
      }
    ]
  });
  let carts = [];
  if (data.update_type == 'size') {
    if (orderProduct) {
      await cartModel.update({
        size_id: data.size_id
      }, {
        where: {
          id: data.cart_id
        }
      });

      await cartMaterialsModel.destroy({ where: { cart_id: data.cart_id } });

      for (let x = 0; x < data.materials.length; x++) {
        let material = data.materials[x];
        await cartMaterialsModel.create({
          cart_id: data.cart_id,
          material_id: material.material_id,
          purity_id: material.purity_id,
          weight: material.weight,
          unit_id: material.unit_id,
          quantity: material.quantity
        });
      }

      carts = await getOrderCartData(data.order_id, null, data.role_id);
      for (let i = 0; i < carts.length; i++) {
        if (carts[i].id == data.cart_id) {
          await orderProductModel.update({
            product_id: carts[i].product_id,
            size_id: carts[i].size_id || null,
            quantity: carts[i].quantity,
            rate: carts[i].price,
            total_weight: carts[i].total_weight,
            making_charge: carts[i].total_making_charge,
            making_charge_discount_amount: carts[i].making_charge_discount_amount,
            making_charge_discount_percent: carts[i].making_charge_discount_percent,
            total_discount: carts[i].total_discount,
            sub_price: carts[i].sub_price,
            price_without_tax: carts[i].price_without_tax,
            igst: carts[i].igst,
            cgst: carts[i].cgst,
            sgst: carts[i].sgst,
          }, {
            where: {
              order_id: data.order_id,
              id: data.id
            }
          })
        }
      }
    }

  } else if (data.update_type == 'purity_id') {
    if (orderProduct) {
      await cartMaterialsModel.update({ purity_id: data.purity_id }, { where: { cart_id: data.cart_id, material_id: data.material_id } });

      carts = await getOrderCartData(data.order_id, null, data.role_id);
      for (let i = 0; i < carts.length; i++) {
        if (carts[i].id == data.cart_id) {
          await orderProductModel.update({
            product_id: carts[i].product_id,
            size_id: carts[i].size_id || null,
            quantity: carts[i].quantity,
            rate: carts[i].price,
            total: carts[i].price,
            total_weight: carts[i].total_weight,
            making_charge: carts[i].total_making_charge,
            making_charge_discount_amount: carts[i].making_charge_discount_amount,
            making_charge_discount_percent: carts[i].making_charge_discount_percent,
            total_discount: carts[i].total_discount,
            sub_price: carts[i].sub_price,
            price_without_tax: carts[i].price_without_tax,
            igst: carts[i].igst,
            cgst: carts[i].cgst,
            sgst: carts[i].sgst,
          }, {
            where: {
              order_id: data.order_id,
              id: data.id
            }
          });

          for (let x = 0; x < carts[i].cart_material.length; x++) {
            let cartMaterial = carts[i].cart_material[x];
            if (cartMaterial.material_id == data.material_id) {
              await orderMaterialsModel.update({
                purity_id: cartMaterial.purity_id,
                weight: cartMaterial.weight,
                quantity: cartMaterial.quantity,
                unit_id: cartMaterial.unit_id,
                price: cartMaterial.price,
                discount: cartMaterial.discount,
                discount_type: cartMaterial.discount_type,
                total: cartMaterial.total_price,
                per_gram_price: cartMaterial.per_gram_price,
                rate: cartMaterial.rate,
                discount_percent: cartMaterial.discount_percent,
                total_gram: cartMaterial.weight_in_gram
              }, { where: { id: data.product_m_id } })

            }

          }

        }
      }
    }
  }

  let item_total = 0, total_payable = 0, promocode_discount = 0, promocode = '', total_discount = 0;
  for (let i = 0; i < carts.length; i++) {
    item_total += carts[i].total_price;
    if (!isEmpty(carts[i].promocode)) {
      promocode = carts[i].promocode;
      promocode_discount = parseFloat(carts[i].promocode_discount);
    }
    total_discount += carts[i].total_discount;
  }
  total_payable = Math.round(priceFormat(item_total - promocode_discount));
  let discount_amount = order.discount_amount ? priceFormat(data.discount_amount) : 0;
  await orderModel.update({
    sub_total: item_total,
    total_amount: priceFormat(total_payable - discount_amount)
  }, { where: { id: data.order_id } })

  res.send(formatResponse([], `Updated Successfully.`));
}


/**
 * Order Sale Procceed
 * 
 * @param {*} req 
 * @param {*} res 
 */
exports.orderSaleProceed = async (req, res) => {
  let order = await orderModel.findOne({
    where: { id: req.params.id },
    include: [
      {
        model: orderProductModel,
        as: 'orderProducts',
        separate: true,
        include: [
          {
            model: orderMaterialsModel,
            as: 'orderProductMaterials',
            separate: true,
            include: [
              {
                model: materialModel,
                as: 'material'
              },
              {
                model: UnitModel,
                as: 'unit'
              },
              {
                model: PurityModel,
                as: 'purity'
              }
            ]
          },
          {
            model: productModel,
            as: 'product'
          },
          {
            model: sizeModel,
            as: 'size'
          }
        ]
      }
    ]
  });
  if (!order) {
    return res.status(errorCodes.default).send(formatErrorResponse('order not found'));
  }


  let userID = await getWorkingUserID(req);
  let stockCon = { user_id: await getStockUserID(req, userID) };


  /**
   * Now add to cart order product from stock
   */
  let isCartAdded = false, haveAllInStock = true;
  for (let x = 0; x < order.orderProducts.length; x++) {
    let orderProduct = order.orderProducts[x];
    let thisCon = { ...stockCon, product_id: orderProduct.product_id };
    if (isEmpty(orderProduct.size_id)) {
      thisCon = { ...thisCon, size_id: { [Op.is]: null } }
    } else {
      thisCon = { ...thisCon, size_id: orderProduct.size_id }
    }
    let stocks = await stocksModel.findAll({
      where: thisCon,
      include: [
        {
          model: stock_materialsModel,
          as: 'stockMaterials',
          required: true,
          separate: true
        }
      ]
    });
    let cartAddedNum = 0;
    if (orderProduct.product.type != "material") {
      for (let q = 0; q < orderProduct.quantity; q++) {
        if (q in stocks) {
          let stock = stocks[q];
          let can_add_cart = await canStockAddCart(stock.id, orderProduct.product.type, userID);
          if (!can_add_cart) {
            haveAllInStock = false;
            continue;
          }

          let numMatched = 0;
          let stockMaterials = getStockMaterials(stock.stockMaterials);
          for (let i = 0; i < orderProduct.orderProductMaterials.length; i++) {
            let item = orderProduct.orderProductMaterials[i];
            let thisM = _.filter(stockMaterials, { material_id: item.material_id });
            if (thisM.length && thisM[0].material_id == item.material_id && thisM[0].purity_id == item.purity_id && thisM[0].unit_id == item.unit_id) {
              numMatched++;
            }
          }
          if (numMatched == orderProduct.orderProductMaterials.length) {
            await insertIntoCart({
              user_id: userID,
              stock_id: stock.id,
              product_id: orderProduct.product_id,
              size_id: orderProduct.size_id || null,
              quantity: 1,
              total_weight: stock.total_weight || null,
              type: 'sale',
              materials: stockMaterials,
              order_product_id: orderProduct.id
            });
            isCartAdded = true;
            cartAddedNum++;
          }
        } else {
          haveAllInStock = false;
        }
      }

      if (cartAddedNum < orderProduct.quantity) {
        haveAllInStock = false;
      }

    } else {
      if (stocks.length) {
        let stock = stocks[0];
        let can_add_cart = await canStockAddCart(stock.id, orderProduct.product.type, userID);
        if (!can_add_cart) {
          continue;
        }

        let numMatched = 0;
        let stockMaterials = getStockMaterials(stock.stockMaterials);
        for (let i = 0; i < orderProduct.orderProductMaterials.length; i++) {
          let item = orderProduct.orderProductMaterials[i];
          let thisM = _.filter(stockMaterials, { material_id: item.material_id });
          if (thisM.length && thisM[0].material_id == item.material_id && thisM[0].purity_id == item.purity_id && thisM[0].unit_id == item.unit_id) {
            numMatched++;
          }
        }
        if (numMatched == orderProduct.orderProductMaterials.length) {
          let orderProductM = orderProduct.orderProductMaterials[0];
          let stockM = stockMaterials[0];
          let qty = 0, weight = 0;
          if (parseInt(stockM.quantity) >= parseInt(orderProductM.quantity)) {
            qty = orderProductM.quantity;
          } else {
            qty = stockM.quantity;
            haveAllInStock = false;
          }
          if (parseInt(stockM.weight) >= parseInt(orderProductM.weight)) {
            weight = orderProductM.weight;
          } else {
            weight = stockM.weight;
            haveAllInStock = false;
          }
          await insertIntoCart({
            user_id: userID,
            stock_id: stock.id,
            product_id: orderProduct.product_id,
            size_id: orderProduct.size_id || null,
            quantity: qty,
            total_weight: convertUnitToGram(orderProductM.unit ? orderProductM.unit.name : '', weight),
            type: 'sale',
            materials: [{
              material_id: stockM.material_id,
              purity_id: stockM.purity_id,
              weight: weight,
              unit_id: stockM.unit_id,
              quantity: qty
            }],
            order_product_id: orderProduct.id
          });
          isCartAdded = true;
        } else {
          haveAllInStock = false;
        }

      } else {
        haveAllInStock = false;
      }
    }

  }

  if (!isCartAdded) {
    return res.status(errorCodes.default).send(formatErrorResponse("You doesn't have stock."));
  }

  /**
  * Clear cart data
  */
  let carts = await cartModel.findAll({ where: { user_id: userID } });
  let cartIds = arrayColumn(carts, 'id');
  await cartMaterialsModel.destroy({ where: { cart_id: { [Op.in]: cartIds } } });
  await cartModel.destroy({ where: { user_id: userID } });

  res.send(formatResponse({
    all_added: haveAllInStock ? 1 : 0
  }));

}

const getStockMaterials = (stockMaterials) => {
  let materialItem = [];
  for (let item of stockMaterials) {
    materialItem.push({
      material_id: item.material_id,
      weight: item.weight,
      quantity: item.quantity,
      unit_id: item.unit_id,
      purity_id: item.purity_id
    });
  }
  return materialItem;
}

const insertIntoCart = async (data) => {
  let cart = await cartModel.create({
    user_id: data.user_id,
    stock_id: data.stock_id,
    product_id: data.product_id,
    size_id: data.size_id,
    quantity: data.quantity,
    total_weight: data.total_weight,
    type: 'sale',
    order_product_id: data.order_product_id
  });
  for (let x = 0; x < data.materials.length; x++) {
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



