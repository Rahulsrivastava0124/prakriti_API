const config = require("@config/auth.config");
const { errorCodes, formatErrorResponse, formatResponse } = require("@utils/response.config");
const db = require("@models");
const moment = require('moment');
const { isEmpty, getDateFromToWhere, priceFormat, formatDateTime, weightFormat, addLog, convertUnitToGram, ucWords, encodeForStorage, decodeFromStorage, cleanInput } = require("@helpers/helper");
const { updateOrCreate, removeMaterialFromStock, getWalletBalance, getWorkingUserID, isSuperAdmin, updateWalletRemainingBalance, updateAdvanceAmount, getSuperAdminId, sendNotification, isManager } = require("@library/common");
const { getPaginationOptions } = require('@helpers/paginator')
const { ReturnSaleCollection } = require("@resources/superadmin/ReturnSaleCollection");
const { ReturnSaleListCollection } = require("@resources/superadmin/ReturnSaleListCollection");
const { Op } = require("sequelize");
const { isDistributor, isSalesExecutive, isAdmin } = require("../../library/common");
const sequelize = db.sequelize;
const ProductModel = db.products;
const UserModel = db.users;
const ProductSizeModel = db.product_sizes;
const PurityModel = db.purities;
const UnitModel = db.units;
const CategoryModel = db.categories;
const SubCategoryModel = db.sub_categories;
const CertificateModel = db.certificates;
const MaterialModel = db.materials;
const SizeModel = db.sizes;
const StockModel = db.stocks;
const StockMaterialModel = db.stock_materials;
const PurchaseModel = db.purchases;
const PurchaseProductModel = db.purchase_products;
const PurchaseProductMaterialModel = db.purchase_product_materials;
const stockHistoryModel = db.stock_raw_material_histories;
const paymentModel = db.payments;
const ReturnModel = db.returns;
const ReturnProductModel = db.return_products;
const ReturnProductMaterialModel = db.return_product_materials;
const SaleModel = db.sales;
const SaleProductModel = db.sale_products;
const SaleProductMaterialModel = db.sale_product_materials;

/**
 * Retrieve all purchase
 * 
 * @param req
 * @param res
 */
exports.index = async (req, res) => {
  let { page, limit, user_id, search, date_from, date_to, status, sale_return } = req.query;
  let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
  let conditions = {};
  conditions = { table_type: 'sales' };
  if (isDistributor(req) || isSalesExecutive(req)) {
    conditions.seller_id = userID;
  } else if (isAdmin(req)) {
    conditions.user_id = userID;
  } else {
    conditions = { ...conditions, [Op.or]: [{ user_id: userID }, { show_superadmin: true }] }
  }

  let sale_con = {};
  if (!isEmpty(user_id)) {
    sale_con.user_id = supplier_id;
  }
  if (!isEmpty(search)) {
    sale_con.invoice_number = { [Op.like]: `%${search}%` };
  }
  conditions = { ...conditions, ...getDateFromToWhere(date_from, date_to) }

  const paginatorOptions = getPaginationOptions(page, limit);
  ReturnModel.findAndCountAll({
    order: [['id', 'DESC']],
    offset: paginatorOptions.offset,
    limit: paginatorOptions.limit,
    where: conditions,
    include: [
      {
        model: SaleModel,
        as: 'sale',
        where: sale_con,
        include: [
          {
            model: UserModel,
            as: 'user',
          }
        ]
      },
    ]
  }).then(async (data) => {
    let result = {
      items: ReturnSaleListCollection(data.rows),
      total: data.count,
    }
    res.send(formatResponse(result));
  })
    .catch(err => {
      compactLog(err)
      res.status(errorCodes.default).send(formatErrorResponse(err));
    });
};


/**
 * View Purchase
 * 
 * @param {*} req 
 * @param {*} res 
 */
exports.view = async (req, res) => {
  let purchase = await ReturnModel.findOne({
    where: { id: req.params.id },
    include: [
      {
        model: SaleModel,
        as: 'sale',
        include: [
          {
            model: UserModel,
            as: 'user',
          }
        ]
      },
      {
        model: ReturnProductModel,
        as: 'returnProducts',
        separate: true,
        include: [
          {
            model: SaleProductModel,
            as: 'saleProduct',
            include: [
              {
                model: ProductModel,
                as: 'product',
                include: [
                  {
                    model: CategoryModel,
                    as: 'category'
                  }
                ]
              },
              {
                model: SizeModel,
                as: 'size',
              },
            ]
          },
          {
            model: ReturnProductMaterialModel,
            as: 'returnMaterials',
            separate: true,
            include: [
              {
                model: MaterialModel,
                as: 'material',
              },
              {
                model: PurityModel,
                as: 'purity'
              },
              {
                model: UnitModel,
                as: 'unit'
              }
            ]
          }
        ]
      }
    ]
  });
  if (!purchase) {
    return res.status(errorCodes.default).send(formatErrorResponse('Return not found'));
  }
  res.send(formatResponse(await ReturnSaleCollection(purchase)));
};


/**
 * Update Status
 * 
 * @param {*} req 
 * @param {*} res 
 */
exports.updateStatus = async (req, res) => {
  let returnData = await ReturnModel.findOne({ where: { id: req.params.id } });
  if (!returnData) {
    return res.status(errorCodes.default).send(formatErrorResponse('Return not found'));
  }

  let userID = await getWorkingUserID(req);
  let data = req.body;
  /* req_data = new Buffer.from(returnData.req_data, "base64").toString('ascii');
  req_data = req_data.replace(/[\u0000-\u001F]+/g, ""); // remove invisible and invalid characters
  req_data = JSON.parse(req_data); */
  req_data = decodeFromStorage(returnData.req_data);
  let return_products = req_data.return_products;
  let return_data = req_data.return_data;

  let sale = await SaleModel.findOne({
    where: { id: returnData.table_id },
    include: [
      {
        model: SaleProductModel,
        as: 'saleProducts',
        separate: true,
        include: [
          {
            model: SaleProductMaterialModel,
            as: 'saleMaterials',
            separate: true,
          }
        ]
      },
    ]
  });

  if (sale) {
    let purchase = await PurchaseModel.findOne({ where: { sale_id: sale.id } });
    if (purchase) {

      data.status = data.status == 'complete' ? 'completed' : data.status;
      let show_superadmin = returnData.show_superadmin;

      if (data.status == 'accepted' || data.status == 'declined') {
        if (data.status == 'accepted' && req_data.payment_type == "return") {
          let return_amount_from_wallet = 'return_amount_from_wallet' in req_data ? parseFloat(req_data.return_amount_from_wallet) : 0;
          let walletBalance = await getWalletBalance(userID, req_data.return_payment_mode);
          if (return_amount_from_wallet > 0 && walletBalance < return_amount_from_wallet) {
            return res.status(errorCodes.default).send(formatErrorResponse("Insufficient wallet balance."));
          }
        }

        if (data.status == 'accepted') {

          for (let i = 0; i < return_products.length; i++) {
            if (!return_products[i].is_return) {
              continue;
            }

            let thisItem = return_data.products[i];
            let saleProduct = sale.saleProducts[i];

            if (return_data.products[i].product_type == 'material') {
              let total_return_weight = parseFloat(saleProduct.saleMaterials[0].return_weight) + parseFloat(return_data.products[i].materials[0].return_weight);
              let total_return_qty = parseInt(saleProduct.saleMaterials[0].return_qty) + parseInt(return_data.products[i].materials[0].return_qty);
              let is_return = (total_return_qty >= parseInt(saleProduct.saleMaterials[0].quantity) || total_return_weight >= parseFloat(saleProduct.saleMaterials[0].weight)) ? true : false;

              await SaleProductModel.update({ is_return: is_return }, { where: { id: saleProduct.id } });
              await SaleProductMaterialModel.update({
                return_qty: total_return_qty,
                return_weight: total_return_weight
              }, { where: { id: saleProduct.saleMaterials[0].id } });

            } else {
              await SaleProductModel.update({ is_return: true }, { where: { id: saleProduct.id } });
            }

            //move seller stock
            let stock = null;
            let product = await ProductModel.findByPk(thisItem.product_id);
            if (return_data.products[i].product_type == 'material') {
              let quantity = 0, unit_name = '';
              for (let mItem of return_data.products[i].materials) {
                quantity += mItem.return_qty ? parseInt(mItem.return_qty) : 0;
                unit_name = mItem.unit_name;
              }
              let return_weight_in_gram = convertUnitToGram(unit_name, return_data.products[i].materials[0].return_weight);
              let result = await updateOrCreate(StockModel, {
                product_id: thisItem.product_id,
                user_id: sale.sale_by,
                purity_id: thisItem.materials[0].purity_id,
              }, {
                product_id: thisItem.product_id,
                quantity: quantity,
                total_weight: return_weight_in_gram,
                user_id: sale.sale_by,
                purity_id: thisItem.materials[0].purity_id,
              }, null, ['quantity', 'total_weight']);
              stock = result.item;
            } else {
              // Try to get current_image from multiple sources (prioritize most recent/updated image)
              let current_image = null;
              
              // First, check if current_image is in return_data (if provided by frontend)
              if (return_data.products[i] && return_data.products[i].current_image) {
                // Check if it's a base64 string (needs upload) or a path (already uploaded)
                if (return_data.products[i].current_image.startsWith('data:') || return_data.products[i].current_image.startsWith('iVBOR')) {
                  // It's a base64 string, upload it
                  const { base64FileUpload } = require("@helpers/upload");
                  let imageResult = await base64FileUpload(
                    return_data.products[i].current_image,
                    "products"
                  );
                  if (imageResult && imageResult.path) {
                    current_image = imageResult.path;
                  }
                } else {
                  // It's already a path
                  current_image = return_data.products[i].current_image;
                }
              } else if (thisItem.certificate_no) {
                // Second, check Stock records first (most recent/updated - has the latest image)
                let stockQuery = {
                  where: {
                    certificate_no: {
                      [Op.like]: thisItem.certificate_no
                    }
                  },
                  order: [['id', 'DESC']] // Get the most recent one
                };
                let existingStock = await StockModel.findOne(stockQuery);
                if (existingStock && existingStock.current_image) {
                  current_image = existingStock.current_image;
                } else {
                  // Third, check PurchaseProduct by certificate_no (fallback)
                  let purchaseQuery = {
                    where: {
                      certificate_no: {
                        [Op.like]: thisItem.certificate_no
                      }
                    },
                    order: [['id', 'DESC']] // Get the most recent one
                  };
                  let purchaseProduct = await PurchaseProductModel.findOne(purchaseQuery);
                  if (purchaseProduct && purchaseProduct.current_image) {
                    current_image = purchaseProduct.current_image;
                  } else if (thisItem.id) {
                    // Fourth, check PurchaseProduct by ID (last resort)
                    let purchaseProductById = await PurchaseProductModel.findOne({
                      where: { id: thisItem.id }
                    });
                    if (purchaseProductById && purchaseProductById.current_image) {
                      current_image = purchaseProductById.current_image;
                    }
                  }
                }
              }
              
              stock = await StockModel.create({
                purchase_id: purchase.id,
                purchase_product_id: thisItem.id,
                product_id: thisItem.product_id,
                size_id: thisItem.size_id || null,
                certificate_no: cleanInput(thisItem.certificate_no),
                quantity: 1,
                total_weight: thisItem.total_weight,
                current_image: current_image,
                user_id: sale.sale_by
              });
            }

             /**
             * add to stock materials
             */
             for (let x = 0; x < thisItem.materials.length; x++) {
              if (return_data.products[i].product_type == 'material') {
                let stockMaterial = await StockMaterialModel.findOne({ where: { stock_id: stock.id, material_id: thisItem.materials[x].material_id } });
                if (stockMaterial) {
                  let thisquantity = thisItem.materials[x].return_qty ? (parseInt(stockMaterial.quantity) + parseInt(thisItem.materials[x].return_qty)) : stockMaterial.quantity;
                  let unit_name = thisItem.materials[x].unit_name;
                  let return_weight_in_gram = convertUnitToGram(unit_name, thisItem.materials[x].return_weight);
                  await StockMaterialModel.update({
                    weight: weightFormat(parseFloat(stockMaterial.weight) + weightFormat(thisItem.materials[x].return_weight)),
                    weight_in_gram: weightFormat(parseFloat(stockMaterial.weight_in_gram) + weightFormat(return_weight_in_gram)),
                    quantity: thisquantity,
                    purity_id: thisItem.materials[x].purity_id,
                    unit_id: thisItem.materials[x].unit_id,
                    category_id: product.category_id
                  }, { where: { id: stockMaterial.id } });
                } else {
                  let unit_name = thisItem.materials[x].unit_name;
                  let return_weight_in_gram = convertUnitToGram(unit_name, thisItem.materials[x].return_weight);
                  await StockMaterialModel.create({
                    stock_id: stock.id,
                    material_id: thisItem.materials[x].material_id,
                    weight: weightFormat(thisItem.materials[x].return_weight),
                    weight_in_gram: weightFormat(return_weight_in_gram),
                    quantity: thisItem.materials[x].return_qty || 0,
                    purity_id: thisItem.materials[x].purity_id,
                    unit_id: thisItem.materials[x].unit_id,
                    category_id: product.category_id
                  });
                }
              } else {
                let unit_name = thisItem.materials[x].unit_name;
                let return_weight_in_gram = convertUnitToGram(unit_name, thisItem.materials[x].return_weight);
                await StockMaterialModel.create({
                  stock_id: stock.id,
                  material_id: thisItem.materials[x].material_id,
                  weight: weightFormat(thisItem.materials[x].return_weight),
                  weight_in_gram: weightFormat(return_weight_in_gram),
                  quantity: thisItem.materials[x].return_qty || 0,
                  purity_id: thisItem.materials[x].purity_id,
                  unit_id: thisItem.materials[x].unit_id,
                  category_id: product.category_id
                });
              }
            }

          }



          let total_payable = parseFloat(sale.total_payable);
          let return_amount = parseFloat(req_data.return_amount);
          total_payable = priceFormat(total_payable - return_amount);
          let paid_amount = parseFloat(sale.paid_amount);
          let due_amount = priceFormat(total_payable - paid_amount, true);
          let advance_amount = due_amount < 0 ? priceFormat(0 - due_amount) : 0;
          due_amount = due_amount < 0 ? 0 : due_amount;
          if (paid_amount > total_payable) {
            paid_amount = 0;
          }
          // if (!sale.is_assigned && advance_amount > 0) {
          //   let supplier = await UserModel.findByPk(purchase.supplier_id);
          //   if (supplier) {
          //     advance_amount = priceFormat(advance_amount + supplier.advance_amount);
          //     await UserModel.update({ advance_amount: advance_amount }, { where: { id: purchase.supplier_id } });
          //   }
          // }

          let return_amount_from_wallet = 'return_amount_from_wallet' in req_data ? parseFloat(req_data.return_amount_from_wallet) : 0;
          if (req_data.payment_type == "return") {
            if (return_amount_from_wallet > 0) {
              let payment2 = await paymentModel.create({
                payment_mode: req_data.return_payment_mode,
                amount: return_amount_from_wallet,
                user_id: sale.user_id,
                payment_by: userID,
                payment_date: moment().format('YYYY-MM-DD'),
                //txn_id: payment.txn_id,
                //cheque_no: payment.cheque_no,
                status: 'success',
                type: 'debit',
                table_type: 'sale',
                table_id: sale.id,
                payment_belongs: userID,
                purpose: 'sale return'
              });

              await updateWalletRemainingBalance(payment2.payment_belongs, payment2.id);

              let payment3 = await paymentModel.create({
                payment_mode: req_data.return_payment_mode,
                amount: return_amount_from_wallet,
                user_id: userID,
                payment_by: userID,
                payment_date: moment().format('YYYY-MM-DD'),
                //txn_id: payment.txn_id,
                //cheque_no: payment.cheque_no,
                status: 'success',
                type: 'credit',
                table_type: 'purchase',
                table_id: purchase.id,
                payment_belongs: sale.user_id,
                purpose: 'purchase return'
              });

              await updateWalletRemainingBalance(sale.user_id, payment3.id);
            }
          } else {
            if (return_amount_from_wallet > 0) {
              await updateAdvanceAmount(sale.user_id, userID, return_amount_from_wallet, true);
            }
          }

          await SaleModel.update({
            return_amount: return_amount,
            total_payable: total_payable,
            due_amount: due_amount,
            paid_amount: paid_amount
          }, { where: { id: sale.id } });

          await ReturnModel.update({
            status: "accepted"
          }, { where: { id: returnData.id } });

          await ReturnModel.update({
            status: "accepted"
          }, { where: { id: returnData.parent_id } });


        } else {

          for (let i = 0; i < return_products.length; i++) {
            if (!return_products[i].is_return) {
              continue;
            }

            let thisItem = return_data.products[i];
            let product = await ProductModel.findByPk(thisItem.product_id);
            let stock = null;

            let purchaseProduct = await PurchaseProductModel.findOne({
              where: { id: return_products[i].id },
              include: [
                {
                  model: PurchaseProductMaterialModel,
                  as: 'purchaseMaterials'
                }
              ]
            });

            if (product.type == "material") {
              let quantity = 0, unit_name = '';
              for (let mItem of return_data.products[i].materials) {
                quantity += mItem.return_qty ? parseInt(mItem.return_qty) : 0;
                unit_name = mItem.unit_name;
              }
              let return_weight_in_gram = convertUnitToGram(unit_name, return_data.products[i].materials[0].return_weight);
              let result = await updateOrCreate(StockModel, {
                product_id: thisItem.product_id,
                user_id: sale.user_id,
                purity_id: thisItem.materials[0].purity_id,
              }, {
                product_id: thisItem.product_id,
                quantity: quantity,
                total_weight: return_weight_in_gram,
                user_id: sale.user_id,
                purity_id: thisItem.materials[0].purity_id,
              }, null, ['quantity', 'total_weight']);
              stock = result.item;
            } else {
              // Try to get current_image from multiple sources (prioritize most recent/updated image)
              let current_image = null;
              
              // First, check if current_image is in return_data (if provided by frontend)
              if (return_data.products[i] && return_data.products[i].current_image) {
                // Check if it's a base64 string (needs upload) or a path (already uploaded)
                if (return_data.products[i].current_image.startsWith('data:') || return_data.products[i].current_image.startsWith('iVBOR')) {
                  // It's a base64 string, upload it
                  const { base64FileUpload } = require("@helpers/upload");
                  let imageResult = await base64FileUpload(
                    return_data.products[i].current_image,
                    "products"
                  );
                  if (imageResult && imageResult.path) {
                    current_image = imageResult.path;
                  }
                } else {
                  // It's already a path
                  current_image = return_data.products[i].current_image;
                }
              } else if (thisItem.certificate_no) {
                // Second, check Stock records first (most recent/updated - has the latest image)
                let stockQuery = {
                  where: {
                    certificate_no: {
                      [Op.like]: thisItem.certificate_no
                    }
                  },
                  order: [['id', 'DESC']] // Get the most recent one
                };
                let existingStock = await StockModel.findOne(stockQuery);
                if (existingStock && existingStock.current_image) {
                  current_image = existingStock.current_image;
                } else {
                  // Third, check PurchaseProduct by certificate_no (fallback)
                  let purchaseQuery = {
                    where: {
                      certificate_no: {
                        [Op.like]: thisItem.certificate_no
                      }
                    },
                    order: [['id', 'DESC']] // Get the most recent one
                  };
                  let purchaseProductByCert = await PurchaseProductModel.findOne(purchaseQuery);
                  if (purchaseProductByCert && purchaseProductByCert.current_image) {
                    current_image = purchaseProductByCert.current_image;
                  } else if (thisItem.id) {
                    // Fourth, check PurchaseProduct by ID (last resort)
                    let purchaseProductById = await PurchaseProductModel.findOne({
                      where: { id: thisItem.id }
                    });
                    if (purchaseProductById && purchaseProductById.current_image) {
                      current_image = purchaseProductById.current_image;
                    }
                  }
                }
              }
              
              stock = await StockModel.create({
                purchase_id: purchase.id,
                purchase_product_id: thisItem.id,
                product_id: thisItem.product_id,
                size_id: thisItem.size_id || null,
                certificate_no: cleanInput(thisItem.certificate_no),
                quantity: 1,
                total_weight: thisItem.total_weight,
                current_image: current_image,
                user_id: sale.user_id
              });
            }

            if (return_data.products[i].product_type == 'material') {
              let total_return_weight = parseFloat(purchaseProduct.purchaseMaterials[0].return_weight) - parseFloat(return_data.products[i].materials[0].return_weight);
              let total_return_qty = parseInt(purchaseProduct.purchaseMaterials[0].return_qty) - parseInt(return_data.products[i].materials[0].return_qty);
              let is_return = false;

              await PurchaseProductModel.update({ is_return: is_return }, { where: { id: purchaseProduct.id } });
              await PurchaseProductMaterialModel.update({
                return_qty: total_return_qty,
                return_weight: total_return_weight
              }, { where: { id: purchaseProduct.purchaseMaterials[0].id } });

            } else {
              await PurchaseProductModel.update({ is_return: false }, { where: { id: purchaseProduct.id } });
            }


            /**
             * add to stock materials
             */
            for (let x = 0; x < thisItem.materials.length; x++) {
              if (product.type == "material") {
                let stockMaterial = await StockMaterialModel.findOne({ where: { stock_id: stock.id, material_id: thisItem.materials[x].material_id } });
                if (stockMaterial) {
                  let thisquantity = thisItem.materials[x].return_qty ? (parseInt(stockMaterial.quantity) + parseInt(thisItem.materials[x].return_qty)) : stockMaterial.quantity;
                  let unit_name = thisItem.materials[x].unit_name;
                  let return_weight_in_gram = convertUnitToGram(unit_name, thisItem.materials[x].return_weight);
                  await StockMaterialModel.update({
                    weight: weightFormat(parseFloat(stockMaterial.weight) + weightFormat(thisItem.materials[x].return_weight)),
                    weight_in_gram: weightFormat(parseFloat(stockMaterial.weight_in_gram) + weightFormat(return_weight_in_gram)),
                    quantity: thisquantity,
                    purity_id: thisItem.materials[x].purity_id,
                    unit_id: thisItem.materials[x].unit_id,
                    category_id: product.category_id
                  }, { where: { id: stockMaterial.id } });
                } else {
                  let unit_name = thisItem.materials[x].unit_name;
                  let return_weight_in_gram = convertUnitToGram(unit_name, thisItem.materials[x].return_weight);
                  await StockMaterialModel.create({
                    stock_id: stock.id,
                    material_id: thisItem.materials[x].material_id,
                    weight: weightFormat(thisItem.materials[x].return_weight),
                    weight_in_gram: weightFormat(return_weight_in_gram),
                    quantity: thisItem.materials[x].return_qty || 0,
                    purity_id: thisItem.materials[x].purity_id,
                    unit_id: thisItem.materials[x].unit_id,
                    category_id: product.category_id
                  });
                }
              } else {
                let unit_name = thisItem.materials[x].unit_name;
                let return_weight_in_gram = convertUnitToGram(unit_name, thisItem.materials[x].return_weight);
                await StockMaterialModel.create({
                  stock_id: stock.id,
                  material_id: thisItem.materials[x].material_id,
                  weight: weightFormat(thisItem.materials[x].return_weight),
                  weight_in_gram: weightFormat(return_weight_in_gram),
                  quantity: thisItem.materials[x].return_qty || 0,
                  purity_id: thisItem.materials[x].purity_id,
                  unit_id: thisItem.materials[x].unit_id,
                  category_id: product.category_id
                });
              }
            }

          }

          let return_amount = parseFloat(returnData.total_amount)
          let total_payable = parseFloat(purchase.total_payable);
          let purchase_return_amount = parseFloat(purchase.return_amount);
          let paid_amount = parseFloat(purchase.paid_amount);

          total_payable += parseFloat(return_amount);
          let total_return_amount = purchase_return_amount;
          let due_amount = priceFormat(total_payable - paid_amount, true);
          let advance_amount = due_amount < 0 ? priceFormat(0 - due_amount) : 0;
          due_amount = due_amount < 0 ? 0 : due_amount;
          // if (!sale.is_assigned && advance_amount > 0 && isEmpty(purchase.sale_id)) {
          //   let supplier = await UserModel.findByPk(purchase.supplier_id);
          //   if (supplier) {
          //     advance_amount = priceFormat(advance_amount + supplier.advance_amount);
          //     await UserModel.update({ advance_amount: advance_amount }, { where: { id: purchase.supplier_id } });
          //   }
          // }
          if (paid_amount > total_payable) {
            paid_amount = 0;
          }

          await PurchaseModel.update({
            return_amount: total_return_amount,
            total_payable: total_payable,
            due_amount: due_amount,
            paid_amount: paid_amount
          }, { where: { id: purchase.id } });

          await ReturnModel.update({
            status: "declined"
          }, { where: { id: returnData.id } });

          await ReturnModel.update({
            status: "declined"
          }, { where: { id: returnData.parent_id } });

        }
      } else {
        let superadminId = await getSuperAdminId();
        if (data.status == 'send_to_superadmin') {
          show_superadmin = true;

          sendNotification('sale_return', req, { sale: sale, status: data.status, to_user_id: superadminId, from_user_id: req.userId, return_id: returnData.id });

        } else if (data.status == 'superadmin_declined') {
          await StockModel.update({
            user_id: null
          }, { where: { return_id: returnData.id } });

          sendNotification('sale_return', req, { sale: sale, status: data.status, to_user_id: returnData.seller_id, from_user_id: req.userId, return_id: returnData.id });

        } else if (data.status == 'declined_accept') {
          await StockModel.update({
            user_id: userID
          }, { where: { return_id: returnData.id } });

        } else if (data.status == 'send_to_customer') {
          await StockModel.destroy({ where: { return_id: returnData.id } });

          await SaleModel.update({
            status: parseFloat(sale.due_amount) > 0 ? 'due' : 'paid'
          }, { where: { id: sale.id } })

        } else if (data.status == 'superadmin_accepted') {
          await StockModel.update({
            user_id: superadminId
          }, { where: { return_id: returnData.id } });

          sendNotification('sale_return', req, { sale: sale, status: data.status, to_user_id: returnData.seller_id, from_user_id: req.userId, return_id: returnData.id });

        }

        if (data.status != 'completed') {
          await ReturnModel.update({
            status: data.status,
            show_superadmin: show_superadmin
          }, { where: { id: returnData.id } });

          if (returnData.parent_id) {
            await ReturnModel.update({
              status: data.status
            }, { where: { id: returnData.parent_id } });
          }
        }
      }

      let thisStatus = ucWords((data.status.split("_")).join(" "));
      res.send(formatResponse([], `Return ${thisStatus} Successfully!`));

    } else {
      res.status(errorCodes.default).send(formatErrorResponse('Sale not found'));
    }
  } else {
    res.status(errorCodes.default).send(formatErrorResponse('Sale not found'));
  }

}

