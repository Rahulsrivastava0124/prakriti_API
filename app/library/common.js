const db = require("@models");
const { Op, QueryTypes, Sequelize } = require("sequelize");
const globalConfig = require("@config/global.config.js");
const Role = db.roles;
const DeviceToken = db.device_tokens;
const SettingModel = db.settings;
const StockModel = db.stocks;
const StockMaterialModel = db.stock_materials;
const UserModel = db.users;
const SaleModel = db.sales;
const dbSequelize = db.sequelize;
const MaterialPricePurityModel = db.material_price_purities;
const MaterialPriceModel = db.material_prices;
const PurityModel = db.purities;
const UnitModel = db.units;
const PurchaseModel = db.purchases;
const AddressModel = db.addresses;
const {
  SaleListCollection,
} = require("@resources/superadmin/SaleListCollection");
const { getActivityLog } = require("@library/activityLog");
const {
  isEmpty,
  isObject,
  formatDateTime,
  addLog,
  convertPerGramPriceToPerUnit,
  weightFormat,
  priceFormat,
  arrayColumn,
  displayAmount,
  socketEmit,
  isArray,
  convertUnitToGram,
  convertGramToUnit,
  getDateFromToWhere,
  isWeeklyHoliday,
  getFormatedAddress,
  ucWords,
  getFileAbsulatePath,
} = require("@helpers/helper");
const {
  NotificationCollection,
} = require("@resources/superadmin/NotificationCollection");
const { PurityCollection } = require("@resources/superadmin/PurityCollection");
const {
  AttendanceCollection,
} = require("@resources/superadmin/AttendanceCollection");
const {
  HolidayCollection,
} = require("@resources/superadmin/HolidayCollection");
const moment = require("moment");
const request = require("request");
const { model } = require("mongoose");
const e = require("cors");
const _ = require("lodash");
const { compareSync } = require("bcryptjs");
const productsModel = db.products;
const materialModel = db.materials;
const TaxSlabModel = db.tax_slabs;
const SubCategoryModel = db.sub_categories;
const CategoryModel = db.categories;
const UserPermissionModel = db.user_permissions;
const PaymentModel = db.payments;
const NoticationModel = db.notifiactions;
const cartsModel = db.carts;
const ProductSizeMaterialModel = db.product_size_materials;
const ProductMaterialModel = db.product_materials;
const MaterialModel = db.materials;
const SizeModel = db.sizes;
const UserToUserModel = db.user_to_users;
const LoanDetailModel = db.loan_details;
const RetailerReviewModel = db.retailer_reviews;
const RetailerVisitModel = db.retailer_visits;
const WishlistModel = db.wishlists;
const stockHistoryModel = db.stock_raw_material_histories;
const AttendanceModel = db.attendances;
const HolidayModel = db.holidays;
const leaveApplicationModel = db.leave_applications;
const AdvancePaymentModel = db.advance_payments;
const PurchaseProductModel = db.purchase_products;
const PurchaseProductMaterialModel = db.purchase_product_materials;
const SaleProductModel = db.sale_products;
const SaleProductMaterialModel = db.sale_product_materials;
const cartMaterialsModel = db.cart_materials;
const nodemailer = require("nodemailer");
const order = require("../../models/order");
const { parse } = require("dotenv");
const { findLastKey } = require("lodash");

const getRoleId = (name) => {
  let roleId = 0;
  switch (name) {
    case "superadmin":
      roleId = 1;
      break;

    case "admin":
      roleId = 2;
      break;

    case "distributor":
      roleId = 3;
      break;

    case "sales_executive":
      roleId = 4;
      break;

    case "retailer":
      roleId = 5;
      break;

    case "customer":
      roleId = 6;
      break;

    case "employee":
      roleId = 7;
      break;

    case "supplier":
      roleId = 8;
      break;

    case "manager":
      roleId = 9;
      break;

    case "worker":
      roleId = 10;
      break;

    case "investor":
      roleId = 11;
      break;

    default:
      break;
  }
  return roleId;
};
const getRoleName = async (id) => {
  try {
    let role = await Role.findByPk(id);
    return role ? role.display_name : "User";
  } catch (err) {
    return "User";
  }
};

const sendOTP = async (mobile) => {
  //let otp = '0000';
  let otp = Math.floor(1000 + Math.random() * 9000);
  otp = otp.toString();
  //sendSMS([mobile], 'login', {otp: otp});
  return otp;
};

const getDeliveryCharge = async () => {
  return 0;
};

const updateDeviceTokens = async (user_id, deviceType, newToken, req) => {
  let user = await DeviceToken.findOne({ where: { user_id: user_id } });
  if (user) {
    if (user.device_token != newToken) {
      await DeviceToken.update(
        {
          device_type: deviceType,
          device_token: newToken,
        },
        { where: { user_id: user_id } }
      );
    }
  } else {
    await DeviceToken.create({
      user_id: user_id,
      device_type: deviceType,
      device_token: newToken,
    });
  }
  return "";
};

const getSetting = async (params, req) => {
  params = { ...params };
  try {
    let setting = await SettingModel.findOne(params).exec();
    return setting ? setting.value : "";
  } catch (err) {
    return "";
  }
};

const setSetting = async (params, value, req) => {
  params = { ...params };
  try {
    let result = await SettingModel.findOneAndUpdate(
      params,
      { value: value },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return true;
  } catch (err) {
    return false;
  }
};

const sendSMS = (mobiles, type, params) => {
  let clientServerOptions;
  let flow_id = "",
    country = "91",
    authkey = "214978ANvezYcqM61726d00P1",
    recipients = [],
    sender = "WBAPPS";
  if (type == "login") {
    let template_id = "626f74ccd08c9754823acee4";
    let mobileStr = "";
    for (let i = 0; i < mobiles.length; i++) {
      mobileStr += country + mobiles[i];
    }
    let postData = {};
    clientServerOptions = {
      uri:
        "https://api.msg91.com/api/v5/otp?unicode=0&authkey=" +
        authkey +
        "&template_id=" +
        template_id +
        "&mobile=" +
        mobileStr +
        "&otp=" +
        params.otp +
        "&sender=" +
        sender,
      body: JSON.stringify(postData),
      method: "GET",
      headers: {
        authkey: authkey,
        "Content-Type": "application/json",
      },
    };
  } else {
    if (type == "order_placed") {
      flow_id = "626f742208e6514e10489962";
    } else if (type == "order_delivered") {
      flow_id = "626f73b3b698064a56500e29";
    } else if (type == "order_bill") {
      flow_id = "62fe050e59ebd51f40143834";
    }
    params == !isObject(params) ? {} : params;
    for (let i = 0; i < mobiles.length; i++) {
      recipients.push({
        mobiles: country + mobiles[i],
        ...params,
      });
    }
    let postData = {
      sender: sender,
      flow_id: flow_id,
      recipients: recipients,
    };
    //console.log(postData);
    clientServerOptions = {
      uri: "http://api.msg91.com/api/v5/flow/",
      body: JSON.stringify(postData),
      method: "POST",
      headers: {
        authkey: authkey,
        "Content-Type": "application/json",
      },
    };
  }

  return new Promise(function (resolve, reject) {
    request(clientServerOptions, function (error, res, body) {
      if (!error && res.statusCode == 200) {
        resolve(true);
      } else {
        reject(false);
      }
    });
  });

  /*request(clientServerOptions, function (error, response) {
        console.log('error', error);
        console.log('response', response);
        return;
    });*/
};

/**
 * update or create model
 */
const updateOrCreate = async (model, where, newItem, t, incrementFields) => {
  // First try to find the record
  const foundItem = await model.findOne({ where });
  let item;
  if (!foundItem) {
    if (t) {
      item = await model.create(newItem, { transaction: t });
    } else {
      item = await model.create(newItem);
    }
    return { item: item, created: true };
  }

  if (incrementFields) {
    for (let i of incrementFields) {
      newItem[i] = foundItem[i]
        ? weightFormat(newItem[i] + parseFloat(foundItem[i]))
        : 0;
    }
  }

  if (t) {
    item = await model.update(newItem, { where: where, transaction: t });
  } else {
    item = await model.update(newItem, { where });
  }
  return { item: foundItem, created: false };
};

/**
 * get existing permission
 */

const gePermissionValue = (value) => {
  if (value != undefined && value == 1) {
    return 1;
  } else {
    return 0;
  }
};

/**
 * get existing status
 */

const geStatusValue = (value) => {
  if (value != null) {
    return value == 1 ? "Active" : "Inactive";
  } else {
    return "";
  }
};

/**
 * get existing making charge type
 */

const getMakingChargeType = (value) => {
  let type = "";
  if (value != null) {
    switch (value) {
      case "per_gram":
        type = " / gram";
        break;

      case "per_piece":
        type = " / piece";
        break;

      default:
        type = "";
        break;
    }
  }
  return type;
};

/**
 * get product all prices
 */

const getProductPrices = (material, quantity) => {
  let priceData = {
    price: "",
    sale_price: "",
    discount: "",
    off_discount: "",
  };

  if (!isEmpty(material) && !isEmpty(material.purities)) {
    let material_price = material.material_price;

    if (
      !isEmpty(material_price) &&
      material_price.materialPricePurities.length > 0
    ) {
      let per_product_original_price =
        material_price.materialPricePurities[0].price;
      let customer_discount =
        material_price.materialPricePurities[0].customer_discount;
      let per_product_discount =
        (per_product_original_price * customer_discount) / 100;
      let per_product_price = per_product_original_price - per_product_discount;

      priceData.price = quantity * per_product_original_price;
      priceData.sale_price = quantity * per_product_price;
      priceData.discount = customer_discount;
      priceData.off_discount = parseInt(customer_discount);
    }
  }

  return priceData;
};
/**
 * get product all prices
 */

const getCartMaterialPrices = async (material, isMaterial, type) => {
  //material -> cart material
  let priceData = {
    price: 0,
    sale_price: 0,
    discount: 0,
    per_gram_price: 0,
    discount_percent: 0,
    rate: 0,
  };
  type = type === undefined ? "customer" : type;

  if (!isEmpty(material)) {
    let materialPriceObj = await MaterialPriceModel.findOne({
      where: { material_id: material.material_id },
      include: [
        {
          model: MaterialPricePurityModel,
          as: "materialPricePurities",
          where: { purity_id: material.purity_id },
          separate: true,
        },
      ],
    });
    let price = 0,
      sale_price = 0,
      per_gram_price = 0,
      unit_name = "unit" in material && material.unit ? material.unit.name : "",
      discount = 0,
      discount_percent = 0,
      rate = 0;
    if (materialPriceObj && materialPriceObj.materialPricePurities.length) {
      let materialPrice = materialPriceObj.materialPricePurities[0];
      if (type == "retailer") {
        discount_percent = materialPrice.retailer_max_discount
          ? materialPrice.retailer_max_discount
          : 0;
      } else {
        discount_percent = materialPrice.customer_discount
          ? materialPrice.customer_discount
          : 0;
      }
      sale_price =
        materialPrice.per_gram_price -
        (materialPrice.per_gram_price * discount_percent) / 100;
      price = materialPrice.per_gram_price;
      let total_gram = convertUnitToGram(unit_name, material.weight);
      per_gram_price = parseFloat(materialPrice.per_gram_price);
      sale_price = priceFormat(sale_price * parseFloat(total_gram));
      price = priceFormat(price * parseFloat(total_gram));
      discount = price - sale_price;
      rate = convertPerGramPriceToPerUnit(
        parseFloat(materialPrice.per_gram_price),
        unit_name
      );
    }
    priceData.price = price;
    priceData.sale_price = sale_price;
    priceData.per_gram_price = per_gram_price;
    priceData.discount = discount;
    priceData.discount_percent = discount_percent;
    priceData.rate = rate;
  }

  return priceData;
};

/**
 * Remove product & materials from stock
 */
const removeMaterialFromStock = async (purchase, t, userId) => {
  for (let item of purchase.purchaseProducts) {
    let stock = null;
    if (item.product.type == "material") {
      stock = await StockModel.findOne({
        where: { product_id: purchase.product_id, user_id: userId },
      });
      let quantity = 0;
      for (let mItem of item.purchaseMaterials) {
        let stockM = await StockMaterialModel.findOne({
          where: { stock_id: stock.id, material_id: mItem.material_id },
        });
        if (stockM) {
          await StockMaterialModel.update(
            {
              weight: weightFormat(
                parseFloat(stockM.weight) - parseFloat(mItem.weight)
              ),
              quantity:
                parseFloat(stockM.quantity) - parseFloat(mItem.quantity),
            },
            { where: { id: stockM.id } }
          );
          quantity += mItem.quantity ? parseInt(mItem.quantity) : 0;
        }
      }
      if (stock.quantity == quantity) {
        await StockModel.destroy({ where: { id: stock.id } });
      } else {
        await StockModel.update(
          {
            quantity: quantity,
            total_weight:
              parseFloat(stock.total_weight) - parseFloat(item.total_weight),
          },
          { where: { id: stock.id } }
        );
      }
    } else {
      /*stock = await StockModel.findOne({where: {purchase_id: purchase.id}});
            for(let mItem of item.purchaseMaterials){
                let stockM = await StockMaterialModel.findOne({where: {stock_id: stock.id, material_id: mItem.material_id}});
                if(stockM){
                    await StockMaterialModel.update({
                    weight: priceFormat(stockM.weight - mItem.weight),
                    quantity: (stockM.quantity - mItem.quantity)
                    },{where: {id: stockM.id}, transaction: t});

                }
            }*/
    }
  }

  //remove all stock by this purchase id. Stock which have purchase id that is not material product. So we can delete safely.
  let stocks = await StockModel.findAll({
    where: { purchase_id: purchase.id, user_id: userId },
  });
  let stockIds = [];
  for (let i = 0; i < stocks.length; i++) {
    stockIds.push(stocks[i].id);
  }
  await StockModel.destroy({ where: { id: { [Op.in]: stockIds } } });
  await StockMaterialModel.destroy({
    where: { stock_id: { [Op.in]: stockIds } },
  });

  return true;
};

const getCustomRoleIds = async () => {
  let roles = await Role.findAll({
    where: { is_custom: true },
    attributes: ["id"],
    raw: true,
  });
  return arrayColumn(roles, "id");
};

const calculateProductPrice = async (
  materials,
  sub_category,
  isMaterial,
  price_by_role,
  tax_info,
  fromCart
) => {
  let price_type = "",
    discount_type = "",
    making_dis_type = "";
  if (price_by_role == "distributor") {
    price_type = "distributor_price";
    discount_type = "distributor_discount";
    making_dis_type = "distributor_discount";
  } else if (price_by_role == "admin") {
    price_type = "admin_price";
    discount_type = "admin_discount";
    making_dis_type = "admin_discount";
  } else if (price_by_role == "retailer") {
    price_type = "retailer_max_price";
    discount_type = "retailer_max_discount";
    making_dis_type = "retailer_discount";
  } else if (price_by_role == "customer") {
    price_type = "customer_price";
    discount_type = "customer_discount";
    making_dis_type = "customer_discount";
  }

  let materialsNew = [],
    total_weight = 0,
    total_quantity = 0,
    total_price = 0,
    total_mrp = 0,
    total_discount = 0,
    total_material_discount = 0,
    total_mrp_price = 0,
    total_sale_price = 0;

  //console.log("materials : ", materials);

  for (let i = 0; i < materials.length; i++) {
    /* let materialPriceObj = await MaterialPriceModel.findOne({
      where: { material_id: materials[i].material_id },
      include: [
        {
          model: MaterialPricePurityModel,
          as: "materialPricePurities",
          where: { purity_id: materials[i].purity_id },
          separate: true,
        },
      ],
    }); */
    //console.log("materialPriceObj : ", materialPriceObj);
    let price = 0,
      mrp = 0,
      unit_based_mrp = 0,
      discount_percent = 0,
      discount_amount = 0,
      total_gram = 0,
      unit_name =
        "unit" in materials[i] && materials[i].unit
          ? materials[i].unit.name
          : "";
    //console.log("materials[i].material : ", materials[i].material);
    //console.log("materials[i].material.material_price.materialPricePurities : ", materials[i].material.material_price.materialPricePurities);
    //console.log(materials[i].material.material_price.materialPricePurities.filter((mpp) => mpp.purity_id == materials[i].purity_id).pop());
    let materialPricePurity =
      materials[i].material &&
      materials[i].material.material_price &&
      materials[i].material.material_price.materialPricePurities &&
      materials[i].material.material_price.materialPricePurities.length
        ? materials[i].material.material_price.materialPricePurities
            .filter((mpp) => mpp.purity_id == materials[i].purity_id)
            .pop()
        : null;
    //console.log("materialPricePurity : ", materialPricePurity);
    //if (materialPriceObj && materialPriceObj.materialPricePurities.length) {
    if (materialPricePurity) {
      //let materialPrice = materialPriceObj.materialPricePurities[0];
      //console.log("materials[i].material.material_price.materialPricePurities : ", materials[i].material.material_price.materialPricePurities);
      let materialPrice = materialPricePurity;
      //mrp = parseFloat(materialPrice.per_gram_price);
      //mrp = parseFloat(materialPrice[price_type]);
      mrp = parseFloat(materialPrice.per_gram_price);

      unit_based_mrp = convertPerGramPriceToPerUnit(
        parseFloat(materialPrice.per_gram_price),
        unit_name
      );
      discount_percent = parseFloat(materialPrice[discount_type]);
      total_gram = convertUnitToGram(unit_name, materials[i].weight);
      if (!fromCart) {
        if (isMaterial) {
          let perWeight =
            parseFloat(materials[i].weight) / parseInt(materials[i].quantity);
          total_gram = convertUnitToGram(unit_name, 1);
          //console.log(total_gram)
        }
        //total_gram = isMaterial ? weightFormat(total_gram / parseInt(materials[i].quantity)) : total_gram;
      }
      //total_gram = unit_name.toLowerCase() !== "gm" ? parseFloat(materials[i].weight) : parseFloat(total_gram);
      total_weight += total_gram;
      total_quantity += parseInt(materials[i].quantity);
      price =
        materialPrice.per_gram_price -
        (materialPrice.per_gram_price * discount_percent) / 100;
      price = priceFormat(price * parseFloat(total_gram));
      total_price += price;
      total_mrp += priceFormat(
        parseFloat(materialPrice.per_gram_price) * parseFloat(total_gram)
      );
      discount_amount = priceFormat(
        materialPrice.per_gram_price * parseFloat(total_gram) - price
      );
      priceFormat((materialPrice.per_gram_price * discount_percent) / 100);
      total_material_discount += discount_amount;
      total_discount += discount_amount;

      total_mrp_price += priceFormat(
        parseFloat(materialPrice.per_gram_price) * parseFloat(total_gram)
      );
      total_sale_price += price;
    }
    materialsNew.push({
      material_id: materials[i].material_id,
      mrp: mrp,
      unit_based_mrp: unit_based_mrp,
      price: price,
      discount_percent: discount_percent,
      discount_amount: discount_amount,
      total_gram: weightFormat(total_gram),
    });
  }
  let total_making_charge = 0;
  let making_charge_type = sub_category ? sub_category.making_charge_type : "";
  let making_charge = sub_category ? sub_category.making_charge : 0;
  let making_charge_discount_percent = sub_category
    ? sub_category[making_dis_type]
    : 0;
  if (making_charge_type == "per_piece") {
    //total_making_charge = isMaterial ? parseFloat(making_charge) : priceFormat(total_quantity * parseFloat(making_charge));
    total_making_charge = priceFormat(parseFloat(making_charge));
  } else if (making_charge_type == "per_gram") {
    total_making_charge = priceFormat(total_weight * parseFloat(making_charge));
  }
  let discount_amount = priceFormat(
    (total_making_charge * making_charge_discount_percent) / 100
  );
  total_mrp_price += total_making_charge;
  total_making_charge = priceFormat(total_making_charge - discount_amount);
  total_discount += discount_amount;
  total_sale_price += total_making_charge;

  let total_tax = 0;
  if (tax_info) {
    let igst = 0;
    let cgst = !isEmpty(tax_info.cgst)
      ? priceFormat((total_mrp_price * parseFloat(tax_info.cgst)) / 100, true)
      : 0;
    let sgst = !isEmpty(tax_info.sgst)
      ? priceFormat((total_mrp_price * parseFloat(tax_info.sgst)) / 100, true)
      : 0;
    total_mrp_price += igst + cgst + sgst;
    total_tax = igst + cgst + sgst;
    total_sale_price += priceFormat(igst + cgst + sgst);
  }

  return {
    price: total_price,
    making_charge: total_making_charge,
    making_charge_discount_percent: making_charge_discount_percent || 0,
    making_charge_discount_amount: discount_amount,
    total_material_discount: total_material_discount,
    total_discount: total_discount,
    materials: materialsNew,
    total_weight: weightFormat(total_weight),
    mrp: total_mrp,
    total_mrp_price: priceFormat(total_mrp_price),
    total_sale_price: priceFormat(total_sale_price),
    total_tax: priceFormat(total_tax),
  };
};

const calculateProductPriceCartNew = async (
  stock,
  sub_category,
  isMaterial,
  role_id,
  tax_info,
  fromCart
) => {
  const stockData = stock && !Array.isArray(stock) ? stock : null;
  const materials = Array.isArray(stock)
    ? stock
    : (stockData && Array.isArray(stockData.stockMaterials) ? stockData.stockMaterials : []);
  const stockSize = stockData && stockData.size ? stockData.size : null;

  console.log("role_id : ", role_id);
  let price_type = "",
    discount_type = "",
    making_dis_type = "";
  if (role_id == 3) { // distributor
    price_type = "distributor_price";
    discount_type = "distributor_discount";
    making_dis_type = "distributor_discount";
  } else if (role_id == 2 || role_id == 1) { // admin or superadmin
    price_type = "admin_price";
    discount_type = "admin_discount";
    making_dis_type = "admin_discount";
  } else if (role_id == 4 || role_id == 5) { // retailer/sales executive
    price_type = "retailer_max_price";
    discount_type = "retailer_max_discount";
    making_dis_type = "retailer_discount";
  } else /* if (role_id == 6) */ { // customer
    price_type = "customer_price";
    discount_type = "customer_discount";
    making_dis_type = "customer_discount";
  }

  let materialsNew = [],
    total_weight = 0,
    total_quantity = 0,
    total_price = 0,
    total_mrp = 0,
    total_discount = 0,
    total_material_discount = 0,
    total_mrp_price = 0,
    total_sale_price = 0;

    /*let dis_type = "customer_discount",
      macking_dis_type = "customer_discount";
    if (role_id == 4 || role_id == 5) {
      dis_type = "retailer_max_discount";
      macking_dis_type = "retailer_discount";
    } else {
      dis_type = "customer_discount";
      macking_dis_type = "customer_discount";
    }*/
      //console.log(materials.get({ plain: true}));

  /* for all stock metirials */
  for (let i = 0; i < materials.length; i++) {
    let materialPriceObj = await MaterialPriceModel.findOne({
      where: { material_id: materials[i].material_id },
      include: [
        {
          model: MaterialPricePurityModel,
          as: "materialPricePurities",
          where: { purity_id: materials[i].purity_id },
          separate: true,
        },
      ],
    });
    let price = 0,
      mrp = 0,
      unit_based_mrp = 0,
      discount_percent = 0,
      discount_amount = 0,
      total_gram = 0,
      unit_name =
        "unit" in materials[i] && materials[i].unit
          ? materials[i].unit.name
          : "";
    let purities = [];
    if (materialPriceObj && materialPriceObj.materialPricePurities.length) {
      /*let purityIds = arrayColumn(materials[i].purities, "id");
      
      let materialPriceObj = await MaterialPriceModel.findOne({
        where: { material_id: materials[i].material_id },
        include: [
          {
            model: MaterialPricePurityModel,
            as: "materialPricePurities",
            where: { purity_id: { [Op.in]: purityIds } },
            separate: true,
          },
        ],
      });*/

      let materialPrice = materialPriceObj.materialPricePurities[0];
      mrp = parseFloat(materialPrice.per_gram_price);

      unit_based_mrp = convertPerGramPriceToPerUnit(
        parseFloat(materialPrice.per_gram_price),
        unit_name
      );
      discount_percent = parseFloat(materialPrice[discount_type]);
      total_gram = convertUnitToGram(unit_name, materials[i].weight);
      if (!fromCart) {
        if (isMaterial) {
          let perWeight =
            parseFloat(materials[i].weight) / parseInt(materials[i].quantity);
          total_gram = convertUnitToGram(unit_name, 1);
          //console.log(total_gram)
        }
        //total_gram = isMaterial ? weightFormat(total_gram / parseInt(materials[i].quantity)) : total_gram;
      }

      total_weight += parseFloat(total_gram);
      total_quantity += parseInt(materials[i].quantity);
      price =
        materialPrice.per_gram_price -
        (materialPrice.per_gram_price * discount_percent) / 100;
      price = priceFormat(price * parseFloat(total_gram));
      mrp = priceFormat(mrp * parseFloat(total_gram));
      total_price += price;
      total_mrp += mrp;
      discount_amount = priceFormat(
        mrp - price
      );
      //priceFormat((materialPrice.per_gram_price * discount_percent) / 100);
      total_material_discount += discount_amount;
      total_discount += discount_amount;

      total_mrp_price += mrp;
      total_sale_price += price;

      purities.push({
        id: materialPrice.purity_id,
        name: materials[i].purity.name,
        price: price,
        mrp_price: mrp,
        is_selected: true,
        discount_percent: priceFormat(discount_percent, true),
      });


      /*for (
        let p = 0;
        p < materialPriceObj.materialPricePurities.length;
        p++
      ) {
        let materialPrice = materialPriceObj.materialPricePurities[p];
        let discount = materialPrice[dis_type]
          ? materialPrice[dis_type]
          : 0;
        let price =
          materialPrice.per_gram_price -
          (materialPrice.per_gram_price * discount) / 100;
        price = priceFormat(price * parseFloat(total_gram));
        let price_without_dis = priceFormat(
          materialPrice.per_gram_price * parseFloat(total_gram)
        );
        let m = _.filter([materials[i].purity], {
          id: materialPrice.purity_id,
        });
        purities.push({
          id: materialPrice.purity_id,
          name: materials[i].purity.name,
          price: price,
          mrp_price: price_without_dis,
          is_selected: p == 0 ? true : false,
          discount_percent: priceFormat(discount, true),
        });
        if (p == 0) {
          total_mrp_price += price_without_dis;
          total_sale_price += price;
          material_price = price;
          mrp_price = price_without_dis;
          discount_percent = priceFormat(discount, true);
        }
      }*/
    }
    //console.log("===============================");
    materials[i] = materials[i].get({ plain: true});
    //console.log(materials); return false;
    materialsNew.push({
      ...materials[i],
      material_name: materials[i].material.name,
      material_id: materials[i].material_id,
      purities: purities, //[materials[i].purity],
      mrp_price: mrp,
      unit_based_mrp: unit_based_mrp,
      //weight: materials[i].weight,
      unit_name: unit_name,
      price: price,
      discount_percent: discount_percent,
      discount_amount: discount_amount,
      total_gram: weightFormat(total_gram),
    });
  }
  /* product weight */
  let product_weight_display = "";
  if (isMaterial && materialsNew[0]) {
    product_weight_display =
      materialsNew[0].weight +
      " " +
      materialsNew[0].unit_name;
  } else {
    product_weight_display = total_weight + " gram";
  }
  /* making charge */
  let total_making_charge = 0;
  let making_charge_type = sub_category ? sub_category.making_charge_type : "";
  let making_charge = sub_category ? sub_category.making_charge : 0;
  let making_charge_discount_percent = sub_category
    ? sub_category[making_dis_type]
    : 0;
  if (making_charge_type == "per_piece") {
    //total_making_charge = isMaterial ? parseFloat(making_charge) : priceFormat(total_quantity * parseFloat(making_charge));
    total_making_charge = priceFormat(parseFloat(making_charge));
  } else if (making_charge_type == "per_gram") {
    total_making_charge = priceFormat(total_weight * parseFloat(making_charge));
  }

  let making_discount_amount = priceFormat(
    (total_making_charge * making_charge_discount_percent) / 100
  );
  total_mrp_price += total_making_charge;
  let total_making_charge_mrp = total_making_charge;
  total_making_charge = priceFormat(total_making_charge - making_discount_amount);
  
  total_discount += making_discount_amount;
  total_sale_price += total_making_charge;

  let total_tax = 0;
  console.log("tax_info : ", tax_info);
  if (tax_info) {
    /* let igst = 0;
    let cgst = !isEmpty(tax_info.cgst)
      ? priceFormat((total_mrp_price * parseFloat(tax_info.cgst)) / 100, true)
      : 0;
    let sgst = !isEmpty(tax_info.sgst)
      ? priceFormat((total_mrp_price * parseFloat(tax_info.sgst)) / 100, true)
      : 0;
    total_mrp_price += igst + cgst + sgst;
    total_tax = igst + cgst + sgst;
    total_sale_price += priceFormat(igst + cgst + sgst); */

    let igst = 0;
    let cgst = !isEmpty(tax_info.cgst)
      ? priceFormat(
          (total_sale_price * parseFloat(tax_info.cgst)) / 100,
          true
        )
      : 0;
    let sgst = !isEmpty(tax_info.sgst)
      ? priceFormat(
          (total_sale_price * parseFloat(tax_info.sgst)) / 100,
          true
        )
      : 0;
    let cgst_m = !isEmpty(tax_info.cgst)
      ? priceFormat(
          (total_mrp_price * parseFloat(tax_info.cgst)) / 100,
          true
        )
      : 0;
    let sgst_m = !isEmpty(tax_info.sgst)
      ? priceFormat(
          (total_mrp_price * parseFloat(tax_info.sgst)) / 100,
          true
        )
      : 0;
    total_mrp_price += igst + cgst_m + sgst_m;
    total_sale_price += igst + cgst + sgst;
    console.log(`igst + cgst + sgst : ${igst} + ${cgst} + ${sgst}, ${priceFormat(igst + cgst + sgst)}`);
    total_tax = priceFormat(igst + cgst + sgst);
  }

  let discount_percent =
  total_mrp_price > total_sale_price
    ? Math.round(
        priceFormat(
          ((total_mrp_price - total_sale_price) / total_mrp_price) * 100
        )
      )
    : 0;

  return {
    size_id: stockSize && stockSize.id ? stockSize.id : null,
    size_name: stockSize && stockSize.name ? stockSize.name : "",
    price: total_price,
    making_charge: priceFormat(total_making_charge),
    making_charge_mrp : priceFormat(
      total_making_charge_mrp
    ),
    making_charge_discount_percent: making_charge_discount_percent || 0,
    making_charge_dis_percent: priceFormat(
      making_charge_discount_percent,
      true
    ),
    making_charge_discount_amount: making_discount_amount,
    total_material_discount: total_material_discount,
    total_discount: total_discount,
    materials: materialsNew,
    total_weight: parseFloat(weightFormat(total_weight)).toFixed(3),
    mrp: total_mrp,
    total_mrp_price: priceFormat(total_mrp_price),
    mrp_price: priceFormat(total_mrp_price),
    total_sale_price: priceFormat(total_sale_price),
    sale_price : priceFormat(total_sale_price),
    total_tax: priceFormat(total_tax),
    total_gst: priceFormat(total_tax),
    product_weight_display: product_weight_display,
    discount_percent: discount_percent,
    have_offer: total_mrp_price > total_sale_price ? true : false
  };
};

const calculateProductPriceCart = async (
  materials,
  sub_category,
  isMaterial,
  price_by_role,
  tax_info,
  fromCart
) => {
  let price_type = "",
    discount_type = "",
    making_dis_type = "";
  if (price_by_role == "distributor") {
    price_type = "distributor_price";
    discount_type = "distributor_discount";
    making_dis_type = "distributor_discount";
  } else if (price_by_role == "admin") {
    price_type = "admin_price";
    discount_type = "admin_discount";
    making_dis_type = "admin_discount";
  } else if (price_by_role == "retailer") {
    price_type = "retailer_max_price";
    discount_type = "retailer_max_discount";
    making_dis_type = "retailer_discount";
  } else if (price_by_role == "customer") {
    price_type = "customer_price";
    discount_type = "customer_discount";
    making_dis_type = "customer_discount";
  }

  let materialsNew = [],
    total_weight = 0,
    total_quantity = 0,
    total_price = 0,
    total_mrp = 0,
    total_discount = 0,
    total_material_discount = 0,
    total_mrp_price = 0,
    total_sale_price = 0;
  console.log("materials : ", materials);
  for (let i = 0; i < materials.length; i++) {
    let materialPriceObj = await MaterialPriceModel.findOne({
      where: { material_id: materials[i].material_id },
      include: [
        {
          model: MaterialPricePurityModel,
          as: "materialPricePurities",
          where: { purity_id: materials[i].purity_id },
          separate: true,
        },
      ],
    });
    let price = 0,
      mrp = 0,
      unit_based_mrp = 0,
      discount_percent = 0,
      discount_amount = 0,
      total_gram = 0,
      unit_name =
        "unit" in materials[i] && materials[i].unit
          ? materials[i].unit.name
          : "";
    if (materialPriceObj && materialPriceObj.materialPricePurities.length) {
      let materialPrice = materialPriceObj.materialPricePurities[0];
      mrp = parseFloat(materialPrice.per_gram_price);

      unit_based_mrp = convertPerGramPriceToPerUnit(
        parseFloat(materialPrice.per_gram_price),
        unit_name
      );
      discount_percent = parseFloat(materialPrice[discount_type]);
      total_gram = convertUnitToGram(unit_name, materials[i].weight);
      if (!fromCart) {
        if (isMaterial) {
          let perWeight =
            parseFloat(materials[i].weight) / parseInt(materials[i].quantity);
          total_gram = convertUnitToGram(unit_name, 1);
          //console.log(total_gram)
        }
        //total_gram = isMaterial ? weightFormat(total_gram / parseInt(materials[i].quantity)) : total_gram;
      }

      total_weight += parseFloat(total_gram);
      total_quantity += parseInt(materials[i].quantity);
      price =
        materialPrice.per_gram_price -
        (materialPrice.per_gram_price * discount_percent) / 100;
      price = priceFormat(price * parseFloat(total_gram));
      total_price += price;
      total_mrp += priceFormat(
        parseFloat(materialPrice.per_gram_price) * parseFloat(total_gram)
      );
      discount_amount = priceFormat(
        materialPrice.per_gram_price * parseFloat(total_gram) - price
      );
      priceFormat((materialPrice.per_gram_price * discount_percent) / 100);
      total_material_discount += discount_amount;
      total_discount += discount_amount;

      total_mrp_price += priceFormat(
        parseFloat(materialPrice.per_gram_price) * parseFloat(total_gram)
      );
      total_sale_price += price;
    }
    materialsNew.push({
      material_id: materials[i].material_id,
      mrp: mrp,
      unit_based_mrp: unit_based_mrp,
      price: price,
      discount_percent: discount_percent,
      discount_amount: discount_amount,
      total_gram: weightFormat(total_gram),
    });
  }
  console.log("total_mrp_price : ", total_mrp_price);
  let total_making_charge = 0;
  let making_charge_type = sub_category ? sub_category.making_charge_type : "";
  let making_charge = sub_category ? sub_category.making_charge : 0;
  let making_charge_discount_percent = sub_category
    ? sub_category[making_dis_type]
    : 0;
  if (making_charge_type == "per_piece") {
    //total_making_charge = isMaterial ? parseFloat(making_charge) : priceFormat(total_quantity * parseFloat(making_charge));
    total_making_charge = priceFormat(parseFloat(making_charge));
  } else if (making_charge_type == "per_gram") {
    total_making_charge = priceFormat(total_weight * parseFloat(making_charge));
  }
  let discount_amount = priceFormat(
    (total_making_charge * making_charge_discount_percent) / 100
  );
  total_mrp_price += total_making_charge;
  console.log("total_mrp_price after making charge : ", total_mrp_price);
  total_making_charge = priceFormat(total_making_charge - discount_amount);
  total_discount += discount_amount;
  total_sale_price += total_making_charge;

  let total_tax = 0;
  if (tax_info) {
    let igst = 0;
    let cgst = !isEmpty(tax_info.cgst)
      ? priceFormat((total_mrp_price * parseFloat(tax_info.cgst)) / 100, true)
      : 0;
    let sgst = !isEmpty(tax_info.sgst)
      ? priceFormat((total_mrp_price * parseFloat(tax_info.sgst)) / 100, true)
      : 0;
    total_mrp_price += igst + cgst + sgst;
    console.log("total_mrp_price after tax : ", total_mrp_price);
    total_tax = igst + cgst + sgst;
    total_sale_price += priceFormat(igst + cgst + sgst);
  }

  return {
    price: total_price,
    making_charge: total_making_charge,
    making_charge_discount_percent: making_charge_discount_percent || 0,
    making_charge_discount_amount: discount_amount,
    total_material_discount: total_material_discount,
    total_discount: total_discount,
    materials: materialsNew,
    total_weight: parseFloat(weightFormat(total_weight)).toFixed(3),
    mrp: total_mrp,
    total_mrp_price: priceFormat(total_mrp_price),
    total_sale_price: priceFormat(total_sale_price),
    total_tax: priceFormat(total_tax),
  };
};

const calculateProductPriceReport = async (
  materials,
  sub_category,
  isMaterial,
  price_by_role,
  tax_info,
  fromCart
) => {
  console.log("price_by_role : ", price_by_role);
  let price_type = "",
    discount_type = "",
    making_dis_type = "";
  if (price_by_role == "distributor") {
    price_type = "distributor_price";
    discount_type = "distributor_discount";
    making_dis_type = "distributor_discount";
  } else if (price_by_role == "admin") {
    price_type = "admin_price";
    discount_type = "admin_discount";
    making_dis_type = "admin_discount";
  } else if (price_by_role == "retailer") {
    price_type = "retailer_max_price";
    discount_type = "retailer_max_discount";
    making_dis_type = "retailer_discount";
  } else if (price_by_role == "customer") {
    price_type = "customer_price";
    discount_type = "customer_discount";
    making_dis_type = "customer_discount";
  }

  let materialsNew = [],
    total_weight = 0,
    total_quantity = 0,
    total_price = 0,
    total_mrp = 0,
    total_discount = 0,
    total_material_discount = 0,
    total_mrp_price = 0,
    total_sale_price = 0;
  console.log("materials : ", materials);
  for (let i = 0; i < materials.length; i++) {
    let materialPriceObj = await MaterialPriceModel.findOne({
      where: { material_id: materials[i].material_id },
      include: [
        {
          model: MaterialPricePurityModel,
          as: "materialPricePurities",
          where: { purity_id: materials[i].purity_id },
          separate: true,
        },
      ],
    });
    let price = 0,
      mrp = 0,
      unit_based_mrp = 0,
      discount_percent = 0,
      discount_amount = 0,
      total_gram = 0,
      unit_name =
        "unit" in materials[i] && materials[i].unit
          ? materials[i].unit.name
          : "";
    if (materialPriceObj && materialPriceObj.materialPricePurities.length) {
      let materialPrice = materialPriceObj.materialPricePurities[0];
      //mrp = parseFloat(materialPrice.per_gram_price);
      console.log('price_type:', price_type);
      console.log('materialPrice : ', JSON.stringify(materialPrice));
      //mrp = parseFloat(materialPrice[price_type]);
      mrp = parseFloat(materialPrice.price);
      console.log('material mrp : ', mrp);
      unit_based_mrp = convertPerGramPriceToPerUnit(
        mrp,
        unit_name
      );
      console.log('material unit_based_mrp : ', unit_based_mrp);
      discount_percent = parseFloat(materialPrice[discount_type]);
      console.log('material : ', JSON.stringify(materials[i]));
      total_gram = convertUnitToGram(unit_name, materials[i].weight);
      console.log('material total_gram : ', total_gram);
      if (!fromCart) {
        if (isMaterial) {
          let perWeight =
            parseFloat(materials[i].weight) / parseInt(materials[i].quantity);
          total_gram = convertUnitToGram(unit_name, 1);
          //console.log(total_gram)
        }
        //total_gram = isMaterial ? weightFormat(total_gram / parseInt(materials[i].quantity)) : total_gram;
      }
      
      total_weight += parseFloat(total_gram);
      total_gram = unit_name.toLowerCase() !== "gm" ? parseFloat(materials[i].weight) : parseFloat(total_gram);
      total_quantity += parseInt(materials[i].quantity);
      price =
        mrp -
        (mrp * discount_percent) / 100;
      price = priceFormat(price * parseFloat(total_gram));
      total_price += price;
      total_mrp += unit_name.toLowerCase() !== "gm" ? priceFormat(
        parseFloat(mrp) * parseFloat(materials[i].weight)
      ):priceFormat(
        parseFloat(mrp) * parseFloat(total_gram)
      );
      discount_amount = priceFormat(
        mrp * parseFloat(total_gram) - price
      );
      priceFormat((mrp * discount_percent) / 100);
      total_material_discount += discount_amount;
      total_discount += discount_amount;

      total_mrp_price += unit_name.toLowerCase() !== "gm" ? priceFormat(
        parseFloat(mrp) * parseFloat(materials[i].weight)
      ):priceFormat(
        parseFloat(mrp) * parseFloat(total_gram)
      );
      total_sale_price += price;
    }
    materialsNew.push({
      material_id: materials[i].material_id,
      mrp: mrp,
      unit_based_mrp: unit_based_mrp,
      price: price,
      discount_percent: discount_percent,
      discount_amount: discount_amount,
      total_gram: weightFormat(total_gram),
    });
  }
  console.log("total_mrp_price : ", total_mrp_price);
  let total_making_charge = 0;
  let making_charge_type = sub_category ? sub_category.making_charge_type : "";
  let making_charge = sub_category ? sub_category.making_charge : 0;
  let making_charge_discount_percent = sub_category
    ? sub_category[making_dis_type]
    : 0;
  if (making_charge_type == "per_piece") {
    //total_making_charge = isMaterial ? parseFloat(making_charge) : priceFormat(total_quantity * parseFloat(making_charge));
    total_making_charge = priceFormat(parseFloat(making_charge));
  } else if (making_charge_type == "per_gram") {
    total_making_charge = priceFormat(total_weight * parseFloat(making_charge));
  }
  let discount_amount = priceFormat(
    (total_making_charge * making_charge_discount_percent) / 100
  );
  total_mrp_price += total_making_charge;
  console.log("total_mrp_price after making charge : ", total_mrp_price);
  total_making_charge = priceFormat(total_making_charge - discount_amount);
  total_discount += discount_amount;
  total_sale_price += total_making_charge;

  let total_tax = 0;
  if (tax_info) {
    let igst = 0;
    let cgst = !isEmpty(tax_info.cgst)
      ? priceFormat((total_mrp_price * parseFloat(tax_info.cgst)) / 100, true)
      : 0;
    let sgst = !isEmpty(tax_info.sgst)
      ? priceFormat((total_mrp_price * parseFloat(tax_info.sgst)) / 100, true)
      : 0;
    total_mrp_price += igst + cgst + sgst;
    console.log("total_mrp_price after tax : ", total_mrp_price);
    total_tax = igst + cgst + sgst;
    total_sale_price += priceFormat(igst + cgst + sgst);
  }

  return {
    price: total_price,
    making_charge: total_making_charge,
    making_charge_discount_percent: making_charge_discount_percent || 0,
    making_charge_discount_amount: discount_amount,
    total_material_discount: total_material_discount,
    total_discount: total_discount,
    materials: materialsNew,
    total_weight: parseFloat(weightFormat(total_weight)).toFixed(3),
    mrp: total_mrp,
    total_mrp_price: priceFormat(total_mrp_price),
    total_sale_price: priceFormat(total_sale_price),
    total_tax: priceFormat(total_tax),
  };
};

const calculateProductPriceByPurity = async (
  materials,
  making_charge,
  making_charge_type,
  isMaterial,
  role
) => {
  role = role === undefined ? "customer" : role;
  let materialsNew = [],
    total_weight = 0,
    total_quantity = 0,
    total_price = 0;
  for (let i = 0; i < materials.length; i++) {
    let materialPriceObj = await MaterialPriceModel.findOne({
      where: { material_id: materials[i].material_id },
      include: [
        {
          model: MaterialPricePurityModel,
          as: "materialPricePurities",
          separate: true,
          include: [
            {
              model: PurityModel,
              as: "purity",
            },
          ],
        },
      ],
    });
    let purities = [];
    let material_price = 0,
      unit_name =
        "unit" in materials[i] && materials[i].unit
          ? materials[i].unit.name
          : "";
    let total_gram = convertUnitToGram(unit_name, materials[i].weight);
    total_gram = isMaterial
      ? weightFormat(total_gram / parseInt(materials[i].quantity))
      : weightFormat(total_gram);
    total_weight += parseFloat(total_gram);
    total_quantity += parseInt(materials[i].quantity);
    if (materialPriceObj && materialPriceObj.materialPricePurities.length) {
      for (let x = 0; x < materialPriceObj.materialPricePurities.length; x++) {
        let materialPrice = materialPriceObj.materialPricePurities[x];
        let discount = 0;
        if (role == "retailer") {
          discount = materialPrice.retailer_max_discount
            ? materialPrice.retailer_max_discount
            : 0;
        } else {
          discount = materialPrice.customer_discount
            ? materialPrice.customer_discount
            : 0;
        }
        let price =
          materialPrice.per_gram_price -
          (materialPrice.per_gram_price * discount) / 100;
        price = priceFormat(price * parseFloat(total_gram));
        if (materials[i].purity_id == materialPrice.purity_id) {
          total_price += price;
          material_price = price;
        }
        purities.push({
          id: materialPrice.purity_id,
          name: materialPrice.purity ? materialPrice.purity.name : "",
          price: price,
          price_display: displayAmount(price),
          is_selected: materials[i].purity_id == materialPrice.purity_id,
        });
      }
    }
    materialsNew.push({
      id: materials[i].material_id,
      name: materials[i].material ? materials[i].material.name : "",
      price: material_price,
      price_display: displayAmount(material_price),
      purities: purities,
      unit_id: materials[i].unit_id,
      weight: materials[i].weight,
      total_gram: total_gram,
      quantity: materials[i].quantity ? parseInt(materials[i].quantity) : 0,
    });
  }
  let total_making_charge = 0;
  if (making_charge_type == "per_piece") {
    total_making_charge = priceFormat(parseFloat(making_charge));
  } else if (making_charge_type == "per_gram") {
    total_making_charge = priceFormat(total_weight * parseFloat(making_charge));
  }
  return {
    price: total_price,
    making_charge: total_making_charge,
    materials: materialsNew,
    total_weight: total_weight,
  };
};

const getDistributorAdmin = async (id, state_id, fullObj) => {
  let user = await UserModel.findOne({ where: { id: id } });
  if (!user) return null;

  if (!state_id) {
    //let user = await UserModel.findOne({ where: { id: id } });
    state_id = user ? user.state_id : 0;
  }

  let admin = await UserModel.findOne({
    //where: { state_id: state_id, role_id: getRoleId("admin") },
    where: { id: user.parent_id },
  });

  if (fullObj) {
    return admin;
  } else {
    return admin ? admin.id : null;
  }
};

const getAdminDistributorIds = async (id, state_id) => {
  if (!state_id) {
    let user = await UserModel.findOne({
      attributes: ["state_id"],
      where: { id: id },
    });
    state_id = user ? user.state_id : 0;
  }
  let ids = await UserModel.findAll({
    where: { state_id: state_id, role_id: getRoleId("distributor") },
    attributes: ["id"],
    raw: true,
  });
  return arrayColumn(ids, "id");
};

const getSuperAdminId = async () => {
  let user = await UserModel.findOne({
    where: { role_id: getRoleId("superadmin") },
  });
  return user.id;
};

const getTotalStockPriceByUser = async (byCategory, userId, type, roleName="admin") => {
  type = type !== undefined ? type : "product";
  let conditions = { type: type };
  if (isArray(userId)) {
    conditions.user_id = { [Op.in]: userId };
  } else {
    conditions.user_id = userId;
  }
  let _include = [
    {
      model: StockMaterialModel,
      as: "stockMaterials",
      required: true,
      separate: true,
      include: [
        {
          model: materialModel,
          as: "material",
          include: [
            {
              model: MaterialPriceModel,
              as: "material_price",
              include: [
                {
                  model: MaterialPricePurityModel,
                  as: "materialPricePurities",
                },
              ],
            },
          ],
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
  ];
  if (type == "product" || type == "return") {
    _include.push({
      model: productsModel,
      as: "product",
      required: true,
      include: [
        {
          model: CategoryModel,
          as: "category",
        },
        {
          model: SubCategoryModel,
          as: "sub_category",
        },
        {
          model: TaxSlabModel,
          as: "tax",
        },
      ],
    });
  } else {
    _include.push({
      model: materialModel,
      as: "material",
      required: true,
      include: [
        {
          model: CategoryModel,
          as: "category",
        },
        {
          model: MaterialPriceModel,
          as: "material_price",
          include: [
            {
              model: MaterialPricePurityModel,
              as: "materialPricePurities",
            },
          ],
        },
      ],
    });
  }

  let stocks = await StockModel.findAll({
    where: conditions,
    include: _include,
  });

  console.log("This is stock value :- " ,stocks.map(s => s.id).join(", "));

  let total_price = 0,
    categories = [];
  for (let i = 0; i < stocks.length; i++) {
    let stock = stocks[i];
    
    let taxInfo = null;
    if (
      (stock.type == "product" || stock.type == "return") &&
      "tax" in stock.product &&
      stock.product.tax
    ) {
      taxInfo = {
        name: stock.product.tax.name,
        cgst: parseFloat(stock.product.tax.cgst),
        sgst: parseFloat(stock.product.tax.sgst),
        igst: parseFloat(stock.product.tax.igst),
      };
    }
    let sub_category = null,
      isMaterial = false,
      category_id = null,
      category_name = "";
    if (stock.type == "product" || stock.type == "return") {
      sub_category = stock.product.sub_category;
      isMaterial = stock.product.type == "material" ? true : false;
      category_id = stock.product.category_id;
      category_name = stock.product.category.name;
    } else {
      isMaterial = true;
      category_id = stock.material.category_id;
      category_name = stock.material.category.name;
    }

    let priceMaterials = await calculateProductPrice(
      stock.stockMaterials,
      sub_category,
      isMaterial,
      roleName,
      taxInfo,
      true
    );
    // console.log(priceMaterials)
    let thisPrice = priceMaterials.total_mrp_price - priceMaterials.total_tax; //priceMaterials.total_mrp_price
    //thisPrice = priceMaterials.total_mrp_price;
    total_price += thisPrice;

    let index = _.findIndex(
      categories,
      (item) => item.category_id == category_id
    );
    let stockQ = !stock.quantity ? 1 : stock.quantity;

    /* if stock does not have certificate_no then consider material qty */
    
    if(stock.certificate_no == ""){
      stockQ = stock.stockMaterials && stock.stockMaterials.length > 0 && stock.stockMaterials[0].quantity?stock.stockMaterials[0].quantity:stockQ;
    }

    if (index !== -1) {
      categories[index].total_amount = priceFormat(
        categories[index].total_amount + thisPrice
      );
      categories[index].quantity =
        parseInt(categories[index].quantity) + parseInt(stockQ);
    } else {
      categories.push({
        category_id: category_id,
        category_name: category_name,
        total_amount: priceFormat(thisPrice),
        quantity: stockQ,
      });
    }
  }

  // console.log(" Total_Prize :- ", + total_price);
  console.log("By categories ---------------: ", categories);
  return byCategory ? categories : priceFormat(total_price);
};

const getUserColumnValue = async (id, column) => {
  let user = await UserModel.findOne({ where: { id: id } });
  return user ? user[column] : null;
};

const getWalletBalance = async (
  userId,
  payment_mode,
  payment_type,
  paymentId
) => {
  try{
    payment_type = payment_type === undefined ? "wallet" : payment_type;
    let paymentIdQ = "";
    if (paymentId) {
      paymentIdQ = " AND id <= " + paymentId;
    }
    console.log("payment_mode : ", payment_mode);
    if (!payment_mode) {
      let query =
        "SELECT SUM(CASE WHEN (type = 'debit') THEN amount ELSE 0 END) AS total_debit, SUM(CASE WHEN (type = 'credit') THEN amount ELSE 0 END) AS total_credit FROM payments WHERE status = 'success' AND payment_belongs = " +
        userId +
        " AND payment_type = '" +
        payment_type +
        "' AND deleted_at IS NULL" +
        paymentIdQ;
        console.log(query);
      const paymentObj = await dbSequelize.query(query, {
        type: QueryTypes.SELECT,
      });
      let total_debit = 0,
        total_credit = 0;
      if (paymentObj.length) {
        total_debit = parseFloat(paymentObj[0].total_debit);
        total_credit = parseFloat(paymentObj[0].total_credit);
      }
      return priceFormat(total_credit - total_debit);
    } else {
      let query = "";
      if(payment_mode == "Advance"){
        query =
          "SELECT SUM(CASE WHEN (type = 'debit') THEN amount ELSE 0 END) AS total_debit, SUM(CASE WHEN (type = 'credit') THEN amount ELSE 0 END) AS total_credit FROM payments WHERE status = 'success' AND  payment_belongs = " +
          userId +
          " AND is_advance = '1' AND payment_type = '" +
          payment_type +
          "' AND deleted_at IS NULL" +
          paymentIdQ;
      } else {
        query =
          "SELECT SUM(CASE WHEN (type = 'debit') THEN amount ELSE 0 END) AS total_debit, SUM(CASE WHEN (type = 'credit') THEN amount ELSE 0 END) AS total_credit FROM payments WHERE status = 'success' AND  payment_belongs = " +
          userId +
          " AND payment_mode = '" +
          payment_mode +
          "' AND payment_type = '" +
          payment_type +
          "' AND deleted_at IS NULL" +
          paymentIdQ;
          
      }
      console.log(query);
      const paymentObj = await dbSequelize.query(query, {
        type: QueryTypes.SELECT,
      });
      let total_debit = 0,
        total_credit = 0;
      if (paymentObj.length) {
        total_debit = parseFloat(paymentObj[0].total_debit);
        total_credit = parseFloat(paymentObj[0].total_credit);
      }
      if(payment_mode == "Advance"){
        return priceFormat(total_credit - total_debit);
      } else {
        return priceFormat(total_credit - total_debit);
      }
    } 
  } catch(err){
    console.log(err);
  }
};

const getNextUserName = async (role, id) => {
  let prefix = "";
  let roleId = getRoleId(role);
  if (role == "admin") {
    prefix = "RVA-";
  } else if (role == "distributor") {
    prefix = "RVD-";
  } else if (role == "sales_executive") {
    prefix = "RVS-";
  } else if (role == "retailer") {
    prefix = "RVR-";
  } else if (role == "employee") {
    prefix = "RVE-";
  } else if (role == "supplier") {
    prefix = "RVS-";
  } else if (role == "investor") {
    prefix = "RVI-";
  }
  if (!isEmpty(id)) {
    return prefix + id;
  } else {
    let user = await UserModel.findOne({
      where: { role_id: roleId },
      order: [["id", "DESC"]],
    });
    return user ? prefix + (user.id + 1) : prefix + 1;
  }
};

const getWorkingUserID = async (req) => {
  let role = req.role;
  let arrRoles = [1, 2, 3, 4, 5, 6, 7, 8, 11];
  if (role == 1 || !arrRoles.includes(role)) {
    return await getSuperAdminId();
  } else {
    return req.userId;
  }
};

const isSuperAdmin = (req) => {
  let role = isObject(req) ? req.role : req;
  let arrRoles = [1, 2, 3, 4, 5, 6, 7, 8, 11];
  return role == 1 || !arrRoles.includes(role);
};

const isAdmin = (req) => {
  let role = isObject(req) ? req.role : req;
  return role == 2;
};

const isDistributor = (req) => {
  return req.role == 3;
};

const isSalesExecutive = (req) => {
  return req.role == 4;
};

const isManager = (req) => {
  return req.role == 9;
};

const isRetailer = (req) => {
  let role = isObject(req) ? req.role : req;
  return role == 5;
};

const isCustomer = (req) => {
  let role = isObject(req) ? req.role : req;
  return role == 6;
};

const updateWalletRemainingBalance = async (userId, paymenId, payment_type) => {
  payment_type = payment_type === undefined ? "wallet" : payment_type;
  let remaining_balance = await getWalletBalance(
    userId,
    null,
    payment_type,
    paymenId
  );
  await PaymentModel.update(
    {
      remaining_balance: remaining_balance,
    },
    { where: { id: paymenId } }
  );
};

const updateAdvanceAmount = async (userId, belongsId, amount, isCredit) => {
  amount = parseFloat(amount);
  let advance = await AdvancePaymentModel.findOne({
    attributes: ["amount", "id"],
    where: { user_id: userId, payment_belongs: belongsId },
  });
  if (advance) {
    amount = isCredit
      ? priceFormat(parseFloat(advance.amount) + amount)
      : priceFormat(parseFloat(advance.amount) - amount);
    if (amount < 0) {
      amount = 0;
    }
    await AdvancePaymentModel.update(
      {
        amount: amount,
      },
      { where: { id: advance.id } }
    );
  } else if (isCredit) {
    await AdvancePaymentModel.create({
      user_id: userId,
      payment_belongs: belongsId,
      amount: amount,
    });
  }
};

const getAdvanceAmount = async (userId, belongsId, isSupplier) => {
  // let totalAdvanceCredit = await PaymentModel.sum('amount', { where: { user_id: userId, payment_belongs: belongsId, is_advance: true, payment_type: 'wallet', type: 'credit' } });
  // let totalAdvanceDebit = await PaymentModel.sum('amount', { where: { user_id: userId, payment_belongs: belongsId, is_advance: true, payment_type: 'wallet', type: 'debit' } });
  // totalAdvanceCredit = totalAdvanceCredit ? parseFloat(totalAdvanceCredit) : 0;
  // totalAdvanceDebit = totalAdvanceDebit ? parseFloat(totalAdvanceDebit) : 0;
  // if(isSupplier){
  //     return totalAdvanceDebit > totalAdvanceCredit ? priceFormat((totalAdvanceDebit - totalAdvanceCredit), true) : 0;
  // }else{
  //     return totalAdvanceCredit > totalAdvanceDebit ? priceFormat((totalAdvanceCredit - totalAdvanceDebit), true) : 0;
  // }

  let advanceAmount = 0;

  let advance = await AdvancePaymentModel.findOne({
    attributes: ["amount"],
    where: { user_id: userId, payment_belongs: belongsId },
  });
  //return advance ? parseFloat(advance.amount) : 0;
  if(advance){
    advanceAmount = parseFloat(advance.amount);
  }


  let query = `SELECT SUM(CASE WHEN (type = 'debit') THEN amount ELSE 0 END) AS total_debit, SUM(CASE WHEN (type = 'credit') THEN amount ELSE 0 END) AS total_credit FROM payments WHERE status = 'success' AND payment_belongs = ${belongsId} AND user_id = ${userId} AND payment_type = 'wallet' AND is_advance = '1' AND deleted_at IS NULL`;
  const paymentObj = await dbSequelize.query(query, { type: QueryTypes.SELECT });
  let total_debit = 0, total_credit = 0;
  if(paymentObj.length){
      total_debit = paymentObj[0].total_debit ? parseFloat(paymentObj[0].total_debit) : 0;
      total_credit = paymentObj[0].total_credit ? parseFloat(paymentObj[0].total_credit) : 0;
  }
  advanceAmount = priceFormat(total_credit - total_debit);

  return advanceAmount;

  // let totalDue = 0;
  // let query = `SELECT SUM(CASE WHEN (type = 'debit') THEN amount ELSE 0 END) AS total_debit, SUM(CASE WHEN (type = 'credit') THEN amount ELSE 0 END) AS total_credit FROM payments WHERE status = 'success' AND payment_belongs = ${belongsId} AND user_id = ${userId} AND payment_type = 'wallet' AND deleted_at IS NULL`;
  // const paymentObj = await dbSequelize.query(query, { type: QueryTypes.SELECT });
  // let total_debit = 0, total_credit = 0;
  // if(paymentObj.length){
  //     total_debit = paymentObj[0].total_debit ? parseFloat(paymentObj[0].total_debit) : 0;
  //     total_credit = paymentObj[0].total_credit ? parseFloat(paymentObj[0].total_credit) : 0;
  // }
  // let totalPayment = priceFormat(total_credit - total_debit);
  // if(type == "sale"){
  //     let total_sale_due = await SaleModel.sum('due_amount', { where: { user_id: userId, is_approved: {[Op.ne]: 2 },  is_assigned: false, is_approval: false, sale_by: belongsId  } });
  //     totalDue = total_sale_due ?? 0;
  // }else if(type == "purchase"){
  //     let total_purchase_due = await PurchaseModel.sum('due_amount', { where: { supplier_id: userId, is_approved: {[Op.ne]: 2 },  is_assigned: false, is_approval: false, user_id: belongsId } });
  //     totalDue = total_purchase_due ?? 0;
  // }
  // totalDue = totalDue ? parseFloat(totalDue) : 0;

  // return totalPayment > totalDue ? priceFormat((totalPayment - totalDue), true) : 0;
};

const sendNotification = async (type, req, params, userId) => {
  let message = "",
    postParams = {};
  switch (type) {
    case "sale":
      if (isDistributor(req)) {
        if (params.sale.is_assigned) {
          message = `${params.purchase.invoice_number} New Stock Received from distributor.`;
        }
      } else if (isSalesExecutive(req)) {
        if (params.sale.is_assigned) {
          let name = await getUserColumnValue(req.userId, "name");
          message = `${params.purchase.invoice_number} New Stock Received from ${name}`;
        }
      } else if (isAdmin(req)) {
        if (params.sale.is_assigned) {
          message = `#${params.purchase.invoice_number} New Stock Received from admin`;
        } else {
          message = `#${params.purchase.invoice_number} New Purchase from admin`;
        }
      } else if (isSuperAdmin(req)) {
        if (params.sale.is_assigned) {
          message = `#${params.purchase.invoice_number} New Stock Received from super admin`;
        } else {
          message = `#${params.purchase.invoice_number} New Purchase from super admin`;
        }
      }
      postParams = {
        sale_id: params.sale.id,
        purchase_id: params.purchase.id,
        user_id: params.sale.user_id,
        is_assigned: params.sale.is_assigned,
      };
      break;
    case "purchase_on_approval": 
      message = `${params.sale.invoice_number} sale is pending for approval.`;
      postParams = {
        sale_id: params.sale.id,
        purchase_id: params.purchase.id,
        user_id: params.sale.user_id,
        is_assigned: params.sale.is_assigned,
      };
      break;
    case "purchase_accept":
      if (params.purchase.is_assigned) {
        let name = await getUserColumnValue(req.userId, "name");
        message = `${params.purchase.invoice_number} stock transfer accepted by ${name}`;
        postParams = {
          sale_id: params.purchase.sale_id,
          purchase_id: params.purchase.id,
          user_id: params.purchase.supplier_id,
          is_assigned: params.purchase.is_assigned,
        };
      } else {
        let name = await getUserColumnValue(req.userId, "name");
        message = `${params.purchase.invoice_number} sale accepted by ${name}`;
        postParams = {
          sale_id: params.purchase.sale_id,
          purchase_id: params.purchase.id,
          user_id: params.purchase.supplier_id,
          is_assigned: params.purchase.is_assigned,
        };
      }
      break;
    case "purchase_declined":
      if (params.purchase.is_assigned) {
        let name = await getUserColumnValue(req.userId, "name");
        message = `${params.purchase.invoice_number} stock transfer declined by ${name}`;
        postParams = {
          sale_id: params.purchase.sale_id,
          purchase_id: params.purchase.id,
          user_id: params.purchase.supplier_id,
          is_assigned: params.purchase.is_assigned,
        };
      } else {
        let name = await getUserColumnValue(req.userId, "name");
        message = `${params.purchase.invoice_number} sale declined by ${name}`;
        postParams = {
          sale_id: params.purchase.sale_id,
          purchase_id: params.purchase.id,
          user_id: params.purchase.supplier_id,
          is_assigned: params.purchase.is_assigned,
        };
      }
      break;
    case "order_assigned":
      message = `${params.order.order_no} new order assign to you.`;
      postParams = {
        order_id: params.order.id,
        user_id: params.sales_executive_id,
      };
      break;
    case "order_cancel":
      let name2 = await getUserColumnValue(req.userId, "name");
      message = `${params.order.order_no} has been cancelled by ${name2}.`;
      let superadminId = await getSuperAdminId();
      let userIds = [];
      userIds.push(superadminId);
      if (!isEmpty(params.order.sales_executive_id)) {
        userIds.push(params.order.sales_executive_id);
      }
      if (!isEmpty(params.order.to_user_id)) {
        userIds.push(params.order.to_user_id);
        let adminId = await getDistributorAdmin(params.order.to_user_id);
        if (adminId) {
          userIds.push(adminId);
        }
      }
      const index = userIds.indexOf(req.userId);
      if (index > -1) {
        userIds.splice(index, 1);
      }

      postParams = {
        order_id: params.order.id,
        user_id: userIds,
        order_no: params.order.order_no,
      };
      break;
    case "order_placed":
      let superadminId2 = await getSuperAdminId();
      let user_ids = [superadminId2];
      user_ids.push(params.order.to_user_id);
      let managers = await UserModel.findAll({
        attributes: ["id"],
        where: { role_id: getRoleId("manager") },
      });
      for (let i = 0; i < managers.length; i++) {
        user_ids.push(managers[i].id);
      }
      message = `${params.order_no} new order placed.`;
      postParams = {
        order_id: params.order.id,
        user_id: user_ids,
        order_no: params.order_no,
      };
      break;
    case "return_order_assigned":
      message = `${params.order.order_no} return order assign to you.`;
      postParams = {
        return_order_id: params.returnOrder.id,
        user_id: params.sales_executive_id,
      };
      break;
    case "order_return_request":
      message = `${params.order_no} order return request.`;
      postParams = {
        order_id: params.order.id,
        user_id: params.order.to_user_id,
        order_no: params.order_no,
        return_order_id: params.return_order.id,
      };
      break;
    case "send_money":
      let name = await getUserColumnValue(params.payment.payment_by, "name");
      message = `${name} sent you ${displayAmount(
        params.payment.amount,
        true
      )}.`;
      postParams = { user_id: params.payment.payment_belongs };
      break;
    case "expense":
      if (params.status == "pending") {
        if (isSalesExecutive(req)) {
          let uname = await getUserColumnValue(params.expense.user_id, "name");
          message = `${uname} sent you expense request for ${displayAmount(
            params.expense.amount,
            true
          )}`;
          let user_id = await getSuperAdminId();
          postParams = { user_id: user_id };
        } else {
          let uname = await getUserColumnValue(
            params.expense.created_by,
            "name"
          );
          message = `${uname} sent you ${displayAmount(
            params.expense.amount,
            true
          )} for expense.`;
          postParams = { user_id: params.expense.user_id };
        }
      } else {
        if (isSalesExecutive(req)) {
          let uname = await getUserColumnValue(params.expense.user_id, "name");
          message = `${uname} ${params.status} ${displayAmount(
            params.expense.amount,
            true
          )} for expense.`;
          let user_id = await getSuperAdminId();
          postParams = { user_id: user_id };
        } else {
          let uname = await getUserColumnValue(
            params.expense.created_by,
            "name"
          );
          message = `${uname} ${params.status} ${displayAmount(
            params.expense.amount,
            true
          )} for expense.`;
          postParams = { user_id: params.expense.user_id };
        }
      }
      break;
    case "leave_application":
      if (params.status == "pending") {
        let uname = await getUserColumnValue(params.leave.user_id, "name");
        message = `${uname} request for leave application.`;
        let user_id = await getSuperAdminId();
        postParams = { user_id: user_id };
      } else {
        message = `Superadmin ${params.status} your leave application.`;
        postParams = { user_id: params.leave.user_id };
      }
      break;
    case "sale_return":
      let uname = await getUserColumnValue(params.from_user_id, "name");
      if (params.status == "send_to_superadmin") {
        message = `#${params.sale.invoice_number} Return sale sent from ${uname}`;
      } else {
        let thisStatus = ucWords(params.status.split("_").join(" "));
        message = `#${params.sale.invoice_number} Return sale status changed to ${thisStatus} by ${uname}`;
      }
      postParams = { user_id: params.to_user_id, return_id: params.return_id };
      break;
    case "material_stock_send":
      let uname1 = await getUserColumnValue(params.from_user_id, "name");
      message = `New Material Stock Received from ${uname1}`;
      postParams = {
        user_id: params.to_user_id,
        from_user_id: params.from_user_id,
      };
      break;
  }

  if (!isEmpty(message)) {
    let userIds = postParams.user_id;
    if (!isArray(userIds)) {
      userIds = [postParams.user_id];
    }
    for (let i of userIds) {
      let data = {
        user_id: i,
        type: type,
        params: JSON.stringify(postParams),
        message: message,
      };
      let notification = await NoticationModel.create(data);
      notification = NotificationCollection(notification);
      req.pusher.trigger("Prakriti_channel", `${i}-notification`, notification);
    }
  }
};

const getAdminSEWhereCondition = async (distributors, state_id, isIds) => {
  let distributorsIds = [];
  if (!distributors) {
    state_id = !state_id
      ? await getUserColumnValue(req.userId, "state_id")
      : state_id;
    let distributorRoleId = getRoleId("distributor");
    distributors = await UserModel.findAll({
      where: { role_id: distributorRoleId, state_id: state_id },
    });
    distributorsIds = arrayColumn(distributors, "id");
  } else {
    distributorsIds =
      isIds === true ? distributors : arrayColumn(distributors, "id");
  }
  let sales_executiveRoleId = getRoleId("sales_executive");
  return {
    parent_id: { [Op.in]: distributorsIds },
    role_id: sales_executiveRoleId,
  };
};

const updateCartByCookieID = async (cookie_id, user_id, isNewUser) => {
  if (isNewUser === true) {
    let cart = await cartsModel.findOne({
      where: { cookie_id: cookie_id, user_id: { [Op.is]: null } },
      include: [
        {
          model: cartMaterialsModel,
          as: "cartMaterial",
          separate: true,
        },
      ],
    });
    if (!cart) {
      let carts = await cartsModel.findAll({
        where: { cookie_id: cookie_id, user_id: { [Op.is]: null } },
      });
      for (let i = 0; i < carts.length; i++) {
        let cart = await cartsModel.create({
          product_id: carts[i].product_id,
          type: carts[i].type,
          size_id: carts[i].size_id,
          user_id: user_id,
          cookie_id: null,
          stock_id: carts[i].stock_id,
          sale_product_id: carts[i].sale_product_id,
          discount: carts[i].discount,
          total_weight: carts[i].total_weight,
          discount_type: carts[i].discount_type,
          certificate_no: carts[i].certificate_no,
          rate: carts[i].rate,
          quantity: carts[i].quantity,
          promocode_id: carts[i].promocode_id,
          promocode: carts[i].promocode,
          promocode_discount: carts[i].promocode_discount,
          is_manual: carts[i].is_manual,
        });
        for (let x = 0; x < carts[i].cartMaterial.length; x++) {
          await cartMaterialsModel.create({
            cart_id: cart.id,
            material_id: carts[i].cartMaterial[i].material_id,
            purity_id: carts[i].cartMaterial[i].purity_id,
            weight: carts[i].cartMaterial[i].weight,
            quantity: carts[i].cartMaterial[i].quantity,
            unit_id: carts[i].cartMaterial[i].unit_id,
          });
        }
      }
    } else {
      await cartsModel.update(
        { user_id: user_id },
        { where: { cookie_id: cookie_id } }
      );
    }
  } else {
    await cartsModel.update(
      { user_id: user_id },
      { where: { cookie_id: cookie_id } }
    );
  }
};

const sendEmail = (params) => {
  try {
    let transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: process.env.MAIL_PORT,
      // Port 465 requires implicit TLS. Honour an explicit MAIL_SECURE flag,
      // otherwise default secure=true for 465 (needed for Gmail SMTP).
      secure:
        process.env.MAIL_SECURE != null
          ? process.env.MAIL_SECURE === "true"
          : Number(process.env.MAIL_PORT) === 465,
      auth: {
        user: process.env.MAIL_USERNAME,
        pass: process.env.MAIL_PASSWORD,
      },
    });

    let mailOptions = {
      from: process.env.MAIL_FROM_ADDRESS,
      to: params.to,
      subject: params.subject,
      html: params.message,
    };

    // A plain-text alternative makes the message multipart/alternative instead of
    // HTML-only, which is one of the cheapest deliverability wins — HTML-only mail
    // is a well-known spam signal. Callers that don't supply one are unchanged.
    if (params.text) {
      mailOptions.text = params.text;
    }
    // Give recipients a real address to reply to rather than a no-reply void.
    if (params.replyTo || process.env.MAIL_REPLY_TO) {
      mailOptions.replyTo = params.replyTo || process.env.MAIL_REPLY_TO;
    }

    return new Promise(function (resolve, reject) {
      transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
          console.log("mail error: " + error.toString());
          addLog("mail error: " + error.toString());
          reject(false);
        } else {
          resolve(true);
        }
      });
    });
  } catch (error) {
    addLog("mail catch error: " + error.toString());
    return false;
  }
};

const getProductSizeMaterials = async (
  productId,
  productType,
  withPrice,
  role_id,
  taxInfo,
  sub_category,
  isSingle
) => {
  let size_materials = [];
  let sizeMatarialsData = await ProductSizeMaterialModel.findAll({
    where: { product_id: productId },
    include: [
      {
        model: ProductMaterialModel,
        as: 'productMaterial',
        required: false,
        on: {
          product_id: Sequelize.where(
            Sequelize.col("product_size_materials.product_id"),
            "=",
            Sequelize.col("productMaterial.product_id")
          ),
          material_id: Sequelize.where(
            Sequelize.col("product_size_materials.material_id"),
            "=",
            Sequelize.col("productMaterial.material_id")
          )
        }
      },
      {
        model: MaterialModel,
        as: "material",
      },
      {
        model: SizeModel,
        as: "size",
      },
      {
        model: UnitModel,
        as: "unit",
      },
    ],
    order: [["id", "ASC"]],
  });
  let purityToFirst = ["Grade-C", "Grade-B", "Grade-A"];
  let mgroup = [];
  for (let i = 0; i < sizeMatarialsData.length; i++) {
    let purityIds = sizeMatarialsData[i].purities.split(",").map(Number);
    let purities = await PurityModel.findAll({
      where: { id: { [Op.in]: purityIds } },
    });
    purities = await PurityCollection(purities);
    purities.sort(function (a, b) {
      return purityIds.indexOf(a.id) - purityIds.indexOf(b.id);
    });
    //console.log(sizeMatarialsData[i].size.name, sizeMatarialsData[i].purities)
    //purities.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));

    // for(let p of purityToFirst){
    //     let index = _.findIndex(purities, (item) => item.name == p);
    //     if(index !== -1){
    //         let item = purities[index];
    //         purities.splice(index, 1);
    //         purities.unshift(item);
    //     }
    // }

    if (productType == "material") {
      size_materials.push({
        size_id: "",
        size_name: "",
        materials: [
          {
            material_id: sizeMatarialsData[i].material_id,
            material_name: sizeMatarialsData[i].material
              ? sizeMatarialsData[i].material.name
              : "",
            purities: purities,
            weight: weightFormat(sizeMatarialsData[i].weight),
            unit_id: sizeMatarialsData[i].unit_id,
            quantity: sizeMatarialsData[i].quantity || 0,
            unit_name: sizeMatarialsData[i].unit
              ? sizeMatarialsData[i].unit.name
              : "",
          },
        ],
      });
    } else {
      let index = _.findIndex(
        size_materials,
        (item) => item.size_id == sizeMatarialsData[i].size_id
      );
      let mgIndex = _.findIndex(
        mgroup,
        (item) => sizeMatarialsData[i].productMaterial && sizeMatarialsData[i].productMaterial.group && item == sizeMatarialsData[i].productMaterial.group
      );
      //console.log("sizeMatarialsData[i].productMaterial : ", sizeMatarialsData[i].productMaterial);
      if(mgIndex === -1 && sizeMatarialsData[i].productMaterial && sizeMatarialsData[i].productMaterial.group){
        mgroup.push(sizeMatarialsData[i].productMaterial.group);
      }
      console.log("mgroup : ", mgroup);
      /* group materials */
      //let gmaterials = [];
      /* if(mgroup.length > 0){
        if(!gmaterials[mgIndex]){
          gmaterials[mgIndex] = [];
        }
        
        gmaterials[mgIndex].push({
          material_id: sizeMatarialsData[i].material_id,
          material_name: sizeMatarialsData[i].material
            ? sizeMatarialsData[i].material.name
            : "",
          purities: purities,
          weight: weightFormat(sizeMatarialsData[i].weight),
          unit_id: sizeMatarialsData[i].unit_id,
          quantity: sizeMatarialsData[i].quantity || 0,
          unit_name: sizeMatarialsData[i].unit
            ? sizeMatarialsData[i].unit.name
            : "",
          group: sizeMatarialsData[i].productMaterial?sizeMatarialsData[i].productMaterial.group:false
        }); 
      } else { 
        gmaterials = {
          material_id: sizeMatarialsData[i].material_id,
          material_name: sizeMatarialsData[i].material
            ? sizeMatarialsData[i].material.name
            : "",
          purities: purities,
          weight: weightFormat(sizeMatarialsData[i].weight),
          unit_id: sizeMatarialsData[i].unit_id,
          quantity: sizeMatarialsData[i].quantity || 0,
          unit_name: sizeMatarialsData[i].unit
            ? sizeMatarialsData[i].unit.name
            : "",
          group: sizeMatarialsData[i].productMaterial?sizeMatarialsData[i].productMaterial.group:false
        };
      }*/

      
      if (index !== -1) {
        size_materials[index].materials.push({
          material_id: sizeMatarialsData[i].material_id,
          material_name: sizeMatarialsData[i].material
            ? sizeMatarialsData[i].material.name
            : "",
          purities: purities,
          weight: weightFormat(sizeMatarialsData[i].weight),
          unit_id: sizeMatarialsData[i].unit_id,
          quantity: sizeMatarialsData[i].quantity || 0,
          unit_name: sizeMatarialsData[i].unit
            ? sizeMatarialsData[i].unit.name
            : "",
          group: sizeMatarialsData[i].productMaterial?sizeMatarialsData[i].productMaterial.group:false
        });
        //size_materials[index].materials = gmaterials;
      } else {
        size_materials.push({
          size_id: sizeMatarialsData[i].size_id,
          mgroup: mgroup,
          size_name: sizeMatarialsData[i].size
            ? sizeMatarialsData[i].size.name
            : "",
          materials: [
            {
              material_id: sizeMatarialsData[i].material_id,
              material_name: sizeMatarialsData[i].material
                ? sizeMatarialsData[i].material.name
                : "",
              purities: purities,
              weight: weightFormat(sizeMatarialsData[i].weight),
              unit_id: sizeMatarialsData[i].unit_id,
              quantity: sizeMatarialsData[i].quantity || 0,
              unit_name: sizeMatarialsData[i].unit
                ? sizeMatarialsData[i].unit.name
                : "",
              group: sizeMatarialsData[i].productMaterial?sizeMatarialsData[i].productMaterial.group:false
            },
          ],
          //materials: gmaterials
        });
      }
    }
  }

  //size_materials.sort((a, b) => a.size_name.localeCompare(b.size_name, 'en', { numeric: true }));

  if (withPrice) {
    let dis_type = "customer_discount",
      macking_dis_type = "customer_discount";
    if (role_id == 4 || role_id == 5) {
      dis_type = "retailer_max_discount";
      macking_dis_type = "retailer_discount";
    } else {
      dis_type = "customer_discount";
      macking_dis_type = "customer_discount";
    }

    for (let i = 0; i < size_materials.length; i++) {
      let size_material = size_materials[i];

      let total_mrp_price = 0,
        total_sale_price = 0,
        total_weight = 0,
        total_quantity = 0;
      for (let x = 0; x < size_material.materials.length; x++) {
        let material = size_material.materials[x];
        let purityIds = arrayColumn(material.purities, "id");
        let purities = [];
        let materialPriceObj = await MaterialPriceModel.findOne({
          where: { material_id: material.material_id },
          include: [
            {
              model: MaterialPricePurityModel,
              as: "materialPricePurities",
              where: { purity_id: { [Op.in]: purityIds } },
              separate: true,
            },
          ],
        });
        let material_price = 0,
          mrp_price = 0,
          discount_percent = 0;
        if (materialPriceObj && materialPriceObj.materialPricePurities.length) {
          //console.log(purityIds)
          materialPriceObj.materialPricePurities.sort(function (a, b) {
            return (
              purityIds.indexOf(a.purity_id) - purityIds.indexOf(b.purity_id)
            );
          });

          total_gram = convertUnitToGram(material.unit_name, material.weight);
          total_weight += parseFloat(total_gram);
          total_quantity += parseInt(material.quantity);
          for (
            let p = 0;
            p < materialPriceObj.materialPricePurities.length;
            p++
          ) {
            let materialPrice = materialPriceObj.materialPricePurities[p];
            let discount = materialPrice[dis_type]
              ? materialPrice[dis_type]
              : 0;
            let price =
              materialPrice.per_gram_price -
              (materialPrice.per_gram_price * discount) / 100;
            price = priceFormat(price * parseFloat(total_gram));
            let price_without_dis = priceFormat(
              materialPrice.per_gram_price * parseFloat(total_gram)
            );
            let m = _.filter(material.purities, {
              id: materialPrice.purity_id,
            });
            purities.push({
              id: materialPrice.purity_id,
              name: m[0].name,
              price: price,
              mrp_price: price_without_dis,
              is_selected: p == 0 ? true : false,
              discount_percent: priceFormat(discount, true),
            });
            if (p == 0) {
              total_mrp_price += price_without_dis;
              total_sale_price += price;
              material_price = price;
              mrp_price = price_without_dis;
              discount_percent = priceFormat(discount, true);
            }
          }
        }

        //set price data
        //purities.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
        for (let p of purityToFirst) {
          let index = _.findIndex(purities, (item) => item.name == p);
          if (index !== -1) {
            let item = purities[index];
            purities.splice(index, 1);
            purities.unshift(item);
          }
        }
        size_material.materials[x].purities = purities;
        size_material.materials[x].price = material_price;
        size_material.materials[x].mrp_price = mrp_price;
        size_material.materials[x].discount_percent = discount_percent;
      }

      //manage making charge & tax
      let total_making_charge = 0;
      total_weight = weightFormat(total_weight);
      let making_charge_type = sub_category.making_charge_type;
      let making_charge = sub_category.making_charge;
      let making_charge_discount_percent = sub_category[macking_dis_type] || 0;
      if (making_charge_type == "per_piece") {
        total_making_charge = priceFormat(parseFloat(making_charge));
      } else if (making_charge_type == "per_gram") {
        total_making_charge = priceFormat(
          total_weight * parseFloat(making_charge)
        );
      }
      let discount_amount =
        making_charge_discount_percent > 0
          ? priceFormat(
              (total_making_charge * making_charge_discount_percent) / 100
            )
          : 0;
      total_mrp_price += total_making_charge;
      let total_making_charge_mrp = total_making_charge;
      total_making_charge = priceFormat(total_making_charge - discount_amount);
      total_sale_price += total_making_charge;

      let total_gst = 0;
      if (taxInfo) {
        let igst = 0;
        let cgst = !isEmpty(taxInfo.cgst)
          ? priceFormat(
              (total_sale_price * parseFloat(taxInfo.cgst)) / 100,
              true
            )
          : 0;
        let sgst = !isEmpty(taxInfo.sgst)
          ? priceFormat(
              (total_sale_price * parseFloat(taxInfo.sgst)) / 100,
              true
            )
          : 0;
        let cgst_m = !isEmpty(taxInfo.cgst)
          ? priceFormat(
              (total_mrp_price * parseFloat(taxInfo.cgst)) / 100,
              true
            )
          : 0;
        let sgst_m = !isEmpty(taxInfo.sgst)
          ? priceFormat(
              (total_mrp_price * parseFloat(taxInfo.sgst)) / 100,
              true
            )
          : 0;
        total_mrp_price += igst + cgst_m + sgst_m;
        total_sale_price += igst + cgst + sgst;
        total_gst = priceFormat(igst + cgst + sgst);
      }

      let product_weight_display = "";
      if (productType == "material") {
        product_weight_display =
          size_material.materials[0].weight +
          " " +
          size_material.materials[0].unit_name;
      } else {
        product_weight_display = total_weight + " gram";
      }

      let discount_percent =
        total_mrp_price > total_sale_price
          ? Math.round(
              priceFormat(
                ((total_mrp_price - total_sale_price) / total_mrp_price) * 100
              )
            )
          : 0;

      size_materials[i].mrp_price = priceFormat(total_mrp_price);
      size_materials[i].sale_price = priceFormat(total_sale_price);
      size_materials[i].making_charge = priceFormat(total_making_charge);
      size_materials[i].making_charge_mrp = priceFormat(
        total_making_charge_mrp
      );
      size_materials[i].total_gst = total_gst;
      (size_materials[i].have_offer =
        total_mrp_price > total_sale_price ? true : false),
        (size_materials[i].making_charge_dis_percent = priceFormat(
          making_charge_discount_percent,
          true
        ));
      size_materials[i].product_weight_display = product_weight_display;
      size_materials[i].product_weight_display = product_weight_display;
      size_materials[i].discount_percent = discount_percent;

      if (isSingle) {
        break;
      }
    }
  }

  return size_materials;
};

const getTotalStockByUser = async (userId, type) => {
  console.log("userId is the getTotalStockByUser ===", userId);

  type = type !== undefined ? type : "product";
  let conditions = { type: type };
  if (isArray(userId)) {
    conditions.user_id = { [Op.in]: userId };
  } else {
    conditions.user_id = userId;
  }
  let qty = 0;
  // console.log(" stocks common condition is the  upper  === ", conditions);
  let stocks = await StockModel.findAll({ where: conditions });
  for (let i = 0; i < stocks.length; i++) {
    qty += stocks[i].quantity ? parseInt(stocks[i].quantity) : 1;
  }

  return qty;
};

const getTransferSale = async (userId, type) => {

  console.log("this is the userId ====", userId||"this is not defiend userId");
  
  const getModelObject_data = async (data, userId) => {
    // console.log(" call in the getModelObject_data");

    let no_of_products = await SaleProductModel.count({
      where: { sale_id: data.id },
    });

    // console.log(no_of_products, "no_of_products is the count");
    

    return await {
      no_of_products: no_of_products,
      total_amount: data.total_amount,
    };
  };


  let TransferData = await SaleModel.findAndCountAll({
    order: [["id", "DESC"]],
    where: {
      is_assigned: true,
      is_approval: false,
      is_approved: "0",
      sale_by: userId,
    },
    include: [
      {
        model: UserModel,
        as: "user",
      },
      {
        model: UserModel,
        as: "saleBy",
      },
    ],
    distinct: true,
  })
    .then(async (data) => {
      console.log(
        "this is call the SaleListCollection ========",
        data.rows.length
      );
      let arr = [];
      for (let i = 0; i < data.rows.length; i++) {
        arr.push(await getModelObject_data(data.rows[i], userId));
      }

      return arr;
    })
    .catch((err) => {
      console.log("Error in getTransferSale: ", err);
    });

  let totalStock = 0,totalPrice=0

  TransferData.map((item) => {
    console.log("this is the item ========", item);
    totalStock += item.no_of_products;
    totalPrice += item.total_amount;
  });
  // console.log("this is the total stock ========", totalStock);
  return {totalStock,totalPrice};
};

const getMyRetailerIds = async (userId) => {
  let roleId = getRoleId("retailer");
  let ids = await UserToUserModel.findAll({
    where: { to_role_id: roleId, user_id: userId },
    attributes: ["to_user_id"],
    raw: true,
  });
  return arrayColumn(ids, "to_user_id");
};

const insertLoanEMI = async (loan, startDate, emi, amount) => {
  let nextMonth = startDate.add(1, "month");
  startDate = nextMonth.startOf("month");
  let interest_due_date = moment(startDate).add(2, "day").format("YYYY-MM-DD");
  let first_due_date = interest_due_date;
  let c = 1,
    d = 1,
    a = 0,
    b = 0;
  let interestRateYearly = parseFloat(loan.interest);
  d = amount;
  while (c > 0) {
    c = d * (1 + interestRateYearly * 0.0008333) - emi;
    a = a + emi - d * interestRateYearly * 0.0008333;
    b = (a / amount) * 100;
    if (c < 1) {
      c = 0;
      b = 100;
    }
    let loanDetailObj = {
      loan_id: loan.id,
      type: "EMI", //'interest',
      principal_amount: (emi - d * interestRateYearly * 0.0008333).toFixed(0),
      //principal_due_amount: amount,
      remaining_balance: c.toFixed(0),
      interest_amount: (d * interestRateYearly * 0.0008333).toFixed(0),
      emi: emi.toFixed(0),
      interest_due_date: interest_due_date,
      status: "pending",
    };
    await LoanDetailModel.create(loanDetailObj);

    nextMonth = nextMonth.add(1, "month");
    startDate = nextMonth.startOf("month");
    interest_due_date = moment(startDate).add(2, "day").format("YYYY-MM-DD");
    d = c;
  }
  return {
    first_due_date: first_due_date,
  };
};

const updateRetailerAvgReview = async (id) => {
  let query =
    "SELECT AVG(rating) as avg_rating FROM retailer_reviews WHERE retailer_id = " +
    id +
    " AND deleted_at IS NULL";
  const reviewObj = await dbSequelize.query(query, { type: QueryTypes.SELECT });
  let avg_rating = 0;
  if (reviewObj.length) {
    avg_rating = parseFloat(reviewObj[0].avg_rating).toFixed(2);
  }
  await UserModel.update({ avg_rating: avg_rating }, { where: { id: id } });
};

const insertVisit = async (data, t) => {
  if (t) {
    return await RetailerVisitModel.create(data, { transaction: t });
  } else {
    return await RetailerVisitModel.create(data);
  }
};

const productHaveWishlist = async (id, userId) => {
  if (!userId) return false;
  let c = await WishlistModel.count({
    where: { product_id: id, user_id: userId },
  });
  return c ? true : false;
};

const getOrderStatusProgress = (data) => {
  let status_progress = [];
  if (data.status == "pending") {
    status_progress = [
      {
        status: "accepted",
        status_display: "Order Awaiting Approval",
        date: "",
        is_active: false,
      },
      {
        status: "on_process",
        status_display: "On Process",
        date: "",
        is_active: false,
      },
      {
        status: "is_ready",
        status_display: "Order Ready",
        date: "",
        is_active: false,
      },
      {
        status: "shipped",
        status_display: "Order Shipped",
        date: "",
        is_active: false,
      },
      {
        status: "out_for_delivery",
        status_display: "Out For Delivery",
        date: "",
        is_active: false,
      },
      {
        status: "delivered",
        status_display: "Delivered",
        date: "",
        is_active: false,
      },
    ];
  } else if (data.status == "accepted") {
    status_progress = [
      {
        status: "accepted",
        status_display: "Order Accepted",
        date: formatDateTime(data.accepted_at, 7),
        is_active: true,
      },
      {
        status: "on_process",
        status_display: "On Process",
        date: "",
        is_active: false,
      },
      {
        status: "is_ready",
        status_display: "Order Ready",
        date: "",
        is_active: false,
      },
      {
        status: "shipped",
        status_display: "Order Shipped",
        date: "",
        is_active: false,
      },
      {
        status: "out_for_delivery",
        status_display: "Out For Delivery",
        date: "",
        is_active: false,
      },
      {
        status: "delivered",
        status_display: "Delivered",
        date: "",
        is_active: false,
      },
    ];
  } else if (data.status == "on_process") {
    status_progress = [
      {
        status: "accepted",
        status_display: "Order Accepted",
        date: formatDateTime(data.accepted_at, 7),
        is_active: true,
      },
      {
        status: "on_process",
        status_display: "On Process",
        date: formatDateTime(data.on_process_at, 7),
        is_active: true,
      },
      {
        status: "is_ready",
        status_display: "Order Ready",
        date: "",
        is_active: false,
      },
      {
        status: "shipped",
        status_display: "Order Shipped",
        date: "",
        is_active: false,
      },
      {
        status: "out_for_delivery",
        status_display: "Out For Delivery",
        date: "",
        is_active: false,
      },
      {
        status: "delivered",
        status_display: "Delivered",
        date: "",
        is_active: false,
      },
    ];
  } else if (data.status == "is_ready") {
    status_progress = [
      {
        status: "accepted",
        status_display: "Order Accepted",
        date: formatDateTime(data.accepted_at, 7),
        is_active: true,
      },
      {
        status: "on_process",
        status_display: "On Process",
        date: formatDateTime(data.on_process_at, 7),
        is_active: true,
      },
      {
        status: "is_ready",
        status_display: "Order Ready",
        date: formatDateTime(data.on_ready_at, 7),
        is_active: true,
      },
      {
        status: "shipped",
        status_display: "Order Shipped",
        date: "",
        is_active: false,
      },
      {
        status: "out_for_delivery",
        status_display: "Out For Delivery",
        date: "",
        is_active: false,
      },
      {
        status: "delivered",
        status_display: "Delivered",
        date: "",
        is_active: false,
      },
    ];
  } else if (data.status == "shipped") {
    status_progress = [
      {
        status: "accepted",
        status_display: "Order Accepted",
        date: formatDateTime(data.accepted_at, 7),
        is_active: true,
      },
      {
        status: "on_process",
        status_display: "On Process",
        date: formatDateTime(data.on_process_at, 7),
        is_active: true,
      },
      {
        status: "is_ready",
        status_display: "Order Ready",
        date: formatDateTime(data.on_ready_at, 7),
        is_active: true,
      },
      {
        status: "shipped",
        status_display: "Order Shipped",
        date: formatDateTime(data.shipped_at, 7),
        is_active: true,
      },
      {
        status: "out_for_delivery",
        status_display: "Out For Delivery",
        date: "",
        is_active: false,
      },
      {
        status: "delivered",
        status_display: "Delivered",
        date: "",
        is_active: false,
      },
    ];
  } else if (data.status == "out_for_delivery") {
    status_progress = [
      {
        status: "accepted",
        status_display: "Order Accepted",
        date: formatDateTime(data.accepted_at, 7),
        is_active: true,
      },
      {
        status: "on_process",
        status_display: "On Process",
        date: formatDateTime(data.on_process_at, 7),
        is_active: true,
      },
      {
        status: "is_ready",
        status_display: "Order Ready",
        date: formatDateTime(data.on_ready_at, 7),
        is_active: true,
      },
      {
        status: "shipped",
        status_display: "Order Shipped",
        date: formatDateTime(data.shipped_at, 7),
        is_active: true,
      },
      {
        status: "out_for_delivery",
        status_display: "Out For Delivery",
        date: formatDateTime(data.out_for_delivery_at, 7),
        is_active: true,
      },
      {
        status: "delivered",
        status_display: "Delivered",
        date: "",
        is_active: false,
      },
    ];
  } else if (data.status == "delivered") {
    status_progress = [
      {
        status: "accepted",
        status_display: "Order Accepted",
        date: formatDateTime(data.accepted_at, 7),
        is_active: true,
      },
      {
        status: "on_process",
        status_display: "On Process",
        date: formatDateTime(data.on_process_at, 7),
        is_active: true,
      },
      {
        status: "is_ready",
        status_display: "Order Ready",
        date: formatDateTime(data.on_ready_at, 7),
        is_active: true,
      },
      {
        status: "shipped",
        status_display: "Order Shipped",
        date: formatDateTime(data.shipped_at, 7),
        is_active: true,
      },
      {
        status: "out_for_delivery",
        status_display: "Out For Delivery",
        date: formatDateTime(data.out_for_delivery_at, 7),
        is_active: true,
      },
      {
        status: "delivered",
        status_display: "Delivered",
        date: formatDateTime(data.delivered_at, 7),
        is_active: true,
      },
    ];
  }
  return status_progress;
};

const convertToNotificationGroup = (items) => {
  let arr = [];
  for (let item of items) {
    let index = _.findIndex(arr, (i) => i.type == item.type);
    if (index !== -1) {
      arr[index].items.push(item);
    } else {
      let label = getNotificationLabelByType(item);
      if (!isEmpty(label)) {
        arr.push({
          type: item.type,
          label: label,
          items: [item],
        });
      }
    }
  }
  return arr;
};

const getNotificationLabelByType = (item) => {
  let label = "";
  switch (item.type) {
    case "sale":
      if (item.params.is_assigned) {
        label = "Stock Received";
      } else {
        label = "Purchase";
      }
      break;
    case "purchase_on_approval":
      if (item.params.is_assigned) {
        label = "Purchase assigned";
      } else {
        label = "Purchase on approval";
      }
      break;
    case "purchase_accept":
    case "purchase_declined":
      if (item.params.is_assigned) {
        label = "Stock Transfer";
      } else {
        label = "Sale";
      }
      break;
    case "order_assigned":
      label = "Order Assign";
      break;
    case "order_placed":
    case "order_cancel":
      label = "Order";
      break;
    case "purchase_due":
      label = "Purchase Due";
      break;
    case "sale_due":
      label = "Sale Due";
      break;
    case "sale_settlement":
      label = "Sale Settlement";
      break;
    case "return_order_assigned":
      label = "Return Order Assign";
      break;
    case "order_return_request":
      label = "Return Orders";
      break;
    case "send_money":
      label = "Send Money";
      break;
    case "expense":
      label = "Expense";
      break;
    case "leave_application":
      label = "Leave Application";
      break;
    case "sale_return":
      label = "Sale Return";
      break;
    case "material_stock_send":
      label = "Material Stock";
      break;
    case "retailer_visit":
      label = "Retailer Visit";
      break;
    default:
      label = "";
      break;
  }
  return label;
};

const updateProductAvgReview = async (productId) => {
  let query =
    "SELECT AVG(rating) as avg_rating FROM product_reviews WHERE product_id = " +
    productId +
    " AND deleted_at IS NULL";
  const reviewObj = await dbSequelize.query(query, { type: QueryTypes.SELECT });
  let avg_rating = 0;
  if (reviewObj.length) {
    avg_rating = parseFloat(reviewObj[0].avg_rating).toFixed(2);
  }
  await productsModel.update(
    { avg_rating: avg_rating },
    { where: { id: productId } }
  );
};

const getStockUserID = async (req, userID) => {
  if (!userID) {
    userID = await getWorkingUserID(req);
  }
  return userID;
};

const canStockAddCart = async (stockId, productType, user_id, certificate_no = null) => {
  if (productType == "material") {
    let stock = await StockModel.findOne({
      where: { id: stockId, user_id: user_id },
    });
    let query =
      "SELECT SUM(quantity) as total_quantity FROM carts WHERE stock_id = " +
      stockId +
      " AND deleted_at IS NULL";
    const cart = await dbSequelize.query(query, { type: QueryTypes.SELECT });
    if (
      !stock ||
      !cart.length ||
      !cart[0].total_quantity ||
      cart[0].total_quantity < stock.quantity
    ) {
      can_add_cart = true;
    } else {
      can_add_cart = false;
    }
  } else {
    let cart = await cartsModel.findOne({
      where: { stock_id: stockId, user_id: user_id },
    });
    if (!cart) {
      can_add_cart = true;
    } else {
      can_add_cart = false;
    }
  }

  /* check if already sold or in sale on approval state */
  // if(certificate_no != null){
  //   /* get all sale on approval sale ids by user */
  //   const sales = await SaleModel.findAll({
  //     attributes: ["id"],
  //     where: { 
  //       is_approval: "1",
  //       sale_by: user_id,
  //       is_approved: "3"
  //     }
  //   });
  //   let saleIds = arrayColumn(sales, "id");
  //   const saleProductExists = await SaleProductModel.findOne({
  //     where: { 
  //       certificate_no: certificate_no,
  //       sale_id: { [Op.in]: saleIds }, 
  //     },
  //   });
  //   console.log("---------------------->saleProductExists->>>>>>>>>", saleProductExists);
  //   if (!saleProductExists) {
  //     can_add_cart = true;
  //   } else {
  //     can_add_cart = false;
  //   }
  // }

  return can_add_cart;
};

const updateStockRawMaterialOutStanding = async (
  id,
  data,
  type,
  is_deleted
) => {
  let unit = await UnitModel.findByPk(data.unit_id);
  let unit_name = unit ? unit.name : "";
  let lastStockH = await stockHistoryModel.findOne({
    order: [["id", "DESC"]],
    where: {
      belongs_to: data.user_id,
      material_id: data.material_id,
      id: { [Op.ne]: id },
    },
  });
  if (lastStockH) {
    let outstanding_weight = 0;
    let outstanding_gram =
      type == "credit"
        ? weightFormat(
            parseFloat(lastStockH.outstanding_gram) +
              convertUnitToGram(unit_name, data.weight)
          )
        : weightFormat(
            parseFloat(lastStockH.outstanding_gram) -
              convertUnitToGram(unit_name, data.weight)
          );
    let outstanding_qty =
      type == "credit"
        ? parseInt(lastStockH.outstanding_qty) + parseInt(data.quantity)
        : parseInt(lastStockH.outstanding_qty) - parseInt(data.quantity);
    if (lastStockH.unit_id == data.unit_id) {
      outstanding_weight =
        type == "credit"
          ? weightFormat(
              parseFloat(lastStockH.outstanding_weight) +
                parseFloat(data.weight)
            )
          : weightFormat(
              parseFloat(lastStockH.outstanding_weight) -
                parseFloat(data.weight)
            );
    } else {
      outstanding_weight =
        type == "credit"
          ? weightFormat(
              convertGramToUnit(unit_name, lastStockH.outstanding_gram) +
                parseFloat(data.weight)
            )
          : weightFormat(
              convertGramToUnit(unit_name, lastStockH.outstanding_gram) -
                parseFloat(data.weight)
            );
    }
    await stockHistoryModel.update(
      {
        outstanding_weight: outstanding_weight,
        outstanding_qty: outstanding_qty,
        outstanding_gram: outstanding_gram,
      },
      { where: { id: is_deleted ? lastStockH.id : id } }
    );
  } else {
    if (type == "credit") {
      await stockHistoryModel.update(
        {
          outstanding_weight: data.weight,
          outstanding_qty: data.quantity,
          outstanding_gram: convertUnitToGram(unit_name, data.weight),
        },
        { where: { id: id } }
      );
    } else {
      lastStockH = await stockHistoryModel.findOne({
        order: [["id", "DESC"]],
        where: { belongs_to: data.user_id, material_id: data.material_id },
      });
      if (lastStockH) {
        let outstanding_weight = 0;
        let outstanding_gram = weightFormat(
          parseFloat(lastStockH.outstanding_gram) -
            convertUnitToGram(unit_name, data.weight)
        );
        let outstanding_qty =
          parseInt(lastStockH.outstanding_qty) - parseInt(data.quantity);
        if (lastStockH.unit_id == data.unit_id) {
          outstanding_weight = weightFormat(
            parseFloat(lastStockH.outstanding_weight) - parseFloat(data.weight)
          );
        } else {
          outstanding_weight = weightFormat(
            convertGramToUnit(unit_name, lastStockH.outstanding_gram) -
              parseFloat(data.weight)
          );
        }
        await stockHistoryModel.update(
          {
            outstanding_weight: outstanding_weight,
            outstanding_qty: outstanding_qty,
            outstanding_gram: outstanding_gram,
          },
          { where: { id: lastStockH.id } }
        );
      }
    }
  }
  return true;
};

const getTodayAttendence = async (user, date) => {
  let today = date ? date : moment().format("YYYY-MM-DD");
  let attendance = await AttendanceModel.findOne({
    where: {
      user_id: user.id,
      type: "login",
      ...getDateFromToWhere(today, today),
    },
  });
  let status = "";
  if (attendance) {
    status = attendance.status;
  } else {
    let to_time = moment(
      moment().format(`YYYY-MM-DD ${globalConfig.employee_login_to}`)
    );
    if (moment().isAfter(moment(user.createdAt)) && moment().isAfter(to_time)) {
      status = "absent";
    } else {
      status = "pending";
    }
  }
  if (status == "absent") {
    let holiday = await HolidayModel.findOne({ where: { date: today } });
    let leave = await haveLeave(user.id, today);
    if (holiday || isWeeklyHoliday(today, user.weekly_holidays) || leave) {
      status = "";
    }
  }
  return status;
};

const getLoginLogoutAddress = async (userId, date) => {
  date = !date ? moment().format("YYYY-MM-DD") : date;
  let attendance = await AttendanceModel.findOne({
    where: {
      user_id: userId,
      type: "login",
      createdAt: {
        [Op.gte]: moment().format("YYYY-MM-DD 11:00:00"),
      },
    },
  });
  let login_details = "",
    logout_details = "";
  if (attendance) {
    login_details = {
      address: !isEmpty(attendance.address)
        ? attendance.address
        : getFormatedAddress(attendance),
      lat: attendance.lat,
      lng: attendance.lng,
    };
  }
  let attendance2 = await AttendanceModel.findOne({
    order: [["id", "DESC"]],
    where: {
      user_id: userId,
      type: "logout",
      createdAt: {
        [Op.gte]: moment().format("YYYY-MM-DD 11:00:00"),
      },
    },
  });
  if (attendance2) {
    logout_details = {
      address: !isEmpty(attendance2.address)
        ? attendance2.address
        : getFormatedAddress(attendance2),
      lat: attendance2.lat,
      lng: attendance2.lng,
    };
  }
  return {
    login: login_details,
    logout: logout_details,
  };
};

const getTotalAbsent = async (user, month, year) => {
  let current_month = month;
  let last_day = moment(year + "-" + month, "YYYY-MM").daysInMonth();
  let first_date = moment().format(year + "-" + current_month + "-01");
  let next_month = current_month < 12 ? parseInt(current_month) + 1 : 1;
  let formatted_next_month = next_month < 10 ? "0" + next_month : next_month;
  let next_year = month > next_month ? parseInt(year) + 1 : year;
  let end_date =
    moment().format(next_year + "-" + formatted_next_month + "-") + "01";
  conditions = {
    created_at: { [Op.between]: [first_date, end_date] },
    user_id: user.id,
    [Op.or]: [{ status: "present" }, { status: "absent" }],
  };
  let all_attendances = await AttendanceModel.findAll({ where: conditions });
  let attendance_arr = AttendanceCollection(all_attendances);
  let total_absent = 0;

  let holidays = await HolidayModel.findAll({
    where: { date: { [Op.between]: [first_date, end_date] } },
  });
  holidays = HolidayCollection(holidays);
  for (let i = 1; i <= last_day; i++) {
    let j = i < 10 ? "0" + i : i;
    let current_date = moment(year + "-" + current_month + "-" + j);
    let status_arr = _.map(
      _.filter(attendance_arr, { date: current_date.format("YYYY-MM-DD") }),
      "status"
    );
    let status = !isEmpty(status_arr) ? status_arr[0] : "";
    if (isEmpty(status)) {
      if (
        current_date.isAfter(moment(user.createdAt)) &&
        !current_date.isAfter(moment())
      ) {
        status = "absent";
      }
    }
    // if (status == "absent") {
    //     let index = _.findIndex(holidays, (i) => i.date_display == current_date.format('DD/MM/YYYY'));
    //     let leave = await haveLeave(user.id, current_date.format('YYYY-MM-DD'));
    //     if (isWeeklyHoliday(current_date.format('YYYY-MM-DD'), user.weekly_holidays) || index != -1 || leave) {
    //         status = "";
    //     }
    // }
    if (status == "absent" || isEmpty(status)) {
      let index = _.findIndex(
        holidays,
        (i) => i.date_display == current_date.format("DD/MM/YYYY")
      );
      let leave = await haveLeave(user.id, current_date.format("YYYY-MM-DD"));
      if (
        !leave &&
        (moment(current_date).isSame(moment().format("YYYY-MM-DD"), "day") ||
          moment(current_date).isBefore(moment().format("YYYY-MM-DD"))) &&
        (isWeeklyHoliday(
          current_date.format("YYYY-MM-DD"),
          user.weekly_holidays
        ) ||
          index != -1)
      ) {
        status = "present";
      }
    }

    if (status == "absent") {
      total_absent++;
    }
  }
  return total_absent;
};

const haveLeave = async (userId, date) => {
  date = moment(date).format("YYYY-MM-DD");
  let leave = await leaveApplicationModel.findOne({
    where: {
      user_id: userId,
      status: "accepted",
      from_date: {
        [Op.lte]: date,
      },
      to_date: {
        [Op.gte]: date,
      },
    },
  });
  return leave ? true : false;
};

/**
 * Purchase products list filters. Shared by the superadmin and the per-user
 * listing so both stay in sync. Query values are strings, hence the loose !=.
 */
const matchesPurchaseProductFilters = (params, purchase, product) => {
  if (!isObject(params)) return true;
  if (
    !isEmpty(params.category_id) &&
    (!product || product.category_id != params.category_id)
  ) {
    return false;
  }
  if (
    !isEmpty(params.sub_category_id) &&
    (!product || product.sub_category_id != params.sub_category_id)
  ) {
    return false;
  }
  if (!isEmpty(params.supplier_id) && purchase.supplier_id != params.supplier_id) {
    return false;
  }
  return true;
};

const getPurchaseProducts = async (params) => {
  /*let mansgers = await UserModel.findAll({
    attributes: ["id"],
    where: { role_id: getRoleId("manager") },
  });
  let managerIds = arrayColumn(mansgers, "id");
  let superadminId = await getSuperAdminId();f
  managerIds.push(superadminId);*/

  let managerIds = await avlStockUserIdsNew(null, getRoleId("superadmin"));
  //console.log(managerIds);

  let purchases = await PurchaseModel.findAll({
    where: {
      is_approved: { [Op.ne]: 2 },
      is_assigned: false,
      is_approval: false,
      sale_id: { [Op.is]: null },
      //type: { [Op.in]: ["product", "order_purchase"] },
      type: {[Op.ne]: "material"},
      user_id: { [Op.in]: managerIds },
    },
    order: [["createdAt", "DESC"]],
    include: [
      {
        model: PurchaseProductModel,
        as: "purchaseProducts",
        separate: true,
        include: [
          {
            model: productsModel,
            as: "product",
            include: [
              {
                model: CategoryModel,
                as: "category",
              },
            ],
          },
          {
            model: PurchaseProductMaterialModel,
            as: "purchaseMaterials",
            separate: true,
            include: [
              {
                model: MaterialModel,
                as: "material",
              },
              {
                model: PurityModel,
                as: "purity",
              },
              {
                model: UnitModel,
                as: "unit",
              },
            ],
          },
          {
            model: SizeModel,
            as: "size",
          },
        ],
      },
    ],
  });
  let total_purchase_return = await PurchaseModel.sum("return_amount", {
    where: {
      user_id: { [Op.in]: managerIds },
      is_approved: { [Op.ne]: 2 },
      is_assigned: false,
      is_approval: false,
    },
  });

  let items = [],
    total_amount = 0,
    total_product = 0,
    total_return_amount = total_purchase_return,
    total_return_product = 0,
    categories = [];
  for (let i = 0; i < purchases.length; i++) {
    let p = purchases[i];
    total_amount += parseFloat(p.total_payable);
    for (let x = 0; x < p.purchaseProducts.length; x++) {
      let pp = p.purchaseProducts[x];
      let product = pp.product;

      if (pp.is_return) {
        //total_return_amount += parseFloat(p.return_amount);
        total_return_product++;
        continue;
      }
      let pushItem = matchesPurchaseProductFilters(params, p, product);

      let image = "";
      if (product && isArray(product.images)) {
        for (let img = 0; img < product.images.length; img++) {
          // console.log(getFileAbsulatePath(product.images[img].path))
          // console.log(product.images)
          image = getFileAbsulatePath(product.images[img].path);
          break;
        }
      }

      // console.log("---------product data ", product)

      let weight_display = [],
        unit_display = [],
        purity_display = [],
        materialItem = [],
        materialString = [];
      for (let y = 0; y < pp.purchaseMaterials.length; y++) {
        let pm = pp.purchaseMaterials[y];
        let str = pm.material ? pm.material.name : "";
        let weight = pm.weight ? parseFloat(pm.weight) : 0;
        let quantity = pm.quantity ? parseFloat(pm.quantity) : 0;
        let return_qty = pm.return_qty ? parseFloat(pm.return_qty) : 0;
        let return_weight = pm.return_weight ? parseFloat(pm.return_weight) : 0;
        if (return_qty > 0) {
          quantity = quantity - return_qty;
        }
        if (return_weight > 0) {
          weight = weightFormat(weight - return_weight);
        }
        materialItem.push({
          material_id: pm.material_id,
          material_name: pm.material ? pm.material.name : "",
          weight: weight,
          return_weight: return_weight,
          unit_name: pm.unit ? pm.unit.name : "",
          quantity: quantity,
          return_qty: return_qty,
          unit_id: pm.unit_id,
          purity_id: pm.purity_id,
          purity_name: pm.purity ? pm.purity.name : "",
        });
        materialString.push(str);
        if (product && product.type == "material") {
          //console.log(pm.quantity, pm.return_qty, product.name)
          weight_display.push(weightFormat(quantity));
        } else if(product && isEmpty(pp.certificate_no) && product.type != "material"){ 
          weight_display.push(weightFormat(quantity));
        } else {
          weight_display.push(weightFormat(weight));
        }
        unit_display.push(pm.unit ? pm.unit.name : "-");
        purity_display.push(pm.purity ? pm.purity.name : "-");
      }
      let total_weight_display = "";
      if (materialItem.length == 1) {
        total_weight_display =
          weightFormat(materialItem[0].weight) +
          " , " +
          materialItem[0].unit_name;
      } else {
        total_weight_display = weightFormat(pp.total_weight) + " , gm";
      }

      let item = {
        purchase_id: p.id,
        image: image,
        current_image:
          pp.current_image == null
            ? null
            : getFileAbsulatePath(pp.current_image),
        name: product ? product.name : "",
        certificate_no: pp.certificate_no ?? "",
        total_weight_display: total_weight_display,
        stock_material_display: materialString,
        purity_display: purity_display,
        weight_display: weight_display,
        unit_display: unit_display,
        product_code: product ? product.product_code : "",
        size_name: pp.size ? pp.size.name : "",
        mrp_display: displayAmount(pp.total),
      };

      if (pushItem) {
        items.push(item);
      }
      if (product && product.type == "material") {
        total_product += materialItem.length ? materialItem[0].quantity : 0;
        total_return_product += materialItem.length
          ? materialItem[0].return_qty
          : 0;
      } else if(product && isEmpty(pp.certificate_no) && product.type != "material"){
        total_product += materialItem.length ? materialItem[0].quantity : 1;
      } else {
        total_product++;
        //total_return_product++;
      }

      if (product) {
        let index = _.findIndex(
          categories,
          (jj) => jj.category_id == product.category_id
        );
        let stockQ =
          product.type == "material"
            ? materialItem.length
              ? materialItem[0].quantity
              : 0
            : 1;
        if(product && isEmpty(pp.certificate_no) && product.type != "material"){
          stockQ = materialItem.length?materialItem[0].quantity:1;
        }
        if (index !== -1) {
          categories[index].total_amount = priceFormat(
            categories[index].total_amount + priceFormat(pp.total)
          );
          categories[index].quantity =
            parseInt(categories[index].quantity) + parseInt(stockQ);
        } else {
          categories.push({
            category_id: product.category_id,
            category_name: product.category ? product.category.name : "",
            total_amount: priceFormat(pp.total),
            quantity: stockQ,
          });
        }
      }
    }
  }
  return {
    items: items,
    total_amount: priceFormat(total_amount),
    total_return_amount: priceFormat(total_return_amount),
    total_product: total_product,
    total_return_product: total_return_product,
    categories: categories,
  };
};

const getPurchaseProductsUser = async (req, params) => {
  let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
  // fetch pruchase records
  let purchases = await PurchaseModel.findAll({
    where: {
      is_approved: { [Op.ne]: 2 },
      is_assigned: false,
      is_approval: false,
      //sale_id: { [Op.is]: null },
      //type: { [Op.in]: ["product", "order_purchase"] },
      user_id: userID,
    },
    order: [["createdAt", "DESC"]],
    include: [
      {
        model: PurchaseProductModel,
        as: "purchaseProducts",
        separate: true,
        include: [
          {
            model: productsModel,
            as: "product",
            include: [
              {
                model: CategoryModel,
                as: "category",
              },
            ],
          },
          {
            model: PurchaseProductMaterialModel,
            as: "purchaseMaterials",
            separate: true,
            include: [
              {
                model: MaterialModel,
                as: "material",
              },
              {
                model: PurityModel,
                as: "purity",
              },
              {
                model: UnitModel,
                as: "unit",
              },
            ],
          },
          {
            model: SizeModel,
            as: "size",
          },
        ],
      },
    ],
  });
  let total_purchase_return = await PurchaseModel.sum("return_amount", {
    where: {
      user_id: userID,
      is_approved: { [Op.ne]: 2 },
      is_assigned: false,
      is_approval: false,
    },
  });
  let items = [],
    total_amount = 0,
    total_product = 0,
    total_return_amount = total_purchase_return,
    total_return_product = 0,
    categories = [];
  for (let i = 0; i < purchases.length; i++) {
    let p = purchases[i];
    total_amount += parseFloat(p.total_payable);
    for (let x = 0; x < p.purchaseProducts.length; x++) {
      let pp = p.purchaseProducts[x];
      let product = pp.product;
      //total_return_amount += parseFloat(p.return_amount);

      if (pp.is_return) {
        //total_return_amount += parseFloat(p.return_amount);
        total_return_product++;
        continue;
      }

      let pushItem = matchesPurchaseProductFilters(params, p, product);

      let image = "";
      if (product && isArray(product.images)) {
        for (let img = 0; img < product.images.length; img++) {
          // console.log(getFileAbsulatePath(product.images[img].path))
          // console.log(product.images)
          image = getFileAbsulatePath(product.images[img].path);
          break;
        }
      }

      // console.log("---------product data ", product)

      let weight_display = [],
        unit_display = [],
        purity_display = [],
        materialItem = [],
        materialString = [];
      for (let y = 0; y < pp.purchaseMaterials.length; y++) {
        let pm = pp.purchaseMaterials[y];
        let str = pm.material ? pm.material.name : "";
        let weight = pm.weight ? parseFloat(pm.weight) : 0;
        let quantity = pm.quantity ? parseFloat(pm.quantity) : 0;
        let return_qty = pm.return_qty ? parseFloat(pm.return_qty) : 0;
        let return_weight = pm.return_weight ? parseFloat(pm.return_weight) : 0;
        if (return_qty > 0) {
          quantity = quantity - return_qty;
        }
        if (return_weight > 0) {
          weight = weightFormat(weight - return_weight);
        }
        materialItem.push({
          material_id: pm.material_id,
          material_name: pm.material ? pm.material.name : "",
          weight: weight,
          return_weight: return_weight,
          unit_name: pm.unit ? pm.unit.name : "",
          quantity: quantity,
          return_qty: return_qty,
          unit_id: pm.unit_id,
          purity_id: pm.purity_id,
          purity_name: pm.purity ? pm.purity.name : "",
        });
        materialString.push(str);
        if (product && product.type == "material") {
          //console.log(pm.quantity, pm.return_qty, product.name)
          weight_display.push(weightFormat(quantity));
        } else if(product && isEmpty(pp.certificate_no) && product.type != "material"){ 
          weight_display.push(weightFormat(quantity));
        } else {
          weight_display.push(weightFormat(weight));
        }
        unit_display.push(pm.unit ? pm.unit.name : "-");
        purity_display.push(pm.purity ? pm.purity.name : "-");
      }
      let total_weight_display = "";
      if (materialItem.length == 1) {
        total_weight_display =
          weightFormat(materialItem[0].weight) +
          " , " +
          materialItem[0].unit_name;
      } else {
        total_weight_display = weightFormat(pp.total_weight) + " , gm";
      }

      let item = {
        purchase_id: p.id,
        image: image,
        current_image:
          pp.current_image == null
            ? null
            : getFileAbsulatePath(pp.current_image),
        name: product ? product.name : "",
        certificate_no: pp.certificate_no ?? "",
        total_weight_display: total_weight_display,
        stock_material_display: materialString,
        purity_display: purity_display,
        weight_display: weight_display,
        unit_display: unit_display,
        product_code: product ? product.product_code : "",
        size_name: pp.size ? pp.size.name : "",
        mrp_display: displayAmount(pp.total),
      };

      if (pushItem) {
        items.push(item);
      }

      if (product && product.type == "material") {
        total_product += materialItem.length ? materialItem[0].quantity : 0;
        total_return_product += materialItem.length
          ? materialItem[0].return_qty
          : 0;
      } else if(product && isEmpty(pp.certificate_no) && product.type != "material"){
        total_product += materialItem.length ? materialItem[0].quantity : 1;
      } else {
        total_product++;
        //total_return_product++;
      }

      if (product) {
        let index = _.findIndex(
          categories,
          (jj) => jj.category_id == product.category_id
        );
        let stockQ =
          product.type == "material"
            ? materialItem.length
              ? materialItem[0].quantity
              : 0
            : 1;
        if(product && isEmpty(pp.certificate_no) && product.type != "material"){
          stockQ = materialItem.length?materialItem[0].quantity:1;
        }    
        if (index !== -1) {
          categories[index].total_amount = priceFormat(
            categories[index].total_amount + priceFormat(pp.total)
          );
          categories[index].quantity =
            parseInt(categories[index].quantity) + parseInt(stockQ);
        } else {
          categories.push({
            category_id: product.category_id,
            category_name: product.category ? product.category.name : "",
            total_amount: priceFormat(pp.total),
            quantity: stockQ,
          });
        }
      }
    }
  }
  return {
    items: items.reverse(),
    total_amount: priceFormat(total_amount),
    total_return_amount: priceFormat(total_return_amount),
    total_product: total_product,
    total_return_product: total_return_product,
    categories: categories,
  };
};

const getOwnUserSaleProducts = async (req, params, roleId = null) => {
  let userIds = await avlStockUserIdsNew(req, roleId);
  console.log("getOwnUserSaleProducts users ===> ", userIds);
  
  //let superadminId = isManager(req) ? req.userId : await getWorkingUserID(req);
  //userIds.push(superadminId);
  let sales = await SaleModel.findAll({
    where: {
      sale_by: { [Op.in]: userIds },
      //is_assigned: false, is_approval: false, /* is_approved: { [Op.ne]: 2 } */
      /* [Op.or]: [
        { is_approval: false, is_approved: { [Op.ne]: 2 } },
        { is_approval: true, is_approved: 3 },
      ], */
      is_approved: { [Op.ne]: 2 },
      is_assigned: false,
      is_approval: false,
    },
    include: [
      {
        model: SaleProductModel,
        as: "saleProducts",
        separate: true,
        include: [
          {
            model: productsModel,
            as: "product",
            include: [
              {
                model: CategoryModel,
                as: "category",
              },
              {
                model: SubCategoryModel,
                as: "sub_category",
              },
            ],
          },
          {
            model: SizeModel,
            as: "size",
          },
          {
            model: SaleProductMaterialModel,
            as: "saleMaterials",
            separate: true,
            include: [
              {
                model: MaterialModel,
                as: "material",
              },
              {
                model: PurityModel,
                as: "purity",
              },
              {
                model: UnitModel,
                as: "unit",
              },
            ],
          },
        ],
      },
      {
        model: UserModel,
        as: "saleBy",
      },
    ],
  });
  console.log("sales length -----", sales.length);
  let items = [],
    total_amount = 0,
    total_product = 0,
    categories = [];
  for (let i = 0; i < sales.length; i++) {
    let p = sales[i];
    total_amount += parseFloat(p.total_payable);
    for (let x = 0; x < p.saleProducts.length; x++) {
      let pp = p.saleProducts[x];
      let product = pp.product;
      if (pp.is_return) {
        continue;
      }
      let pushItem = true;
      if (isObject(params)) {
        if (!isEmpty(params.category_id)) {
          if (!product || product.category_id != params.category_id) {
            pushItem = false;
          }
        }

        if (!isEmpty(params.sub_category_id)) {
          if (!product || product.sub_category_id != params.sub_category_id) {
            pushItem = false;
          }
        }

        if (!isEmpty(params.sale_by)) {
          if (!p || p.sale_by != params.sale_by) {
            pushItem = false;
          }
        }
      }

      let image = "";
      if (product && isArray(product.images)) {
        for (let img = 0; img < product.images.length; img++) {
          image = getFileAbsulatePath(product.images[img].path);
          break;
        }
      }

      let weight_display = [],
        unit_display = [],
        purity_display = [],
        materialItem = [],
        materialString = [];
      for (let y = 0; y < pp.saleMaterials.length; y++) {
        let pm = pp.saleMaterials[y];
        let str = pm.material ? pm.material.name : "";
        let weight = pm.weight ? parseFloat(pm.weight) : 0;
        let quantity = pm.quantity ? parseFloat(pm.quantity) : 0;
        let return_qty = pm.return_qty ? parseFloat(pm.return_qty) : 0;
        let return_weight = pm.return_weight ? parseFloat(pm.return_weight) : 0;
        if (return_qty > 0) {
          quantity = quantity - return_qty;
        }
        if (return_weight > 0) {
          weight = weightFormat(weight - return_weight);
        }
        materialItem.push({
          material_id: pm.material_id,
          material_name: pm.material ? pm.material.name : "",
          weight: weight,
          unit_name: pm.unit ? pm.unit.name : "",
          quantity: quantity,
          unit_id: pm.unit_id,
          purity_id: pm.purity_id,
          purity_name: pm.purity ? pm.purity.name : "",
        });
        materialString.push(str);
        if (product && product.type == "material") {
          weight_display.push(weightFormat(quantity));
        } else if(product && isEmpty(pp.certificate_no) && product.type != "material"){
          weight_display.push(weightFormat(quantity));
        } else {
          weight_display.push(weightFormat(weight));
        }
        unit_display.push(pm.unit ? pm.unit.name : "-");
        purity_display.push(pm.purity ? pm.purity.name : "-");
      }
      let total_weight_display = "";
      if (materialItem.length == 1) {
        total_weight_display =
          weightFormat(materialItem[0].weight) +
          " , " +
          materialItem[0].unit_name;
      } else {
        total_weight_display = weightFormat(pp.total_weight) + " , gm";
      }

      let item = {
        sale_id: p.id,
        image: image,
        name: product ? product.name : "",
        certificate_no: pp.certificate_no ?? "",
        total_weight_display: total_weight_display,
        stock_material_display: materialString,
        purity_display: purity_display,
        weight_display: weight_display,
        unit_display: unit_display,
        product_code: product ? product.product_code : "",
        size_name: pp.size ? pp.size.name : "",
        mrp_display: displayAmount(pp.total),
        sale_by: p.sale_by,
        sale_by_name: p.saleBy ? p.saleBy.name : "",
      };
      if (pushItem) {
        items.push(item);
      }
      if (product && product.type == "material") {
        total_product += materialItem.length ? materialItem[0].quantity : 0;
      } else if(product && isEmpty(pp.certificate_no) && product.type != "material"){
        total_product += materialItem.length ? materialItem[0].quantity : 1;
      } else {
        total_product++;
      }

      if (product) {
        let index = _.findIndex(
          categories,
          (jj) => jj.category_id == product.category_id
        );
        let stockQ =
          product.type == "material"
            ? materialItem.length
              ? materialItem[0].quantity
              : 0
            : 1;
        if(product && isEmpty(pp.certificate_no) && product.type != "material"){
          stockQ = materialItem.length ? materialItem[0].quantity : 1;
        }
        if (index !== -1) {
          categories[index].total_amount = priceFormat(
            categories[index].total_amount + priceFormat(pp.total)
          );
          categories[index].quantity =
            parseInt(categories[index].quantity) + parseInt(stockQ);
        } else {
          categories.push({
            category_id: product.category_id,
            category_name: product.category ? product.category.name : "",
            total_amount: priceFormat(pp.total),
            quantity: stockQ,
          });
        }
      }
    }
  }
  console.log("items of length is ----------", items.length);

  return {
    items: items,
    total_amount: priceFormat(total_amount),
    total_product: total_product,
    categories: categories,
  };
};

const avlStockUserIdsNew = async (req, roleId = null) => {
  let ownUserIds = [],
    admin_role = getRoleId("admin"),
    adminIds = [],
    distributor_role = getRoleId("distributor"),
    distrIds = [],
    ownUsers = [];

  let userID = 0;
  if (roleId == getRoleId("superadmin")) {
    userID = await getSuperAdminId(); // super admin (should be the first user always)
  } else {
    userID = isManager(req) ? req.userId : await getWorkingUserID(req);
  }

  if (roleId == getRoleId("superadmin")) {
    ownUsers = await UserModel.findAll({
      attributes: ["id", "role_id"],
      where: { own: true, parent_id: userID },
    });
  } else if (roleId == getRoleId("admin")) {
    ownUsers = await UserModel.findAll({
      attributes: ["id", "role_id"],
      where: { own: true, parent_id: userID },
    });
  } else {
    ownUsers = await UserModel.findAll({
      attributes: ["id", "role_id"],
      where: { parent_id: userID },
    });
  }

  /* ownUsers = await UserModel.findAll({
    attributes: ["id", "role_id"],
    where: { own: true, parent_id:userID  },
  }); */

  if (roleId == getRoleId("superadmin")) {
    let mansgers = await UserModel.findAll({
      attributes: ["id"],
      where: { role_id: getRoleId("manager"), parent_id: userID },
    });
    let managerIds = arrayColumn(mansgers, "id");
    ownUserIds = ownUserIds.concat(managerIds);

    for (let i = 0; i < ownUsers.length; i++) {
      ownUserIds.push(ownUsers[i].id);
      if (ownUsers[i].role_id == admin_role) {
        adminIds.push(ownUsers[i].id);
      }
      if (ownUsers[i].role_id == distributor_role) {
        distrIds.push(ownUsers[i].id);
      }
    }

    let admin_distr = await UserModel.findAll({
      attributes: ["id"],
      where: {
        parent_id: { [Op.in]: adminIds },
        own: true,
        role_id: getRoleId("distributor"),
      },
    });
    let admin_distrIds = arrayColumn(admin_distr, "id");

    ownUserIds = ownUserIds.concat(admin_distrIds);
    distrIds = distrIds.concat(admin_distrIds);

    let superadminId = await getSuperAdminId(); //isManager(req) ? req.userId : await getSuperAdminId();
    ownUserIds.push(superadminId);
  } else {
    for (let i = 0; i < ownUsers.length; i++) {
      ownUserIds.push(ownUsers[i].id);
      if (ownUsers[i].role_id == distributor_role) {
        distrIds.push(ownUsers[i].id);
      }
    }

    ownUserIds.push(userID);
  }

  let se = await UserModel.findAll({
    attributes: ["id"],
    where: { 
      //parent_id: { [Op.in]: distrIds },
      [Op.or]: [{ parent_id: { [Op.in]: distrIds } }, { parent_id: { [Op.in]: ownUserIds } }],
      role_id: getRoleId("sales_executive"),
    },
  });
  let seIds = arrayColumn(se, "id");

  return ownUserIds.concat(seIds);
};

const avlStockUserIds = async (req, roleId = null) => {
  let ownUserIds = [],
    distributor_role = getRoleId("distributor"),
    distrIds = [],
    ownUsers = [];

  let userID = isManager(req) ? req.userId : await getWorkingUserID(req);

  if (roleId == getRoleId("superadmin")) {
    ownUsers = await UserModel.findAll({
      attributes: ["id", "role_id"],
      //where: { own: true },
    });
  } else {
    ownUsers = await UserModel.findAll({
      attributes: ["id", "role_id"],
      where: { own: true, parent_id: userID },
    });
  }

  for (let i = 0; i < ownUsers.length; i++) {
    ownUserIds.push(ownUsers[i].id);
    if (ownUsers[i].role_id == distributor_role) {
      distrIds.push(ownUsers[i].id);
    }
  }

  if (roleId == getRoleId("superadmin")) {
    let mansgers = await UserModel.findAll({
      attributes: ["id"],
      where: { role_id: getRoleId("manager") },
    });
    let managerIds = arrayColumn(mansgers, "id");
    ownUserIds = ownUserIds.concat(managerIds);
    let superadminId = await getSuperAdminId(); //isManager(req) ? req.userId : await getSuperAdminId();
    ownUserIds.push(superadminId);
  }

  let se = await UserModel.findAll({
    attributes: ["id"],
    where: {
      //parent_id: { [Op.in]: distrIds },
      [Op.or]: [{ parent_id: { [Op.in]: distrIds } }, { parent_id: { [Op.in]: ownUserIds } }],
      role_id: getRoleId("sales_executive"),
    },
  });
  let seIds = arrayColumn(se, "id");

  return ownUserIds.concat(seIds);
};

module.exports = {
  getRoleId,
  sendOTP,
  getDeliveryCharge,
  getRoleName,
  updateDeviceTokens,
  getSetting,
  setSetting,
  sendSMS,
  updateOrCreate,
  gePermissionValue,
  geStatusValue,
  getMakingChargeType,
  removeMaterialFromStock,
  getCustomRoleIds,
  getProductPrices,
  calculateProductPrice,
  calculateProductPriceCart,
  calculateProductPriceCartNew,
  getDistributorAdmin,
  getSuperAdminId,
  calculateProductPriceByPurity,
  getCartMaterialPrices,
  getTotalStockPriceByUser,
  getUserColumnValue,
  getWalletBalance,
  getNextUserName,
  getWorkingUserID,
  isSuperAdmin,
  isAdmin,
  isDistributor,
  isManager,
  updateWalletRemainingBalance,
  getAdvanceAmount,
  updateAdvanceAmount,
  sendNotification,
  isSalesExecutive,
  getAdminSEWhereCondition,
  isRetailer,
  isCustomer,
  updateCartByCookieID,
  sendEmail,
  getProductSizeMaterials,
  getTotalStockByUser,
  getMyRetailerIds,
  getTransferSale,
  insertLoanEMI,
  updateRetailerAvgReview,
  insertVisit,
  productHaveWishlist,
  getAdminDistributorIds,
  getOrderStatusProgress,
  getNotificationLabelByType,
  convertToNotificationGroup,
  updateProductAvgReview,
  getStockUserID,
  canStockAddCart,
  updateStockRawMaterialOutStanding,
  getTodayAttendence,
  haveLeave,
  getLoginLogoutAddress,
  getTotalAbsent,
  getPurchaseProducts,
  matchesPurchaseProductFilters,
  getPurchaseProductsUser,
  avlStockUserIds,
  avlStockUserIdsNew,
  getOwnUserSaleProducts,
  calculateProductPriceReport
};
