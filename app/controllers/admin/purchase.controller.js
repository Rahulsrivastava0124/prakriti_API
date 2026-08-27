const config = require("@config/auth.config");
const {
  errorCodes,
  formatErrorResponse,
  formatResponse,
} = require("@utils/response.config");
const db = require("@models");
const { getCompanyDetails } = require("@helpers/companyDetails");
const moment = require("moment");
const {
  isEmpty,
  getDateFromToWhere,
  priceFormat,
  formatDateTime,
  weightFormat,
  addLog,
  convertUnitToGram,
  encodeForStorage,
  decodeFromStorage,
  cleanInput,
} = require("@helpers/helper");
const {
  updateOrCreate,
  removeMaterialFromStock,
  getWalletBalance,
  getSuperAdminId,
  getWorkingUserID,
} = require("@library/common");
const { getPaginationOptions } = require("@helpers/paginator");
const {
  PurchaseListCollection,
} = require("@resources/superadmin/PurchaseListCollection");
const {
  PurchaseEditCollection,
} = require("@resources/superadmin/PurchaseEditCollection");
const {
  PurchaseViewCollection,
} = require("@resources/superadmin/PurchaseViewCollection");
const { PurityCollection } = require("@resources/superadmin/PurityCollection");
const { Op } = require("sequelize");
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

/**
 * Retrieve all purchase
 *
 * @param req
 * @param res
 */
exports.index = async (req, res) => {
  let {
    page,
    limit,
    supplier_id,
    load_payments,
    search,
    date_from,
    date_to,
    status,
  } = req.query;
  let conditions = { user_id: req.userId };
  if (status !== undefined && status != "") {
    conditions.is_approved = status;
  }
  if (!isEmpty(supplier_id)) {
    conditions.supplier_id = supplier_id;
  }
  if (!isEmpty(search)) {
    conditions.invoice_number = { [Op.like]: `%${search}%` };
  }
  conditions = {
    ...conditions,
    ...getDateFromToWhere(date_from, date_to, "invoice_date"),
  };

  const paginatorOptions = getPaginationOptions(page, limit);
  PurchaseModel.findAndCountAll({
    order: [["id", "DESC"]],
    offset: paginatorOptions.offset,
    limit: paginatorOptions.limit,
    where: conditions,
    include: [
      {
        model: PurchaseProductModel,
        as: "purchaseProducts",
        include: [
          {
            model: ProductModel,
            as: "product",
          },
          {
            model: PurchaseProductMaterialModel,
            as: "purchaseMaterials",
          },
        ],
      },
      {
        model: UserModel,
        as: "supplier",
      },
    ],
  })
    .then(async (data) => {
      let result = {
        items: await PurchaseListCollection(data.rows, load_payments),
        total: data.count,
      };
      res.send(formatResponse(result, "Purchase List"));
    })
    .catch((err) => {
      res.status(errorCodes.default).send(formatErrorResponse(err));
    });
};

/**
 * Store purchase
 *
 * @param {*} req
 * @param {*} res
 */
exports.store = async (req, res) => {
  let data = req.body;
  const dateFormats = [
    moment.ISO_8601,
    "YYYY-MM-DD",
    "DD/MM/YYYY",
    "MM/DD/YYYY",
  ];

  const invoiceDate = moment(data.invoice_date, dateFormats, true);
  if (!invoiceDate.isValid()) {
    return res
      .status(errorCodes.default)
      .send(
        formatErrorResponse("Invalid invoice date. Please send a valid date."),
      );
  }

  const dueDate = isEmpty(data.due_date)
    ? null
    : moment(data.due_date, dateFormats, true);
  if (!isEmpty(data.due_date) && !dueDate.isValid()) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Invalid due date. Please send a valid date."));
  }

  if (!isEmpty(data.invoice_number)) {
    let purchaseData = await PurchaseModel.findOne({
      where: { invoice_number: data.invoice_number },
    });
    if (purchaseData) {
      //return res.status(errorCodes.default).send(formatErrorResponse('Invoice number is exists.'));

      /* create new invoice nummber */
      let purchase = await PurchaseModel.findOne({
        attributes: ["id"],
        order: [["id", "DESC"]],
      });
      data.invoice_number = "RV-P-" + (purchase ? purchase.id + 1 : 1);
    }
  }

  if (priceFormat(data.paid_amount) > 0) {
    let wallet_balance = await getWalletBalance(req.userId, data.payment_mode);
    if (priceFormat(data.paid_amount) > wallet_balance) {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse("Insufficient wallet balance."));
    }
  }

  try {
    const trans = await sequelize.transaction(async (t) => {
      //insert into purchase table
      let invoice_number = data.invoice_number || null;
      let req_data = data; //JSON.stringify(data);
      //req_data = new Buffer.from(req_data).toString("base64");
      let status = "due",
        paid_amount = 0,
        due_amount = 0;
      if (data.payment_mode != "cheque") {
        status =
          priceFormat(data.paid_amount) >= priceFormat(data.total_payable)
            ? "paid"
            : "due";
        paid_amount = data.paid_amount ? priceFormat(data.paid_amount) : 0;
        due_amount = priceFormat(data.due_amount);
      } else {
        due_amount = priceFormat(data.total_payable);
      }
      let purchaseObj = {
        supplier_id: data.supplier_id,
        user_id: req.userId,
        invoice_number: invoice_number,
        invoice_date: invoiceDate.format("YYYY-MM-DD"),
        notes: data.notes,
        payment_mode: data.payment_mode,
        transaction_no: data.transaction_no,
        total_amount: priceFormat(data.total_amount),
        tax: priceFormat(data.tax),
        discount: priceFormat(data.discount),
        paid_amount: paid_amount,
        taxable_amount: priceFormat(data.taxable_amount),
        bill_amount: priceFormat(data.total_payable),
        total_payable: priceFormat(data.total_payable),
        due_amount: due_amount,
        due_date: dueDate ? dueDate.format("YYYY-MM-DD") : null,
        status: status,
        is_approved: 0,
        //req_data: req_data
      };

      let purchase = await PurchaseModel.create(purchaseObj, {
        transaction: t,
      });

      //insert into purchase product table
      for (let i = 0; i < data.products.length; i++) {
        let thisItem = data.products[i];
        let worker_id = thisItem.worker_id || null;
        let thisObj = {
          purchase_id: purchase.id,
          product_id: thisItem.product_id,
          worker_id: worker_id,
          size_id: thisItem.size_id || null,
          certificate_no: cleanInput(thisItem.certificate_no),
          total_weight: weightFormat(thisItem.total_weight),
          sub_price: priceFormat(thisItem.sub_price),
          making_charge: priceFormat(thisItem.making_charge),
          rep: priceFormat(thisItem.rep),
          tax: priceFormat(thisItem.tax),
          total: priceFormat(thisItem.total),
        };
        let purchaseProduct = await PurchaseProductModel.create(thisObj, {
          transaction: t,
        });
        req_data.products[i].id = purchaseProduct.id;

        /**
         * START - add to super admin stock
         */
        /*let product = await ProductModel.findByPk(thisItem.product_id);
        let stock = null;
        if(product.type == "material"){
          let quantity = 0;
          for(let x = 0; x < thisItem.materials.length; x++){
            quantity += thisItem.materials[x].quantity ? parseInt(thisItem.materials[x].quantity) : 0;
          }
          let result = await updateOrCreate(StockModel, {
            product_id: thisItem.product_id, 
            user_id: {[Op.is]: null}
          }, {
            product_id: thisItem.product_id, 
            quantity: quantity,
            total_weight: thisItem.total_weight
          }, t, ['quantity', 'total_weight']);
          stock = result.item;
        }else{
          stock = await StockModel.create({
            purchase_id: purchase.id,
            product_id: thisItem.product_id,
            size_id: thisItem.size_id || null,
            certificate_no: thisItem.certificate_no,
            quantity: 1,
            total_weight: thisItem.total_weight
          }, { transaction: t });
        }*/

        //insert into purchase product materials
        let batch_id = null;
        for (let x = 0; x < thisItem.materials.length; x++) {
          let thisMObj = {
            purchase_id: purchase.id,
            purchase_product_id: purchaseProduct.id,
            material_id: thisItem.materials[x].material_id,
            weight: weightFormat(thisItem.materials[x].weight),
            quantity: thisItem.materials[x].quantity || 0,
            purity_id: thisItem.materials[x].purity_id,
            unit_id: thisItem.materials[x].unit_id,
            rate: thisItem.materials[x].rate,
            amount: thisItem.materials[x].amount,
          };
          await PurchaseProductMaterialModel.create(thisMObj, {
            transaction: t,
          });

          /*if(!isEmpty(worker_id)){
            let stockH = await stockHistoryModel.create({
              from_user_id: worker_id,
              to_user_id: req.userId,
              material_id: thisItem.materials[x].material_id,
              weight: weightFormat(thisItem.materials[x].weight),
              unit_id: thisItem.materials[x].unit_id,
              quantity: thisItem.materials[x].quantity,
              date: moment().format('YYYY-MM-DD'),
              type: 'debit',
              batch_id: batch_id,
              purchase_id: purchase.id
            }, { transaction: t });
            if(batch_id == null){
              batch_id = stockH.id;
              await stockHistoryModel.update({
                batch_id: batch_id
              },{where: {id: stockH.id}, transaction: t});
            }
          }*/

          /**
           * add to stock materials
           */
          /*if(product.type == "material"){
            let stockMaterial = await StockMaterialModel.findOne({where: {stock_id: stock.id, material_id: thisItem.materials[x].material_id}});
            if(stockMaterial){
              await StockMaterialModel.update({
                weight: weightFormat(stockMaterial.weight + weightFormat(thisItem.materials[x].weight)),
                weight_in_gram: weightFormat(stockMaterial.weight_in_gram + weightFormat(thisItem.materials[x].weight_in_gram)),
                quantity: (stockMaterial.quantity + thisItem.materials[x].quantity),
                purity_id: thisItem.materials[x].purity_id,
                unit_id: thisItem.materials[x].unit_id,
                category_id: product.category_id
              },{where: {id: stockMaterial.id}, transaction: t});
            }else{
              await StockMaterialModel.create({
                stock_id: stock.id, 
                material_id: thisItem.materials[x].material_id,
                weight: weightFormat(thisItem.materials[x].weight),
                weight_in_gram: weightFormat(thisItem.materials[x].weight_in_gram),
                quantity: thisItem.materials[x].quantity,
                purity_id: thisItem.materials[x].purity_id,
                unit_id: thisItem.materials[x].unit_id,
                category_id: product.category_id
              }, { transaction: t });
            }
          }else{
            await StockMaterialModel.create({
              stock_id: stock.id, 
              material_id: thisItem.materials[x].material_id,
              weight: weightFormat(thisItem.materials[x].weight),
              weight_in_gram: weightFormat(thisItem.materials[x].weight_in_gram),
              quantity: thisItem.materials[x].quantity,
              purity_id: thisItem.materials[x].purity_id,
              unit_id: thisItem.materials[x].unit_id,
              category_id: product.category_id
            }, { transaction: t });
          }*/
        }

        /**
         * END - add to super admin stock
         */
      }

      //update invoice no if not sent
      if (isEmpty(invoice_number)) {
        invoice_number = "RV-P-" + purchase.id;
      }

      //req_data = JSON.stringify(req_data);
      //req_data = new Buffer.from(req_data).toString("base64");
      req_data = encodeForStorage(req_data);
      await PurchaseModel.update(
        {
          invoice_number: invoice_number,
          req_data: req_data,
        },
        { where: { id: purchase.id }, transaction: t },
      );

      //insert into payment table
      if (priceFormat(data.paid_amount) > 0) {
        await paymentModel.create({
          payment_mode: data.payment_mode,
          amount: priceFormat(data.paid_amount),
          user_id: data.supplier_id,
          payment_by: req.userId,
          payment_date: moment().format("YYYY-MM-DD"),
          txn_id: data.transaction_no,
          cheque_no: data.cheque_no,
          status: "success",
          type: "purchase",
          table_type: "purchase",
          table_id: purchase.id,
          payment_belongs: req.userId,
          purpose: "purchase",
        });
      }

      res.send(formatResponse([], "Purchase successfully!"));
    });
  } catch (error) {
    addLog("err: " + error.toString());
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Purchase does not success due to some error"));
  }
};

/**
 * Purchase on Approval List
 * @param {*} req
 * @param {*} res
 * @returns
 */
exports.onapprove_index = async (req, res) => {
  let { page, limit, supplier_id, load_payments, search, date_from, date_to } =
    req.query;
  let conditions = {};
  if (!isEmpty(supplier_id)) {
    conditions.supplier_id = supplier_id;
  }
  if (!isEmpty(search)) {
    conditions.invoice_number = { [Op.like]: `%${search}%` };
  }
  conditions.is_approved = { [Op.eq]: 0 };

  conditions = {
    ...conditions,
    ...getDateFromToWhere(date_from, date_to, "invoice_date"),
  };

  const paginatorOptions = getPaginationOptions(page, limit);
  PurchaseModel.findAndCountAll({
    order: [["id", "DESC"]],
    offset: paginatorOptions.offset,
    limit: paginatorOptions.limit,
    where: conditions,
    include: [
      {
        model: PurchaseProductModel,
        as: "purchaseProducts",
        include: [
          {
            model: ProductModel,
            as: "product",
          },
          {
            model: PurchaseProductMaterialModel,
            as: "purchaseMaterials",
          },
        ],
      },
      {
        model: UserModel,
        as: "supplier",
      },
    ],
  })
    .then(async (data) => {
      let result = {
        items: await PurchaseListCollection(data.rows, load_payments),
        total: data.count,
      };
      res.send(formatResponse(result, "Purchase List"));
    })
    .catch((err) => {
      res.status(errorCodes.default).send(formatErrorResponse(err));
    });
};

/**
 * View Purchase on Approval
 *
 * @param {*} req
 * @param {*} res
 */
exports.onapprove_view = async (req, res) => {
  let purchase = await PurchaseModel.findOne({
    where: { id: req.params.id },
    include: [
      {
        model: PurchaseProductModel,
        as: "purchaseProducts",
        include: [
          {
            model: ProductModel,
            as: "product",
            include: [
              {
                model: CategoryModel,
                as: "category",
              },
            ],
          },
          {
            model: SizeModel,
            as: "size",
          },
          {
            model: PurchaseProductMaterialModel,
            as: "purchaseMaterials",
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
        as: "supplier",
      },
    ],
  });
  if (!purchase) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Purchase not found"));
  }
  res.send(
    formatResponse(PurchaseViewCollection(purchase), "Purchase details"),
  );
};

/**
 * Status Change
 *
 * @param {*} req
 * @param {*} res
 */
exports.statuschange = async (req, res) => {
  let data = req.body;
  let purchase = await PurchaseModel.findOne({
    where: { id: req.params.id },
    include: [
      {
        model: PurchaseProductModel,
        as: "purchaseProducts",
        include: [
          {
            model: ProductModel,
            as: "product",
            include: [
              {
                model: CategoryModel,
                as: "category",
              },
            ],
          },
          {
            model: SizeModel,
            as: "size",
          },
          {
            model: PurchaseProductMaterialModel,
            as: "purchaseMaterials",
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
        as: "supplier",
      },
    ],
  });
  if (!purchase) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Purchase not found"));
  }

  try {
    const trans = await sequelize.transaction(async (t) => {
      let purchaseObj = {
        is_approved: data.approve_status,
      };
      await PurchaseModel.update(purchaseObj, {
        where: { id: purchase.id },
        transaction: t,
      });

      /**
       * START - add to super admin stock
       */
      if (data.approve_status == 1) {
        let req_data = purchase.req_data;
        if (!isEmpty(req_data)) {
          //req_data = new Buffer.from(req_data, "base64").toString('ascii');
          //req_data = JSON.parse(req_data);
          req_data = decodeFromStorage(req_data);
          for (let i = 0; i < req_data.products.length; i++) {
            let thisItem = req_data.products[i];
            let worker_id = thisItem.worker_id || null;

            let product = await ProductModel.findByPk(thisItem.product_id);
            let stock = null;
            if (product.type == "material") {
              let quantity = 0;
              for (let x = 0; x < thisItem.materials.length; x++) {
                quantity += thisItem.materials[x].quantity
                  ? parseInt(thisItem.materials[x].quantity)
                  : 0;
              }
              let result = await updateOrCreate(
                StockModel,
                {
                  product_id: thisItem.product_id,
                  user_id: req.userId,
                },
                {
                  product_id: thisItem.product_id,
                  quantity: quantity,
                  total_weight: thisItem.total_weight,
                },
                t,
                ["quantity", "total_weight"],
              );
              stock = result.item;
            } else {
              stock = await StockModel.create(
                {
                  user_id: req.userId,
                  purchase_id: purchase.id,
                  purchase_product_id: thisItem.id,
                  product_id: thisItem.product_id,
                  size_id: thisItem.size_id || null,
                  certificate_no: cleanInput(thisItem.certificate_no),
                  quantity: 1,
                  total_weight: thisItem.total_weight,
                },
                { transaction: t },
              );
            }

            let batch_id = null;
            for (let x = 0; x < thisItem.materials.length; x++) {
              if (!isEmpty(worker_id)) {
                let stockH = await stockHistoryModel.create(
                  {
                    from_user_id: worker_id,
                    to_user_id: req.userId,
                    material_id: thisItem.materials[x].material_id,
                    weight: weightFormat(thisItem.materials[x].weight),
                    unit_id: thisItem.materials[x].unit_id,
                    quantity: thisItem.materials[x].quantity || 1,
                    date: moment().format("YYYY-MM-DD"),
                    type: "debit",
                    batch_id: batch_id,
                    purchase_id: purchase.id,
                  },
                  { transaction: t },
                );
                if (batch_id == null) {
                  batch_id = stockH.id;
                  await stockHistoryModel.update(
                    {
                      batch_id: batch_id,
                    },
                    { where: { id: stockH.id }, transaction: t },
                  );
                }
              }

              /**
               * add to stock materials
               */
              if (product.type == "material") {
                let stockMaterial = await StockMaterialModel.findOne({
                  where: {
                    stock_id: stock.id,
                    material_id: thisItem.materials[x].material_id,
                  },
                });
                if (stockMaterial) {
                  let thisquantity = thisItem.materials[x].quantity
                    ? stockMaterial.quantity + thisItem.materials[x].quantity
                    : stockMaterial.quantity;
                  await StockMaterialModel.update(
                    {
                      weight: weightFormat(
                        parseFloat(stockMaterial.weight) +
                          weightFormat(thisItem.materials[x].weight),
                      ),
                      weight_in_gram: weightFormat(
                        parseFloat(stockMaterial.weight_in_gram) +
                          weightFormat(thisItem.materials[x].weight_in_gram),
                      ),
                      quantity: thisquantity,
                      purity_id: thisItem.materials[x].purity_id,
                      unit_id: thisItem.materials[x].unit_id,
                      category_id: product.category_id,
                    },
                    { where: { id: stockMaterial.id }, transaction: t },
                  );
                } else {
                  await StockMaterialModel.create(
                    {
                      stock_id: stock.id,
                      material_id: thisItem.materials[x].material_id,
                      weight: weightFormat(thisItem.materials[x].weight),
                      weight_in_gram: weightFormat(
                        thisItem.materials[x].weight_in_gram,
                      ),
                      quantity: thisItem.materials[x].quantity || 0,
                      purity_id: thisItem.materials[x].purity_id,
                      unit_id: thisItem.materials[x].unit_id,
                      category_id: product.category_id,
                    },
                    { transaction: t },
                  );
                }
              } else {
                await StockMaterialModel.create(
                  {
                    stock_id: stock.id,
                    material_id: thisItem.materials[x].material_id,
                    weight: weightFormat(thisItem.materials[x].weight),
                    weight_in_gram: weightFormat(
                      thisItem.materials[x].weight_in_gram,
                    ),
                    quantity: thisItem.materials[x].quantity || 0,
                    purity_id: thisItem.materials[x].purity_id,
                    unit_id: thisItem.materials[x].unit_id,
                    category_id: product.category_id,
                  },
                  { transaction: t },
                );
              }
            }
          }

          //delete all payment
          await paymentModel.destroy({
            where: {
              table_type: "purchase",
              table_id: purchase.id,
            },
            transaction: t,
          });

          if (!isEmpty(purchase.paid_amount)) {
            await PurchaseModel.update(
              {
                paid_amount: 0,
                due_amount: purchase.total_payable,
                status: "due",
              },
              { where: { id: purchase.id }, transaction: t },
            );
          }
        }
      }

      res.send(formatResponse([], "Purchase Status Changed successfully!"));
    });
  } catch (error) {
    addLog("err: " + error.toString());
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Purchase does not update due to some error"));
  }
};

/**
 * View Purchase
 *
 * @param {*} req
 * @param {*} res
 */
exports.view = async (req, res) => {
  let purchase = await PurchaseModel.findOne({
    where: { id: req.params.id },
    include: [
      {
        model: PurchaseProductModel,
        as: "purchaseProducts",
        include: [
          {
            model: ProductModel,
            as: "product",
            include: [
              {
                model: CategoryModel,
                as: "category",
              },
            ],
          },
          {
            model: SizeModel,
            as: "size",
          },
          {
            model: PurchaseProductMaterialModel,
            as: "purchaseMaterials",
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
        as: "supplier",
      },
    ],
  });
  if (!purchase) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Purchase not found"));
  }
  res.send(
    formatResponse(PurchaseViewCollection(purchase), "Purchase details"),
  );
};

/**
 * edit data for Purchase
 *
 * @param {*} req
 * @param {*} res
 */
exports.edit = async (req, res) => {
  let purchase = await PurchaseModel.findOne({
    where: { id: req.params.id },
    include: [
      {
        model: PurchaseProductModel,
        as: "purchaseProducts",
        include: [
          {
            model: ProductModel,
            as: "product",
          },
          {
            model: SizeModel,
            as: "size",
          },
          {
            model: PurchaseProductMaterialModel,
            as: "purchaseMaterials",
            include: [
              {
                model: MaterialModel,
                as: "material",
                include: [
                  {
                    model: PurityModel,
                    as: "purities",
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
        ],
      },
      {
        model: UserModel,
        as: "supplier",
      },
      {
        model: UserModel,
        as: "addedBy",
      },
      {
        model: SaleModel,
        as: "sale",
      },
    ],
  });
  if (!purchase) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Purchase not found"));
  }
  res.send(
    formatResponse(PurchaseEditCollection(purchase), "Purchase edit details"),
  );
};

/**
 * Update Product
 *
 * @param {*} req
 * @param {*} res
 */
exports.update = async (req, res) => {
  let purchase = await PurchaseModel.findOne({
    where: { id: req.params.id },
    include: [
      {
        model: PurchaseProductModel,
        as: "purchaseProducts",
        include: [
          {
            model: ProductModel,
            as: "product",
          },
          {
            model: PurchaseProductMaterialModel,
            as: "purchaseMaterials",
          },
        ],
      },
    ],
  });

  if (!purchase) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Data not found"));
  }

  let data = req.body;
  try {
    const trans = await sequelize.transaction(async (t) => {
      //remove from stock history
      await stockHistoryModel.destroy({
        where: { purchase_id: purchase.id },
        transaction: t,
      });

      //update purchase table
      let invoice_number = data.invoice_number || null;
      let purchaseObj = {
        supplier_id: data.supplier_id,
        invoice_number: invoice_number,
        invoice_date:
          formatDateTime(purchase.invoice_date, 9) == data.invoice_date
            ? moment(purchase.invoice_date).format("YYYY-MM-DD")
            : moment(data.invoice_date).format("YYYY-MM-DD"),
        notes: data.notes,
        payment_mode: data.payment_mode,
        transaction_no: data.transaction_no,
        total_amount: priceFormat(data.total_amount),
        tax: priceFormat(data.tax),
        discount: priceFormat(data.discount),
        paid_amount: priceFormat(data.paid_amount),
        taxable_amount: priceFormat(data.taxable_amount),
        total_payable: priceFormat(data.total_payable),
        due_amount: priceFormat(data.due_amount),
        due_date:
          formatDateTime(purchase.due_date, 9) == data.due_date
            ? moment(purchase.due_date).format("YYYY-MM-DD")
            : moment(data.due_date).format("YYYY-MM-DD"),
      };
      await PurchaseModel.update(purchaseObj, {
        where: { id: purchase.id },
        transaction: t,
      });

      //remove old product & materials from stock
      let userID = await getWorkingUserID(req);
      await removeMaterialFromStock(purchase, t, userID);

      //update purchase product table
      let ppIds = [],
        pmIds = [];
      for (let i = 0; i < data.products.length; i++) {
        let thisItem = data.products[i];
        let worker_id = thisItem.worker_id || null;
        let thisObj = {
          purchase_id: purchase.id,
          worker_id: worker_id,
          product_id: thisItem.product_id,
          size_id: thisItem.size_id,
          certificate_no: cleanInput(thisItem.certificate_no),
          total_weight: priceFormat(thisItem.total_weight),
          sub_price: priceFormat(thisItem.sub_price),
          making_charge: priceFormat(thisItem.making_charge),
          rep: priceFormat(thisItem.rep),
          tax: priceFormat(thisItem.tax),
          total: priceFormat(thisItem.total),
        };
        let purchaseProduct = null;
        if (thisItem.id == 0) {
          let quantity = 0;
          for (let x = 0; x < thisItem.materials.length; x++) {
            quantity += thisItem.materials[x].quantity
              ? parseInt(thisItem.materials[x].quantity)
              : 0;
          }

          purchaseProduct = await PurchaseProductModel.create(thisObj, {
            transaction: t,
          });
        } else {
          purchaseProduct = await PurchaseProductModel.update(thisObj, {
            where: { id: thisItem.id },
            transaction: t,
          });
        }
        ppIds.push(purchaseProduct.id);

        /**
         * update to stock
         */
        let product = await ProductModel.findByPk(thisItem.product_id);
        let stock = null;
        if (product.type == "material") {
          let quantity = 0;
          for (let x = 0; x < thisItem.materials.length; x++) {
            quantity += thisItem.materials[x].quantity
              ? parseInt(thisItem.materials[x].quantity)
              : 0;
          }
          let result = await updateOrCreate(
            StockModel,
            { product_id: thisItem.product_id, user_id: req.userId },
            {
              product_id: thisItem.product_id,
              quantity: quantity,
              total_weight: thisItem.total_weight,
            },
            t,
            ["quantity", "total_weight"],
          );
          stock = result.item;
        } else {
          let result = await updateOrCreate(
            StockModel,
            { purchase_id: purchase.id, user_id: req.userId },
            {
              user_id: req.userId,
              purchase_id: purchase.id,
              product_id: thisItem.product_id,
              size_id: thisItem.size_id,
              certificate_no: cleanInput(thisItem.certificate_no),
              quantity: 1,
              total_weight: thisItem.total_weight,
            },
            t,
          );
          stock = result.item;
        }

        //update purchase product materials
        let batch_id = null;
        for (let x = 0; x < thisItem.materials.length; x++) {
          let thisMObj = {
            purchase_id: purchase.id,
            purchase_product_id: purchaseProduct.id,
            material_id: thisItem.materials[x].material_id,
            weight: priceFormat(thisItem.materials[x].weight),
            quantity: thisItem.materials[x].quantity,
            purity_id: thisItem.materials[x].purity_id,
            unit_id: thisItem.materials[x].unit_id,
            rate: thisItem.materials[x].rate,
            amount: thisItem.materials[x].amount,
          };
          let purchaseProductM = null;
          if (thisItem.materials[x].id == 0) {
            purchaseProductM = await PurchaseProductMaterialModel.create(
              thisMObj,
              { transaction: t },
            );
          } else {
            purchaseProductM = await PurchaseProductMaterialModel.update(
              thisMObj,
              { where: { id: thisItem.materials[x].id }, transaction: t },
            );
          }

          if (!isEmpty(worker_id)) {
            let stockH = await stockHistoryModel.create(
              {
                from_user_id: worker_id,
                to_user_id: req.userId,
                material_id: thisItem.materials[x].material_id,
                weight: priceFormat(thisItem.materials[x].weight),
                unit_id: thisItem.materials[x].unit_id,
                quantity: thisItem.materials[x].quantity,
                date: moment().format("YYYY-MM-DD"),
                type: "debit",
                batch_id: batch_id,
                purchase_id: purchase.id,
              },
              { transaction: t },
            );
            if (batch_id == null) {
              batch_id = stockH.id;
              await stockHistoryModel.update(
                {
                  batch_id: batch_id,
                },
                { where: { id: stockH.id }, transaction: t },
              );
            }
          }

          /**
           * add to stock materials
           */
          if (product.type == "material") {
            let stockMaterial = await StockMaterialModel.findOne({
              where: {
                stock_id: stock.id,
                material_id: thisItem.materials[x].material_id,
              },
            });
            if (stockMaterial) {
              await StockMaterialModel.update(
                {
                  weight: priceFormat(
                    stockMaterial.weight +
                      priceFormat(thisItem.materials[x].weight),
                  ),
                  quantity:
                    stockMaterial.quantity + thisItem.materials[x].quantity,
                  purity_id: thisItem.materials[x].purity_id,
                  unit_id: thisItem.materials[x].unit_id,
                },
                { where: { id: stockMaterial.id }, transaction: t },
              );
            } else {
              await StockMaterialModel.create(
                {
                  stock_id: stock.id,
                  material_id: thisItem.materials[x].material_id,
                  weight: priceFormat(thisItem.materials[x].weight),
                  quantity: thisItem.materials[x].quantity,
                  purity_id: thisItem.materials[x].purity_id,
                  unit_id: thisItem.materials[x].unit_id,
                },
                { transaction: t },
              );
            }
          } else {
            let result = await updateOrCreate(
              StockMaterialModel,
              {
                stock_id: stock.id,
                material_id: thisItem.materials[x].material_id,
              },
              {
                stock_id: stock.id,
                material_id: thisItem.materials[x].material_id,
                weight: priceFormat(thisItem.materials[x].weight),
                quantity: thisItem.materials[x].quantity,
                purity_id: thisItem.materials[x].purity_id,
                unit_id: thisItem.materials[x].unit_id,
              },
              t,
            );
          }
        }
      }

      //update invoice no if not sent
      if (isEmpty(invoice_number)) {
        invoice_number = "RVINV" + purchase.id;
        await PurchaseModel.update(
          {
            invoice_number: invoice_number,
          },
          { where: { id: purchase.id }, transaction: t },
        );
      }

      res.send(formatResponse([], "Purchase updated successfully!"));
    });
  } catch (error) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Purchase does not update due to some error"));
  }
};

/**
 * delete Purchase
 *
 * @param {*} req
 * @param {*} res
 */
exports.delete = async (req, res) => {
  let purchase = await PurchaseModel.findOne({
    where: { id: req.params.id },
    include: [
      {
        model: PurchaseProductModel,
        as: "purchaseProducts",
        include: [
          {
            model: ProductModel,
            as: "product",
          },
          {
            model: PurchaseProductMaterialModel,
            as: "purchaseMaterials",
          },
        ],
      },
    ],
  });
  if (!purchase) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Data not found"));
  }

  try {
    let purchase_id = req.params.id;
    const trans = await sequelize.transaction(async (t) => {
      //remove old product & materials from stock
      let userID = await getWorkingUserID(req);
      await removeMaterialFromStock(purchase, t, userID);

      await PurchaseProductModel.destroy({
        where: { purchase_id: purchase_id },
        transaction: t,
      });
      await PurchaseProductMaterialModel.destroy({
        where: { purchase_id: purchase_id },
        transaction: t,
      });
      await PurchaseModel.destroy({
        where: { id: purchase_id },
        transaction: t,
      });

      res.send(formatResponse([], "Purchase deleted successfully!"));
    });
  } catch (error) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Purchase does not delete due to some error"));
  }
};

/**
 * get new purchase invoice number
 *
 * @param {*} req
 * @param {*} res
 */
exports.newInvoiceNumber = async (req, res) => {
  let purchase = await PurchaseModel.findOne({ order: [["id", "DESC"]] });
  let next_invoice = "RV-P-" + (purchase ? purchase.id + 1 : 1);

  res.send(formatResponse({ next_invoice: next_invoice }));
};

/**
 * Return Products
 *
 * @param {*} req
 * @param {*} res
 */
exports.returnProducts = async (req, res) => {
  let data = req.body;
  let return_data = data.return_data;
  let return_products = data.return_products;
  let purchase = await PurchaseModel.findOne({ where: { id: req.params.id } });
  if (!purchase) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Purchase not found"));
  }

  /* check if stock left with the user */
  /*for(let i = 0; i < return_products.length; i++){
    if(!return_products[i].is_return){
      continue;
    }

    //fetch purchase product by id
    let purchaseProduct = await PurchaseProductModel.findOne({
      where: {id: return_products[i].id},
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
        {
          model: PurchaseProductMaterialModel,
          as: 'purchaseMaterials',
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
    });

    let stock = null;
    if(return_data.products[i].product_type == 'material'){
      stock = await StockModel.findOne({where: {product_id: return_data.products[i].product_id, user_id: req.userId}});
    } else {
      stock = await StockModel.findOne({where: {purchase_product_id: purchaseProduct.id}})
    }

    // if stock exists 
    if(!stock){
      return res.status(errorCodes.default).send(formatErrorResponse(`${return_data.products[i].product_name} stock not found under the user.`));
    } else if(stock && stock.user_id != req.userId){
      let latestUserDetails = UserModel.findOne({where: {id: stock.user_id}});
      return res.status(errorCodes.default).send(formatErrorResponse(`${return_data.products[i].product_name} stock belongs to ${latestUserDetails.name}. Can not able to return.`));
    }
  }*/

  try {
    const trans = await sequelize.transaction(async (t) => {
      //insert into return table
      const returnObj = await ReturnModel.create(
        {
          user_id: req.userId,
          table_id: purchase.id,
          table_type: "purchases",
          notes: data.notes,
          payment_mode: data.payment_mode,
          txn_id: data.transaction_no,
          cheque_no: data.cheque_no,
          status: "success",
          total_amount: data.return_amount,
          accepted_at: moment().format("YYYY-MM-DD"),
          return_date: data.return_date
            ? moment(data.return_date).format("YYYY-MM-DD")
            : moment().format("YYYY-MM-DD"),
        },
        { transaction: t },
      );

      for (let i = 0; i < return_products.length; i++) {
        if (!return_products[i].is_return) {
          continue;
        }

        //fetch purchase product by id
        let purchaseProduct = await PurchaseProductModel.findOne({
          where: { id: return_products[i].id },
          include: [
            {
              model: ProductModel,
              as: "product",
              include: [
                {
                  model: CategoryModel,
                  as: "category",
                },
              ],
            },
            {
              model: SizeModel,
              as: "size",
            },
            {
              model: PurchaseProductMaterialModel,
              as: "purchaseMaterials",
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
        });

        //insert into return product table
        let returnProduct = await ReturnProductModel.create(
          {
            return_id: returnObj.id,
            table_id: purchaseProduct.id,
            table_type: "purchase_products",
            sub_total: return_data.products[i].return_amount,
          },
          { transaction: t },
        );

        //insert into return product materials table
        for (let x = 0; x < return_data.products[i].materials.length; x++) {
          let thisQty =
            return_data.products[i].product_type == "material"
              ? parseFloat(return_data.products[i].materials[x].return_qty)
              : return_data.products[i].materials[x].quantity;
          let thisWeight =
            return_data.products[i].product_type == "material"
              ? parseFloat(return_data.products[i].materials[x].return_weight)
              : return_data.products[i].materials[x].weight;
          await ReturnProductMaterialModel.create(
            {
              return_id: returnObj.id,
              return_product_id: returnProduct.id,
              material_id: return_data.products[i].materials[x].material_id,
              weight: thisWeight,
              quantity: thisQty,
              purity_id: return_data.products[i].materials[x].purity_id,
              unit_id: return_data.products[i].materials[x].unit_id,
            },
            { transaction: t },
          );
        }

        //update purchase product is return and return weight & qty into purchase product material table
        if (return_data.products[i].product_type == "material") {
          let total_return_weight =
            parseFloat(purchaseProduct.purchaseMaterials[0].return_weight) +
            parseFloat(return_data.products[i].materials[0].return_weight);
          let total_return_qty =
            parseInt(purchaseProduct.purchaseMaterials[0].return_qty) +
            parseInt(return_data.products[i].materials[0].return_qty);
          let is_return =
            total_return_qty >=
              parseInt(purchaseProduct.purchaseMaterials[0].quantity) ||
            total_return_weight >=
              parseFloat(purchaseProduct.purchaseMaterials[0].weight)
              ? true
              : false;

          await PurchaseProductModel.update(
            { is_return: is_return },
            { where: { id: purchaseProduct.id }, transaction: t },
          );
          await PurchaseProductMaterialModel.update(
            {
              return_qty: total_return_qty,
              return_weight: total_return_weight,
            },
            {
              where: { id: purchaseProduct.purchaseMaterials[0].id },
              transaction: t,
            },
          );
        } else {
          await PurchaseProductModel.update(
            { is_return: true },
            { where: { id: purchaseProduct.id }, transaction: t },
          );
        }

        /**
         * START - Remove from stock table
         */
        if (purchase.is_approved == 1) {
          let stock = null;
          if (return_data.products[i].product_type == "material") {
            stock = await StockModel.findOne({
              where: {
                product_id: return_data.products[i].product_id,
                user_id: req.userId,
              },
            });
            let quantity = 0,
              unit_name = "";
            for (let mItem of return_data.products[i].materials) {
              let stockM = await StockMaterialModel.findOne({
                where: { stock_id: stock.id, material_id: mItem.material_id },
              });
              if (stockM) {
                await StockMaterialModel.update(
                  {
                    weight: weightFormat(
                      parseFloat(stockM.weight) -
                        parseFloat(mItem.return_weight),
                    ),
                    quantity:
                      parseInt(stockM.quantity) - parseInt(mItem.return_qty),
                  },
                  { where: { id: stockM.id } },
                );
                quantity += mItem.return_qty ? parseInt(mItem.return_qty) : 0;
              }
              unit_name = mItem.unit_name;
            }
            if (stock.quantity <= quantity) {
              await StockModel.destroy({ where: { id: stock.id } });
            } else {
              let return_weight_in_gram = convertUnitToGram(
                unit_name,
                return_data.products[i].materials[0].return_weight,
              );
              await StockModel.update(
                {
                  quantity: stock.quantity - quantity,
                  total_weight: stock.total_weight - return_weight_in_gram,
                },
                { where: { id: stock.id } },
              );
            }
          } else {
            let stock = await StockModel.findOne({
              where: { purchase_product_id: purchaseProduct.id },
            });
            if (stock) {
              await StockModel.destroy({ where: { id: stock.id } });
              await StockMaterialModel.destroy({
                where: { stock_id: stock.id },
              });
            }
          }
        }
        /**
         * END - Remove from stock table
         */

        //update purchase total payable price
        let total_payable = parseFloat(purchase.total_payable);
        let return_amount = parseFloat(data.return_amount);
        total_payable = priceFormat(total_payable - return_amount);
        let paid_amount = parseFloat(purchase.paid_amount);
        let due_amount = priceFormat(total_payable - paid_amount, true);
        let advance_amount = due_amount < 0 ? priceFormat(0 - due_amount) : 0;
        due_amount = due_amount < 0 ? 0 : due_amount;
        if (advance_amount > 0) {
          // let supplier = await UserModel.findByPk(purchase.supplier_id);
          // if(supplier){
          //   advance_amount = priceFormat(advance_amount + supplier.advance_amount);
          //   await UserModel.update({advance_amount: advance_amount}, {where: {id: purchase.supplier_id}, transaction: t});
          // }
        }

        await PurchaseModel.update(
          {
            return_amount: return_amount,
            total_payable: total_payable,
            due_amount: due_amount,
          },
          { where: { id: req.params.id }, transaction: t },
        );
      }
      res.send(formatResponse([], "Returned successfully!"));
    });
  } catch (error) {
    addLog("err: " + error.toString());
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse(errorCodes.defaultErrorMsg));
  }
};

/**
 * Download Invoice
 *
 * @param {*} req
 * @param {*} res
 */
exports.downloadInvoiceInfo = async (req, res) => {
  const company = await getCompanyDetails(req.userId);
  let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
  let purchase = await PurchaseModel.findOne({
    where: { id: req.params.id /*, user_id: userID*/ },
    /* include: [
      {
        model: PurchaseProductModel,
        as: "purchaseProducts",
        separate: true,
        include: [
          {
            model: ProductModel,
            as: "product",
            include: [
              {
                model: CategoryModel,
                as: "category",
              }
            ],
          },
          {
            model: SizeModel,
            as: "size",
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
        ],
      },
      {
        model: UserModel,
        as: "supplier",
      },
    ], */
    include: [
      {
        model: PurchaseProductModel,
        as: "purchaseProducts",
        separate: true,
        include: [
          {
            model: ProductModel,
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
              {
                model: taxSlabModel,
                as: "tax",
              },
            ],
          },
          {
            model: SizeModel,
            as: "size",
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
        ],
      },
      {
        model: UserModel,
        as: "supplier",
      },
      {
        model: UserModel,
        as: "purchaseBy",
      },
      {
        model: SaleModel,
        as: "sale",
      },
    ],
  });
  if (!purchase) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Purchase not found"));
  }

  let purchaseData = PurchaseViewCollection(purchase);

  let payments = await PaymentModel.findAll({
    where: {
      table_type: "purchase",
      table_id: req.params.id,
    },
    include: [
      {
        model: UserModel,
        as: "user",
      },
    ],
  });
  payments = await PaymentCollection(payments);
  /* 18k gold purity value */
  let purity18K = await PurityModel.findOne({
    where: {
      id: 1, //18K
    },
  });

  purity18K = await PurityCollection(purity18K);

  let logo;
  if (company.logo) {
    const _logoRes = await require("axios").get(`${process.env.BASE_URL}${company.logo}`, { responseType: "arraybuffer" });
    logo = Buffer.from(_logoRes.data).toString("base64");
  } else {
    logo = fs.readFileSync(`public/images/logo.png`).toString("base64");
  }

  let footerhtml = `
          
              <div class="invoice" style="width: 1000px; padding:15px; margin: 0px; background-color: #f9f9f9; border-top: 2px solid #000;">
                  <table cellpadding="0" cellspacing="1" width="1000px" style="margin:auto;" >
                      <tbody>
                          <tr>
                              <td><table cellspacing="0" cellpadding="0"
                                    border="0"
                                    align="center" width="90%">
                                    <div style="display: table; width:
                                        100%; font-size: 11px;">
                                        <div style="display: table-cell; width: 65%; vertical-align: top;"></div>
                                        <div style="display: table-cell;
                                            width: 35%;">
                                            <div style="display: flex;
                                                
                                                justify-content:
                                                space-between;">
                                                <!---<div>
                                                    <h4 style="margin:
                                                        0px;
                                                        text-align:
                                                        center;
                                                        font-size:
                                                        11px;">Customer
                                                        Signature</h4>
                                                    <input type="text"
                                                        style="display:
                                                        block;
                                                        margin: auto;
                                                        height:
                                                        36px; min-width:
                                                        142px; ">

                                                </div> -->
                                                <!-- <div style="display:flex ; align-items: center;">
                                                    <h4 style="margin-right:
                                                        5px;
                                                        text-align:
                                                        center;
                                                        font-size:
                                                        11px;">Returning%
                                                    </h4>
                                                    <div
                                                        style="position:
                                                        relative;">
                                                        <input
                                                            type="text"
                                                            style="display:
                                                            block;
                                                            margin:
                                                            auto;
                                                            height:
                                                            16px;
                                                            min-width:
                                                            24px; width:64px; ">
                                                        <div
                                                            style="position:
                                                            absolute;
                                                            right:
                                                            12px; top:
                                                            4px;
                                                            font-size:
                                                            11px;">%</div>
                                                    </div>
                                                </div> -->

                                            </div>
                                        </div>
                                    </div>
                                </table></td>
                        </tr>
                    </tbody>
                </table>
            </div>
          `;

  let html = `<!DOCTYPE html>
  <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Bill</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <style>
          html {
            -webkit-print-color-adjust: exact;
          }
          tbody tr { page-break-inside: avoid; }
          thead { display: table-header-group; }
          .table-footer-area { page-break-inside: avoid; }
          </style>
      </head>
      <body style="box-sizing: border-box; padding: 0px; margin: 0px; font-family:
          'Poppins', sans-serif;">
          <div class="invoice" style="max-width: 1000px; margin: auto; padding:
              15px;
              background-color: #f9f9f9;">
              <table cellpadding="0" cellspacing="0" width="100%">
                  <tbody>
                      <tr>
                          <td>
                              <table cellspacing="0" cellpadding="0" border="0"
                                  align="center" width="100%">
                                  <h1 style="font-size: 14px; text-align:
                                      center; margin-bottom: 5px; font-weight:
                                      300;">PURCHASE TAX INVOICE</h1>
                              </table>
                              <table cellspacing="0" cellpadding="0" border="0"
                                  align="center" width="100%">
                                  <div style="display: table; width: 100%;">
                                      <div style="width: 65%; display: table-cell;
                                          vertical-align: bottom;">
                                          <img src="data:image/png;base64,${logo}" style="width:
                                              220px; margin-left: 10px;">
                                          <h3 style="margin: 0; font-weight: 400;
                                              font-size: 12px;">Corporate Office -
                                              ${company.corporate_office_address || ''}</h3>
  
                                      </div>
                                      <div style="width: 35%; display: table-cell;
                                          vertical-align: middle; text-align:
                                          left;">
                                          <h3 style="margin: 0;">
                                              <span style="font-size: 16px;
                                                  font-weight: 600;">${company.head_office_name || ''}</span></h3>
                                          <h3 style="margin: 0; font-weight: 400;
                                              font-size: 14px;">GST No -
                                              <span style="font-weight: 600;">${company.gst_no || ''}</span></h3>
                                          <h3 style="margin: 0; font-weight: 400;
                                              font-size: 12px;">User Id - <span>${purchaseData.purchase_by_name}</span></h3>
                                          <h3 style="margin: 0; font-weight: 400;
                                              font-size: 12px;">Address - ${company.address || ''}</h3>
                                          <h3 style="font-weight: 600; font-size:
                                              12px; margin: 0;">
                                              ${company.email || ''}, ${company.phone || ''}
                                          </h3>
                                      </div>
                                  </div>
                              </table>
                              <table cellspacing="0" cellpadding="5" border="0"
                                  align="center" width="100%">
                                  <tbody>
                                      <tr>
                                          <hr style="border: 1px solid #1E2757">
                                      </tr>
                                  </tbody>
                              </table>
                              <table cellspacing="0" cellpadding="5" border="0"
                                  align="center" width="100%">
                                  <thead>
                                      <!-- <tr style="background-color: #000;">
                                          <th style="text-align: left; color:
                                              #fff;">Company: Ratn Alankar
                                              Jewellers</th>
                                          <th style="text-align: left; color:
                                              #fff;">Name: Mukund Singhaindi</th>
                                          <th style="text-align: left; color:
                                              #fff;">Cont: 91919191919</th>
                                          <th style="text-align: left; color:
                                              #fff;">City: Muzaffarpur</th>
                                      </tr>
                                  </thead> -->
                                      <tbody>
                                          <!-- <tr style="background-color: #fff;">
                                          <td style="">
                                              <span style="font-weight: 600;"> GST
                                                  IN ${purchaseData.supplier_details.gst} </span>
                                          </td>
                                          <td style="">
                                              Ad:
                                          </td>
                                          <td style="">
  
                                          </td>
                                          <td style="">
                                              Pin Code: 800 020
                                          </td>
                                      </tr> -->
                                          <tr>
                                              <td style="padding: 0;">
                                                  <div class="comp-part-one">
                                                      <ul style="margin: 0;
                                                          padding: 0; list-style:
                                                          none; display: flex;
                                                          gap: 15px;
                                                          justify-content:
                                                          space-between;">
                                                          <li><span
                                                                  style="font-weight:
                                                                  400; font-size:
                                                                  12px; margin:
                                                                  0;">Company -</span>
                                                              <span
                                                                  style="font-weight:
                                                                  600; font-size:
                                                                  12px; margin:
                                                                  0;">${purchaseData.supplier_details.company_name}</span></li>
                                                          <li><span
                                                                  style="font-weight:
                                                                  400; font-size:
                                                                  12px; margin:
                                                                  0;">GST IN</span>
                                                              <span
                                                                  style="font-weight:
                                                                  600; font-size:
                                                                  12px; margin:
                                                                  0;">${purchaseData.supplier_details.gst}</span></li>
                                                          <li><span
                                                                  style="font-weight:
                                                                  400; font-size:
                                                                  12px; margin:
                                                                  0;">Cont -
                                                              </span>
                                                              <span
                                                                  style="font-weight:
                                                                  600; font-size:
                                                                  12px; margin:
                                                                  0;">${purchaseData.supplier_mobile}</span>
                                                          <li><span
                                                                  style="font-weight:
                                                                  400; font-size:
                                                                  12px; margin:
                                                                  0;">Invoice Date
                                                                  -
                                                              </span> <span
                                                                  style="font-weight:
                                                                  600; font-size:
                                                                  12px; margin:
                                                                  0;">${purchaseData.invoice_date}</span></li>
                                                                  
                                                      </ul>
                                                  </div>
                                                  <div class="comp-part-two">
                                                      <ul style="margin: 0;
                                                          padding: 0; list-style:
                                                          none; display: flex;
                                                          gap: 15px;
                                                          justify-content:
                                                          space-between;">
                                                          <li><span
                                                                  style="font-weight:
                                                                  400; font-size:
                                                                  12px; margin:
                                                                  0;">Address -</span>
                                                              <span
                                                                  style="font-weight:
                                                                  500; font-size:
                                                                  12px; margin:
                                                                  0;">${purchaseData.supplier_details.address}</span></li>
                                                         
                                                          <li><span
                                                                  style="font-weight:
                                                                  400; font-size:
                                                                  12px; margin:
                                                                  0;">Invoice No -
                                                              </span> <span
                                                                  style="font-weight:
                                                                  600; font-size:
                                                                  12px; margin:
                                                                  0;">${purchaseData.invoice_number}</span></li>
                                                      </ul>
 <ul style="margin: 0;
                                                          padding: 0;margin-left:52px; list-style:
                                                          none; display: flex;
                                                          gap: 15px;
                                                         ">
                                                       <li><span
                                                                  style="font-weight:
                                                                  400; font-size:
                                                                  12px; margin:
                                                                  0;">City -</span>
                                                              <span
                                                                  style="font-weight:
                                                                  500; font-size:
                                                                  12px; margin:
                                                                  0;">${purchaseData.supplier_details.city}</span></li>
                                                          <li><span
                                                                  style="font-weight:
                                                                  400; font-size:
                                                                  12px; margin:
                                                                  0;">Pin -
                                                              </span>
                                                              <span
                                                                  style="font-weight:
                                                                  500; font-size:
                                                                  12px; margin:
                                                                  0;">${purchaseData.supplier_details.pincode}</span></li>
                                                                  </ul>
                                                  </div>
                                              </td>
                                          </tr>
                                      </tbody>
                                  </table>`;
  let metalHtml = "";
  if (purchaseData.subCatItems.length == 0) {
    html += `<table cellspacing="0" cellpadding="5"  style="margin-top:10px"
                            border="0"
                            align="center" width="100%">
                            <thead style="background-color: #1E2757;">
                                <tr style="background-color: #1E2757;">
                                    <th style="text-align: left; color:
                                        #fff; border: 1px solid #1E2757;
                                        font-size: 12px; font-weight:
                                        400;background-color: #1E2757;">#</th>
                                    <th style="text-align: left; color:
                                        #fff; font-size: 12px;
                                        font-weight: 400; width:
                                        250px;">Product Name</th>
                                    <th style="text-align: left; color:
                                        #fff; font-size: 12px;
                                        font-weight: 400; width: 50px;">Size</th>
                                    <th style="text-align: left; color:
                                        #fff; font-size: 12px;
                                        font-weight: 400; width: 150px;">Product Id</th>
                                    <th style="text-align: left; color:
                                        #fff; font-size: 12px;
                                        font-weight: 400;">Mtrl</th>
                                    <th style="text-align: left; color:
                                        #fff; font-size: 12px;
                                        font-weight: 400; width: 70px">Making Etc</th>
                                    <th style="text-align: left; color:
                                        #fff; font-size: 12px;
                                        font-weight: 400;">Tag Price</th>
                                    <th style="text-align: left; color:
                                        #fff; font-size: 12px;
                                        font-weight: 400;">Dist Amt</th>
                                    <th style="text-align: left; color:
                                        #fff; font-size: 12px;
                                        font-weight: 400;">Sub-Tot</th>
                                    <th style="text-align: left; color:
                                        #fff; font-size: 12px;
                                        font-weight: 400;">Tax%</th>
                                    <th style="text-align: left; color:
                                        #fff; font-size: 12px;
                                        font-weight: 400;">Total</th>
                                </tr>
                            </thead>
                            <tbody>`;
    for (let i = 0; i < purchaseData.products.length; i++) {
      let bgTrColor = i % 2 == 0 ? "#C1BDBD" : "#C4BEED";
      html += `<tr style="background-color: ${bgTrColor}">
                                    <td style="text-align: left;
                                        font-size: 11px;
                                        font-weight: 400;">
                                        ${i + 1}
                                    </td>
                                    <td style="text-align: left;
                                        font-size: 11px;
                                        font-weight: 400;font-size: 10px;">
                                        ${
                                          purchaseData.products[i].product_name
                                        } - ${
                                          purchaseData.products[i].product_code
                                        }
                                    </td>
                                    <td style="text-align: left;
                                        font-size: 11px;
                                        font-weight: 400;">
                                        ${purchaseData.products[i].size_name}
                                    </td>
                                    <td colspan="8" style="text-align:
                                        left; font-size: 11px;
                                        font-weight: 400;">
                                        ${
                                          purchaseData.products[i]
                                            .certificate_no
                                        }
                                    </td>

                                </tr>
                                <tr style="background-color: #fff;
                                    vertical-align: top;">
                                    <td colspan="3"
                                        style="border-bottom: 1px solid
                                        #1E2757; width: 300px; text-align: left;">
                                        <div style="max-width: 300px; text-align: left;">`;
      for (let x = 0; x < purchaseData.products[i].materials.length; x++) {
        purchaseData.products[i].materials[x].amount == "₹0.00"
          ? null
          : (html += `<div style="display: flex;
                                                flex-wrap: wrap;
                                                justify-content: center;
                                                margin: 0 -5px; text-align: left;">
                                                <div style="flex-basis:
                                                    calc(69% - 10px);
                                                    margin: 0 5px
                                                    0px; line-height:
                                                    1;text-align: left;">
                                                    <span
                                                        style="text-align:
                                                        left;font-size:
                                                        10px;
                                                        font-weight:
                                                        400;text-align: left;">${purchaseData.products[i].materials[x].material_name} ${purchaseData.products[i].materials[x].pakka_weight} ${purchaseData.products[i].materials[x].unit_name}x${purchaseData.products[i].materials[x].rate}
                                                    </span>

                                                </div>

                                                <div
                                                    style="flex-basis:
                                                    calc(31% -
                                                    10px);
                                                    margin: 0 5px
                                                    0px; line-height:
                                                    1;">
                                                    <span
                                                        style="text-align:
                                                        left; font-size:
                                                        10px;
                                                        font-weight:
                                                        400;"> = ${purchaseData.products[i].materials[x].amount}</span>
                                                </div>

                                            </div>`);
      }

      html += `</div>


                                            </td>
                                            <td style="border-bottom:
                                                1px solid #1E2757;">`;
      for (let x = 0; x < purchaseData.products[i].materials.length; x++) {
        html += `<div>`;
        if (isEmpty(purchaseData.products[i].materials[x].discount_amount)) {
          purchaseData.products[i].materials[x].amount == "₹0.00"
            ? null
            : (html += `-`);
        } else {
          html += `<span
                                                        style="text-align:
                                                        left; font-size:
                                                        10px;
                                                        font-weight:
                                                        400;">@${removeBlankZero(
                                                          purchaseData.products[
                                                            i
                                                          ].materials[x]
                                                            .discount_percent,
                                                        )}% ${
                                                          purchaseData.products[
                                                            i
                                                          ].materials[x]
                                                            .discount_amount_display
                                                        }</span> 
                                                                    <!--<span
                                                        style="text-align:
                                                        left; font-size:
                                                        10px;
                                                        font-weight:
                                                        400;">${
                                                          purchaseData.products[
                                                            i
                                                          ].materials[x]
                                                            .discount_amount_display
                                                        }</span>-->`;
        }
        html += `</div>`;
      }
      html += `</td>
                                            <td style="text-align: left;
                                                font-size: 10px;
                                                font-weight: 400;
                                                border-bottom: 1px solid
                                                #1E2757;">`;
      for (let x = 0; x < purchaseData.products[i].materials.length; x++) {
        purchaseData.products[i].materials[x].amount == "₹0.00"
          ? null
          : (html += `<div>${purchaseData.products[i].materials[x].material_cost}</div>`);
      }
      html += `</td>
                                            <td style="text-align: left;
                                                font-size: 10px;
                                                font-weight: 400;
                                                border-bottom: 1px solid
                                                #1E2757;">
                                                ${
                                                  purchaseData.products[i]
                                                    .making_charge
                                                }@${
                                                  purchaseData.products[i]
                                                    .making_charge_discount
                                                    ? purchaseData.products[i]
                                                        .making_charge_discount
                                                    : ""
                                                }% = ${
                                                  purchaseData.products[i]
                                                    .total_making_charge_discount
                                                    ? purchaseData.products[i]
                                                        .total_making_charge_discount
                                                    : ""
                                                }
                                            </td>

                                            <td style="text-align:
                                                left;font-size: 10px;
                                                font-weight: 600;
                                                border-bottom: 1px solid
                                                #1E2757;">
                                                ${
                                                  purchaseData.products[i]
                                                    .sub_price
                                                }
                                            </td>
                                            <td style="text-align:
                                                left;font-size: 10px;
                                                font-weight: 600;
                                                border-bottom: 1px solid
                                                #1E2757;">
                                                ${
                                                  purchaseData.products[i]
                                                    .total_discount_display
                                                }
                                            </td>
                                            <td style="text-align:
                                                left;font-size: 10px;
                                                font-weight: 400;
                                                border-bottom: 1px solid
                                                #1E2757;">
                                                ${
                                                  purchaseData.products[i]
                                                    .sub_total
                                                }
                                            </td>
                                            <td style="text-align:
                                                left;font-size: 10px;
                                                font-weight: 400;
                                                border-bottom: 1px solid
                                                #1E2757;">
                                                ${purchaseData.products[i].tax}
                                            </td>
                                            <td style="text-align:
                                                left;font-size: 10px;
                                                font-weight: 600;
                                                border-bottom: 1px solid
                                                #1E2757;">
                                                ${
                                                  purchaseData.products[i]
                                                    .total_display
                                                }
                                            </td>

                                        </tr>`;
    }
    html += `<tr style="
                                            vertical-align: top;">
                                            <td colspan="6"
                                                style="
                                                border:none;">

                                            </td>
                                            <!-- <td style="">
                                                <div>
                                                    <h4 style="margin:
                                                        0;
                                                        text-align:
                                                        left; font-size:
                                                        12px;
                                                        font-weight:
                                                        600; display:
                                                        ;">
                                                        Total
                                                        Save <div>139000</div></h4>
                                                </div>
                                            </td> -->
                                            
                                            
                                            

                                        </tr>

                                        <!-- <tr style="
                                            vertical-align: top;">
                                            <td colspan="8"
                                                style="
                                                border:none; padding: 0;">
                                            </td>
                                          
                                            
                                            
                                            <td colspan="3" style="margin: 0;
                                                text-align: left;
                                                font-size: 12px;
                                                font-weight: 600; padding: 4px;">
                                                <div>
                                                    <h4 style="margin:
                                                        0;
                                                        text-align:
                                                        right; font-size:
                                                        12px;
                                                        font-weight:
                                                        600;">
                                                        Total <span style=""> <input type="text" value="139000" style="max-width: 80px;"></span></h4>
                                                </div>
                                            </td>

                                        </tr>
                                        <tr style="
                                            vertical-align: top;">
                                            <td colspan="8"
                                                style="
                                                border:none; padding: 0;">

                                            </td> 
                                            <td colspan="3" style="margin: 0;
                                                text-align: left;
                                                font-size: 12px;
                                                font-weight: 600; padding: 4px;">
                                                <div>
                                                    <h4 style="margin:
                                                        0;
                                                        text-align:
                                                        right; font-size:
                                                        12px;
                                                        font-weight:
                                                        600;">
                                                        Total <span style=""> <input type="text" value="139000" style="max-width: 80px;"></span></h4>
                                                </div>
                                            </td>

                                        </tr> -->
                                    </tbody>
                                </table>`;
  } else {
    /* Making charge lookup per sub-category HSN, from the purchase products */
    let makingChargeMap = {};
    if (purchaseData.products) {
      purchaseData.products.forEach((p) => {
        const key = p.sub_category_hsn || "";
        if (!makingChargeMap[key]) makingChargeMap[key] = 0;
        makingChargeMap[key] += parseFloat(p.making_charge) || 0;
      });
    }

    html += `<table cellspacing="0" cellpadding="5" style="margin-top:10px; border-collapse: collapse;"
                                      border="0"
                                      align="center" width="100%">
                              <thead style="background-color: #1E2757;">
                                  <tr style="background-color: #1E2757;">
                                      <th rowspan="2" style="text-align: center; color: #fff; font-size: 11px; font-weight: 400; border: 1px solid #ffffff; width: 32px; padding: 5px 3px;">S.No.</th>
                                      <th rowspan="2" style="text-align: center; color: #fff; font-size: 11px; font-weight: 400; border: 1px solid #ffffff; width: 110px; padding: 5px 3px;">Product Name</th>
                                      <th rowspan="2" style="text-align: center; color: #fff; font-size: 11px; font-weight: 400; border: 1px solid #ffffff; width: 40px; padding: 5px 3px;">Qty<br/>(Pcs)</th>
                                      <th rowspan="2" style="text-align: center; color: #fff; font-size: 11px; font-weight: 400; border: 1px solid #ffffff; width: 48px; padding: 5px 3px;">Code</th>
                                      <th rowspan="2" style="text-align: center; color: #fff; font-size: 11px; font-weight: 400; border: 1px solid #ffffff; width: 95px; padding: 5px 3px;">Metals</th>
                                      <th colspan="2" style="text-align: center; color: #fff; font-size: 11px; font-weight: 400; border: 1px solid #ffffff; padding: 5px 3px;">Gross Weight</th>
                                      <th rowspan="2" style="text-align: center; color: #fff; font-size: 11px; font-weight: 400; border: 1px solid #ffffff; width: 38px; padding: 5px 3px;">Unit</th>
                                      <th rowspan="2" style="text-align: center; color: #fff; font-size: 11px; font-weight: 400; border: 1px solid #ffffff; width: 50px; padding: 5px 3px;">Rate</th>
                                      <th rowspan="2" style="text-align: center; color: #fff; font-size: 11px; font-weight: 600; border: 1px solid #ffffff; width: 65px; padding: 5px 3px;"><b>Making<br/>Charge</b></th>
                                      <th rowspan="2" style="text-align: center; color: #fff; font-size: 11px; font-weight: 400; border: 1px solid #ffffff; width: 48px; padding: 5px 3px;">Tax<br/>%</th>
                                      <th rowspan="2" style="text-align: center; color: #fff; font-size: 11px; font-weight: 400; border: 1px solid #ffffff; width: 75px; padding: 5px 3px;">Amount (₹)</th>
                                  </tr>
                                  <tr style="background-color: #1E2757;">
                                      <th style="text-align: center; color: #fff; font-size: 11px; font-weight: 400; border: 1px solid #ffffff; width: 48px; padding: 5px 3px;">N. Wt.</th>
                                      <th style="text-align: center; color: #fff; font-size: 11px; font-weight: 400; border: 1px solid #ffffff; width: 60px; padding: 5px 3px;">Total (GM)</th>
                                  </tr>
                              </thead>
                              <tbody>`;
    let fine_metals = 0;
    let totalGrossWeight = 0;
    let materialTotals = {};
    let totalTaxableAmt = 0;
    let totalMakingCharge = 0;
    let totalTax = 0;

    if (purchaseData.products) {
      purchaseData.products.forEach((product) => {
        totalMakingCharge += parseFloat(product.making_charge) || 0;
      });
    }

    for (let i = 0; i < purchaseData.subCatItems.length; i++) {
      let item = purchaseData.subCatItems[i];
      item.material.map((itm) => {
        if (itm.id == 1) {
          fine_metals += parseFloat(itm.weight);
        }
      });

      /* Calculate GW for this row */
      let rowGrossWeight = 0;
      item.material.forEach((mat) => {
        rowGrossWeight += convertUnitToGram(mat.unit, mat.weight);
        totalGrossWeight += convertUnitToGram(mat.unit, mat.weight);
      });

      /* Accumulate material totals */
      let taxableAmt = parseFloat(item.taxableAmount) || 0;
      let taxPercent = parseFloat(item.tax) || 0;
      totalTaxableAmt += taxableAmt;
      totalTax += (taxableAmt * taxPercent) / 100;
      item.material.forEach((mat) => {
        const key = mat.name;
        if (!materialTotals[key]) {
          materialTotals[key] = {
            weight: 0,
            unit: mat.unit,
            rate: parseFloat(mat.rate) || 0,
            amount: 0,
            isGold: key.toLowerCase().includes("gold"),
          };
        }
        materialTotals[key].weight += parseFloat(mat.weight) || 0;
        materialTotals[key].amount +=
          (parseFloat(mat.weight) || 0) * (parseFloat(mat.rate) || 0);
      });

      let materialNames = item.material.map((itm) => itm.name).join("<br/>");
      let materialWts = item.material
        .map((itm) => parseFloat(itm.weight).toFixed(3))
        .join("<br/>");
      let materialUnits = item.material.map((itm) => itm.unit).join("<br/>");
      let materialRates = item.material
        .map((itm) => parseFloat(itm.rate).toFixed(2))
        .join("<br/>");
      let bgTrColor = i % 2 == 0 ? "#f5f5f5" : "#ffffff";
      let slNo = i + 1 <= 9 ? "0" + (i + 1) : i + 1;
      let makingCharge = makingChargeMap[item.hsn] || 0;

      html += `<tr style="background-color: ${bgTrColor}; border-bottom: 1px solid #e0e0e0;">
                  <td style="text-align: center; font-size: 11px; font-weight: 400; padding: 6px 4px; border: 1px solid #e0e0e0;">${slNo}</td>
                  <td style="text-align: center; font-size: 11px; font-weight: 400; padding: 6px 4px; border: 1px solid #e0e0e0;">${item.name}</td>
                  <td style="text-align: center; font-size: 11px; font-weight: 400; padding: 6px 4px; border: 1px solid #e0e0e0;">${item.qty}</td>
                  <td style="text-align: center; font-size: 11px; font-weight: 400; padding: 6px 4px; border: 1px solid #e0e0e0;">${item.hsn ? item.hsn : ""}</td>
                  <td style="text-align: center; font-size: 11px; font-weight: 400; padding: 6px 4px; border: 1px solid #e0e0e0;">${materialNames}</td>
                  <td style="text-align: center; font-size: 11px; font-weight: 400; padding: 6px 4px; border: 1px solid #e0e0e0;">${materialWts}</td>
                  <td style="text-align: center; font-size: 11px; font-weight: 600; padding: 6px 4px; border: 1px solid #e0e0e0;">${rowGrossWeight.toFixed(3)}</td>
                  <td style="text-align: center; font-size: 11px; font-weight: 400; padding: 6px 4px; border: 1px solid #e0e0e0;">${materialUnits}</td>
                  <td style="text-align: center; font-size: 11px; font-weight: 400; padding: 6px 4px; border: 1px solid #e0e0e0;">${materialRates}</td>
                  <td style="text-align: center; font-size: 11px; font-weight: 400; padding: 6px 4px; border: 1px solid #e0e0e0;">${makingCharge > 0 ? makingCharge.toFixed(2) : "-"}</td>
                  <td style="text-align: center; font-size: 11px; font-weight: 400; padding: 6px 4px; border: 1px solid #e0e0e0;">${item.tax}%</td>
                  <td style="text-align: right; font-size: 11px; font-weight: 600; padding: 6px 4px; border: 1px solid #e0e0e0; color: #1E2746;">${item.taxableAmount.toFixed(2)}</td>
              </tr>`;
    }

    /* Summary rows below the table */
    html += `<tr><td colspan="12" style="border-bottom: none; padding: 4px;"></td></tr>`;

    /* Total Gross Weight */
    html += `<tr>
                <td colspan="5" style="font-size: 12px; font-weight: 600; color: #1E2746; padding: 4px; border-bottom: 1px solid #e0e0e0;">Total Gross Weight (GW)</td>
                <td colspan="2" style="font-size: 12px; font-weight: 600; color: #1E2746; padding: 4px; text-align: center; white-space: nowrap; border-bottom: 1px solid #e0e0e0;">${totalGrossWeight.toFixed(3)} gm</td>
                <td colspan="5" style="border-bottom: 1px solid #e0e0e0;"></td>
            </tr>`;

    /* Material-wise totals (gold first) */
    let matEntries = Object.entries(materialTotals).sort((a, b) => {
      const aIsGold = a[0].toLowerCase().includes("gold") ? 1 : 0;
      const bIsGold = b[0].toLowerCase().includes("gold") ? 1 : 0;
      return aIsGold - bIsGold;
    });
    for (let idx = 0; idx < matEntries.length; idx++) {
      let [name, data] = matEntries[idx];
      let isGold = name.toLowerCase().includes("gold");
      let fontWeight = isGold ? "600" : "400";
      let fontColor = isGold ? "#1E2746" : "#555";
      html += `<tr>
                  <td colspan="4" style="font-size: 12px; font-weight: ${fontWeight}; color: ${fontColor}; padding: 4px; border-bottom: 1px solid #eeeeee;">${name}</td>
                  <td colspan="2" style="font-size: 12px; font-weight: ${fontWeight}; color: ${fontColor}; padding: 4px; text-align: right; white-space: nowrap; border-bottom: 1px solid #eeeeee;">${data.weight.toFixed(3)} ${data.unit}</td>
                  <td colspan="2" style="font-size: 12px; font-weight: ${fontWeight}; color: ${fontColor}; padding: 4px; text-align: center; white-space: nowrap; border-bottom: 1px solid #eeeeee;">x ${data.rate.toFixed(2)}</td>
                  <td colspan="2" style="font-size: 12px; font-weight: ${fontWeight}; color: ${fontColor}; padding: 4px; text-align: right; white-space: nowrap; border-bottom: 1px solid #eeeeee;">${data.amount.toFixed(2)}</td>
                  <td colspan="2" style="border-bottom: 1px solid #eeeeee;"></td>
              </tr>`;
    }

    /* Making Charge */
    if (totalMakingCharge > 0) {
      html += `<tr>
                  <td colspan="8" style="font-size: 12px; font-weight: 700; color: #555; padding: 4px;">Making Charge</td>
                  <td colspan="2" style="font-size: 12px; font-weight: 700; color: #555; padding: 4px; text-align: right; white-space: nowrap;">${totalMakingCharge.toFixed(2)}</td>
                  <td colspan="2"></td>
              </tr>`;
    }

    /* Taxable Amount total */
    html += `<tr style="border: none;">
                <td colspan="9" style="font-size: 13px; font-weight: 700; color: #1E2746; padding: 4px 4px 2px; border-top: 2px solid #90caf9; border-bottom: none;">Taxable Amt.</td>
                <td colspan="3" style="font-size: 13px; font-weight: 700; color: #1E2746; text-align: right; padding: 4px 4px 2px; border-top: 2px solid #90caf9; border-bottom: none;">${totalTaxableAmt.toFixed(2)}</td>
            </tr>`;

    let receive_metal = 0;
    let metalExists = true;
    payments.map((itm) => {
      if (itm.payment_mode.toLowerCase() == "metal" && itm.weight != null) {
        metalExists = true;
        receive_metal += parseFloat(itm.weight);
      }
    });
    compactLog("fine_metals before : ", fine_metals);
    /* convert gold to 24k from 18k */
    if (purity18K && purity18K.value != null) {
      fine_metals =
        (parseFloat(fine_metals) * parseFloat(purity18K.value)) / 100;
    }

    let rest_metal = fine_metals - receive_metal;

    let totalReportCharge = 0;
    let taxOnReportCharge = 0;
    if (purchaseData.sale) {
      totalReportCharge =
        parseInt(purchaseData.sale.report_qty) *
        parseFloat(purchaseData.sale.report_charge);
      taxOnReportCharge =
        (totalReportCharge *
          parseFloat(purchaseData.sale.report_tax_percentage)) /
        100;
    }

    if (purchaseData.sale && purchaseData.sale.report_qty > 0) {
      html += `<tr style="border: none;">
                  <td colspan="2" style="font-size: 13px; font-weight: 700; color: #1E2746; padding: 2px 4px; border: none;">Report Charges (${parseFloat(purchaseData.sale.report_tax_percentage).toFixed(0)}%)</td>
                  <td colspan="6" style="font-size: 12px; color: #555; padding: 2px 4px; border: none;">${purchaseData.sale.report_qty} Pics x ${parseFloat(purchaseData.sale.report_charge).toFixed(2)} =</td>
                  <td colspan="4" style="font-size: 13px; font-weight: 700; color: #1E2746; text-align: right; padding: 2px 4px; border: none;">${totalReportCharge.toFixed(2)}</td>
              </tr>`;
    }

    if (metalExists) {
      metalHtml = `<table cellspacing="0" cellpadding="0" width="100%" style="border-collapse: collapse;">`;
      [
        ["Fine Metals :", fine_metals],
        ["Receive Fine Metal :", receive_metal],
        ["Rest :", rest_metal],
      ].forEach(([label, val]) => {
        metalHtml += `<tr>
                  <td style="background-color: #0A8AB8; border-bottom: 1px solid #fff; font-size: 11px; font-weight: 400; color: #ffffff; padding: 5px 8px; width: 30%;">${label}</td>
                  <td style="background-color: #C1BDBD; border-bottom: 1px solid #fff; font-size: 12px; font-weight: 400; padding: 5px 8px;">${val.toFixed(2)} GM</td>
              </tr>`;
      });
      metalHtml += `</table>`;
    }

    html += ` </tbody>
                          </table>`;
  }
  html += `
                        </td>
                    </tr>
                </tbody>
              </table>
          </div>
          <div style="position: fixed; bottom: 0; left: 0; right: 0; background-color: #f9f9f9; padding: 6px 15px 4px 15px; border-top: 2px solid #1E2746;">
            <div style="display: flex; width: 100%; gap: 0;">
              <div style="flex: 0 0 68%; width: 68%; padding-right: 12px; box-sizing: border-box;">
                ${metalHtml}
                <div style="display: block; width: 100%; margin-top: 6px;">`;
  if (payments.length) {
    html += `<table cellspacing="0" cellpadding="3" rules="rows" align="left" width="100%">
                <tr style="background-color: #1E2757; color: #fff;">
                    <th style="font-weight: 400; font-size: 12px; text-align: left;">SL</th>
                    <th style="font-weight: 400; font-size: 12px; text-align: left;">PayDate</th>
                    <th style="font-weight: 400; font-size: 12px; text-align: left;">Mode</th>
                    <th style="font-weight: 400; font-size: 12px; text-align: left;">Note</th>
                    <th style="font-weight: 400; font-size: 12px; text-align: left;">Amount</th>
                </tr>`;
    for (let i = 0; i < payments.length; i++) {
      html += `<tr>
                    <td style="font-size: 12px;">${i + 1}</td>
                    <td style="font-size: 12px;">${payments[i].payment_date}</td>
                    <td style="font-size: 12px;">${payments[i].payment_mode}</td>
                    <td style="font-size: 12px;">${payments[i].notes}</td>
                    <td style="font-size: 12px;">${payments[i].payment_mode.toLowerCase() == "metal" && payments[i].weight != null ? payments[i].weight : payments[i].amount}</td>
                </tr>`;
    }
    html += `</table>`;
  }
  html += `</div>
                                <table cellspacing="0" cellpadding="0" width="100%" style="border-collapse: collapse; table-layout: fixed; margin-top: 8px;">
                                  <tr>
                                    <td style="width: 22%; font-size: 12px; font-weight: 400; padding: 3px 6px 3px 0; white-space: nowrap;">Due Date :</td>
                                    <td style="width: 28%; padding: 3px 20px 3px 0;"><input type="text" value="${purchaseData.due_date}" style="display: block; width: 100%; box-sizing: border-box; font-size: 12px; padding: 2px 4px;"></td>
                                    <td style="width: 50%;"></td>
                                  </tr>
                                </table>
                                ${purchaseData.notes && purchaseData.notes.trim() ? `<div style="font-size: 11px;"><span style="font-weight: 600;">Notes: </span><span style="font-weight: 400;">${purchaseData.notes}</span></div>` : ""}
              </div>
              <div style="flex: 0 0 32%; width: 32%; vertical-align: top;">
                <table cellspacing="0" cellpadding="0" align="right" width="100%" style="border-collapse: collapse; table-layout: fixed;">`;
  const amtRow = (label, value, bold = false) =>
    `<tr>
      <td style="width: 54%; font-size: 12px; font-weight: ${bold ? "600" : "400"}; text-align: right; padding: 3px 6px 3px 0; white-space: nowrap;">${label}</td>
      <td style="width: 46%; padding: 3px 0;"><input type="text" value="${value}" style="display: block; width: 100%; box-sizing: border-box; font-size: 12px; font-weight: ${bold ? "600" : "400"}; text-align: right; padding: 2px 4px;"></td>
    </tr>`;
  html += amtRow("Total", purchaseData.taxable_amount, true);
  if (purchaseData.is_same_state_trnx && purchaseData.cgst_tax) {
    html += amtRow("CGST Amt", purchaseData.cgst_tax);
  }
  if (purchaseData.is_same_state_trnx && purchaseData.sgst_tax) {
    html += amtRow("SGST Amt", purchaseData.sgst_tax);
  }
  if (!purchaseData.is_same_state_trnx && purchaseData.igst_tax) {
    html += amtRow("IGST Amt", purchaseData.igst_tax);
  }
  html += amtRow("Sub Total", purchaseData.total_amount);
  html += amtRow("Cash Dist", purchaseData.discount);
  html += amtRow("Total Payable", purchaseData.bill_amount, true);
  html += amtRow("Paid Amount", purchaseData.paid_amount_display);
  if (purchaseData.return_amount) {
    html += amtRow(
      "Return Amount",
      purchaseData.return_amount ? purchaseData.return_amount : "0.00",
    );
  }
  html += amtRow("Rest Due Amt", purchaseData.due_amount_display);
  html += `</table>
              </div>
            </div>
          </div>
      </body>
  </html>
  `;
  /*let footerhtml_old = `<!DOCTYPE html>
  <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Bill</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          
          <style>
          html {
            -webkit-print-color-adjust: exact;
          }
          tbody tr { page-break-inside: avoid; }
          thead { display: table-header-group; }
          .table-footer-area { page-break-inside: avoid; }
          </style>
      </head>
      <body style="box-sizing: border-box; padding: 0px; margin: 0px; font-family:
          'Poppins', sans-serif;"><div class="invoice" style="max-width: 800px; margin:auto; padding:
              5px;
              background-color: #f9f9f9; border-top: 2px solid #000;">
              <table cellpadding="0" cellspacing="1" width="550px" style="margin:auto;" >
                  <tbody>
                      <tr>
                          <td><table cellspacing="0" cellpadding="0"
                                              border="0"
                                              align="center" width="90%">
                                              <div style="display: table; width:
                                                  100%; font-size: 8px;">
                                                  <div style="display: table-cell; width: 65%; vertical-align: top;"></div>
                                                  <div style="display: table-cell;
                                                      width: 35%;">
                                                      <div style="display: flex;
                                                          gap: 10px;
                                                          justify-content:
                                                          space-between;">
                                                          <!---<div>
                                                              <h4 style="margin:
                                                                  0px;
                                                                  text-align:
                                                                  center;
                                                                  font-size:
                                                                  12px;">Customer
                                                                  Signature</h4>
                                                              <input type="text"
                                                                  style="display:
                                                                  block;
                                                                  margin: auto;
                                                                  height:
                                                                  36px; min-width:
                                                                  142px; ">
  
                                                          </div> -->
                                                         <!-- <div style="display:flex ; align-items: center;">
                                                              <h4 style="margin-right:
                                                                  5px;
                                                                  text-align:
                                                                  center;
                                                                  font-size:
                                                                  8px;">Returning%
                                                              </h4>
                                                              <div
                                                                  style="position:
                                                                  relative;">
                                                                  <input
                                                                      type="text"
                                                                      style="display:
                                                                      block;
                                                                      margin:
                                                                      auto;
                                                                      height:
                                                                      16px;
                                                                      min-width:
                                                                      24px; width:64px; ">
                                                                  <div
                                                                      style="position:
                                                                      absolute;
                                                                      right:
                                                                      12px; top:
                                                                      4px;
                                                                      font-size:
                                                                      10px;">%</div>
                                                              </div>
                                                          </div>
  
                                                      </div> -->
                                                  </div>
                                              </div>
                                          </table></td>
                                  </tr>
                              </tbody>
                          </table>
                      </div></body>
                      </html>`;*/

  /*var options = {
    format: "A4",
    orientation: "portrait",
    border: "1mm",
    header: {
        height: "0mm",
        contents: ''
    },
    footer: {
        height: "10mm",
        contents: {
            first: '',
            2: '', // Any page number is working. 1-based index
            default: '<span style="color: #444;">{{page}}</span>/<span>{{pages}}</span>', // fallback value
            last: ''
        }
    }
  };

  let file_path = "public/invoices/"+purchaseData.invoice_number+".pdf";

  var document = {
    html: html,
    data: {

    },
    path: './'+file_path,
    type: "",
  };
  pdf.create(document, options)
  .then((resp) => {
    res.send(formatResponse({
      file_name: purchaseData.invoice_number+".pdf",
      url: getFileAbsulatePath(file_path),
      image_url: logoUrl
    }, "Invoice pdf"));
  })
  .catch((error) => {
    addLog("pdf error: " + error.toString());
    console.error(error);
  });*/

  /* -------------- commented by Soumalya Nandy ------------ */
  /*var browser;

  try {
    let file_path = "public/invoices/" + purchaseData.invoice_number + ".pdf";
    //! browser instance for the linux
    // Create a browser instance
    if (env != "production") {
      browser = await puppeteer.launch({
        executablePath: "/usr/bin/chromium-browser",
        args: ["--no-sandbox"],
      });
    } else {
      browser = await puppeteer.launch({
        ignoreDefaultArgs: ["--disable-extensions"],
      });
    }

    //this is test commit
    // Create a new page
    const page = await browser.newPage();

    //Get HTML content from HTML file
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    // To reflect CSS used for screens instead of print
    await page.emulateMediaType("screen");

    // Downlaod the PDF
    const pdf = await page.pdf({
      path: file_path,
      //margin: { top: '0px', right: '0px', bottom: '300px', left: '0px' },
      //printBackground: true,
      format: "A4",
      displayHeaderFooter: true,
      footerTemplate: footerhtml,
      margin: {
        top: "0px",
        right: "0px",
        bottom: "100px",
        left: "0px",
      },
    });

    // Close the browser instance
    await browser.close();*/
  /* -------------- commented by Soumalya Nandy ------------ */

  try {
    let file_path =
      "public/invoices/" + purchaseData.invoice_number + "_tax.pdf";
    const options = { format: "A4" };

    (async () => {
      const file = { content: html };

      // Generate PDF
      const pdfBuffer = await html_to_pdf.generatePdf(file, options);

      // Save PDF to file
      fs.writeFileSync(file_path, pdfBuffer);
      compactLog("PDF generated successfully!");

      res.send(
        formatResponse(
          {
            file_name: purchaseData.invoice_number + "_tax.pdf",
            url: getFileAbsulatePathPDF(file_path),
            purchase,
            purchaseData,
            payments,
          },
          "Invoice pdf",
        ),
      );
    })();
  } catch (error) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse(error.toString()));
  }
};

exports.downloadInvoiceItems = async (req, res) => {
  const company = await getCompanyDetails(req.userId);
  let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
  let purchase = await PurchaseModel.findOne({
    where: { id: req.params.id /*, user_id: userID*/ },
    /* include: [
      {
        model: PurchaseProductModel,
        as: "purchaseProducts",
        separate: true,
        include: [
          {
            model: ProductModel,
            as: "product",
            include: [
              {
                model: CategoryModel,
                as: "category",
              }
            ],
          },
          {
            model: SizeModel,
            as: "size",
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
        ],
      },
      {
        model: UserModel,
        as: "supplier",
      },
    ], */
    include: [
      {
        model: PurchaseProductModel,
        as: "purchaseProducts",
        separate: true,
        include: [
          {
            model: ProductModel,
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
              {
                model: taxSlabModel,
                as: "tax",
              },
            ],
          },
          {
            model: SizeModel,
            as: "size",
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
        ],
      },
      {
        model: UserModel,
        as: "supplier",
      },
      {
        model: UserModel,
        as: "purchaseBy",
      },
    ],
  });
  if (!purchase) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Purchase not found"));
  }

  let purchaseData = PurchaseViewCollection(purchase);

  let payments = await PaymentModel.findAll({
    where: {
      table_type: "purchase",
      table_id: req.params.id,
    },
    include: [
      {
        model: UserModel,
        as: "user",
      },
    ],
  });
  payments = await PaymentCollection(payments);
  let logo;
  if (company.logo) {
    const _logoRes = await require("axios").get(`${process.env.BASE_URL}${company.logo}`, { responseType: "arraybuffer" });
    logo = Buffer.from(_logoRes.data).toString("base64");
  } else {
    logo = fs.readFileSync(`public/images/logo.png`).toString("base64");
  }

  let footerhtml = `
          
              <div class="invoice" style="width: 96%; margin: 0px; background-color: #f9f9f9; border-top: 2px solid #000;">
                  <table cellpadding="0" cellspacing="1" style="margin:auto;; width:100%" >
                      <tbody>
                          <tr>
                              <td><table cellspacing="0" cellpadding="0"
                                    border="0"
                                    align="center" width="90%">
                                    <div style="display: table; width:
                                        100%; font-size: 11px;">
                                        <div style="display: table-cell; width: 65%; vertical-align: top;"></div>
                                        <div style="display: table-cell;
                                            width: 35%;">
                                            <div style="display: flex;
                                                gap: 10px;
                                                justify-content:
                                                space-between;">
                                                <div>
                                                    <h4 style="margin:
                                                        0px;
                                                        text-align:
                                                        center;
                                                        font-size:
                                                        11px;">Customer
                                                        Signature</h4>
                                                    <input type="text"
                                                        style="display:
                                                        block;
                                                        margin: auto;
                                                        height:
                                                        36px; min-width:
                                                        142px; ">

                                                </div>
                                                <div >
                                                    <h4 style="
                                                    margin: 0px 5px 0px 0px;
                                                        text-align:
                                                        center;
                                                        font-size:
                                                        11px;">Returning%
                                                    </h4>
                                                    <div
                                                        style="position:
                                                        relative;">
                                                        <input
                                                          type="text"
                                                          style="display:
                                                          block;
                                                          margin: auto;
                                                          height:
                                                          36px; min-width:
                                                          142px; ">
                                                        <div
                                                            style="position:
                                                            absolute;
                                                            right:
                                                            12px; top:
                                                            10px;
                                                            font-size:
                                                            11px;">%</div>
                                                    </div>
                                                </div>

                                            </div>
                                        </div>
                                    </div>
                                </table></td>
                        </tr>
                    </tbody>
                </table>
            </div>
          `;

  let totalSave = 0.0;
  let totalTagPrice = 0.0;
  for (let i = 0; i < purchaseData.products.length; i++) {
    totalSave += purchaseData.products[i].total_discount;
    totalTagPrice += purchaseData.products[i].subtotal_price;
  }

  let totalSaveDisplay = displayAmount(totalSave);
  let totalTagPriceDisplay = displayAmount(totalTagPrice);

  let html = `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Bill</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <style>
        html {
          -webkit-print-color-adjust: exact;
        }
        tbody tr { page-break-inside: avoid; }
        thead { display: table-header-group; }
        .table-footer-area { page-break-inside: avoid; }
        </style>
    </head>
    <body style="box-sizing: border-box; padding: 0px; margin: 0px; font-family:
        'Poppins', sans-serif;">
        <div class="invoice" style="max-width: 1000px; margin: auto; padding:
            15px;
            background-color: #f9f9f9;">
            <table cellpadding="0" cellspacing="0" width="100%">
                <tbody>
                    <tr>
                        <td>
                            <table cellspacing="0" cellpadding="0" border="0"
                                align="center" width="100%">
                                <h1 style="font-size: 14px; text-align:
                                    center; margin-bottom: 5px; font-weight:
                                    300;">PURCHASE TAX INVOICE</h1>
                            </table>
                            <table cellspacing="0" cellpadding="0" border="0"
                                align="center" width="100%">
                                <div style="display: table; width: 100%;">
                                    <div style="width: 65%; display: table-cell;
                                        vertical-align: bottom;">
                                        <img src="data:image/png;base64,${logo}" style="width:
                                            220px; margin-left: 10px;">
                                        <h3 style="margin: 0; font-weight: 400;
                                            font-size: 12px;">Corporate Office -
                                            ${company.corporate_office_address || ''}</h3>

                                    </div>
                                    <div style="width: 35%; display: table-cell;
                                        vertical-align: middle; text-align:
                                        left;">
                                        <h3 style="margin: 0;">
                                            <span style="font-size: 16px;
                                                font-weight: 600;">${company.head_office_name || ''}</span></h3>
                                        <h3 style="margin: 0; font-weight: 400;
                                            font-size: 14px;">GST No -
                                            <span style="font-weight: 600;">${company.gst_no || ''}</span></h3>
                                        <h3 style="margin: 0; font-weight: 400;
                                            font-size: 12px;">User Id - <span>${purchaseData.purchase_by_name}</span></h3>
                                        <h3 style="margin: 0; font-weight: 400;
                                            font-size: 12px;">Address - ${company.address || ''}</h3>
                                        <h3 style="font-weight: 600; font-size:
                                            12px; margin: 0;">
                                            ${company.email || ''}, ${company.phone || ''}
                                        </h3>
                                    </div>
                                </div>
                            </table>
                            <table cellspacing="0" cellpadding="5" border="0"
                                align="center" width="100%">
                                <tbody>
                                    <tr>
                                        <hr style="border: 1px solid #1E2757">
                                    </tr>
                                </tbody>
                            </table>
                            <table cellspacing="0" cellpadding="5" border="0"
                                align="center" width="100%">
                                <thead>
                                    <!-- <tr style="background-color: #000;">
                                        <th style="text-align: left; color:
                                            #fff;">Company: Ratn Alankar
                                            Jewellers</th>
                                        <th style="text-align: left; color:
                                            #fff;">Name: Mukund Singhaindi</th>
                                        <th style="text-align: left; color:
                                            #fff;">Cont: 91919191919</th>
                                        <th style="text-align: left; color:
                                            #fff;">City: Muzaffarpur</th>
                                    </tr>
                                </thead> -->
                                    <tbody>
                                        <!-- <tr style="background-color: #fff;">
                                        <td style="">
                                            <span style="font-weight: 600;"> GST
                                                IN ${purchaseData.supplier_details.gst} </span>
                                        </td>
                                        <td style="">
                                            Ad:
                                        </td>
                                        <td style="">

                                        </td>
                                        <td style="">
                                            Pin Code: 800 020
                                        </td>
                                    </tr> -->
                                        <tr>
                                            <td style="padding: 0;">
                                                <div class="comp-part-one">
                                                    <ul style="margin: 0;
                                                        padding: 0; list-style:
                                                        none; display: flex;
                                                        gap: 15px;
                                                        justify-content:
                                                        space-between;">
                                                        <li><span
                                                                style="font-weight:
                                                                400; font-size:
                                                                12px; margin:
                                                                0;">Company -</span>
                                                            <span
                                                                style="font-weight:
                                                                600; font-size:
                                                                12px; margin:
                                                                0;">${purchaseData.supplier_details.company_name}</span></li>
                                                        <li><span
                                                                style="font-weight:
                                                                400; font-size:
                                                                12px; margin:
                                                                0;">GST IN</span>
                                                            <span
                                                                style="font-weight:
                                                                600; font-size:
                                                                12px; margin:
                                                                0;">${purchaseData.supplier_details.gst}</span></li>
                                                        <li><span
                                                                style="font-weight:
                                                                400; font-size:
                                                                12px; margin:
                                                                0;">Cont -
                                                            </span>
                                                            <span
                                                                style="font-weight:
                                                                600; font-size:
                                                                12px; margin:
                                                                0;">${purchaseData.supplier_mobile}</span>
                                                        <li><span
                                                                style="font-weight:
                                                                400; font-size:
                                                                12px; margin:
                                                                0;">Invoice Date
                                                                -
                                                            </span> <span
                                                                style="font-weight:
                                                                600; font-size:
                                                                12px; margin:
                                                                0;">${purchaseData.invoice_date}</span></li>
                                                                
                                                    </ul>
                                                </div>
                                                <div class="comp-part-two">
                                                    <ul style="margin: 0;
                                                        padding: 0; list-style:
                                                        none; display: flex;
                                                        gap: 15px;
                                                        justify-content:
                                                        space-between;">
                                                        <li><span
                                                                style="font-weight:
                                                                400; font-size:
                                                                12px; margin:
                                                                0;">Address -</span>
                                                            <span
                                                                style="font-weight:
                                                                500; font-size:
                                                                12px; margin:
                                                                0;">${purchaseData.supplier_details.address}</span></li>
                                                       
                                                        <li><span
                                                                style="font-weight:
                                                                400; font-size:
                                                                12px; margin:
                                                                0;">Invoice No -
                                                            </span> <span
                                                                style="font-weight:
                                                                600; font-size:
                                                                12px; margin:
                                                                0;">${purchaseData.invoice_number}</span></li>
                                                    </ul>
<ul style="margin: 0;
                                                        padding: 0;margin-left:52px; list-style:
                                                        none; display: flex;
                                                        gap: 15px;
                                                       ">
                                                     <li><span
                                                                style="font-weight:
                                                                400; font-size:
                                                                12px; margin:
                                                                0;">City -</span>
                                                            <span
                                                                style="font-weight:
                                                                500; font-size:
                                                                12px; margin:
                                                                0;">${purchaseData.supplier_details.city}</span></li>
                                                        <li><span
                                                                style="font-weight:
                                                                400; font-size:
                                                                12px; margin:
                                                                0;">Pin -
                                                            </span>
                                                            <span
                                                                style="font-weight:
                                                                500; font-size:
                                                                12px; margin:
                                                                0;">${purchaseData.supplier_details.pincode}</span></li>
                                                                </ul>
                                                </div>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>`;
  if (purchaseData.subCatItems.length == 0) {
    html += `<table cellspacing="0" cellpadding="5"  style="margin-top:10px"
                          border="0"
                          align="center" width="100%">
                          <thead style="background-color: #1E2757;">
                              <tr style="background-color: #1E2757;">
                                  <th style="text-align: left; color:
                                      #fff; border: 1px solid #1E2757;
                                      font-size: 12px; font-weight:
                                      400;background-color: #1E2757;">#</th>
                                  <th style="text-align: left; color:
                                      #fff; font-size: 12px;
                                      font-weight: 400; width:
                                      250px;">Product Name</th>
                                  <th style="text-align: left; color:
                                      #fff; font-size: 12px;
                                      font-weight: 400; width: 50px;">Size</th>
                                  <th style="text-align: left; color:
                                      #fff; font-size: 12px;
                                      font-weight: 400; width: 150px;">Product Id</th>
                                  <th style="text-align: left; color:
                                      #fff; font-size: 12px;
                                      font-weight: 400;">Mtrl</th>
                                  <th style="text-align: left; color:
                                      #fff; font-size: 12px;
                                      font-weight: 400; width: 70px">Making Etc</th>
                                  <th style="text-align: left; color:
                                      #fff; font-size: 12px;
                                      font-weight: 400;">Tag Price</th>
                                  <th style="text-align: left; color:
                                      #fff; font-size: 12px;
                                      font-weight: 400;">Dist Amt</th>
                                  <th style="text-align: left; color:
                                      #fff; font-size: 12px;
                                      font-weight: 400;">Sub-Tot</th>
                                  <th style="text-align: left; color:
                                      #fff; font-size: 12px;
                                      font-weight: 400;">Tax%</th>
                                  <th style="text-align: left; color:
                                      #fff; font-size: 12px;
                                      font-weight: 400;">Total</th>
                              </tr>
                          </thead>
                          <tbody>`;
    for (let i = 0; i < purchaseData.products.length; i++) {
      let bgTrColor = i % 2 == 0 ? "#C1BDBD" : "#C4BEED";
      html += `<tr style="background-color: ${bgTrColor}">
                                  <td style="text-align: left;
                                      font-size: 11px;
                                      font-weight: 400;">
                                      ${i + 1}
                                  </td>
                                  <td style="text-align: left;
                                      font-size: 11px;
                                      font-weight: 400;font-size: 10px;">
                                      ${
                                        purchaseData.products[i].product_name
                                      } - ${purchaseData.products[i].product_code}
                                  </td>
                                  <td style="text-align: left;
                                      font-size: 11px;
                                      font-weight: 400;">
                                      ${purchaseData.products[i].size_name}
                                  </td>
                                  <td colspan="8" style="text-align:
                                      left; font-size: 11px;
                                      font-weight: 400;">
                                      ${purchaseData.products[i].certificate_no}
                                  </td>

                              </tr>
                              <tr style="background-color: #fff;
                                  vertical-align: top;">
                                  <td colspan="3"
                                      style="border-bottom: 1px solid
                                      #1E2757; width: 300px; text-align: left;">
                                      <div style="max-width: 300px; text-align: left;">`;
      for (let x = 0; x < purchaseData.products[i].materials.length; x++) {
        purchaseData.products[i].materials[x].amount == "₹0.00"
          ? null
          : (html += `<div style="display: flex;
                                              flex-wrap: wrap;
                                              justify-content: center;
                                              margin: 0 -5px; text-align: left;">
                                              <div style="flex-basis:
                                                  calc(69% - 10px);
                                                  margin: 0 5px
                                                  0px; line-height:
                                                  1;text-align: left;">
                                                  <span
                                                      style="text-align:
                                                      left;font-size:
                                                      10px;
                                                      font-weight:
                                                      400;text-align: left;">${purchaseData.products[i].materials[x].material_name} ${purchaseData.products[i].materials[x].pakka_weight} ${purchaseData.products[i].materials[x].unit_name}x${purchaseData.products[i].materials[x].rate}
                                                  </span>

                                              </div>

                                              <div
                                                  style="flex-basis:
                                                  calc(31% -
                                                  10px);
                                                  margin: 0 5px
                                                  0px; line-height:
                                                  1;">
                                                  <span
                                                      style="text-align:
                                                      left; font-size:
                                                      10px;
                                                      font-weight:
                                                      400;"> = ${purchaseData.products[i].materials[x].amount}</span>
                                              </div>

                                          </div>`);
      }

      html += `</div>


                                          </td>
                                          <td style="border-bottom:
                                              1px solid #1E2757;">`;
      for (let x = 0; x < purchaseData.products[i].materials.length; x++) {
        html += `<div>`;
        if (isEmpty(purchaseData.products[i].materials[x].discount_amount)) {
          purchaseData.products[i].materials[x].amount == "₹0.00"
            ? null
            : (html += `-`);
        } else {
          html += `<span
                                                      style="text-align:
                                                      left; font-size:
                                                      10px;
                                                      font-weight:
                                                      400;">@${removeBlankZero(
                                                        purchaseData.products[i]
                                                          .materials[x]
                                                          .discount_percent,
                                                      )}% ${
                                                        purchaseData.products[i]
                                                          .materials[x]
                                                          .discount_amount_display
                                                      }</span> 
                                                                  <!--<span
                                                      style="text-align:
                                                      left; font-size:
                                                      10px;
                                                      font-weight:
                                                      400;">${
                                                        purchaseData.products[i]
                                                          .materials[x]
                                                          .discount_amount_display
                                                      }</span>-->`;
        }
        html += `</div>`;
      }
      html += `</td>
                                          <td style="text-align: left;
                                              font-size: 10px;
                                              font-weight: 400;
                                              border-bottom: 1px solid
                                              #1E2757;">`;
      for (let x = 0; x < purchaseData.products[i].materials.length; x++) {
        purchaseData.products[i].materials[x].amount == "₹0.00"
          ? null
          : (html += `<div>${purchaseData.products[i].materials[x].material_cost}</div>`);
      }
      html += `</td>
                                          <td style="text-align: left;
                                              font-size: 10px;
                                              font-weight: 400;
                                              border-bottom: 1px solid
                                              #1E2757;">
                                              ${purchaseData.products[i].making_charge}@${purchaseData.products[i].making_charge_discount ? purchaseData.products[i].making_charge_discount : ""}% = ${purchaseData.products[i].total_making_charge_discount ? purchaseData.products[i].total_making_charge_discount : ""}
                                          </td>

                                          <td style="text-align:
                                              left;font-size: 10px;
                                              font-weight: 600;
                                              border-bottom: 1px solid
                                              #1E2757;">
                                              ${purchaseData.products[i].sub_price}
                                          </td>
                                          <td style="text-align:
                                              left;font-size: 10px;
                                              font-weight: 600;
                                              border-bottom: 1px solid
                                              #1E2757;">
                                              ${purchaseData.products[i].total_discount_display}
                                          </td>
                                          <td style="text-align:
                                              left;font-size: 10px;
                                              font-weight: 400;
                                              border-bottom: 1px solid
                                              #1E2757;">
                                              ${purchaseData.products[i].sub_total}
                                          </td>
                                          <td style="text-align:
                                              left;font-size: 10px;
                                              font-weight: 400;
                                              border-bottom: 1px solid
                                              #1E2757;">
                                              ${purchaseData.products[i].tax}
                                          </td>
                                          <td style="text-align:
                                              left;font-size: 10px;
                                              font-weight: 600;
                                              border-bottom: 1px solid
                                              #1E2757;">
                                              ${purchaseData.products[i].total_display}
                                          </td>

                                      </tr>`;
    }
    html += `<tr style="
                                          vertical-align: top;">
                                          <td colspan="6"
                                              style="
                                              border:none;">

                                          </td>
                                          <!-- <td style="">
                                              <div>
                                                  <h4 style="margin:
                                                      0;
                                                      text-align:
                                                      left; font-size:
                                                      12px;
                                                      font-weight:
                                                      600; display:
                                                      ;">
                                                      Total
                                                      Save <div>139000</div></h4>
                                              </div>
                                          </td> -->
                                          
                                          
                                          

                                      </tr>

                                      <!-- <tr style="
                                          vertical-align: top;">
                                          <td colspan="8"
                                              style="
                                              border:none; padding: 0;">
                                          </td>
                                        
                                          
                                          
                                          <td colspan="3" style="margin: 0;
                                              text-align: left;
                                              font-size: 12px;
                                              font-weight: 600; padding: 4px;">
                                              <div>
                                                  <h4 style="margin:
                                                      0;
                                                      text-align:
                                                      right; font-size:
                                                      12px;
                                                      font-weight:
                                                      600;">
                                                      Total <span style=""> <input type="text" value="139000" style="max-width: 80px;"></span></h4>
                                              </div>
                                          </td>

                                      </tr>
                                      <tr style="
                                          vertical-align: top;">
                                          <td colspan="8"
                                              style="
                                              border:none; padding: 0;">

                                          </td> 
                                          <td colspan="3" style="margin: 0;
                                              text-align: left;
                                              font-size: 12px;
                                              font-weight: 600; padding: 4px;">
                                              <div>
                                                  <h4 style="margin:
                                                      0;
                                                      text-align:
                                                      right; font-size:
                                                      12px;
                                                      font-weight:
                                                      600;">
                                                      Total <span style=""> <input type="text" value="139000" style="max-width: 80px;"></span></h4>
                                              </div>
                                          </td>

                                      </tr> -->
                                  </tbody>
                              </table>`;
  } else {
    html += `<table cellspacing="0" cellpadding="5"  style="margin-top:10px"
                                    border="0"
                                    align="center" width="100%">
                                    <thead style="background-color: #1E2757;">
                                        <tr style="background-color: #1E2757;">
                                            <th style="text-align: left; color:
                                                #fff; border: 1px solid #1E2757;
                                                font-size: 12px; font-weight:
                                                400;background-color: #1E2757; width:50px;">SL</th>
                                            <th style="text-align: left; color:
                                                #fff; font-size: 12px;
                                                font-weight: 400; width:150px;">Product Name</th>
                                            <th style="text-align: left; color:
                                                #fff; font-size: 12px;
                                                font-weight: 400; width: 50px;">QTY</th>
                                            <th style="text-align: left; color:
                                                #fff; font-size: 12px;
                                                font-weight: 400; width: 50px;">HSN</th>
                                            <th style="text-align: left; color:
                                                #fff; font-size: 12px;
                                                font-weight: 400; width:150px;">Material</th>
                                            <th style="text-align: left; color:
                                                #fff; font-size: 12px;
                                                font-weight: 400; width: 50px">WT</th>
                                            <th style="text-align: left; color:
                                                #fff; font-size: 12px;
                                                font-weight: 400; width:50px;">Unit</th>
                                            <th style="text-align: left; color:
                                                #fff; font-size: 12px;
                                                font-weight: 400; width:50px;">Rate</th>
                                            <th style="text-align: left; color:
                                                #fff; font-size: 12px;
                                                font-weight: 400; width:50px;">Tax@</th>
                                            <th style="text-align: left; color:
                                                #fff; font-size: 12px;
                                                font-weight: 400; width:50px;">Taxable Amt.</th>
                                        </tr>
                                    </thead>
                                    <tbody>`;
    for (let i = 0; i < purchaseData.subCatItems.length; i++) {
      let materialNames = purchaseData.subCatItems[i].material
        .map((itm) => itm.name)
        .join("<br/ >");
      let materialWts = purchaseData.subCatItems[i].material
        .map((itm) => itm.weight.toFixed(2))
        .join("<br/ >");
      let materialUnits = purchaseData.subCatItems[i].material
        .map((itm) => itm.unit)
        .join("<br/ >");
      let materialRates = purchaseData.subCatItems[i].material
        .map((itm) => itm.rate.toFixed(2))
        .join("<br/ >");
      let bgTrColor = i % 2 == 0 ? "#C1BDBD" : "#C4BEED";

      html += `<tr style="background-color: ${bgTrColor}">
                                            <td style="text-align: left;
                                                font-size: 14px;
                                                font-weight: 400;">
                                                ${i + 1}
                                            </td>
                                            <td style="text-align: left;
                                                font-size: 14px;
                                                font-weight: 400;">
                                                ${
                                                  purchaseData.subCatItems[i]
                                                    .name
                                                }
                                            </td>
                                            <td style="text-align: left;
                                                font-size: 14px;
                                                font-weight: 400;">
                                                ${
                                                  purchaseData.subCatItems[i]
                                                    .qty
                                                }
                                            </td>
                                            <td style="text-align:
                                                left; font-size: 14px;
                                                font-weight: 400;">
                                                ${
                                                  purchaseData.subCatItems[i]
                                                    .hsn
                                                    ? purchaseData.subCatItems[
                                                        i
                                                      ].hsn
                                                    : ""
                                                }
                                            </td>
                                            <td style="text-align:
                                                left; font-size: 14px;
                                                font-weight: 400;">
                                                ${materialNames}
                                            </td>
                                            <td style="text-align:
                                                left; font-size: 14px;
                                                font-weight: 400;">
                                                ${materialWts}
                                            </td>
                                            <td style="text-align:
                                                left; font-size: 14px;
                                                font-weight: 400;">
                                                ${materialUnits}
                                            </td>
                                            <td style="text-align:
                                                left; font-size: 14px;
                                                font-weight: 400;">
                                                ${materialRates}
                                            </td>
                                            <td style="text-align:
                                                left; font-size: 14px;
                                                font-weight: 400;">
                                                ${
                                                  purchaseData.subCatItems[i]
                                                    .tax
                                                }
                                            </td>
                                            <td style="text-align:
                                                left; font-size: 14px;
                                                font-weight: 400;">
                                                ${purchaseData.subCatItems[
                                                  i
                                                ].taxableAmount.toFixed(2)}
                                            </td>

                                        </tr>`;
    }
    html += `<tr style="
                                                    vertical-align: top;">
                                                    <td colspan="6"
                                                        style="
                                                        border:none;">

                                                    </td>
                                                    <!-- <td style="">
                                                        <div>
                                                            <h4 style="margin:
                                                                0;
                                                                text-align:
                                                                left; font-size:
                                                                12px;
                                                                font-weight:
                                                                600; display:
                                                                ;">
                                                                Total
                                                                Save <div>139000</div></h4>
                                                        </div>
                                                    </td> -->
                                                    
                                                    
                                                    

                                                </tr>

                                                <!-- <tr style="
                                                    vertical-align: top;">
                                                    <td colspan="8"
                                                        style="
                                                        border:none; padding: 0;">
                                                    </td>
                                                 
                                                   
                                                    
                                                    <td colspan="3" style="margin: 0;
                                                        text-align: left;
                                                        font-size: 12px;
                                                        font-weight: 600; padding: 4px;">
                                                        <div>
                                                            <h4 style="margin:
                                                                0;
                                                                text-align:
                                                                right; font-size:
                                                                12px;
                                                                font-weight:
                                                                600;">
                                                                Total <span style=""> <input type="text" value="139000" style="max-width: 80px;"></span></h4>
                                                        </div>
                                                    </td>

                                                </tr>
                                                <tr style="
                                                    vertical-align: top;">
                                                    <td colspan="8"
                                                        style="
                                                        border:none; padding: 0;">

                                                    </td> 
                                                    <td colspan="3" style="margin: 0;
                                                        text-align: left;
                                                        font-size: 12px;
                                                        font-weight: 600; padding: 4px;">
                                                        <div>
                                                            <h4 style="margin:
                                                                0;
                                                                text-align:
                                                                right; font-size:
                                                                12px;
                                                                font-weight:
                                                                600;">
                                                                Total <span style=""> <input type="text" value="139000" style="max-width: 80px;"></span></h4>
                                                        </div>
                                                    </td>

                                                </tr> -->
                                            </tbody>
                                        </table>`;
  }
  html += `
                                        <div class="table-footer-area" style="display: table; width:
                                          100%; margin-top: 10px">
                                          <hr/>
                                        </div>
                                        <div

                                            class="table-footer-area"
                                            style="display: table; width:
                                            100%; margin-top: 10px">
                                            <div style="display:
                                                table-cell; width:
                                                74%">
                                                <div style="
                                                    display: block;
                                                    justify-content: flex-end;
                                                    gap: 10px;
                                                    width: 80%;
                                                    
                                                ">
                                                    <!--<div>
                                                        <h4 style="margin:
                                                            0;
                                                            text-align:
                                                            left; font-size:
                                                            14px;
                                                            font-weight:
                                                            600; display: flex; gap: 40px; justify-content: end;">
                                                            <div>${
                                                              purchaseData.total_tag_price
                                                            }</div>
                                                            <div>${
                                                              purchaseData.product_discount
                                                            }</div>
                                                        </h4>
                                                    </div>-->`;

  if (payments.length) {
    html += `<table cellspacing="0"
                                                        cellpadding="3"
                                                       rules="rows"
                                                        align="left"
                                                        width="80%"
                                                        style=" margin-top: 10px;margin-right:40px;">
                                                        <tr
                                                            style="background-color:
                                                            #1E2757;
                                                            color: #fff;">
                                                            <th
                                                                style="font-weight:
                                                                400; font-size: 12px; text-align: left;">SL</th>
                                                            <th
                                                                style="font-weight:
                                                                400; font-size: 12px; text-align: left;">PayDate</th>
                                                            <th
                                                                style="font-weight:
                                                                400; font-size: 12px; text-align: left;"> Mode</th>
                                                            <th
                                                                style="font-weight:
                                                                400; font-size: 12px; text-align: left;"> Payment</th>
                                                            <th
                                                                style="font-weight:
                                                                400; font-size: 12px; text-align: left;">Amount</th>
                                                            `;
    for (let i = 0; i < payments.length; i++) {
      html += `<tr
                                                            style=" ">
                                                            <td
                                                                style="border-right:
                                                                none; font-size: 12px;">${
                                                                  i + 1
                                                                }</td>
                                                            <td
                                                                style="border-right:
                                                                none; font-size: 12px;">${
                                                                  payments[i]
                                                                    .payment_date
                                                                }</td>
                                                           
                                                            <td
                                                                style="border-right:
                                                                none; font-size: 12px;">${
                                                                  payments[i]
                                                                    .payment_mode
                                                                }</td>
                                                            <td
                                                                style="border-right:
                                                                none; font-size: 12px;">${
                                                                  payments[i]
                                                                    .purpose[0]
                                                                }</td>
                                                            <td
                                                                style="border-right:
                                                                none; font-size: 12px;">${
                                                                  payments[i]
                                                                    .amount
                                                                }</td>
                                                           
                                                        </tr>`;
    }
    html += `</table>`;
  }
  html += `</div>
                                            </div>
                                            
                                            <div style="display:
                                                table-cell;
                                               
                                                width:
                                                26%">
                                                <div style="display: inline-table;
                                                    justify-content: flex-end;
                                                    ">
                                                    <div>
                                                        <h4 style="margin:
                                                            0;
                                                            text-align:
                                                            right;
                                                            font-size:
                                                            12px;
                                                            font-weight:
                                                            400; margin-bottom:
                                                            5px;margin-right:10px ;">
                                                            Total <span
                                                                style="">
                                                                <input
                                                                    type="text"
                                                                    value="${purchaseData.taxable_amount}"
                                                                    style="max-width:
                                                                    80px;font-Weight:600"></span></h4>
                                                    </div>`;
  if (purchaseData.is_same_state_trnx) {
    html += `<div>
                                                        <h4 style="margin:
                                                            0;
                                                            text-align:
                                                            right;
                                                            font-size:
                                                            12px;
                                                            font-weight:
                                                            400; margin-bottom:
                                                            5px;margin-right:10px ;">
                                                            CGST Amt <span
                                                                style="">
                                                                <input
                                                                    type="text"
                                                                    value="${purchaseData.cgst_tax}"
                                                                    style="max-width:
                                                                    80px;"></span></h4>
                                                    </div>`;
    html += `<div>
                                                        <h4 style="margin:
                                                            0;
                                                            text-align:
                                                            right;
                                                            font-size:
                                                            12px;
                                                            font-weight:
                                                            400; margin-bottom:
                                                            5px;margin-right:10px ;">
                                                            SGST Amt <span
                                                                style="">
                                                                <input
                                                                    type="text"
                                                                    value="${purchaseData.sgst_tax}"
                                                                    style="max-width:
                                                                    80px;"></span></h4>
                                                    </div>`;
  } else {
    html += `<div>
                                                        <h4 style="margin:
                                                            0;
                                                            text-align:
                                                            right;
                                                            font-size:
                                                            12px;
                                                            font-weight:
                                                            400; margin-bottom:
                                                            5px;margin-right:10px ;">
                                                            IGST Amt <span
                                                                style="">
                                                                <input
                                                                    type="text"
                                                                    value="${purchaseData.igst_tax}"
                                                                    style="max-width:
                                                                    80px;"></span></h4>
                                                    </div>`;
  }

  html += `<div>
                                                        
                                                    </div>
                                                    <div>
                                                        <h4 style="margin:
                                                            0;
                                                            text-align:
                                                            right;
                                                            font-size:
                                                            12px;
                                                            font-weight:
                                                            400; margin-bottom:
                                                            5px;margin-right:10px ;">
                                                            Sub Total <span
                                                                style=""
                                                                
                                                                >
                                                                <input
                                                                    type="text"
                                                                    value="${purchaseData.total_amount}"
                                                                    style="max-width:
                                                                    80px;"></span></h4>
                                                    </div>
                                                    <div>
                                                        <h4 style="margin:
                                                            0;
                                                            text-align:
                                                            right;
                                                            font-size:
                                                            12px;
                                                            font-weight:
                                                            400; margin-bottom:
                                                            5px;margin-right:10px ;">
                                                            Cash Dist <span
                                                                style="">
                                                                <input
                                                                    type="text"
                                                                    value="${purchaseData.discount}"
                                                                    style="max-width:
                                                                    80px;"></span></h4>
                                                    </div>
                                                    <div>
                                                        <h4 style="margin:
                                                            0;
                                                            text-align:
                                                            right;
                                                            font-size:
                                                            12px;
                                                            font-weight:
                                                            600; margin-bottom:
                                                            5px;margin-right:10px ;">
                                                            Total Payable <span
                                                                style="">
                                                                <input
                                                                    type="text"
                                                                    value="${purchaseData.bill_amount}"
                                                                    style="max-width:
                                                                    80px;font-Weight:600"></span></h4>
                                                    </div>
                                                </div>
                                            
                                        </div>
                                          </div>
                                        <div
                                            class="table-footer-area"
                                            style="display: table; width:
                                            100%; margin-top: 10px;">
                                            <div style="display:
                                                table-cell; width:
                                                74%">
                                                <div style="display: inline-flex;
                                                    justify-content: flex-end;
                                                    gap: 10px;">
                                                    <div>
                                                        <h4 style="margin:
                                                            0;
                                                            text-align:
                                                            left;
                                                            font-size:
                                                            12px;
                                                            font-weight:
                                                            400; margin-bottom:
                                                            5px;">
                                                            <span
                                                                style="">
                                                                <input
                                                                    type="text"
                                                                    value="${purchaseData.due_date}"
                                                                    style="max-width:
                                                                    80px;"></span>
                                                            Due Date</h4>
                                                    </div>
                                                    
                                                </div>
                                            </div>
                                            <div style="display:
                                                table-cell; width:
                                                26%">
                                                <div style="display: inline-table;
                                                    justify-content: flex-end;
                                                    ">
                                                    <div>
                                                        <h4 style="margin:
                                                            0;
                                                            text-align:
                                                            right;
                                                            font-size:
                                                            12px;
                                                            font-weight:
                                                            400; margin-bottom:
                                                            5px;margin-right:10px ;">
                                                            Paid Amount <span
                                                                style="">
                                                                <input
                                                                    type="text"
                                                                    value="${purchaseData.paid_amount_display}"
                                                                    style="max-width:
                                                                    80px;"></span></h4>
                                                    </div>`;
  if (purchaseData.return_amount) {
    html += `<div>
                                                        <h4 style="margin:
                                                            0;
                                                            text-align:
                                                            right;
                                                            font-size:
                                                            12px;
                                                            font-weight:
                                                            400; margin-bottom:
                                                            5px;margin-right:10px ;">
                                                            Return Amount <span
                                                                style="">
                                                                <input
                                                                    type="text"
                                                                    value="${purchaseData.return_amount}"
                                                                    style="max-width:
                                                                    80px;"></span></h4>
                                                    </div>`;
  }

  html += `<div>
                                                        <h4 style="margin:
                                                            0;
                                                            text-align:
                                                            right;
                                                            font-size:
                                                            12px;
                                                            font-weight:
                                                            400; margin-bottom:
                                                            5px;margin-right:10px ;">
                                                            Rest Due Amt <span
                                                                style="">
                                                                <input
                                                                    type="text"
                                                                    value="${purchaseData.due_amount_display}"
                                                                    style="max-width:
                                                                    80px;"></span></h4>
                                                    </div>
                                                  </div>
                                                </div>
                                            </div>
                                       <!-- <table cellspacing="0" cellpadding="0"
                                            border="0"
                                            align="center" width="100%"
                                            style="position:absolute;bottom:30px;"
                                            >
                                            <tbody>
                                                <tr>
                                                    <hr style="border: 0.5px
                                                        solid #1E2757">
                                                </tr>
                                            </tbody>
                                        </table>-->
                                        <!-- Footer -->
                                        
                                        ${footerhtml}
                                    </td>
                                </tr>

                            </tbody>
                        </table>
                    </div>
                </body>
            </html>`;
  /*let footerhtml_old = `<!DOCTYPE html>
  <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Bill</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          
          <style>
          html {
            -webkit-print-color-adjust: exact;
          }
          tbody tr { page-break-inside: avoid; }
          thead { display: table-header-group; }
          .table-footer-area { page-break-inside: avoid; }
          </style>
      </head>
      <body style="box-sizing: border-box; padding: 0px; margin: 0px; font-family:
          'Poppins', sans-serif;"><div class="invoice" style="max-width: 800px; margin:auto; padding:
              5px;
              background-color: #f9f9f9; border-top: 2px solid #000;">
              <table cellpadding="0" cellspacing="1" width="550px" style="margin:auto;" >
                  <tbody>
                      <tr>
                          <td><table cellspacing="0" cellpadding="0"
                                              border="0"
                                              align="center" width="90%">
                                              <div style="display: table; width:
                                                  100%; font-size: 8px;">
                                                  <div style="display: table-cell; width: 65%; vertical-align: top;"></div>
                                                  <div style="display: table-cell;
                                                      width: 35%;">
                                                      <div style="display: flex;
                                                          gap: 10px;
                                                          justify-content:
                                                          space-between;">
                                                          <!---<div>
                                                              <h4 style="margin:
                                                                  0px;
                                                                  text-align:
                                                                  center;
                                                                  font-size:
                                                                  12px;">Customer
                                                                  Signature</h4>
                                                              <input type="text"
                                                                  style="display:
                                                                  block;
                                                                  margin: auto;
                                                                  height:
                                                                  36px; min-width:
                                                                  142px; ">
  
                                                          </div> -->
                                                         <!-- <div style="display:flex ; align-items: center;">
                                                              <h4 style="margin-right:
                                                                  5px;
                                                                  text-align:
                                                                  center;
                                                                  font-size:
                                                                  8px;">Returning%
                                                              </h4>
                                                              <div
                                                                  style="position:
                                                                  relative;">
                                                                  <input
                                                                      type="text"
                                                                      style="display:
                                                                      block;
                                                                      margin:
                                                                      auto;
                                                                      height:
                                                                      16px;
                                                                      min-width:
                                                                      24px; width:64px; ">
                                                                  <div
                                                                      style="position:
                                                                      absolute;
                                                                      right:
                                                                      12px; top:
                                                                      4px;
                                                                      font-size:
                                                                      10px;">%</div>
                                                              </div>
                                                          </div>
  
                                                      </div> -->
                                                  </div>
                                              </div>
                                          </table></td>
                                  </tr>
                              </tbody>
                          </table>
                      </div></body>
                      </html>`;*/

  /*var options = {
    format: "A4",
    orientation: "portrait",
    border: "1mm",
    header: {
        height: "0mm",
        contents: ''
    },
    footer: {
        height: "10mm",
        contents: {
            first: '',
            2: '', // Any page number is working. 1-based index
            default: '<span style="color: #444;">{{page}}</span>/<span>{{pages}}</span>', // fallback value
            last: ''
        }
    }
  };

  let file_path = "public/invoices/"+purchaseData.invoice_number+".pdf";

  var document = {
    html: html,
    data: {

    },
    path: './'+file_path,
    type: "",
  };
  pdf.create(document, options)
  .then((resp) => {
    res.send(formatResponse({
      file_name: purchaseData.invoice_number+".pdf",
      url: getFileAbsulatePath(file_path),
      image_url: logoUrl
    }, "Invoice pdf"));
  })
  .catch((error) => {
    addLog("pdf error: " + error.toString());
    console.error(error);
  });*/

  /* -------------- commented by Soumalya Nandy ------------ */
  /*var browser;

  try {
    let file_path = "public/invoices/" + purchaseData.invoice_number + ".pdf";
    //! browser instance for the linux
    // Create a browser instance
    if (env != "production") {
      browser = await puppeteer.launch({
        executablePath: "/usr/bin/chromium-browser",
        args: ["--no-sandbox"],
      });
    } else {
      browser = await puppeteer.launch({
        ignoreDefaultArgs: ["--disable-extensions"],
      });
    }

    //this is test commit
    // Create a new page
    const page = await browser.newPage();

    //Get HTML content from HTML file
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    // To reflect CSS used for screens instead of print
    await page.emulateMediaType("screen");

    // Downlaod the PDF
    const pdf = await page.pdf({
      path: file_path,
      //margin: { top: '0px', right: '0px', bottom: '300px', left: '0px' },
      //printBackground: true,
      format: "A4",
      displayHeaderFooter: true,
      footerTemplate: footerhtml,
      margin: {
        top: "0px",
        right: "0px",
        bottom: "100px",
        left: "0px",
      },
    });

    // Close the browser instance
    await browser.close();*/
  /* -------------- commented by Soumalya Nandy ------------ */

  try {
    let file_path =
      "public/invoices/" + purchaseData.invoice_number + "_lists.pdf";
    const options = { format: "A4" };

    (async () => {
      const file = { content: html };

      // Generate PDF
      const pdfBuffer = await html_to_pdf.generatePdf(file, options);

      // Save PDF to file
      fs.writeFileSync(file_path, pdfBuffer);
      compactLog("PDF generated successfully!");

      res.send(
        formatResponse(
          {
            file_name: purchaseData.invoice_number + "_lists.pdf",
            url: getFileAbsulatePathPDF(file_path),
            purchaseData,
            payments,
          },
          "Invoice pdf",
        ),
      );
    })();

    /*const doc = new jsPDF();
    doc.html(html, {
        callback: (pdf) => {
            pdf.save(file_path);
            compactLog('PDF generated successfully!');

            res.send(
              formatResponse(
                {
                  file_name: purchaseData.invoice_number + ".pdf",
                  url: getFileAbsulatePath(file_path),
                  purchaseData,
                  payments,
                },
                "Invoice pdf"
              )
            );
        },
    });*/
  } catch (error) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse(error.toString()));
  }
};
