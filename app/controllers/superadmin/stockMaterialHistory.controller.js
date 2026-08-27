const config = require("@config/auth.config");
const { errorCodes, formatErrorResponse, formatResponse } = require("@utils/response.config");
const db = require("@models");
const sequelize = db.sequelize;
const moment = require('moment');
const { Op, QueryTypes } = require("sequelize");
const { getPaginationOptions } = require('@helpers/paginator')
const { UnitCollection } = require("@resources/superadmin/UnitCollection");
const { StocksCollection } = require("@resources/superadmin/StocksCollection");
const { StocksMaterialCollection } = require("@resources/superadmin/StocksMaterialCollection");
const { StockHistoriesCollection } = require("@resources/superadmin/StockHistoriesCollection");
const { getOrderCartData } = require("@library/orderCart");
const StockModel = db.stocks;
const { isEmpty, priceFormat, convertUnitToGram, addLog, weightFormat, arrayColumn } = require("@helpers/helper");
const { getTotalStockPriceByUser, getWorkingUserID, isSuperAdmin, getStockUserID, isManager, updateOrCreate, sendNotification } = require("@library/common");
const productsModel = db.products;
const cartModel = db.carts;
const sizesModel = db.sizes;
const StockMaterialModel = db.stock_materials;
const cartMaterialsModel = db.cart_materials;
const MaterialModel = db.materials
const UnitModel = db.units;
const PurityModel = db.purities;
const TaxSlabModel = db.tax_slabs;
const SubCategoryModel = db.sub_categories;
const CategoryModel = db.categories;
const UserModel = db.users;
const stockHistoryModel = db.stock_raw_material_histories;
const orderModel = db.orders;
const orderMaterialsModel = db.order_materials;
const orderProductModel = db.order_products;
const PurchaseProductModel = db.purchase_products;
const PurchaseModel = db.purchases;
const PurchaseProductMaterialModel = db.purchase_product_materials;

/**
 * Retrieve all stock material
 * @param req
 * @param res
 */
exports.index = async (req, res) => {
    let { page, limit, search } = req.query;
    let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
    //let conditions = { belongs_to: userID };
    let conditions = { from_user_id: userID };
    if (!isEmpty(search)) {
        conditions = { ...conditions, [Op.or]: [{ '$material.name$': { [Op.like]: `%${search}%` } }, { '$unit.name$': { [Op.like]: `%${search}%` } }, { '$purity.name$': { [Op.like]: `%${search}%` } }, { '$toUser.name$': { [Op.like]: `%${search}%` } }] }
    }
    const paginatorOptions = getPaginationOptions(page, limit);
    stockHistoryModel.findAndCountAll({
        order: [['id', 'DESC']],
        offset: paginatorOptions.offset,
        limit: paginatorOptions.limit,
        where: conditions,
        include: [
            {
                model: MaterialModel,
                as: 'material'
            },
            {
                model: UnitModel,
                as: 'unit'
            },
            {
                model: PurityModel,
                as: 'purity'
            },
            {
                model: UserModel,
                as: 'fromUser'
            },
            {
                model: UserModel,
                as: 'toUser'
            }
        ]
    }).then(async (stockH) => {
        let result = {
            items: StockHistoriesCollection(stockH.rows),
            total: stockH.count,
        }
        res.send(formatResponse(result, 'Stock histories'));
    })
        .catch(err => {
            res.status(errorCodes.default).send(formatErrorResponse(err));
        });

}


/**
 * Store stock material
 * 
 * @param req
 * @param res
 */
exports.store = async (req, res) => {
    const t = await sequelize.transaction();

    try {
        let data = req.body;
        let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
        let stockH = await stockHistoryModel.create({
            belongs_to: userID,
            from_user_id: userID,
            to_user_id: data.user_id,
            material_id: data.material_id,
            weight: data.weight,
            pakka_weight: data.pakka_weight,
            unit_id: data.unit_id,
            quantity: data.quantity,
            purity_id: data.purity_id,
            status: "pending",
            type: "debit",
            can_accept: false
        }, { transaction: t });

        await stockHistoryModel.create({
            parent_id: stockH.id,
            belongs_to: data.user_id,
            from_user_id: userID,
            to_user_id: data.user_id,
            material_id: data.material_id,
            weight: data.weight,
            pakka_weight: data.pakka_weight,
            unit_id: data.unit_id,
            quantity: data.quantity,
            purity_id: data.purity_id,
            status: "pending",
            type: "credit",
            can_accept: true
        }, { transaction: t });

        //remove from stock
        let unit = await UnitModel.findByPk(data.unit_id);
        let weight_in_gram = convertUnitToGram(unit.name, data.weight);

        let stock = await StockModel.findOne({
            where: {
                material_id: stockH.material_id,
                purity_id: stockH.purity_id,
                user_id: userID,
                type: 'material'
            }
        });
        if (stock) {
            let stockMaterial = await StockMaterialModel.findOne({ where: { material_id: data.material_id, stock_id: stock.id } });
            if (stockMaterial) {
                let quantity = data.quantity ? parseInt(data.quantity) : 0;
                await StockMaterialModel.update({
                    weight: weightFormat(parseFloat(stockMaterial.weight) - weightFormat(data.weight)),
                    quantity: (parseInt(stockMaterial.quantity) - quantity)
                }, { where: { id: stockMaterial.id } });

                if ((parseFloat(stockMaterial.weight) - parseFloat(data.weight)) <= 0) {
                    await StockModel.destroy({ where: { id: stock.id } });
                    await StockMaterialModel.destroy({ where: { stock_id: stock.id } });
                } else {
                    await StockModel.update({
                        quantity: (parseInt(stockMaterial.quantity) - quantity),
                        total_weight: (parseFloat(stock.total_weight) - weight_in_gram),
                    }, { where: { id: stock.id } });
                }

            }
        }

        await t.commit();

        //send notification
        sendNotification('material_stock_send', req, { from_user_id: req.userId, to_user_id: data.user_id });

        res.send(formatResponse("", 'Sent Successfully.'));

    } catch (error) {
        await t.rollback();
        res.status(errorCodes.default).send(formatErrorResponse());
    }

}

/**
 * Update Status
 * 
 * @param req
 * @param res
 */
exports.updateStatus = async (req, res) => {
    let stockH = await stockHistoryModel.findByPk(req.params.id);
    if (!stockH) {
        return res.status(errorCodes.default).send(formatErrorResponse());
    }

    const t = await sequelize.transaction();
    try {
        let data = req.body;
        if (data.status == "declined") {
            await UpdateStockMaterial(stockH, stockH.from_user_id, t);
        } else if (data.status == "accepted") {
            await UpdateStockMaterial(stockH, stockH.belongs_to, t);
        }

        await stockHistoryModel.update({
            status: data.status,
            reason: data.reasons || ""
        }, { where: { id: stockH.id }, transaction: t });

        await stockHistoryModel.update({
            status: data.status,
            reason: data.reasons || ""
        }, { where: { id: stockH.parent_id }, transaction: t });

        await t.commit();

        res.send(formatResponse("", 'Updated Successfully.'));

    } catch (error) {
        await t.rollback();
        res.status(errorCodes.default).send(formatErrorResponse());
    }
}

const UpdateStockMaterial = async (stockH, userID, t) => {
    const stockPurityId = 22;
    let unit = await UnitModel.findByPk(stockH.unit_id);
    let weight_in_gram = convertUnitToGram(unit.name, stockH.pakka_weight);
    let result = await updateOrCreate(StockModel, {
        material_id: stockH.material_id,
        purity_id: stockPurityId,
        user_id: userID,
        type: 'material'
    }, {
        material_id: stockH.material_id,
        purity_id: stockPurityId,
        weight: stockH.pakka_weight,
        unit_id: stockH.unit_id,
        quantity: stockH.quantity,
        total_weight: weight_in_gram,
        user_id: userID,
        type: 'material'
    }, t, ['quantity', 'total_weight']);
    let stock = result.item;
    compactLog("UpdateStockMaterial stock id:", stock && stock.id);
    let stockMaterial = await StockMaterialModel.findOne({ where: { stock_id: stock.id, material_id: stockH.material_id } });
    let thisM = await MaterialModel.findByPk(stockH.material_id);
    category_id = thisM.id;
    compactLog("UpdateStockMaterial stockMaterial id:", stockMaterial && stockMaterial.id);
    if (stockMaterial) {
        let thisquantity = stockH.quantity ? (parseInt(stockMaterial.quantity) + parseInt(stockH.quantity)) : stockMaterial.quantity;
        await StockMaterialModel.update({
            weight: weightFormat(parseFloat(stockMaterial.weight) + weightFormat(stockH.pakka_weight)),
            weight_in_gram: weightFormat(parseFloat(stockMaterial.weight_in_gram) + weightFormat(weight_in_gram)),
            quantity: thisquantity,
            purity_id: stockPurityId,
            unit_id: stockH.unit_id,
            category_id: category_id
        }, { where: { id: stockMaterial.id }, transaction: t });
    } else {
        await StockMaterialModel.create({
            stock_id: stock.id,
            material_id: stockH.material_id,
            weight: weightFormat(stockH.pakka_weight),
            weight_in_gram: weightFormat(weight_in_gram),
            quantity: stockH.quantity || 0,
            purity_id: stockPurityId,
            unit_id: stockH.unit_id,
            category_id: category_id
        }, { transaction: t });
    }
}

exports.transferStockMaterial = async (req, res) => {
    //const t = await sequelize.transaction();

    try {
        let data = req.body;
        let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
        compactLog("<=================== transferStockMaterial =================>");
        /* get all materials by from_user_id */
        let _include = [
            {
              model: StockMaterialModel,
              as: "stockMaterials",
              required: true,
              where: {},
              //separate: true,
              include: [
                {
                  model: MaterialModel,
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
              model: UserModel,
              as: "user",
            },
        ];
        _include.push({
            model: MaterialModel,
            as: "material",
            required: true,
            where: {},
            include: [
              {
                model: CategoryModel,
                as: "category",
              },
            ],
          });
          compactLog({ type: 'material', user_id: data.from_user_id, material_id: data.material_id });
        let stocks = await StockModel
        .findAll({
            order: [["id", "DESC"]],
            where: { type: 'material', user_id: data.from_user_id, material_id: data.material_id },
            include: _include,
            distinct: true,
            //subQuery: isEmpty(search) ? true : false,
        });
        
        stocks = await StocksMaterialCollection(stocks, data.from_user_id);
        //compactLog("stocks :==> ", stocks); return false;
        compactLog("stocks len:", Array.isArray(stocks) ? stocks.length : typeof stocks);
        compactLog("data keys:", data && typeof data === 'object' ? Object.keys(data).length : typeof data);
        let total_weight = 0;
        let total_quantity = 0; 
        stocks.forEach((item) => {
            total_weight += parseFloat(item.total_weight);
        });
        compactLog("transferMaterial ===============:");
        await transferMaterial(data, stocks[0]);

        res.send(formatResponse("", 'Sent Successfully.'));

    } catch (error) {
        //await t.rollback();
        res.status(errorCodes.default).send(formatErrorResponse());
    }
}

const transferMaterial = async (data, stockMaterial) => {
    const t = await sequelize.transaction();
    const stockPurityId = 22;
    try {
        let stockH = await stockHistoryModel.create({
            belongs_to: data.from_user_id,
            from_user_id: data.from_user_id,
            to_user_id: data.to_user_id,
            material_id: data.material_id,
            weight: data.weight,
            pakka_weight: data.effective_weight,
            unit_id: data.unit_id,
            quantity: data.quantity,
            purity_id: data.purity_id,
            status: "accepted",
            type: "debit",
            can_accept: false
        }, { transaction: t });

        await stockHistoryModel.create({
            parent_id: stockH.id,
            belongs_to: data.to_user_id,
            from_user_id: data.from_user_id,
            to_user_id: data.to_user_id,
            material_id: data.material_id,
            weight: data.weight,
            pakka_weight: data.effective_weight,
            unit_id: data.unit_id,
            quantity: data.quantity,
            purity_id: data.purity_id,
            status: "accepted",
            type: "credit",
            can_accept: true
        }, { transaction: t });

        
        let unit = await UnitModel.findByPk(data.unit_id);
        let weight_in_gram = convertUnitToGram(unit.name, data.effective_weight);
        compactLog("stockH id:", stockH && stockH.id);
        compactLog({
                material_id: stockH.material_id,
                purity_id: stockPurityId, //stockH.purity_id,
                user_id: data.from_user_id,
                type: 'material'
            });
        let stock = await StockModel.findOne({
            where: {
                material_id: stockH.material_id,
                purity_id: stockPurityId,
                user_id: data.from_user_id,
                type: 'material'
            }
        });
        compactLog("stock id:", stock && stock.id);
        if (stock) {
            let stockMaterial = await StockMaterialModel.findOne({ where: { material_id: data.material_id, stock_id: stock.id } });
            if (stockMaterial) {
                compactLog("stockMaterial id:", stockMaterial && stockMaterial.id);
                let quantity = data.quantity ? parseInt(data.quantity) : 0;
                await StockMaterialModel.update({
                    weight: weightFormat(parseFloat(stockMaterial.weight) - weightFormat(data.effective_weight)),
                    quantity: (parseInt(stockMaterial.quantity) - quantity)
                }, { where: { id: stockMaterial.id } });

                /*if ((parseFloat(stockMaterial.weight) - parseFloat(data.effective_weight)) <= 0) {
                    await StockModel.destroy({ where: { id: stock.id } });
                    await StockMaterialModel.destroy({ where: { stock_id: stock.id } });
                } else {*/
                    await StockModel.update({
                        quantity: (parseInt(stockMaterial.quantity) - quantity),
                        total_weight: (parseFloat(stock.total_weight) - weight_in_gram),
                    }, { where: { id: stock.id } });
                //}
                compactLog("UpdateStockMaterial ===============: ");
                await UpdateStockMaterial(stockH, stockH.to_user_id, t);
            }
        }

        await t.commit();

        //send notification
        sendNotification('material_stock_send', req, { from_user_id: data.from_user_id, to_user_id: data.to_user_id });
        return true;
    } catch (error) {
        await t.rollback();
        res.status(errorCodes.default).send(formatErrorResponse());
    }        
}

/**
 * 
 * 
 * @param req
 * @param res
 */
exports.storeByProduct = async (req, res) => {
    let data = req.body;
    let order = await orderModel.findByPk(data.order_id);
    let worker_user_id = data.user_id;
    // if (!data.user_id) {
    //     let stockH = await stockHistoryModel.findOne({ where: { order_id: order.id } });
    //     if (!stockH) {
    //         return res.status(errorCodes.default).send(formatErrorResponse());
    //     }
    //     worker_user_id = stockH.to_user_id;
    // }
    let userID = isManager(req) ? req.userId : await getWorkingUserID(req);

    /**
     * check is stock is available or not
     */
    if (data.type == 'send') {
        for (let i = 0; i < data.products.length; i++) {
            for (let x = 0; x < data.products[i].materials.length; x++) {
                let thisItem = data.products[i].materials[x];
                let stock = await StockModel.findOne({
                    where: {
                        material_id: thisItem.material_id,
                        purity_id: thisItem.purity_id,
                        user_id: userID,
                        type: 'material'
                    }
                });
                if (stock) {
                    let stockMaterial = await StockMaterialModel.findOne({ where: { material_id: thisItem.material_id, stock_id: stock.id } });
                    if (stockMaterial) {
                        let quantity = thisItem.quantity ? parseInt(thisItem.quantity) : 0;
                        if (weightFormat(thisItem.weight) > parseFloat(stockMaterial.weight) || (stockMaterial.quantity && quantity > parseInt(stockMaterial.quantity))) {
                            return res.status(errorCodes.default).send(formatErrorResponse("You doesn't have enough stock material."));
                        }
                    } else {
                        return res.status(errorCodes.default).send(formatErrorResponse("You doesn't have enough stock material."));
                    }
                } else {
                    return res.status(errorCodes.default).send(formatErrorResponse("You doesn't have enough stock material."));
                }
            }
        }
    }

    //check certificates unique
    if (data.type != 'send') {
        let certificates = [];
        for (let i = 0; i < data.products.length; i++) {
            for (let y = 0; y < data.products[i].products.length; y++) {
                let p = data.products[i].products[y];
                if (!isEmpty(p.certificate_no)) {
                    if (certificates.includes(p.certificate_no)) {
                        return res.status(errorCodes.default).send(formatErrorResponse(p.certificate_no + " Duplicate certificate no."));
                    }

                    let stock = await StockModel.findOne({ where: { certificate_no: p.certificate_no } });
                    let is_exist = stock ? true : false;
                    let purchaseProduct = await PurchaseProductModel.findOne({
                        where: { certificate_no: p.certificate_no },
                        include: [
                            {
                                model: PurchaseModel,
                                as: 'purchase',
                                required: true,
                                where: { status: { [Op.ne]: 2 } }
                            }
                        ]
                    });
                    is_exist = purchaseProduct ? true : is_exist;
                    if (is_exist) {
                        return res.status(errorCodes.default).send(formatErrorResponse(p.certificate_no + " Duplicate certificate no."));
                    }
                    certificates.push(p.certificate_no);
                }
            }
        }
    }


    let orderProductIds = [], cartIds = [];
    const t = await sequelize.transaction();

    try {

        if (data.type == 'send') {
            for (let i = 0; i < data.products.length; i++) {
                for (let x = 0; x < data.products[i].materials.length; x++) {
                    let thisItem = data.products[i].materials[x];


                    let stockH = await stockHistoryModel.create({
                        belongs_to: userID,
                        from_user_id: userID,
                        to_user_id: data.user_id,
                        material_id: thisItem.material_id,
                        weight: thisItem.weight,
                        unit_id: thisItem.unit_id,
                        quantity: thisItem.quantity || 0,
                        purity_id: thisItem.purity_id,
                        status: "accepted",
                        type: "debit",
                        can_accept: false,
                        order_id: order.id
                    }, { transaction: t });

                    await stockHistoryModel.create({
                        parent_id: stockH.id,
                        belongs_to: data.user_id,
                        from_user_id: userID,
                        to_user_id: data.user_id,
                        material_id: thisItem.material_id,
                        weight: thisItem.weight,
                        unit_id: thisItem.unit_id,
                        quantity: thisItem.quantity || 0,
                        purity_id: thisItem.purity_id,
                        status: "accepted",
                        type: "credit",
                        can_accept: true,
                        order_id: order.id
                    }, { transaction: t });

                    //remove from stock
                    let unit = await UnitModel.findByPk(thisItem.unit_id);
                    let weight_in_gram = convertUnitToGram(unit.name, thisItem.weight);
                    let stock = await StockModel.findOne({
                        where: {
                            material_id: stockH.material_id,
                            purity_id: stockH.purity_id,
                            user_id: userID,
                            type: 'material'
                        }
                    });
                    if (stock) {
                        let stockMaterial = await StockMaterialModel.findOne({ where: { material_id: thisItem.material_id, stock_id: stock.id } });
                        if (stockMaterial) {
                            let quantity = thisItem.quantity ? parseInt(thisItem.quantity) : 0;
                            await StockMaterialModel.update({
                                weight: weightFormat(parseFloat(stockMaterial.weight) - weightFormat(thisItem.weight)),
                                quantity: (parseInt(stockMaterial.quantity) - quantity)
                            }, { where: { id: stockMaterial.id }, transaction: t });

                            if ((parseFloat(stockMaterial.weight) - parseFloat(thisItem.weight)) <= 0) {
                                await StockModel.destroy({ where: { id: stock.id }, transaction: t });
                                await StockMaterialModel.destroy({ where: { stock_id: stock.id }, transaction: t });
                            } else {
                                await StockModel.update({
                                    quantity: (parseInt(stockMaterial.quantity) - quantity),
                                    total_weight: (parseFloat(stock.total_weight) - weight_in_gram),
                                }, { where: { id: stock.id }, transaction: t });
                            }

                        }
                    }

                    //credit to stock
                    await UpdateStockMaterial(stockH, stockH.to_user_id, t);

                    await orderMaterialsModel.update({ sent_weight: thisItem.weight, sent_quantity: thisItem.quantity ? thisItem.quantity : 0 }, { where: { order_id: order.id, order_product_id: data.products[i].id, id: thisItem.id }, transaction: t });

                }

                await orderProductModel.update({
                    status: 'on_process',
                    worker_id: data.user_id
                }, { where: { id: data.products[i].id }, transaction: t });

            }
        } else {
            for (let i = 0; i < data.products.length; i++) {
                let cart = null, cartMaterials = [], isReEntry = false, oldOrderProduct = null, oldOrderProductMaterials = [];
                if (data.products[i].products.length > 1) {
                    cart = await cartModel.findByPk(data.cart_id);
                    cartMaterials = await cartMaterialsModel.findAll({ where: { cart_id: data.cart_id } });
                    await cartModel.destroy({ where: { id: data.cart_id }, transaction: t });
                    await cartMaterialsModel.destroy({ where: { cart_id: data.cart_id }, transaction: t });

                    oldOrderProduct = await orderProductModel.findByPk(data.products[i].id);
                    oldOrderProductMaterials = await orderMaterialsModel.findAll({ where: { order_id: data.order_id, order_product_id: data.products[i].id } });
                    await orderProductModel.destroy({ where: { id: data.products[i].id }, transaction: t });
                    await orderMaterialsModel.destroy({ where: { order_id: data.order_id, order_product_id: data.products[i].id }, transaction: t });

                    isReEntry = true;
                }

                for (let y = 0; y < data.products[i].products.length; y++) {
                    let p = data.products[i].products[y];

                    //delete
                    let newProduct = null;
                    if (isReEntry) {
                        newProduct = await orderProductModel.create({
                            order_id: oldOrderProduct.order_id,
                            product_id: oldOrderProduct.product_id,
                            size_id: oldOrderProduct.size_id,
                            quantity: 1,
                            rate: oldOrderProduct.rate,
                            total_weight: oldOrderProduct.total_weight,
                            making_charge: oldOrderProduct.making_charge,
                            making_charge_discount_amount: oldOrderProduct.making_charge_discount_amount,
                            making_charge_discount_percent: oldOrderProduct.making_charge_discount_percent,
                            total_discount: oldOrderProduct.total_discount,
                            sub_price: oldOrderProduct.sub_price,
                            price_without_tax: oldOrderProduct.price_without_tax,
                            igst: oldOrderProduct.igst,
                            cgst: oldOrderProduct.cgst,
                            sgst: oldOrderProduct.sgst,
                            old_size_id: oldOrderProduct.old_size_id,
                            old_total_weight: oldOrderProduct.old_total_weight,
                            old_quantity: oldOrderProduct.old_quantity,
                            old_rate: oldOrderProduct.old_rate,
                            old_making_charge: oldOrderProduct.old_making_charge,
                            old_making_charge_discount_amount: oldOrderProduct.old_making_charge_discount_amount,
                            old_making_charge_discount_percent: oldOrderProduct.old_making_charge_discount_percent,
                            old_total_discount: oldOrderProduct.old_total_discount,
                            old_sub_price: oldOrderProduct.old_sub_price,
                            old_price_without_tax: oldOrderProduct.old_price_without_tax,
                            old_igst: oldOrderProduct.old_igst,
                            old_cgst: oldOrderProduct.old_cgst,
                            old_sgst: oldOrderProduct.old_sgst,
                            status: oldOrderProduct.status
                        }, { transaction: t });

                        for (let k = 0; k < oldOrderProductMaterials.length; k++) {
                            let item = oldOrderProductMaterials[k];
                            await orderMaterialsModel.create({
                                order_id: item.order_id,
                                order_product_id: newProduct.id,
                                product_id: item.product_id,
                                material_id: item.material_id,
                                size_id: item.size_id,
                                stock_id: item.stock_id,
                                purity_id: item.purity_id,
                                unit_id: item.unit_id,
                                weight: item.weight,
                                quantity: item.quantity,
                                price: item.price,
                                discount: item.discount,
                                discount_type: item.discount_type,
                                total: item.total,
                                rate: item.rate,
                                discount_percent: item.discount_percent,
                                per_gram_price: item.per_gram_price,
                                total_gram: item.total_gram,
                                status: item.status,
                                return_qty: item.return_qty,
                                return_weight: item.return_weight,
                                old_purity_id: item.old_purity_id,
                                old_weight: item.old_weight,
                                old_quantity: item.old_quantity,
                                old_price: item.old_price,
                                old_discount: item.old_discount,
                                old_discount_type: item.old_discount_type,
                                old_total: item.old_total,
                                old_per_gram_price: item.old_per_gram_price,
                                old_discount_percent: item.old_discount_percent,
                                old_total_gram: item.old_total_gram,
                            }, { transaction: t });
                        }

                        cart = await cartModel.create({
                            product_id: cart.product_id,
                            type: cart.type,
                            size_id: cart.size_id,
                            user_id: cart.user_id,
                            cookie_id: cart.cookie_id,
                            stock_id: cart.stock_id,
                            sale_product_id: cart.sale_product_id,
                            discount: cart.discount,
                            total_weight: cart.total_weight,
                            discount_type: cart.discount_type,
                            certificate_no: cart.certificate_no,
                            rate: cart.rate,
                            quantity: 1,
                            promocode_id: cart.promocode_id,
                            promocode: cart.promocode,
                            promocode_discount: cart.promocode_discount,
                            is_manual: cart.is_manual,
                            order_id: cart.order_id,
                            order_product_id: newProduct.id
                        }, { transaction: t });
                        for (let k = 0; k < cartMaterials.length; k++) {
                            let item = cartMaterials[k];
                            await cartMaterialsModel.create({
                                cart_id: cart.id,
                                material_id: item.material_id,
                                purity_id: item.purity_id,
                                weight: item.weight,
                                quantity: item.quantity,
                                unit_id: item.unit_id,
                            }, { transaction: t })
                        }
                        orderProductIds.push({
                            id: newProduct.id,
                            certificate_no: p.certificate_no
                        });
                        cartIds.push(cart.id);
                    } else {
                        orderProductIds.push({
                            id: data.products[i].id,
                            certificate_no: p.certificate_no
                        });
                        cartIds.push(data.cart_id);
                    }

                    for (let x = 0; x < p.materials.length; x++) {
                        let thisItem = p.materials[x];

                        //remove from worker stock
                        let unit = await UnitModel.findByPk(thisItem.unit_id);
                        let weight_in_gram = convertUnitToGram(unit.name, thisItem.weight);
                        let stock = await StockModel.findOne({
                            where: {
                                material_id: thisItem.material_id,
                                purity_id: thisItem.purity_id,
                                user_id: worker_user_id,
                                type: 'material'
                            }
                        });
                        if (stock) {
                            let stockMaterial = await StockMaterialModel.findOne({ where: { material_id: thisItem.material_id, stock_id: stock.id } });
                            if (stockMaterial) {
                                let quantity = thisItem.quantity ? parseInt(thisItem.quantity) : 0;
                                await StockMaterialModel.update({
                                    weight: weightFormat(parseFloat(stockMaterial.weight) - weightFormat(thisItem.weight)),
                                    quantity: (parseInt(stockMaterial.quantity) - quantity)
                                }, { where: { id: stockMaterial.id }, transaction: t });

                                if ((parseFloat(stockMaterial.weight) - parseFloat(thisItem.weight)) <= 0) {
                                    await StockModel.destroy({ where: { id: stock.id }, transaction: t });
                                    await StockMaterialModel.destroy({ where: { stock_id: stock.id }, transaction: t });
                                } else {
                                    await StockModel.update({
                                        quantity: (parseInt(stockMaterial.quantity) - quantity),
                                        total_weight: (parseFloat(stock.total_weight) - weight_in_gram),
                                    }, { where: { id: stock.id }, transaction: t });
                                }

                            }
                        }


                        /**
                         * update order product data
                         */
                        if (isReEntry) {
                            await cartMaterialsModel.update({ weight: thisItem.weight, quantity: thisItem.quantity ? thisItem.quantity : 0 }, { where: { cart_id: cart.id, material_id: thisItem.material_id }, transaction: t });
                            if (data.products[i].product_type == 'material') {
                                await cartModel.update({
                                    quantity: thisItem.quantity ? thisItem.quantity : 0,
                                    total_weight: weight_in_gram
                                }, {
                                    where: {
                                        id: cart.id
                                    }
                                });
                            }

                        } else {

                            await cartMaterialsModel.update({ weight: thisItem.weight, quantity: thisItem.quantity ? thisItem.quantity : 0 }, { where: { cart_id: data.cart_id, material_id: thisItem.material_id }, transaction: t });
                            if (data.products[i].product_type == 'material') {
                                await cartModel.update({
                                    quantity: thisItem.quantity ? thisItem.quantity : 0,
                                    total_weight: weight_in_gram
                                }, {
                                    where: {
                                        id: data.cart_id
                                    }
                                });
                            }

                        }

                    }

                    //let certificate_no = arrayColumn(data.products[i].certificates, 'certificate_no');
                    //certificate_no = certificate_no.join(",");
                    await orderProductModel.update({
                        status: 'received',
                        certificate_no: p.certificate_no || null
                    }, { where: { id: isReEntry ? newProduct.id : data.products[i].id }, transaction: t });
                }
            }
        }


        if (data.type == 'send') {
            await orderModel.update({
                status: 'on_process',
                on_process_at: moment().format('YYYY-MM-DD HH:mm:ss'),
                expected_delivery_date: moment().add(4, 'days').format('YYYY-MM-DD')
            }, { where: { id: order.id }, transaction: t });
        }

        await t.commit();

        if (data.type == "receive") {

            let total_send = await orderProductModel.count({
                where: { order_id: order.id, status: 'on_process' }
            })
            total_send = total_send ?? 0;
            if (total_send == 0) {
                await orderModel.update({
                    status: 'is_ready',
                    on_ready_at: moment().format('YYYY-MM-DD HH:mm:ss'),
                    expected_delivery_date: moment().add(4, 'days').format('YYYY-MM-DD')
                }, { where: { id: order.id } });
            }

            //add to purchase
            let purchase = await PurchaseModel.create({
                supplier_id: worker_user_id,
                user_id: userID,
                invoice_number: "",
                invoice_date: moment().format('YYYY-MM-DD'),
                total_amount: 0,
                tax: 0,
                discount: 0,
                paid_amount: 0,
                taxable_amount: 0,
                bill_amount: 0,
                total_payable: 0,
                due_amount: 0,
                due_date: null,
                status: 'paid',
                is_approved: 0,
                is_approval: 0,
                type: 'order_purchase'
            });

            //update order amount
            let carts = await getOrderCartData(order.id, null, data.role_id);
            for (let i = 0; i < carts.length; i++) {
                if (cartIds.includes(carts[i].id)) {
                    let index = cartIds.indexOf(carts[i].id);
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
                            id: orderProductIds[index].id
                        }
                    });

                    for (let x = 0; x < carts[i].cart_material.length; x++) {
                        let cartMaterial = carts[i].cart_material[x];
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
                        }, { where: { order_id: data.order_id, order_product_id: orderProductIds[index].id, material_id: cartMaterial.material_id } })
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
            }, { where: { id: data.order_id } });



            //add to stock
            for (let i = 0; i < orderProductIds.length; i++) {
                let orderProduct = await orderProductModel.findOne({
                    where: { id: orderProductIds[i].id },
                    include: [
                        {
                            model: orderMaterialsModel,
                            as: 'orderProductMaterials',
                            separate: true,
                            include: [
                                {
                                    model: MaterialModel,
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
                            model: productsModel,
                            as: 'product'
                        }
                    ]
                });

                if (orderProduct) {
                    let product = orderProduct.product;
                    for (let y = 0; y < parseInt(orderProduct.quantity); y++) {
                        let thisStock = null;
                        if (product.type == "material") {
                            let quantity = 0;
                            for (let j = 0; j < orderProduct.orderProductMaterials.length; j++) {
                                quantity += orderProduct.orderProductMaterials[j].quantity ? parseInt(orderProduct.orderProductMaterials[j].quantity) : 0;
                            }
                            let result = await updateOrCreate(StockModel, {
                                product_id: orderProduct.product_id,
                                user_id: userID,
                                purity_id: orderProduct.orderProductMaterials[0].purity_id,
                            }, {
                                product_id: orderProduct.product_id,
                                quantity: quantity,
                                total_weight: orderProduct.total_weight,
                                user_id: userID,
                                purity_id: orderProduct.orderProductMaterials[0].purity_id,
                            }, null, ['quantity', 'total_weight']);
                            thisStock = result.item;
                        } else {
                            thisStock = await StockModel.create({
                                product_id: orderProduct.product_id,
                                size_id: orderProduct.size_id || null,
                                certificate_no: orderProductIds[i].certificate_no,
                                quantity: 1,
                                total_weight: orderProduct.total_weight,
                                user_id: userID
                            });
                        }

                        //purchase products
                        let purchaseProduct = await PurchaseProductModel.create({
                            purchase_id: purchase.id,
                            product_id: orderProduct.product_id,
                            size_id: orderProduct.size_id || null,
                            certificate_no: orderProductIds[i].certificate_no,
                            total_weight: weightFormat(orderProduct.total_weight),
                            sub_price: priceFormat(orderProduct.sub_price),
                            making_charge: priceFormat(orderProduct.making_charge),
                            rep: 0,
                            tax: 0,
                            total: priceFormat(orderProduct.rate),
                        });


                        /**
                         * add to stock materials
                         */
                        for (let j = 0; j < orderProduct.orderProductMaterials.length; j++) {
                            if (product.type == "material") {
                                let stockMaterial = await StockMaterialModel.findOne({ where: { stock_id: thisStock.id, material_id: orderProduct.orderProductMaterials[j].material_id } });
                                if (stockMaterial) {
                                    let thisquantity = orderProduct.orderProductMaterials[j].quantity ? (parseInt(stockMaterial.quantity) + parseInt(orderProduct.orderProductMaterials[j].quantity)) : stockMaterial.quantity;
                                    await StockMaterialModel.update({
                                        weight: weightFormat(parseFloat(stockMaterial.weight) + weightFormat(orderProduct.orderProductMaterials[j].weight)),
                                        weight_in_gram: weightFormat(parseFloat(stockMaterial.total_gram) + weightFormat(orderProduct.orderProductMaterials[j].total_gram)),
                                        quantity: thisquantity,
                                        purity_id: orderProduct.orderProductMaterials[j].purity_id,
                                        unit_id: orderProduct.orderProductMaterials[j].unit_id,
                                        category_id: product.category_id
                                    }, { where: { id: stockMaterial.id } });
                                } else {
                                    await StockMaterialModel.create({
                                        stock_id: thisStock.id,
                                        material_id: orderProduct.orderProductMaterials[j].material_id,
                                        weight: weightFormat(orderProduct.orderProductMaterials[j].weight),
                                        weight_in_gram: weightFormat(orderProduct.orderProductMaterials[j].total_gram),
                                        quantity: orderProduct.orderProductMaterials[j].quantity || 0,
                                        purity_id: orderProduct.orderProductMaterials[j].purity_id,
                                        unit_id: orderProduct.orderProductMaterials[j].unit_id,
                                        category_id: product.category_id
                                    });
                                }
                            } else {
                                await StockMaterialModel.create({
                                    stock_id: thisStock.id,
                                    material_id: orderProduct.orderProductMaterials[j].material_id,
                                    weight: weightFormat(orderProduct.orderProductMaterials[j].weight),
                                    weight_in_gram: weightFormat(orderProduct.orderProductMaterials[j].total_gram),
                                    quantity: orderProduct.orderProductMaterials[j].quantity || 0,
                                    purity_id: orderProduct.orderProductMaterials[j].purity_id,
                                    unit_id: orderProduct.orderProductMaterials[j].unit_id,
                                    category_id: product.category_id
                                });
                            }

                            //purchase product material
                            await PurchaseProductMaterialModel.create({
                                purchase_id: purchase.id,
                                purchase_product_id: purchaseProduct.id,
                                material_id: orderProduct.orderProductMaterials[j].material_id,
                                weight: weightFormat(orderProduct.orderProductMaterials[j].weight),
                                quantity: orderProduct.orderProductMaterials[j].quantity || 0,
                                purity_id: orderProduct.orderProductMaterials[j].purity_id,
                                unit_id: orderProduct.orderProductMaterials[j].unit_id,
                                rate: orderProduct.orderProductMaterials[j].rate,
                                amount: orderProduct.orderProductMaterials[j].rate
                            });
                        }
                    }
                }

            }



        }

        let msg = (!data.user_id) ? "Received" : "Sent";

        res.send(formatResponse("", msg + ' Successfully.'));

    } catch (error) {
        await t.rollback();
        compactLog(error)
        res.status(errorCodes.default).send(formatErrorResponse(error.toString()));
    }

}