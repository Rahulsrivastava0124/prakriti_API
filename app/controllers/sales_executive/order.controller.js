const config = require("@config/auth.config");
const { errorCodes, formatErrorResponse, formatResponse } = require("@utils/response.config");
const db = require("@models");
const { Op } = require("sequelize");
const { getPaginationOptions } = require('@helpers/paginator')
const { OrderCollection } = require("@resources/distributor/OrderCollection");
const { CartCollection } = require("@resources/sales_executive/CartCollection");
const { AddressCollection } = require("@resources/sales_executive/AddressCollection");
const orderModel = db.orders;
const { isEmpty, generateOrderNo, priceFormat } = require("@helpers/helper");
const { getCartMaterialPrices, sendNotification, insertVisit } = require("@library/common");
const cartModel = db.carts;
const cartMaterialsModel = db.cart_materials;
const orderMaterialsModel = db.order_materials;
const materialPriceModel = db.material_prices
const materialPricePurityModel = db.material_price_purities
const materialModel = db.materials;
const orderProductModel = db.order_products;
const UnitModel = db.units;
const productModel = db.products
const sizeModel = db.sizes
const PurityModel = db.purities;
const UserModel = db.users;
const SubCategoryModel = db.sub_categories;
const AddressModel = db.addresses;
const CountryModel = db.countries;
const StateModel = db.states;
const DistrictModel = db.districts;
const RoleModel = db.roles;

/**
 * Retrieve all Unit
 * @param req
 * @param res
 */
exports.index = async (req, res) => {
  let { page, limit, all } = req.query;
  let conditions = { sales_executive_id: "" };
  let order_id = !isEmpty(req.query.order_id) ? req.query.order_id :req.userId;

  if (!isEmpty(order_id)) {
    conditions.id = order_id;
  }

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
            as: 'role'
          }
        ]
      }
    ]
  }).then(async (data) => {
    let result = {
      user_id:req.userId,
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
 * Create Order
 * 
 * @param {*} req 
 * @param {*} res 
 */
exports.placeOrder = async (req, res) => {
  let data = req.body;
  //get all cart product
  let carts = await cartModel.findAll({
    where: { user_id: req.userId },
    include: [
      {
        model: cartMaterialsModel,
        as: 'cartMaterial',
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
            model: SubCategoryModel,
            as: 'sub_category',
            required: true
          },
        ]
      },
      {
        model: sizeModel,
        as: 'size'
      }
    ]
  });
  if (carts.length == 0) {
    return res.status(errorCodes.default).send(formatErrorResponse('Please add product into cart.'));
  }

  let address = await AddressModel.findOne({
    where: { id: data.delivery_address, user_id: req.userId },
    include: [
      {
        model: CountryModel,
        as: 'country'
      },
      {
        model: StateModel,
        as: 'state'
      },
      {
        model: DistrictModel,
        as: 'district'
      }
    ]
  });
  if (!address) {
    return res.status(errorCodes.default).send(formatErrorResponse('Address is not found.'));
  }

  let distributor = await UserModel.findOne({ where: { district_id: address.district_id } });
  let distributor_id = distributor ? distributor.id : null;
  let retailer_id = !isEmpty(data.retailer_id) ? data.retailer_id : 0;
  address = AddressCollection(address);

  try {
    const postData1 = {
      user_id: retailer_id,
      sub_total: !isEmpty(data.sub_total) ? data.sub_total : 0,
      discount_amount: !isEmpty(data.discount_amount) ? data.discount_amount : 0,
      total_amount: !isEmpty(data.total_amount) ? data.total_amount : 0,
      payment_mode: data.payment_mode,
      delivery_address: JSON.stringify(address),
      status: 'pending',
      to_user_id: distributor_id,
    };

    let order = await orderModel.create(postData1)
    if (order) {
      let cartIds = [];
      for (let i = 0; i < carts.length; i++) {
        let making_charge_type = '', making_charge = '', total_making_charge = 0, total_price = 0;
        if (carts[i].product.sub_category) {
          making_charge_type = carts[i].product.sub_category ? carts[i].product.sub_category.making_charge_type : '';
          making_charge = carts[i].product.sub_category ? carts[i].product.sub_category.making_charge : '';

          let orderProduct = await orderProductModel.create({
            order_id: order.id,
            product_id: carts[i].product_id,
            size_id: carts[i].size_id,
            quantity: carts[i].quantity,
            //discount: carts[i].discount,
            //discount_type: carts[i].discount_type,
            // rate: carts[i].rate,
          });
          for (let x = 0; x < carts[i].cartMaterial.length; x++) {
            let cartMaterial = carts[i].cartMaterial[x];
            //price calculation
            let priceData = await getCartMaterialPrices(cartMaterial, carts[i].product.type == "material" ? true : false);
            if (priceData) {
              total_price += parseFloat(priceData.price)
            }
            //making charge cal
            let cart_material_making_charge = 0;
            if (making_charge_type == "per_piece") {
              cart_material_making_charge = parseFloat(making_charge);
              total_making_charge += cart_material_making_charge;
              total_price += cart_material_making_charge
            } else if (making_charge_type == "per_gram") {
              cart_material_making_charge = priceFormat(cartMaterial.weight) * parseFloat(making_charge);
              total_making_charge += parseFloat(cart_material_making_charge);
              total_price += cart_material_making_charge
            }
            //order Materials add
            await orderMaterialsModel.create({
              order_id: order.id,
              order_product_id: orderProduct.id,
              product_id: carts[i].product_id,
              material_id: cartMaterial.material_id,
              purity_id: cartMaterial.purity_id,
              weight: cartMaterial.weight,
              quantity: cartMaterial.quantity,
              unit_id: cartMaterial.unit_id,
              price: !isEmpty(priceData) ? priceData.price : '',
              discount: !isEmpty(cartMaterial) ? cartMaterial.discount : '',
              discount_type: !isEmpty(cartMaterial) ? cartMaterial.discount_type : '',
              total: !isEmpty(priceData) ? priceFormat(parseFloat(priceData.price) + parseFloat(cart_material_making_charge)) : '',
              status: 'active'
            });
          }
          //order product rate  update
          await orderProductModel.update({
            rate: total_price,
          }, { where: { id: orderProduct.id } });

          cartIds.push(carts[i].id);
        }


        await orderModel.update({
          order_no: generateOrderNo(order.id),
        }, { where: { id: order.id } });

        await cartModel.destroy({ where: { id: { [Op.in]: cartIds } } });
        await cartMaterialsModel.destroy({ where: { cart_id: { [Op.in]: cartIds } } });

      }

      // an order taken for a retailer counts as a visit (once, not per cart item);
      // no date, as date is a follow-up reminder
      if (retailer_id) {
        await insertVisit({
          user_id: req.userId,
          visit_user_id: retailer_id,
          type: "Order",
          notes: "Order " + generateOrderNo(order.id),
        });
      }

      res.send(formatResponse({ order_id: order.id }, "Order place successfully!"));
    } else {
      return res.status(errorCodes.default).send(formatErrorResponse('Cart does not created due to some error'));
    }
  } catch (err) {
    // await t.rollback();
    return res.status(errorCodes.default).send(formatErrorResponse('Cart does not created due to some error'));
  }

  /*await orderModel.create(postData1).then(async result => {
   order_id = result.id;
   result.order_no = generateOrderNo(order_id);
   await orderModel.update({order_no: generateOrderNo(order_id)}, { where: { id: order_id } });
    cartModel.findAll({where: {user_id:  req.userId } , 
      include: [
        {
          model: cartMaterialsModel,
          as: 'cartMaterial',
          include: [
            {
              model: materialModel,
              as:'material',
              include: [
                {
                  model: materialPriceModel,
                  as: 'material_price',
                  include: [
                    {
                      model: materialPricePurityModel,
                      as: 'materialPricePurities'
                    }
                  ]
                },
              ]
            }
          ]
        }
      ]}).then(result2 => {  
       let carts = result2;
      
       carts.forEach(cart => { 
            let cartMaterial = !isEmpty(cart.cartMaterial) ? CartMaterialCollection(cart.cartMaterial) : null;
            const postData2 = {
              order_id: order_id,
              product_id: cart.product_id,
              material_id:  !isEmpty(cartMaterial) ? cartMaterial.material_id : '',
              sale_id: cart.sale_id,
              size_id: cart.size_id,
              purity_id: !isEmpty(cartMaterial) ? cartMaterial.purity_id : '',
              purchase_id: cart.purchase_id,
              quantity: cart.quantity,
              weight: !isEmpty(cartMaterial) ? cartMaterial.weight : '',
              price: !isEmpty(cartMaterial) ? cartMaterial.price : '',
              discount: !isEmpty(cartMaterial) ? cartMaterial.discount : '',
              discount_type: !isEmpty(cartMaterial) ? cartMaterial.discount_type : '',
              total: !isEmpty(cartMaterial) ? cartMaterial.total : '',
              status: 'active'
          };
          orderMaterialsModel.create(postData2).then(result3 => {
            cartModel.destroy({ where: { id:  cart.id } })
            cartMaterialsModel.destroy({ where: { cart_id: cart.id  } });
          });
       });
   });
  
    res.send(formatResponse(OrderCollection(result), "Order place successfully!"));
  }).catch(error => { compactLog(error)
    return res.status(errorCodes.default).send(formatErrorResponse('Order does not placed due to some error' + error));
  }); */
}


/**
* Cancel Order
* 
* @param {*} req 
* @param {*} res 
*/
exports.cancelOrder = async (req, res) => {
  let data = req.body;
  let order_id = data.order_id;

  let existing_order = await orderModel.findOne({ where: { id: order_id } });

  if (!isEmpty(existing_order)) {
    orderModel.update({ status: 'inactive' }, { where: { id: order_id } });
    orderMaterialsModel.update({ status: 'inactive' }, { where: { order_id: order_id } });

    sendNotification('order_cancel', req, { order: existing_order });

    res.send(formatResponse([], "Order cancelled successfully!"));
  }
  else {
    res.send(formatResponse([], "Order does not exist"));
  }

}

/**
 * Confirm Order
 */

exports.confirmOrder = async (req, res) => {
  let data = req.body;
  let order_id = data.order_id;
  let existing_order = await orderModel.findOne({ where: { id: order_id } });

  if (!isEmpty(existing_order)) {
    orderModel.update({ status: 'confirm' }, { where: { id: order_id } });
    res.send(formatResponse([], "Order confirmed successfully!"));
  } else {
    res.send(formatResponse([], "Order does not exist"));
  }
}

/**
 * View Order
 * 
 * @param {*} req 
 * @param {*} res 
 */
exports.fetch = async (req, res) => {
  let order = await orderModel.findOne({
    where: { id: req.params.id, sales_executive_id: req.userId },
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
      },
      {
        model: UserModel,
        as: 'saleExecutive'
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
      }
    ]
  });
  if (!order) {
    return res.status(errorCodes.default).send(formatErrorResponse('order not found'));
  }
  res.send(formatResponse(await OrderCollection(order), "order fetched successfully!"));
};





