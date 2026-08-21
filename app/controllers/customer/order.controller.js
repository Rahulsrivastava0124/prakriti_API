const config = require("@config/auth.config");
const {
  errorCodes,
  formatErrorResponse,
  formatResponse,
} = require("@utils/response.config");
const db = require("@models");
const { Op } = require("sequelize");
const moment = require("moment");
const { getPaginationOptions } = require("@helpers/paginator");
const { OrderCollection } = require("@resources/customer/OrderCollection");
const { CartCollection } = require("@resources/customer/CartCollection");
const { AddressCollection } = require("@resources/customer/AddressCollection");
const orderModel = db.orders;
const sequelize = db.sequelize;
const { isEmpty, generateOrderNo, priceFormat } = require("@helpers/helper");
const { base64FileUpload, removeFile } = require("@helpers/upload");
const {
  getCartMaterialPrices,
  isSalesExecutive,
  isRetailer,
  insertVisit,
  sendNotification,
  isCustomer,
  getUserColumnValue,
  updateAdvanceAmount,
  updateWalletRemainingBalance,
} = require("@library/common");
const cartModel = db.carts;
const cartMaterialsModel = db.cart_materials;
const orderMaterialsModel = db.order_materials;
const materialModel = db.materials;
const orderProductModel = db.order_products;
const UnitModel = db.units;
const productModel = db.products;
const StockModel = db.stocks;
const sizeModel = db.sizes;
const PurityModel = db.purities;
const UserModel = db.users;
const SubCategoryModel = db.sub_categories;
const AddressModel = db.addresses;
const CountryModel = db.countries;
const StateModel = db.states;
const DistrictModel = db.districts;
const TaxSlabModel = db.tax_slabs;
const ReturnModel = db.returns;
const ReturnProductModel = db.return_products;
const ReturnProductMaterialModel = db.return_product_materials;
const PaymentModel = db.payments;

/**
 * Retrieve all Unit
 * @param req
 * @param res
 */
exports.index = async (req, res) => {
  let { page, limit, all } = req.query;
  let conditions = {
    [Op.or]: [{ user_id: req.userId }, { sales_executive_id: req.userId }],
  };
  let order_id = !isEmpty(req.query.order_id) ? req.query.order_id : "";

  if (!isEmpty(order_id)) {
    conditions.id = order_id;
  }

  /* if order id then mark order as viewed */
  if(!isEmpty(order_id)){
    await orderModel.update(
      {
        is_viewed: 1
      },
      { where: { id: order_id } }
    );
  }

  const paginatorOptions = getPaginationOptions(page, limit);
  orderModel
    .findAndCountAll({
      order: [["id", "DESC"]],
      // where: conditions,
      offset: paginatorOptions.offset,
      limit: paginatorOptions.limit,
      include: [
        {
          model: orderProductModel,
          as: "orderProducts",
          separate: true,
          include: [
            {
              model: orderMaterialsModel,
              as: "orderProductMaterials",
              separate: true,
              include: [
                {
                  model: materialModel,
                  as: "material",
                },
                {
                  model: UnitModel,
                  as: "unit",
                },
                {
                  model: PurityModel,
                  as: "purity",
                },
              ],
            },
            {
              model: StockModel,
              as: "stock",
            },
            {
              model: productModel,
              as: "product",
            },
            {
              model: sizeModel,
              as: "size",
            },
          ],
        },
        {
          model: UserModel,
          as: "orderFrom",
        },
      ],
    })
    .then(async (data) => {
      let result = {
        // data:data,
        user_id: req?.userId,
        items: await OrderCollection(data.rows),
        total: data.count,
      };
      res.send(formatResponse(result, "orders"));
    })
    .catch((err) => {
      res.status(errorCodes.default).send(formatErrorResponse(err.toString()));
    });
};

/**
 * Create Order
 *
 * @param {*} req
 * @param {*} res
 */
exports.placeOrder = async (req, res) => {
  let data = req.body;

  console.warn("placing order payload keys:", data && typeof data === 'object' ? Object.keys(data).length : typeof data);

  const t = await sequelize.transaction();
  try {
    let carts = await getCart(req.userId, req.role);
    compactLog("carts count:", Array.isArray(carts) ? carts.length : typeof carts);
    if (carts.length == 0) {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse("Please add product into cart."));
    }

    let addressData = await getAddress(data.delivery_address);
    if (isCustomer(req) && !addressData) {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse("Address is not found."));
    }
    let distributor_id = null,
      address = addressData ? addressData.address : {};
    if (isSalesExecutive(req)) {
      distributor_id = await getUserColumnValue(req.userId, "parent_id");
    } else {
      if (addressData) {
        distributor_id = addressData.distributor_id;
      }
    }
    // if (!distributor_id) {
    //   return res.status(errorCodes.default).send(formatErrorResponse('Address is not valid.'));
    // }

    let sales_executive_id = null,
      user_id = req.userId;
    if (isRetailer(req)) {
      sales_executive_id = !isEmpty(data.user_id) ? data.user_id : null;
    } else if (isSalesExecutive(req)) {
      sales_executive_id = req.userId;
      user_id = data.user_id;
    }

    let image = null;
    if (!isEmpty(data.image_file)) {
      let result = await base64FileUpload(data.image_file, "orders");
      if (result) {
        image = result.path;
      }
    }

    let paid_amount = !isEmpty(data.paid_amount)
      ? parseFloat(data.paid_amount)
      : 0;
    const postData1 = {
      user_id: user_id,
      sub_total: !isEmpty(data.sub_total) ? data.sub_total : 0,
      discount_amount: !isEmpty(data.discount_amount)
        ? data.discount_amount
        : 0,
      total_amount: !isEmpty(data.total_amount) ? data.total_amount : 0,
      paid_amount: data.payment_mode == "cheque" ? 0 : paid_amount,
      payment_mode: data.payment_mode,
      delivery_address: JSON.stringify(address),
      status: "pending",
      to_user_id: distributor_id,
      sales_executive_id: sales_executive_id,
      order_by: req.userId,
      notes: data.notes,
      image: image,
      old_sub_total: !isEmpty(data.sub_total) ? data.sub_total : 0,
      old_discount_amount: !isEmpty(data.discount_amount)
        ? data.discount_amount
        : 0,
      old_total_amount: !isEmpty(data.total_amount) ? data.total_amount : 0,
      order_from: "front_website",
    };

    let order = await orderModel.create(postData1, { transaction: t });
    let cartIds = [],
      promocode_discount = 0,
      promocode = null,
      promocode_id = null;
    for (let i = 0; i < carts.length; i++) {
      if (!isEmpty(carts[i].promocode_id)) {
        promocode = carts[i].promocode;
        promocode_id = carts[i].promocode_id;
        promocode_discount = carts[i].promocode_discount;
      }
      let orderProduct = await orderProductModel.create(
        {
          order_id: order.id,
          product_id: carts[i].product_id,
          stock_id: !isEmpty(carts[i].stock_id)?parseInt(carts[i].stock_id):null,
          size_id: !isEmpty(carts[i].size_id)?carts[i].size_id : null,
          quantity: carts[i].quantity,
          rate: carts[i].price,
          total: carts[i].price,
          total_weight: carts[i].total_weight,
          certificate_no: carts[i].certificate_no || null,
          making_charge: carts[i].total_making_charge,
          making_charge_discount_amount: carts[i].making_charge_discount_amount,
          making_charge_discount_percent:
            carts[i].making_charge_discount_percent,
          total_discount: carts[i].total_discount,
          sub_price: carts[i].sub_price,
          price_without_tax: carts[i].price_without_tax,
          igst: carts[i].igst,
          cgst: carts[i].cgst,
          sgst: carts[i].sgst,
          old_size_id: carts[i].size_id || null,
          old_total_weight: carts[i].total_weight,
          old_quantity: carts[i].quantity,
          old_rate: carts[i].price,
          old_making_charge: carts[i].total_making_charge,
          old_making_charge_discount_amount:
            carts[i].making_charge_discount_amount,
          old_making_charge_discount_percent:
            carts[i].making_charge_discount_percent,
          old_total_discount: carts[i].total_discount,
          old_sub_price: carts[i].sub_price,
          old_price_without_tax: carts[i].price_without_tax,
          old_igst: carts[i].igst,
          old_cgst: carts[i].cgst,
          old_sgst: carts[i].sgst,
          status: "pending",
        },
        { transaction: t }
      );

      await cartModel.update(
        {
          order_id: order.id,
          order_product_id: orderProduct.id,
          user_id: null,
          cookie_id: null,
        },
        { where: { id: carts[i].id }, transaction: t }
      );

      for (let x = 0; x < carts[i].cart_material.length; x++) {
        let cartMaterial = carts[i].cart_material[x];

        await orderMaterialsModel.create(
          {
            order_id: order.id,
            order_product_id: orderProduct.id,
            product_id: carts[i].product_id,
            stock_id: !isEmpty(carts[i].stock_id)?parseInt(carts[i].stock_id):null,
            material_id: cartMaterial.material_id,
            purity_id: cartMaterial.purity_id,
            weight: cartMaterial.weight,
            quantity: cartMaterial.quantity,
            unit_id: cartMaterial.unit_id,
            price: cartMaterial.price,
            discount: cartMaterial.discount,
            discount_type: cartMaterial.discount_type,
            total: cartMaterial.total_price,
            status: "active",
            per_gram_price: cartMaterial.per_gram_price,
            rate: cartMaterial.rate,
            discount_percent: cartMaterial.discount_percent,
            total_gram: cartMaterial.weight_in_gram,
            old_purity_id: cartMaterial.purity_id,
            old_weight: cartMaterial.weight,
            old_quantity: cartMaterial.quantity,
            old_price: cartMaterial.price,
            old_discount: cartMaterial.discount,
            old_discount_type: cartMaterial.discount_type,
            old_total: cartMaterial.total_price,
            old_per_gram_price: cartMaterial.per_gram_price,
            old_discount_percent: cartMaterial.discount_percent,
            old_total_gram: cartMaterial.weight_in_gram,
          },
          { transaction: t }
        );
      }

      cartIds.push(carts[i].id);
    }

    let order_no = generateOrderNo(order.id);
    await orderModel.update(
      {
        order_no: order_no,
        promocode: promocode,
        promocode_discount: promocode_discount,
        promocode_id: promocode_id,
      },
      { where: { id: order.id }, transaction: t }
    );

    //await cartModel.destroy({ where: { id: { [Op.in]: cartIds } }, transaction: t });
    //await cartMaterialsModel.destroy({ where: { cart_id: { [Op.in]: cartIds } }, transaction: t });

    let payment = null;
    if (isSalesExecutive(req)) {
      await insertVisit({ user_id: req.userId, visit_user_id: user_id }, t);

      /**
       * if advance paid then send to se wallet
       */
      if (paid_amount > 0) {
        payment = await PaymentModel.create(
          {
            user_id: user_id,
            payment_by: user_id,
            amount: paid_amount,
            payment_mode: data.payment_mode,
            table_type: "orders",
            table_id: order.id,
            remaining_balance: 0,
            notes: data.notes || null,
            cheque_no: data.cheque_no || null,
            status: data.payment_mode != "cheque" ? "success" : "pending",
            payment_date: moment().format("YYYY-MM-DD"),
            payment_belongs: req.userId,
            due_date: null,
            type: "credit",
            purpose: "retailer advance for order #" + order_no,
            can_accept: true,
            is_advance: true,
          },
          { transaction: t }
        );
      }
    }

    await t.commit();

    if (payment && data.payment_mode != "cheque") {
      await updateWalletRemainingBalance(payment.payment_belongs, payment.id);

      await updateAdvanceAmount(
        payment.user_id,
        payment.payment_belongs,
        payment.amount,
        true
      );
    }

    //send notification
    sendNotification("order_placed", req, { order: order, order_no: order_no });
    if (!isEmpty(order.sales_executive_id)) {
      sendNotification("order_assigned", req, {
        order: {
          order_no: order_no,
          id: order.id,
        },
        sales_executive_id: order.sales_executive_id,
      });
    }

    res.send(
      formatResponse({ order_id: order.id }, "Order placed successfully!")
    );
  } catch (error) {
    compactLog(error);
    await t.rollback();
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse(error.toString()));
  }
};

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
    await orderModel.update(
      { status: "cancelled", cancel_reason: data.cancel_reason },
      { where: { id: order_id } }
    );

    sendNotification("order_cancel", req, { order: order });

    res.send(formatResponse([], "Order cancelled successfully!"));
  } else {
    res
      .status(errorCodes.default)
      .send(formatErrorResponse("Order does not exist"));
  }
};

/**
 * Returnn Request
 *
 * @param {*} req
 * @param {*} res
 */
exports.returnRequest = async (req, res) => {
  let conditions = {
    id: req.params.id,
    [Op.or]: [{ user_id: req.userId }, { sales_executive_id: req.userId }],
  };
  let order = await orderModel.findOne({
    where: conditions,
    include: [
      {
        model: orderProductModel,
        as: "orderProducts",
        separate: true,
        include: [
          {
            model: orderMaterialsModel,
            as: "orderProductMaterials",
            separate: true,
          },
        ],
      },
    ],
  });
  if (!order) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Order does not exist"));
  }

  //return res.status(errorCodes.default).send(formatErrorResponse('Order does not exist'));

  const data = req.body;
  try {
    const trans = await sequelize.transaction(async (t) => {
      const returnObj = await ReturnModel.create(
        {
          user_id: order.user_id,
          to_user_id: order.to_user_id,
          table_id: order.id,
          table_type: "orders",
          notes: data.notes,
          status: "pending",
          product_amount: data.product_amount,
          charge: data.return_charge,
          total_amount: data.return_amount,
          return_date: moment().format("YYYY-MM-DD"),
        },
        { transaction: t }
      );

      let return_products = data.return_products;
      let order_products = data.order_products;
      for (let i = 0; i < return_products.length; i++) {
        if (!return_products[i].is_return) {
          continue;
        }

        let orderProduct = order.orderProducts[i];

        let returnProduct = await ReturnProductModel.create(
          {
            return_id: returnObj.id,
            table_id: order.orderProducts[i].id,
            table_type: "order_products",
            sub_total: order.orderProducts[i].rate,
          },
          { transaction: t }
        );

        //insert into return product materials table
        for (let x = 0; x < order_products[i].materials.length; x++) {
          let thisQty =
            order_products[i].product_type == "material"
              ? parseFloat(order_products[i].materials[x].return_qty)
              : order_products[i].materials[x].quantity;
          let thisWeight =
            order_products[i].product_type == "material"
              ? parseFloat(order_products[i].materials[x].return_weight)
              : order_products[i].materials[x].weight;
          await ReturnProductMaterialModel.create(
            {
              return_id: returnObj.id,
              return_product_id: returnProduct.id,
              material_id: order_products[i].materials[x].material_id,
              weight: thisWeight,
              quantity: thisQty,
              purity_id: order_products[i].materials[x].purity_id,
              unit_id: order_products[i].materials[x].unit_id,
            },
            { transaction: t }
          );
        }

        //update order product is return and return weight & qty into order product material table
        if (order_products[i].product_type == "material") {
          let total_return_weight =
            parseFloat(orderProduct.orderProductMaterials[0].return_weight) +
            parseFloat(order_products[i].materials[0].return_weight);
          let total_return_qty =
            parseInt(orderProduct.orderProductMaterials[0].return_qty) +
            parseInt(order_products[i].materials[0].return_qty);
          let is_return =
            total_return_qty >=
              parseInt(orderProduct.orderProductMaterials[0].quantity) ||
            total_return_weight >=
              parseFloat(orderProduct.orderProductMaterials[0].weight)
              ? true
              : false;

          await orderProductModel.update(
            { is_return: is_return },
            { where: { id: orderProduct.id }, transaction: t }
          );
          await orderMaterialsModel.update(
            {
              return_qty: total_return_qty,
              return_weight: total_return_weight,
            },
            {
              where: { id: orderProduct.orderProductMaterials[0].id },
              transaction: t,
            }
          );
        } else {
          await orderProductModel.update(
            { is_return: true },
            { where: { id: orderProduct.id }, transaction: t }
          );
        }
      }

      await orderModel.update(
        { status: "return_request" },
        { where: { id: order.id }, transaction: t }
      );

      //send notification
      sendNotification("order_return_request", req, {
        order: order,
        order_no: order.order_no,
        return_order: returnObj,
      });

      res.send(formatResponse([], "Return requested successfully."));
    });
  } catch (error) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse(errorCodes.defaultErrorMsg));
  }
};

const getAddress = async (addressId) => {
  let address = await AddressModel.findOne({
    where: { id: addressId },
    include: [
      {
        model: CountryModel,
        as: "country",
      },
      {
        model: StateModel,
        as: "state",
      },
      {
        model: DistrictModel,
        as: "district",
      },
    ],
  });
  if (!address) {
    return null;
  }

  let distributor = await UserModel.findOne({
    where: { district_id: address.district_id },
  });
  let distributor_id = distributor ? distributor.id : null;
  address = AddressCollection(address);
  return {
    address: address,
    distributor_id: distributor_id,
  };
};

const getCart = async (userId, role) => {
  let carts = await cartModel.findAll({
    where: { user_id: userId },
    include: [
      {
        model: cartMaterialsModel,
        as: "cartMaterial",
        separate: true,
        include: [
          {
            model: materialModel,
            as: "material",
          },
          {
            model: UnitModel,
            as: "unit",
          },
          {
            model: PurityModel,
            as: "purity",
          },
        ],
      },
      {
        model: productModel,
        as: "product",
        include: [
          {
            model: SubCategoryModel,
            as: "sub_category",
            required: true,
          },
          {
            model: TaxSlabModel,
            as: "tax",
          },
        ],
      },
      {
        model: sizeModel,
        as: "size",
      },
    ],
  });
  carts = await CartCollection(carts, role);
  return carts;
};
