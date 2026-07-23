const config = require("@config/auth.config");
const {
  errorCodes,
  formatErrorResponse,
  formatResponse,
} = require("@utils/response.config");
const db = require("@models");
const moment = require("moment");
const {
  isEmpty,
  getDateFromToWhere,
  priceFormat,
  displayAmount,
  addLog,
  getFileAbsulatePath,
  getFileAbsulatePathPDF,
  weightFormat,
  convertUnitToGram,
} = require("@helpers/helper");
const { updateOrCreate, removeMaterialFromStock } = require("@library/common");
const { getPaginationOptions } = require("@helpers/paginator");
const { SaleCollection } = require("@resources/superadmin/SaleCollection");
const { PurityCollection } = require("@resources/superadmin/PurityCollection");
const { Op } = require("sequelize");
const sequelize = db.sequelize;
const ProductModel = db.products;
const UserModel = db.users;
const CategoryModel = db.categories;
const PurityModel = db.purities;
const UnitModel = db.units;
const MaterialModel = db.materials;
const SizeModel = db.sizes;
const StockModel = db.stocks;
const StockMaterialModel = db.stock_materials;
const SaleModel = db.sales;
const SaleProductModel = db.sale_products;
const SaleProductMaterialModel = db.sale_product_materials;
const paymentModel = db.payments;
const orderModel = db.orders;

/**
 * Retrieve all sales
 *
 * @param req
 * @param res
 */
exports.index = async (req, res) => {
  let { page, limit, user_id, search, date_from, date_to } = req.query;
  let conditions = { sale_by: req.userId };
  if (!isEmpty(user_id)) {
    conditions.user_id = user_id;
  }
  if (!isEmpty(search)) {
    conditions.invoice_number = { [Op.like]: `%${search}%` };
  }
  conditions = {
    ...conditions,
    ...getDateFromToWhere(date_from, date_to, "invoice_date"),
  };

  const paginatorOptions = getPaginationOptions(page, limit);
  SaleModel.findAndCountAll({
    order: [["id", "DESC"]],
    where: conditions,
    offset: paginatorOptions.offset,
    limit: paginatorOptions.limit,
    include: [
      {
        model: SaleProductModel,
        as: "saleProducts",
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
            model: SaleProductMaterialModel,
            as: "saleMaterials",
            include: [
              {
                model: MaterialModel,
                as: "material",
              },
            ],
          },
        ],
      },
      {
        model: UserModel,
        as: "user",
      },
    ],
  })
    .then(async (data) => {
      let result = {
        items: SaleCollection(data.rows),
        total: data.count,
      };
      res.send(formatResponse(result, "Sales List"));
    })
    .catch((err) => {
      res.status(errorCodes.default).send(formatErrorResponse(err));
    });
};

/**
 * Store sale
 *
 * @param {*} req
 * @param {*} res
 */
exports.store = async (req, res) => {
  let data = req.body;

  if (!isEmpty(data.invoice_number)) {
    let sdata = await SaleModel.findOne({
      where: { invoice_number: data.invoice_number },
    });
    if (sdata) {
      /* return res
        .status(errorCodes.default)
        .send(formatErrorResponse("Invoice number is exists.")); */
      /* create new invoice nummber */
      let sale = await SaleModel.findOne({
        attributes: ["id"],
        order: [["id", "DESC"]],
      });
      data.invoice_number = "RV-S-" + (sale ? sale.id + 1 : 1);
    }
  }

  try {
    //const trans = await sequelize.transaction(async (t) => {

    //insert into sale table
    let invoice_number = data.invoice_number || null;
    let saleObj = {
      user_id: data.user_id,
      order_id: data.order_id || null,
      sale_by: req.userId,
      invoice_number: invoice_number,
      invoice_date: moment(data.invoice_date).format("YYYY-MM-DD"),
      notes: data.notes,
      payment_mode: data.payment_mode,
      transaction_no: data.transaction_no,
      report_qty: data.report_qty,
      report_charge: data.report_charge_amount,
      report_tax_percentage: reportCharge[0].tax,
      total_amount: priceFormat(data.total_amount),
      cgst_tax: priceFormat(data.cgst_tax),
      sgst_tax: priceFormat(data.sgst_tax),
      igst_tax: priceFormat(data.igst_tax),
      discount: priceFormat(data.discount),
      paid_amount: data.paid_amount ? priceFormat(data.paid_amount) : 0,
      taxable_amount: priceFormat(data.taxable_amount),
      total_payable: priceFormat(data.total_payable),
      due_amount: priceFormat(data.due_amount),
      due_date: moment(data.due_date).format("YYYY-MM-DD"),
      settlement_date: moment(data.settlement_date).format("YYYY-MM-DD"),
    };
    let sale = await SaleModel.create(saleObj);

    //insert into sale product table
    for (let i = 0; i < data.products.length; i++) {
      let thisItem = data.products[i];
      let thisObj = {
        sale_id: sale.id,
        stock_id: thisItem.stock_id,
        product_id: thisItem.product_id,
        size_id: thisItem.size_id,
        certificate_no: thisItem.certificate_no,
        total_weight: weightFormat(thisItem.total_weight),
        sub_price: priceFormat(thisItem.sub_price),
        making_charge: priceFormat(thisItem.making_charge),
        rep: priceFormat(thisItem.rep),
        tax: priceFormat(thisItem.tax),
        total: priceFormat(thisItem.total),
        total_discount: priceFormat(thisItem.total_discount),
      };
      let saleProduct = await SaleProductModel.create(thisObj);

      let product = await ProductModel.findByPk(thisItem.product_id);

      //remove stock from superadmin
      if (product.type != "material") {
        await StockModel.destroy({ where: { id: thisItem.stock_id } });
      }

      //insert into sale product materials
      let batch_id = null;
      for (let x = 0; x < thisItem.materials.length; x++) {
        let thisMObj = {
          sale_id: sale.id,
          sale_product_id: saleProduct.id,
          material_id: thisItem.materials[x].material_id,
          weight: weightFormat(thisItem.materials[x].weight),
          quantity: thisItem.materials[x].quantity,
          purity_id: thisItem.materials[x].purity_id,
          unit_id: thisItem.materials[x].unit_id,
          rate: thisItem.materials[x].rate,
          amount: thisItem.materials[x].amount,
          discount_amount: thisItem.materials[x].discount_amount,
          discount_percent: thisItem.materials[x].discount_percent,
        };
        await SaleProductMaterialModel.create(thisMObj);

        /**
         * remove from stock materials
         */
        if (product.type == "material") {
          let stockMaterial = await StockMaterialModel.findOne({
            where: {
              material_id: thisItem.materials[x].material_id,
              stock_id: thisItem.stock_id,
            },
          });
          if (stockMaterial) {
            await StockMaterialModel.update(
              {
                weight: weightFormat(
                  parseFloat(stockMaterial.weight) -
                    weightFormat(thisItem.materials[x].weight),
                ),
                quantity:
                  parseInt(stockMaterial.quantity) -
                  parseInt(thisItem.materials[x].quantity),
              },
              { where: { id: stockMaterial.id } },
            );

            if (
              parseInt(stockMaterial.quantity) -
                parseInt(thisItem.materials[x].quantity) <=
              0
            ) {
              await StockModel.destroy({ where: { id: thisItem.stock_id } });
            } else {
              let stock = await StockModel.findOne({
                where: { id: thisItem.stock_id },
              });
              if (stock) {
                await StockModel.update(
                  {
                    quantity:
                      parseInt(stockMaterial.quantity) -
                      parseInt(thisItem.materials[x].quantity),
                    total_weight:
                      parseFloat(stock.total_weight) -
                      weightFormat(thisItem.total_weight),
                  },
                  { where: { id: thisItem.stock_id } },
                );
              }
            }
          }
        }
      }

      /**
       * START - add to admin stock
       */
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
          { product_id: thisItem.product_id, user_id: data.user_id },
          {
            product_id: thisItem.product_id,
            quantity: quantity,
            user_id: data.user_id,
            total_weight: thisItem.total_weight,
          },
          null,
          ["quantity", "total_weight"],
        );
        stock = result.item;
      } else {
        stock = await StockModel.create({
          user_id: data.user_id,
          product_id: thisItem.product_id,
          size_id: thisItem.size_id,
          certificate_no: thisItem.certificate_no,
          quantity: 1,
          user_id: data.user_id,
          sale_id: sale.id,
          total_weight: thisItem.total_weight,
        });
      }

      //insert into stock materials
      let batch_id2 = null;
      for (let x = 0; x < thisItem.materials.length; x++) {
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
                weight: weightFormat(
                  parseFloat(stockMaterial.weight) +
                    weightFormat(thisItem.materials[x].weight),
                ),
                quantity:
                  parseInt(stockMaterial.quantity) +
                  parseInt(thisItem.materials[x].quantity),
                purity_id: thisItem.materials[x].purity_id,
                unit_id: thisItem.materials[x].unit_id,
                category_id: product.category_id,
              },
              { where: { id: stockMaterial.id } },
            );
          } else {
            await StockMaterialModel.create({
              stock_id: stock.id,
              material_id: thisItem.materials[x].material_id,
              weight: weightFormat(thisItem.materials[x].weight),
              quantity: thisItem.materials[x].quantity,
              purity_id: thisItem.materials[x].purity_id,
              unit_id: thisItem.materials[x].unit_id,
              category_id: product.category_id,
            });
          }
        } else {
          await StockMaterialModel.create({
            stock_id: stock.id,
            material_id: thisItem.materials[x].material_id,
            weight: weightFormat(thisItem.materials[x].weight),
            quantity: thisItem.materials[x].quantity,
            purity_id: thisItem.materials[x].purity_id,
            unit_id: thisItem.materials[x].unit_id,
            category_id: product.category_id,
          });
        }
      }

      /**
       * END - add to admin stock
       */
    }

    //update invoice no if not sent
    if (isEmpty(invoice_number)) {
      invoice_number = "RV-S-" + sale.id;
      await SaleModel.update(
        {
          invoice_number: invoice_number,
        },
        { where: { id: sale.id } },
      );
    }

    //insert into payment table
    if (priceFormat(data.paid_amount) > 0) {
      await paymentModel.create({
        payment_mode: data.payment_mode,
        amount: priceFormat(data.paid_amount),
        user_id: req.userId,
        payment_by: data.user_id,
        payment_date: moment().format("YYYY-MM-DD"),
        txn_id: data.transaction_no,
        cheque_no: data.cheque_no,
        status: "success",
        type: "pay_to_admin",
        table_type: "sale",
        table_id: sale.id,
      });
    }

    //complete order
    if (!isEmpty(data.order_id)) {
      await orderModel.update(
        {
          status: "delivered",
        },
        { where: { id: data.order_id } },
      );
    }

    res.send(formatResponse([], "Sale successfully!"));
    //});
  } catch (error) {
    addLog("error: " + error.toString());
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Sale does not success due to some error"));
  }
};

/**
 * View Sale
 *
 * @param {*} req
 * @param {*} res
 */
exports.view = async (req, res) => {
  let sale = await SaleModel.findOne({
    where: { id: req.params.id, sale_by: req.userId },
    include: [
      {
        model: SaleProductModel,
        as: "saleProducts",
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
            model: SaleProductMaterialModel,
            as: "saleMaterials",
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
        as: "user",
      },
    ],
  });
  if (!sale) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Sale not found"));
  }
  res.send(formatResponse(SaleCollection(sale), "Sale details"));
};

/**
 * delete sale
 *
 * @param {*} req
 * @param {*} res
 */
exports.delete = async (req, res) => {
  let sale = await SaleModel.findOne({
    where: { id: req.params.id },
    include: [
      {
        model: SaleProductModel,
        as: "saleProducts",
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
            model: SaleProductMaterialModel,
            as: "saleMaterials",
            include: [
              {
                model: MaterialModel,
                as: "material",
              },
            ],
          },
        ],
      },
    ],
  });
  if (!sale) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Data not found"));
  }

  try {
    let sale_id = req.params.id;
    //const trans = await sequelize.transaction(async (t) => {

    /**
     * Add to superadmin stock
     */
    for (let i = 0; i < sale.saleProducts.length; i++) {
      let product = sale.saleProducts[i].product;
      if (product) {
        if (product.type != "material") {
          await StockModel.update(
            { deletedAt: null },
            {
              where: {
                deletedAt: { ne: null },
                id: sale.saleProducts[i].stock_id,
              },
              paranoid: false,
            },
          );
          await StockMaterialModel.update(
            { deletedAt: null },
            {
              where: {
                deletedAt: { ne: null },
                stock_id: sale.saleProducts[i].stock_id,
              },
              paranoid: false,
            },
          );
        } else {
          let result = await updateOrCreate(
            StockModel,
            { product_id: product.id, user_id: req.userId },
            { product_id: product.id, user_id: req.userId },
            null,
          );
          let stock = result.item;
          let totalQnty = 0;
          if (result.created) {
            for (
              let x = 0;
              x < sale.saleProducts[i].saleMaterials.length;
              i++
            ) {
              let thisItem = sale.saleProducts[i].saleMaterials[x];
              await StockMaterialModel.create({
                stock_id: stock.id,
                material_id: thisItem.material_id,
                weight: weightFormat(thisItem.weight),
                quantity: thisItem.quantity,
              });
              totalQnty += parseInt(thisItem.quantity);
            }
          } else {
            for (
              let x = 0;
              x < sale.saleProducts[i].saleMaterials.length;
              x++
            ) {
              let thisItem = sale.saleProducts[i].saleMaterials[x];
              let stockMaterial = await StockMaterialModel.findOne({
                where: {
                  stock_id: stock.id,
                  material_id: thisItem.material_id,
                },
              });
              if (stockMaterial) {
                await StockMaterialModel.update(
                  {
                    weight: weightFormat(
                      parseFloat(stockMaterial.weight) +
                        parseFloat(thisItem.weight),
                    ),
                    quantity:
                      parseInt(stockMaterial.quantity) +
                      parseInt(thisItem.quantity),
                  },
                  { where: { id: stockMaterial.id } },
                );
                totalQnty += thisItem.quantity;
              }
            }
          }
          totalQnty += stock.quantity ? stock.quantity : 0;
          let totalWeight = stock.total_weight
            ? parseFloat(stock.total_weight) +
              parseFloat(sale.saleProducts[i].total_weight)
            : parseFloat(sale.saleProducts[i].total_weight);
          await StockModel.update(
            {
              quantity: totalQnty,
              total_weight: weightFormat(totalWeight),
            },
            { where: { id: stock.id } },
          );
        }
      }
    }

    /**
     * Remove from admin stock
     */
    for (let i = 0; i < sale.saleProducts.length; i++) {
      let product = sale.saleProducts[i].product;
      if (product) {
        if (product.type == "material") {
          let stock2 = await StockModel.findOne({
            where: { product_id: product.id, user_id: sale.user_id },
          });
          let quantity = 0;
          for (let mItem of sale.saleProducts[i].saleMaterials) {
            let stockM = await StockMaterialModel.findOne({
              where: { stock_id: stock2.id, material_id: mItem.material_id },
            });
            if (stockM) {
              await StockMaterialModel.update(
                {
                  weight: weightFormat(
                    parseFloat(stockM.weight) - parseFloat(mItem.weight),
                  ),
                  quantity:
                    parseInt(stockM.quantity) - parseInt(mItem.quantity),
                },
                { where: { id: stockM.id } },
              );
              quantity += mItem.quantity ? parseInt(mItem.quantity) : 0;
            }
          }
          if (stock2.quantity == quantity) {
            await StockModel.destroy({ where: { id: stock2.id } });
          } else {
            await StockModel.update(
              {
                quantity: quantity,
                total_weight:
                  parseFloat(stock2.total_weight) -
                  parseFloat(sale.saleProducts[i].total_weight),
              },
              { where: { id: stock2.id } },
            );
          }
        } else {
          await StockModel.destroy({ where: { sale_id: sale.id } });
        }
      }
    }

    await SaleProductModel.destroy({ where: { sale_id: sale_id } });
    await SaleProductMaterialModel.destroy({ where: { sale_id: sale_id } });
    await SaleModel.destroy({ where: { id: sale_id } });

    res.send(formatResponse([], "Sale deleted successfully!"));
    //});
  } catch (error) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Sale does not delete due to some error"));
  }
};

/**
 * Download Invoice
 *
 * @param {*} req
 * @param {*} res
 */
exports.downloadInvoice = async (req, res) => {
  let sale = await SaleModel.findOne({
    where: { id: req.params.id, sale_by: req.userId },
    include: [
      {
        model: SaleProductModel,
        as: "saleProducts",
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
            model: SaleProductMaterialModel,
            as: "saleMaterials",
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
        as: "user",
      },
    ],
  });
  if (!sale) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Sale not found"));
  }
  let saleData = SaleCollection(sale);

  const logoUrl = process.env.BASE_URL + "public/images/logo.png";
  // const logoUrl = "file://var/www/html/Prakriti/api.prakriti.one/public/images/logo.png";

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
                                      300;">TAX INVOICE</h1>
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
                                              P210 Strand Bank Road Brabzar
                                              Kolkata 700 011</h3>
  
                                      </div>
                                      <div style="width: 35%; display: table-cell;
                                          vertical-align: middle; text-align:
                                          left;">
                                          <h3 style="margin: 0;">
                                              <span style="font-size: 16px;
                                                  font-weight: 600;">Prakriti Head Office</span></h3>
                                          <h3 style="margin: 0; font-weight: 400;
                                              font-size: 14px;">GST No -
                                              <span style="font-weight: 600;">19ABAFR4515L1ZZ</span></h3>
                                          <h3 style="margin: 0; font-weight: 400;
                                              font-size: 12px;">User Id - <span>${saleData.sale_by_name}</span></h3>
                                          <h3 style="margin: 0; font-weight: 400;
                                              font-size: 12px;">Address - Belur Kolkatta Patna Bihar 711 202</h3>
                                          <h3 style="font-weight: 600; font-size:
                                              12px; margin: 0;">
                                              support@Prakriti.one, +91 9117799755
                                          </h3>
                                      </div>
                                  </div>
                              </table>
                              <table cellspacing="0" cellpadding="5" border="0"
                                  align="center" width="100%">
                                  <tbody>
                                      <tr>
                                          <hr style="border: 1px solid #1e2746">
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
                                                  IN ${saleData.user_details.gst} </span>
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
                                                                  0;">${saleData.user_details.company_name}</span></li>
                                                          <li><span
                                                                  style="font-weight:
                                                                  400; font-size:
                                                                  12px; margin:
                                                                  0;">GST IN</span>
                                                              <span
                                                                  style="font-weight:
                                                                  600; font-size:
                                                                  12px; margin:
                                                                  0;">${saleData.user_details.gst}</span></li>
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
                                                                  0;">${saleData.user_mobile}</span>
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
                                                                  0;">${saleData.invoice_date}</span></li>
                                                                  
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
                                                                  0;">${saleData.user_details.address}</span></li>
                                                         
                                                          <li><span
                                                                  style="font-weight:
                                                                  400; font-size:
                                                                  12px; margin:
                                                                  0;">Invoice No -
                                                              </span> <span
                                                                  style="font-weight:
                                                                  600; font-size:
                                                                  12px; margin:
                                                                  0;">${saleData.invoice_number}</span></li>
                                                      </ul>
 <ul style="margin: 0;
                                                          padding: 0; list-style:
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
                                                                  0;">${saleData.user_details.city}</span></li>
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
                                                                  0;">${saleData.user_details.pincode}</span></li>
                                                                  </ul>
                                                  </div>
                                              </td>
                                          </tr>
                                      </tbody>
                                  </table>
                                  <table cellspacing="0" cellpadding="5"  style="margin-top:10px"
                                      border="0"
                                      align="center" width="100%">
                                      <thead style="background-color: #1E2746;">
                                          <tr style="background-color: #1E2746;">
                                              <th style="text-align: left; color:
                                                  #fff; border: 1px solid #1E2746;
                                                  font-size: 12px; font-weight:
                                                  400;background-color: #1E2746;">#</th>
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
  for (let i = 0; i < saleData.products.length; i++) {
    html += `<tr style="background-color: #C1BDBD;">
                                              <td style="text-align: left;
                                                  font-size: 11px;
                                                  font-weight: 400;">
                                                  ${i + 1}
                                              </td>
                                              <td style="text-align: left;
                                                  font-size: 11px;
                                                  font-weight: 400;font-size: 10px;">
                                                  ${
                                                    saleData.products[i]
                                                      .product_name
                                                  } - ${
                                                    saleData.products[i]
                                                      .product_code
                                                  }
                                              </td>
                                              <td style="text-align: left;
                                                  font-size: 11px;
                                                  font-weight: 400;">
                                                  ${
                                                    saleData.products[i]
                                                      .size_name
                                                  }
                                              </td>
                                              <td colspan="8" style="text-align:
                                                  left; font-size: 11px;
                                                  font-weight: 400;">
                                                  ${
                                                    saleData.products[i]
                                                      .certificate_no
                                                  }
                                              </td>
  
                                          </tr>
                                          <tr style="background-color: #fff;
                                              vertical-align: top;">
                                              <td colspan="3"
                                                  style="border-bottom: 1px solid
                                                  #1E2746; width: 300px; text-align: left;">
                                                  <div style="max-width: 300px; text-align: left;">`;
    for (let x = 0; x < saleData.products[i].materials.length; x++) {
      saleData.products[i].materials[x].amount == "₹0.00"
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
                                                                  400;text-align: left;">${saleData.products[i].materials[x].material_name} ${saleData.products[i].materials[x].weight} ${saleData.products[i].materials[x].unit_name} X ${saleData.products[i].materials[x].rate}
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
                                                                  400;"> = ${saleData.products[i].materials[x].amount}</span>
                                                          </div>
  
                                                      </div>`);
    }

    html += `</div>
  
  
                                                      </td>
                                                      <td style="border-bottom:
                                                          1px solid #1E2746;">`;
    for (let x = 0; x < saleData.products[i].materials.length; x++) {
      html += `<div>`;
      if (isEmpty(saleData.products[i].materials[x].discount_amount)) {
        saleData.products[i].materials[x].amount == "₹0.00"
          ? null
          : (html += `-`);
      } else {
        html += `<span
                                                                  style="text-align:
                                                                  left; font-size:
                                                                  10px;
                                                                  font-weight:
                                                                  400;">Dist@${removeBlankZero(
                                                                    saleData
                                                                      .products[
                                                                      i
                                                                    ].materials[
                                                                      x
                                                                    ]
                                                                      .discount_percent,
                                                                  )}% ${
                                                                    saleData
                                                                      .products[
                                                                      i
                                                                    ].materials[
                                                                      x
                                                                    ]
                                                                      .discount_amount_display
                                                                  }</span> 
															  <!--<span
                                                                  style="text-align:
                                                                  left; font-size:
                                                                  10px;
                                                                  font-weight:
                                                                  400;">${
                                                                    saleData
                                                                      .products[
                                                                      i
                                                                    ].materials[
                                                                      x
                                                                    ]
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
                                                          #1E2746;">`;
    for (let x = 0; x < saleData.products[i].materials.length; x++) {
      saleData.products[i].materials[x].amount == "₹0.00"
        ? null
        : (html += `<div>${saleData.products[i].materials[x].material_cost}</div>`);
    }
    html += `</td>
                                                      <td style="text-align: left;
                                                          font-size: 10px;
                                                          font-weight: 400;
                                                          border-bottom: 1px solid
                                                          #1E2746;">
                                                          ${saleData.products[i].making_charge}@${saleData.products[i].making_charge_discount}% = ${saleData.products[i].total_making_charge_discount}
                                                      </td>
  
                                                      <td style="text-align:
                                                          left;font-size: 10px;
                                                          font-weight: 600;
                                                          border-bottom: 1px solid
                                                          #1E2746;">
                                                          ${saleData.products[i].sub_price}
                                                      </td>
                                                      <td style="text-align:
                                                          left;font-size: 10px;
                                                          font-weight: 600;
                                                          border-bottom: 1px solid
                                                          #1E2746;">
                                                          ${saleData.products[i].total_discount_display}
                                                      </td>
                                                      <td style="text-align:
                                                          left;font-size: 10px;
                                                          font-weight: 400;
                                                          border-bottom: 1px solid
                                                          #1E2746;">
                                                          ${saleData.products[i].sub_total}
                                                      </td>
                                                      <td style="text-align:
                                                          left;font-size: 10px;
                                                          font-weight: 400;
                                                          border-bottom: 1px solid
                                                          #1E2746;">
                                                          ${saleData.products[i].tax}
                                                      </td>
                                                      <td style="text-align:
                                                          left;font-size: 10px;
                                                          font-weight: 600;
                                                          border-bottom: 1px solid
                                                          #1E2746;">
                                                          ${saleData.products[i].total_display}
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
                                          </table>

                                          <div

                                              class="table-footer-area"
                                              style="display: table; width:
                                              90%; margin-top: 10px">
                                              <div style="display:
                                                  table-cell; width:
                                                  74%">
                                                  <div style="display: block;
                                                      justify-content: flex-end;
                                                      gap: 10px;">
                                                      <!--<div>
                                                          <h4 style="margin:
                                                              0;
                                                              text-align:
                                                              left; font-size:
                                                              14px;
                                                              font-weight:
                                                              600; display: flex; gap: 40px; justify-content: end;">
                                                              <div>${saleData.total_tag_price}</div>
                                                              <div>${saleData.product_discount}</div>
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
                                                              #1E2746;
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
                                                                  400; font-size: 12px; text-align: left;"> Note</th>
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
                                                                      .notes
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
                                                  table-cell; width:
                                                  26%">
                                                  <div style="display: block;
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
                                                              600; margin-bottom:
                                                              5px;">
                                                              Total <span
                                                                  style="">
                                                                  <input
                                                                      type="text"
                                                                      value="${saleData.total_sub_total}"
                                                                      style="max-width:
                                                                      80px; font-weight:600px;"></span></h4>
                                                      </div>`;
  if (saleData.cgst_tax) {
    html += `<div>
                                                          <h4 style="margin:
                                                              0;
                                                              text-align:
                                                              right;
                                                              font-size:
                                                              12px;
                                                              font-weight:
                                                              400; margin-bottom:
                                                              5px;">
                                                              CGST Amt <span
                                                                  style="">
                                                                  <input
                                                                      type="text"
                                                                      value="${saleData.cgst_tax_display}"
                                                                      style="max-width:
                                                                      80px;"></span></h4>
                                                      </div>`;
  }
  if (saleData.sgst_tax) {
    html += `<div>
                                                          <h4 style="margin:
                                                              0;
                                                              text-align:
                                                              right;
                                                              font-size:
                                                              12px;
                                                              font-weight:
                                                              400; margin-bottom:
                                                              5px;">
                                                              SGST Amt <span
                                                                  style="">
                                                                  <input
                                                                      type="text"
                                                                      value="${saleData.sgst_tax_display}"
                                                                      style="max-width:
                                                                      80px;"></span></h4>
                                                      </div>`;
  }
  if (saleData.igst_tax) {
    html += `<div>
                                                          <h4 style="margin:
                                                              0;
                                                              text-align:
                                                              right;
                                                              font-size:
                                                              12px;
                                                              font-weight:
                                                              400; margin-bottom:
                                                              5px;">
                                                              IGST Amt <span
                                                                  style="">
                                                                  <input
                                                                      type="text"
                                                                      value="${saleData.igst_tax_display}"
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
                                                              600; margin-bottom:
                                                              5px;">
                                                              Sub Total <span
                                                                  style=""
                                                                  
                                                                  >
                                                                  <input
                                                                      type="text"
                                                                      value="${saleData.total_amount}"
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
                                                              5px;">
                                                              Cash Dist <span
                                                                  style="">
                                                                  <input
                                                                      type="text"
                                                                      value="${saleData.discount}"
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
                                                              5px;">
                                                              Total Payable <span
                                                                  style="">
                                                                  <input
                                                                      type="text"
                                                                      value="${saleData.bill_amount}"
                                                                      style="max-width:
                                                                      80px;font-Weight:600"></span></h4>
                                                      </div>
                                                  </div>
                                              </div>
                                          </div>
                                          <div
                                              class="table-footer-area"
                                              style="display: table; width:
                                              90%; margin-top: 10px">
                                              <div style="display:
                                                  table-cell; width:
                                                  74%">
                                                  <div style="display: block;
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
                                                                      value="${saleData.due_date}"
                                                                      style="max-width:
                                                                      80px;"></span>
                                                              Due Date</h4>
                                                      </div>
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
                                                                      value="${saleData.settlement_date}"
                                                                      style="max-width:
                                                                      80px;"></span>
                                                              Settlement Date</h4>
                                                      </div>
                                                  </div>
                                              </div>
                                              <div style="display:
                                                  table-cell; width:
                                                  26%">
                                                  <div style="display: block;
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
                                                              5px;">
                                                              Paid Amount <span
                                                                  style="">
                                                                  <input
                                                                      type="text"
                                                                      value="${saleData.paid_amount}"
                                                                      style="max-width:
                                                                      80px;"></span></h4>
                                                      </div>`;
  if (saleData.return_amount) {
    html += `<div>
                                                          <h4 style="margin:
                                                              0;
                                                              text-align:
                                                              right;
                                                              font-size:
                                                              12px;
                                                              font-weight:
                                                              400; margin-bottom:
                                                              5px;">
                                                              Return Amount <span
                                                                  style="">
                                                                  <input
                                                                      type="text"
                                                                      value="${saleData.return_amount}"
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
                                                              5px;">
                                                              Rest Due Amt <span
                                                                  style="">
                                                                  <input
                                                                      type="text"
                                                                      value="${saleData.due_amount_display}"
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
                                                          solid #1E2746">
                                                  </tr>
                                              </tbody>
                                          </table>-->
                                          <!-- Footer -->
                                      </td>
                                  </tr>
  
                              </tbody>
                          </table>
                      </div>
                  </body>
              </html>`;
  let footerhtml = `<!DOCTYPE html>
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
          'Poppins', sans-serif;"><div class="invoice" style="max-width: 1000px;  padding:
              5px;
              background-color: #f9f9f9; border-top: 2px solid #000;">
              <table cellpadding="0" cellspacing="1" width="600px">
                  <tbody>
                      <tr>
                          <td><table cellspacing="0" cellpadding="0"
                                              border="0"
                                              align="center" width="100%">
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
                                                      <div style="margin-top:5px">
                                                          <p style="font-size:
                                                              8px; margin: 0;
                                                              line-height: 1.2; ">
                                                              Company Name - ${saleData.user_details.company_name}</p>
                                                          <p style="font-size:
                                                              8px; margin: 0;
                                                              line-height: 1.2; ">
                                                              ${saleData.user_details.company_name},<br/>
                                                               Ac. No - ${saleData.user_details.bank_account_no}</p>
                                                      </div>
                                                  </div>
                                              </div>
                                          </table></td>
                                  </tr>
                              </tbody>
                          </table>
                      </div></body>
                      </html>`;

  var options = {
    format: "A3",
    orientation: "portrait",
    border: "10mm",
    header: {
      height: "45mm",
      contents: "",
    },
    footer: {
      height: "28mm",
      contents: {
        first: "",
        2: "", // Any page number is working. 1-based index
        default:
          '<span style="color: #444;">{{page}}</span>/<span>{{pages}}</span>', // fallback value
        last: "",
      },
    },
  };

  let file_path = "public/invoices/" + saleData.invoice_number + ".pdf";

  var document = {
    html: html,
    data: {},
    path: "./" + file_path,
    type: "",
  };
  pdf
    .create(document, options)
    .then((resp) => {
      res.send(
        formatResponse(
          {
            file_name: saleData.invoice_number + ".pdf",
            url: getFileAbsulatePathPDF(file_path),
            image_url: logoUrl,
          },
          "Invoice pdf",
        ),
      );
    })
    .catch((error) => {
      console.error(error);
    });
};

/**
 * Download Invoice
 *
 * @param {*} req
 * @param {*} res
 */
exports.downloadInvoiceInfo = async (req, res) => {
  let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
  let sale = await SaleModel.findOne({
    //as: "sales",
    where: { id: req.params.id, sale_by: userID },
    include: [
      {
        model: SaleProductModel,
        as: "saleProducts",
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
          /* {
            model: StockModel,
            as: "stock",
            where: {
              user_id: sequelize.col('sales.user_id')
            } 
          },  */
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
        model: PurchaseModel,
        as: "purchase",
      },
      {
        model: StockModel,
        as: "saleStocks",
        where: {
          purchase_id: sequelize.col("purchase.id"),
        },
        required: false,
      },
      {
        model: UserModel,
        as: "user",
      },
      {
        model: UserModel,
        as: "saleBy",
      },
    ],
  });
  if (!sale) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Sale not found"));
  }

  let saleData = SaleCollection(sale);

  let payments = await PaymentModel.findAll({
    where: {
      table_type: "sale",
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

  //compactLog("payments : ",payments);
  const cwd = process.cwd();
  // const logoUrl = `file://${cwd}/public/images/logo.png`;
  const logoUrl = `public/images/logo.png`;
  // const logoUrl = process.env.BASE_URL + "public/images/logo.png";

  const bitmap = fs.readFileSync(logoUrl);
  const logo = bitmap.toString("base64");

  let footerhtml = `
              <div class="invoice" style="width: 100%; margin: 0; padding: 15px; background-color: #f9f9f9; page-break-inside: avoid; border-top: 2px solid #000;">
                  <table cellpadding="0" cellspacing="1"  style="margin:auto; width:100%" >
                      <tbody>
                          <tr>
                              <td>
                                <table cellspacing="0" cellpadding="0"
                                    border="0"
                                    align="center" width="90%">
                                    <div style="display: table; width:
                                        100%; font-size: 11px;">
                                        <div style="display: table-cell; width: 65%; vertical-align: top;">
                                            ${saleData.notes ? `<div style="display: flex; flex-direction: column; margin-top: 4px;"><span style="font-size: 11px; font-weight: 600;">Notes:</span><span style="font-size: 11px; font-weight: 400;">${saleData.notes}</span></div>` : ""}
                                        </div>
                                        <div style="display: table-cell;
                                            width: 35%;">
                                            <div style="display: flex;
                                                justify-content:space-between;">
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
                                                </div> -->
                                            </div> 
                                        </div>
                                    </div>
                                </table>
                              </td>
                        </tr>
                    </tbody>
                </table>
            </div>
          `;

  let html = `
      <!DOCTYPE html>
      <html lang="en">
          <head>
              <meta charset="UTF-8" />
              <meta http-equiv="X-UA-Compatible" content="IE=edge" />
              <meta name="viewport" content="width=device-width, initial-scale=1.0" />
              <title>Bill</title>
              <link rel="preconnect" href="https://fonts.googleapis.com" />
              <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin  />
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
                                      300;">SALE TAX INVOICE</h1>
                              </table>
                              <table cellspacing="0" cellpadding="0" border="0"
                                  align="center" width="100%">
                                  <div style="display: table; width: 100%;">
                                      <div style="width: 65%; display: table-cell;
                                          vertical-align: bottom;">
                                          <img src="data:image/png;base64,${logo}" style="width:
                                              220px; margin-left: 10px;" />
                                          <h3 style="margin: 0; font-weight: 400;
                                              font-size: 12px;">Corporate Office -
                                              P210 Strand Bank Road Brabzar
                                              Kolkata 700 011</h3>

                                      </div>
                                      <div style="width: 35%; display: table-cell;
                                          vertical-align: middle; text-align:
                                          left;">
                                          <h3 style="margin: 0;">
                                              <span style="font-size: 16px;
                                                  font-weight: 600;">Prakriti Head Office</span></h3>
                                          <h3 style="margin: 0; font-weight: 400;
                                              font-size: 14px;">GST No -
                                              <span style="font-weight: 600;">19ABAFR4515L1ZZ</span></h3>
                                          <h3 style="margin: 0; font-weight: 400;
                                              font-size: 12px;">User Id - <span>${saleData.sale_by_name}</span></h3>
                                          <h3 style="margin: 0; font-weight: 400;
                                              font-size: 12px;">Address - Belur Kolkatta Patna Bihar 711 202</h3>
                                          <h3 style="font-weight: 600; font-size:
                                              12px; margin: 0;">
                                              support@Prakriti.one, +91 9117799755
                                          </h3>
                                      </div>
                                  </div>
                              </table>
                              <table cellspacing="0" cellpadding="5" border="0"
                                  align="center" width="100%">
                                  <tbody>
                                      <tr>
                                          <hr style="border: 1px solid #1E2757" />
                                      </tr>
                                  </tbody>
                              </table>
                              <table cellspacing="0" cellpadding="5" border="0"
                                      align="center" width="100%">
                                  <thead>
                                      
                                  </thead>
                                  <tbody>
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
                                                              0;">${saleData.user_details.company_name}</span></li>
                                                      <li><span
                                                              style="font-weight:
                                                              400; font-size:
                                                              12px; margin:
                                                              0;">GST IN</span>
                                                          <span
                                                              style="font-weight:
                                                              600; font-size:
                                                              12px; margin:
                                                              0;">${saleData.user_details.gst}</span></li>
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
                                                              0;">${saleData.user_mobile}</span></li>
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
                                                              0;">${saleData.invoice_date}</span></li>
                                                              
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
                                                              0;">${saleData.user_details.address}</span></li>
                                                      
                                                      <li><span
                                                              style="font-weight:
                                                              400; font-size:
                                                              12px; margin:
                                                              0;">Invoice No -
                                                          </span> <span
                                                              style="font-weight:
                                                              600; font-size:
                                                              12px; margin:
                                                              0;">${saleData.invoice_number}</span></li>
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
                                                              0;">${saleData.user_details.city}</span></li>
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
                                                              0;">${saleData.user_details.pincode}</span></li>
                                                  </ul>
                                              </div>
                                          </td>
                                      </tr>
                                  </tbody>
                              </table>`;
  let metalHtml = "";
  if (saleData.subCatItems.length == 0) {
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
    for (let i = 0; i < saleData.products.length; i++) {
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
                                              saleData.products[i].product_name
                                            } - ${
                                              saleData.products[i].product_code
                                            }
                                        </td>
                                        <td style="text-align: left;
                                            font-size: 11px;
                                            font-weight: 400;">
                                            ${saleData.products[i].size_name}
                                        </td>
                                        <td colspan="8" style="text-align:
                                            left; font-size: 11px;
                                            font-weight: 400;">
                                            ${
                                              saleData.products[i]
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
      for (let x = 0; x < saleData.products[i].materials.length; x++) {
        saleData.products[i].materials[x].amount == "₹0.00"
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
                                                            400;text-align: left;">${saleData.products[i].materials[x].material_name} ${saleData.products[i].materials[x].weight} ${saleData.products[i].materials[x].unit_name}x${saleData.products[i].materials[x].rate}
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
                                                            400;"> = ${saleData.products[i].materials[x].amount}</span>
                                                    </div>

                                                </div>`);
      }

      html += `</div>


                                            </td>
                                            <td style="border-bottom:
                                                1px solid #1E2757;">`;
      for (let x = 0; x < saleData.products[i].materials.length; x++) {
        html += `<div>`;
        if (isEmpty(saleData.products[i].materials[x].discount_amount)) {
          saleData.products[i].materials[x].amount == "₹0.00"
            ? null
            : (html += `-`);
        } else {
          html += `<span
                                                        style="text-align:
                                                        left; font-size:
                                                        10px;
                                                        font-weight:
                                                        400;">@${removeBlankZero(
                                                          saleData.products[i]
                                                            .materials[x]
                                                            .discount_percent,
                                                        )}% ${
                                                          saleData.products[i]
                                                            .materials[x]
                                                            .discount_amount_display
                                                        }</span> 
                                    <!--<span
                                                        style="text-align:
                                                        left; font-size:
                                                        10px;
                                                        font-weight:
                                                        400;">${
                                                          saleData.products[i]
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
      for (let x = 0; x < saleData.products[i].materials.length; x++) {
        saleData.products[i].materials[x].amount == "₹0.00"
          ? null
          : (html += `<div>${saleData.products[i].materials[x].material_cost}</div>`);
      }
      html += `</td>
                                            <td style="text-align: left;
                                                font-size: 10px;
                                                font-weight: 400;
                                                border-bottom: 1px solid
                                                #1E2757;">
                                                ${saleData.products[i].making_charge}@${saleData.products[i].making_charge_discount}% = ${saleData.products[i].total_making_charge_discount}
                                            </td>

                                            <td style="text-align:
                                                left;font-size: 10px;
                                                font-weight: 600;
                                                border-bottom: 1px solid
                                                #1E2757;">
                                                ${saleData.products[i].sub_price}
                                            </td>
                                            <td style="text-align:
                                                left;font-size: 10px;
                                                font-weight: 600;
                                                border-bottom: 1px solid
                                                #1E2757;">
                                                ${saleData.products[i].total_discount_display}
                                            </td>
                                            <td style="text-align:
                                                left;font-size: 10px;
                                                font-weight: 400;
                                                border-bottom: 1px solid
                                                #1E2757;">
                                                ${saleData.products[i].sub_total}
                                            </td>
                                            <td style="text-align:
                                                left;font-size: 10px;
                                                font-weight: 400;
                                                border-bottom: 1px solid
                                                #1E2757;">
                                                ${saleData.products[i].tax}
                                            </td>
                                            <td style="text-align:
                                                left;font-size: 10px;
                                                font-weight: 600;
                                                border-bottom: 1px solid
                                                #1E2757;">
                                                ${saleData.products[i].total_display}
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
    /* Build making charge (after discount) lookup from products by sub_category_hsn */
    let makingChargeMap = {};
    if (saleData.products) {
      saleData.products.forEach((p) => {
        const key = p.sub_category_hsn || "";
        if (!makingChargeMap[key]) makingChargeMap[key] = 0;
        makingChargeMap[key] +=
          (parseFloat(p.making_charge) || 0) -
          (parseFloat(p.making_charge_discount_amount) || 0);
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
                                      <th rowspan="2" style="text-align: center; color: #fff; font-size: 11px; font-weight: 400; border: 1px solid #ffffff; width: 95px; padding: 5px 3px;">Description</th>
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

    /* Sum making_charge after discount from products */
    if (saleData.products) {
      saleData.products.forEach((product) => {
        totalMakingCharge +=
          (parseFloat(product.making_charge) || 0) -
          (parseFloat(product.making_charge_discount_amount) || 0);
      });
    }

    for (let i = 0; i < saleData.subCatItems.length; i++) {
      let item = saleData.subCatItems[i];
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
        .map((itm) => itm.weight.toFixed(3))
        .join("<br/>");
      let materialUnits = item.material.map((itm) => itm.unit).join("<br/>");
      let materialRates = item.material
        .map((itm) => itm.rate.toFixed(2))
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
    compactLog(
      "fine_metals 24k value : ",
      (parseFloat(fine_metals) * parseFloat(purity18K.value)) / 100,
    );
    /* convert gold to 24k from 18k */
    if (purity18K && purity18K.value != null) {
      fine_metals =
        (parseFloat(fine_metals) * parseFloat(purity18K.value)) / 100;
    }

    let rest_metal = fine_metals - receive_metal;

    let totalReportCharge =
      parseInt(saleData.report_qty) * parseFloat(saleData.report_charge);
    let taxOnReportCharge =
      (totalReportCharge * parseFloat(saleData.report_tax_percentage)) / 100;
    let afterTaxTotalReportCharge = totalReportCharge + taxOnReportCharge;

    if (saleData.report_qty > 0) {
      html += `<tr style="border: none;">
                  <td colspan="2" style="font-size: 13px; font-weight: 700; color: #1E2746; padding: 2px 4px; border: none;">Report Charges (18%)</td>
                  <td colspan="6" style="font-size: 12px; color: #555; padding: 2px 4px; border: none;">${saleData.report_qty} Pics x ${saleData.report_charge.toFixed(2)} =</td>
                  <td colspan="4" style="font-size: 13px; font-weight: 700; color: #1E2746; text-align: right; padding: 2px 4px; border: none;">${totalReportCharge.toFixed(2)}</td>
              </tr>`;
    }

    /* Discount - Removed */

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
                          <div
                            class="table-footer-area"
                            style="display: table; width: 100%; table-layout: fixed; margin-top: 8px; page-break-inside: avoid;">
                            <div style="display: table-cell; width: 68%; vertical-align: top; padding-right: 12px;">
                                ${metalHtml}
                                <div style="display: block; width: 100%; margin-top: 8px;">`;
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
                                    <td style="width: 28%; padding: 3px 20px 3px 0;"><input type="text" value="${saleData.due_date}" style="display: block; width: 100%; box-sizing: border-box; font-size: 12px; padding: 2px 4px;"></td>
                                    <td style="width: 22%; font-size: 12px; font-weight: 400; padding: 3px 6px 3px 0; white-space: nowrap;">Settlement Date :</td>
                                    <td style="width: 28%; padding: 3px 0;"><input type="text" value="${saleData.settlement_date}" style="display: block; width: 100%; box-sizing: border-box; font-size: 12px; padding: 2px 4px;"></td>
                                  </tr>
                                </table>
                            </div>
                <div style="display: table-cell; width: 32%; vertical-align: top;">
                  <table cellspacing="0" cellpadding="0" align="right" width="100%" style="border-collapse: collapse; table-layout: fixed;">`;
  const amtRow = (label, value, bold = false) =>
    `<tr>
      <td style="width: 54%; font-size: 12px; font-weight: ${bold ? "600" : "400"}; text-align: right; padding: 3px 6px 3px 0; white-space: nowrap;">${label}</td>
      <td style="width: 46%; padding: 3px 0;"><input type="text" value="${value}" style="display: block; width: 100%; box-sizing: border-box; font-size: 12px; font-weight: ${bold ? "600" : "400"}; text-align: right; padding: 2px 4px;"></td>
    </tr>`;
  html += amtRow("Total", saleData.taxable_amount, true);
  if (saleData.is_same_state_trnx && saleData.cgst_tax) {
    html += amtRow("CGST Amt", saleData.cgst_tax_display);
  }
  if (saleData.is_same_state_trnx && saleData.sgst_tax) {
    html += amtRow("SGST Amt", saleData.sgst_tax_display);
  }
  if (!saleData.is_same_state_trnx && saleData.igst_tax) {
    html += amtRow("IGST Amt", saleData.igst_tax_display);
  }
  html += amtRow("Sub Total", saleData.total_amount);
  html += amtRow("Cash Dist", saleData.discount);
  html += amtRow("Total Payable", saleData.bill_amount, true);
  html += amtRow("Paid Amount", saleData.paid_amount);
  if (saleData.return_amount) {
    html += amtRow(
      "Return Amount",
      saleData.return_amount ? saleData.return_amount : "0.00",
    );
  }
  html += amtRow("Rest Due Amt", saleData.due_amount_display);
  html += `</table>
                            </div>
                          </div>
                          <div style="border-top: 2px solid #90caf9; margin-top: 6px; padding-top: 6px;">
                            <h5 style="margin: 0; font-size: 12px; font-weight: 700; color: #1E2746;">NOTE</h5>
                            <ul style="margin: 4px 0 0 0; padding: 0 0 0 18px; list-style: disc; font-size: 11px; font-weight: 400; color: #000;">
                              <li style="margin: 1px 0;">Goods once sold will be taken back with condition</li>
                              <li style="margin: 1px 0;">Returning minimum product value of Rs 5000/- above</li>
                              <li style="margin: 1px 0;">Returning product taken back Less than 20-30% of my billing amount</li>
                              <li style="margin: 1px 0;">If any Damage charge as per making cost only</li>
                              <li style="margin: 1px 0;">No Charges taken on Sale product returning within 7 days from bill date</li>
                              <li style="margin: 1px 0;">All disputes are subject to Patna Jurisdiction only</li>
                              <li style="margin: 1px 0;">Charges may be appling cancel of order product making only</li>
                            </ul>
                            ${saleData.notes && saleData.notes.trim() ? `<div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid #ccc; font-size: 11px;"><span style="font-weight: 600;">Notes: </span><span style="font-weight: 400;">${saleData.notes}</span></div>` : ""}
                          </div>
                        </td>
                    </tr>
                </tbody>
              </table>
          </div>
      </body>
  </html>
  `;

  try {
    let file_path = "public/invoices/" + saleData.invoice_number + "_info.pdf";
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
            file_name: saleData.invoice_number + "_info.pdf",
            url: `${getFileAbsulatePathPDF(file_path)}?v=${Date.now()}`,
            html,
            sale,
            saleData,
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
  let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
  let sale = await SaleModel.findOne({
    where: { id: req.params.id, sale_by: userID },
    include: [
      {
        model: SaleProductModel,
        as: "saleProducts",
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
        as: "user",
      },
      {
        model: UserModel,
        as: "saleBy",
      },
    ],
  });
  if (!sale) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Sale not found"));
  }
  let saleData = SaleCollection(sale);

  let payments = await PaymentModel.findAll({
    where: {
      table_type: "sale",
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
  const cwd = process.cwd();
  // const logoUrl = `file://${cwd}/public/images/logo.png`;
  const logoUrl = `public/images/logo.png`;
  // const logoUrl = process.env.BASE_URL + "public/images/logo.png";

  const bitmap = fs.readFileSync(logoUrl);
  const logo = bitmap.toString("base64");

  let footerhtml = `
              <div class="invoice" style="width: 96%; margin: 0px; background-color: #f9f9f9; border-top: 2px solid #000; padding-top: 6px;">
                  <table cellpadding="0" cellspacing="1"  style="margin:auto; width:100%" >
                      <tbody>
                          <tr>
                              <td><table cellspacing="0" cellpadding="0"
                                    border="0"
                                    align="center" width="90%">
                                    <div style="display: table; width:
                                        100%; font-size: 11px;">
                                        <div style="display: table-cell;
                                            width: 65%;">
                                            <ul style="margin: 0;
                                                padding: 0px;
                                                list-style: none;">
                                            </ul>
                                        </div>
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
                                            ${saleData.notes ? `<div style="display: flex; flex-direction: column; margin-top: 8px;"><span style="font-size: 11px; font-weight: 600;">Notes:</span><span style="font-size: 11px; font-weight: 400;">${saleData.notes}</span></div>` : ""}
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
  for (let i = 0; i < saleData.products.length; i++) {
    totalSave += saleData.products[i].total_discount;
    totalTagPrice += saleData.products[i].subtotal_price;
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
            <div class="invoice" style="width: 96%; margin: 15px;  background-color: #f9f9f9;">
                <table cellpadding="0" cellspacing="0" width="100%">
                    <tbody>
                        <tr>
                            <td>
                                <table cellspacing="0" cellpadding="0" border="0"
                                    align="center" width="100%">
                                    <h1 style="font-size: 14px; text-align:
                                        center; margin-bottom: 5px; font-weight:
                                        300;">SALE LIST INVOICE</h1>
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
                                                P210 Strand Bank Road Brabzar
                                                Kolkata 700 011</h3>
    
                                        </div>
                                        <div style="width: 35%; display: table-cell;
                                            vertical-align: middle; text-align:
                                            left;">
                                            <h3 style="margin: 0;">
                                                <span style="font-size: 16px;
                                                    font-weight: 600;">Prakriti Head Office</span></h3>
                                            <h3 style="margin: 0; font-weight: 400;
                                                font-size: 14px;">GST No -
                                                <span style="font-weight: 600;">19ABAFR4515L1ZZ</span></h3>
                                            <h3 style="margin: 0; font-weight: 400;
                                                font-size: 12px;">User Id - <span>${saleData.sale_by_name}</span></h3>
                                            <h3 style="margin: 0; font-weight: 400;
                                                font-size: 12px;">Address - Belur Kolkatta Patna Bihar 711 202</h3>
                                            <h3 style="font-weight: 600; font-size:
                                                12px; margin: 0;">
                                                support@Prakriti.one, +91 9117799755
                                            </h3>
                                        </div>
                                    </div>
                                </table>
                                <table cellspacing="0" cellpadding="0" border="0"
                                    align="center" width="100%">
                                    <tbody>
                                        <tr>
                                            <hr style="border: 1px solid #1E2757; width:97%">
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
                                        </tr>-->
                                    </thead> 
                                        <tbody>
                                            <!-- <tr style="background-color: #fff;">
                                            <td style="">
                                                <span style="font-weight: 600;"> GST
                                                    IN ${saleData.user_details.gst} </span>
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
                                                                    0;">${saleData.user_details.company_name}</span></li>
                                                            <li><span
                                                                    style="font-weight:
                                                                    400; font-size:
                                                                    12px; margin:
                                                                    0;">GST IN</span>
                                                                <span
                                                                    style="font-weight:
                                                                    600; font-size:
                                                                    12px; margin:
                                                                    0;">${saleData.user_details.gst}</span></li>
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
                                                                    0;">${saleData.user_mobile}</span></li>
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
                                                                    0;">${saleData.invoice_date}</span></li>
                                                                    
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
                                                                    0;">${saleData.user_details.address}</span></li>
                                                            <li><span
                                                                    style="font-weight:
                                                                    400; font-size:
                                                                    12px; margin:
                                                                    0;">City -</span>
                                                                <span
                                                                    style="font-weight:
                                                                    500; font-size:
                                                                    12px; margin:
                                                                    0;">${saleData.user_details.city}</span></li>
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
                                                                    0;">${saleData.user_details.pincode}</span></li>
                                                            <li><span
                                                                    style="font-weight:
                                                                    400; font-size:
                                                                    12px; margin:
                                                                    0;">Invoice No -
                                                                </span> <span
                                                                    style="font-weight:
                                                                    600; font-size:
                                                                    12px; margin:
                                                                    0;">${saleData.invoice_number}</span></li>
                                                        </ul>
                                                        <!--ul style="margin: 0;
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
                                                                    0;">${saleData.user_details.city}</span></li>
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
                                                                    0;">${saleData.user_details.pincode}</span></li>
                                                                    </ul-->
                                                    </div>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                
                                    <table cellspacing="0" cellpadding="5"  style="margin-top:10px"
                                        border="0"
                                        align="center" width="100%">
                                        <thead style="">
                                            <tr style="background-color: #000000;">
                                                <th style="text-align: left; color:
                                                    #fff; border: 1px solid #000000;
                                                    font-size: 12px; font-weight:
                                                    400; width: 25px;">#</th>
                                                <th style="text-align: left; color:
                                                    #fff; font-size: 12px;
                                                    font-weight: 100; width:
                                                    125px;">Product Name</th>
                                                <th style="text-align: left; color:
                                                    #fff; font-size: 12px;
                                                    font-weight: 400; width: 50px;">Size</th>
                                                <th style="text-align: left; color:
                                                    #fff; font-size: 12px;
                                                    font-weight: 400; width: 90px;">Product Id</th>
                                                <th style="text-align: left; color:
                                                    #fff; font-size: 12px;
                                                    font-weight: 400;width: 40px;">Mtrl</th>
                                                <th style="text-align: left; color:
                                                  #fff; font-size: 12px;
                                                  font-weight: 400; width: 130px">Making Etc</th>
                                                <th style="text-align: left; color:
                                                    #fff; font-size: 12px;
                                                    font-weight: 400;width: 90px;">Tag Price</th>
                                                <th style="text-align: left; color:
                                                    #fff; font-size: 12px;
                                                    font-weight: 400;width: 90px;">Dist Amt</th>
                                                <th style="text-align: left; color:
                                                    #fff; font-size: 12px;
                                                    font-weight: 400;width: 90px;">Sub-Tot</th>
                                                <th style="text-align: left; color:
                                                    #fff; font-size: 12px;
                                                    font-weight: 400;width: 40px;">Tax%</th>
                                                <th style="text-align: left; color:
                                                    #fff; font-size: 12px;
                                                    font-weight: 400;width: 50px;">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>`;
  for (let i = 0; i < saleData.products.length; i++) {
    let bgTrColor = i % 2 == 0 ? "#1E2757" : "#1E2757";
    html += `<tr style="background-color: ${bgTrColor}; color:#FFFFFF;">
                                                <td style="text-align: left;
                                                    font-size: 11px;
                                                    font-weight: 400; width: 25px;">
                                                    ${i < 10 ? "0" + (i + 1) : i + 1}
                                                </td>
                                                <td style="text-align: left;
                                                    font-size: 11px;
                                                    font-weight: 400;font-size: 10px; width:125px;">
                                                    ${
                                                      saleData.products[i]
                                                        .product_name
                                                    } - ${
                                                      saleData.products[i]
                                                        .product_code
                                                        ? saleData.products[i]
                                                            .product_code
                                                        : ""
                                                    }
                                                </td>
                                                <td style="text-align: left;
                                                    font-size: 11px;
                                                    font-weight: 400; width: 60px; ">
                                                    ${
                                                      saleData.products[i]
                                                        .size_name
                                                    }
                                                </td>
                                                <td style="text-align:
                                                      left; font-size: 11px;
                                                      font-weight: 400; width: 90px;">
                                                      ${
                                                        saleData.products[i]
                                                          .certificate_no
                                                      }
                                                </td>
                                                <td colspan="7" style="text-align:
                                                      left; font-size: 11px;
                                                      font-weight: 400;">Gross Weight-
                                                      ${
                                                        saleData.products[i]
                                                          .total_weight
                                                      }
                                                </td>
    
                                            </tr>
                                            <tr style="vertical-align: top; background-color: #FFFFFF;">
                                                <td colspan="2" style="border-bottom: 1px solid #1E2757; padding:0;">
                                                    
                                            `;
    for (let x = 0; x < saleData.products[i].materials.length; x++) {
      saleData.products[i].materials[x].amount == "₹0.00"
        ? null
        : (html += `<div style="display: flex;
                                                    margin: 5px 5px 0px 5px; text-align: left; width:150px;">
                                                    <div style="
                                                        line-height:1; text-align: left;">
                                                        <span
                                                            style="
                                                            font-size:10px;
                                                            font-weight:400;">${saleData.products[i].materials[x].material_name} ${saleData.products[i].materials[x].pakka_weight ? removeCurrencyAndDecimalFromPrice(saleData.products[i].materials[x].pakka_weight) : removeCurrencyAndDecimalFromPrice(saleData.products[i].materials[x].weight)} ${saleData.products[i].materials[x].unit_name} x ${removeCurrencyAndDecimalFromPrice(saleData.products[i].materials[x].rate)}
                                                        </span>
                                                        <!-- span
                                                            style="
                                                            font-size:10px;
                                                            font-weight:400;"> = ${saleData.products[i].materials[x].amount}</span -->
                                                    </div>
  
                                                    <!--div
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
                                                            400;"> = ${saleData.products[i].materials[x].amount}</span>
                                                    </div-->
  
                                                </div>`);
    }
    html += `
                                                </td>
                                                <td style="border-bottom:1px solid #1E2757;">`;
    for (let x = 0; x < saleData.products[i].materials.length; x++) {
      saleData.products[i].materials[x].amount == "₹0.00"
        ? null
        : (html += `<div style="display: flex;
                                                        width:50px;
                                                        margin: 0px 5px 0px 0px; text-align: left;">
                                                        <div style="
                                                            line-height:1; text-align: left;">
                                                            <span
                                                                style="
                                                                font-size:10px;
                                                                font-weight:400;"> = ${removeCurrencyAndDecimalFromPrice(saleData.products[i].materials[x].amount)}</span>
                                                        </div>
                                                    </div>`);
    }
    html += `
                                                </td>
                                                <td style="border-bottom:1px solid #1E2757;">`;
    for (let x = 0; x < saleData.products[i].materials.length; x++) {
      html += `<div style="width:90px;">`;
      if (isEmpty(saleData.products[i].materials[x].discount_amount)) {
        saleData.products[i].materials[x].amount == "₹0.00"
          ? null
          : (html += `-`);
      } else {
        html += `<span style="text-align:left; font-size:10px;font-weight:400;">
                                                    Disc@${removeBlankZero(removeCurrencyAndDecimalFromPrice(saleData.products[i].materials[x].discount_percent))}% ${removeCurrencyAndDecimalFromPrice(saleData.products[i].materials[x].discount_amount_display)}
                                                  </span> 
                                                  <!--<span style="text-align:left; font-size:10px; font-weight:400;">${saleData.products[i].materials[x].discount_amount_display}</span>-->`;
      }
      html += `</div>`;
    }
    html += `
                                                </td>
                                                <td style="border-bottom: 1px solid #1E2757;">`;
    for (let x = 0; x < saleData.products[i].materials.length; x++) {
      saleData.products[i].materials[x].amount == "₹0.00"
        ? null
        : (html += `<div style="text-align: left; font-size: 10px; font-weight: 400;
                                                        margin-top: 5px; 
                                                        width: 40px
                                                        line-height:1;">${removeCurrencyAndDecimalFromPrice(saleData.products[i].materials[x].material_cost)}</div>`);
    }
    html += `
                                                </td>
                                                <td style="text-align: left;
                                                    padding-top: 10px;
                                                    font-size: 10px;
                                                    font-weight: 400;
                                                    width: 130px;
                                                    border-bottom: 1px solid
                                                    #1E2757;">
                                                    ${removeCurrencyAndDecimalFromPrice(saleData.products[i].making_charge)}@${removeBlankZero(removeCurrencyAndDecimalFromPrice(saleData.products[i].making_charge_discount))}%=${removeBlankZero(removeCurrencyAndDecimalFromPrice(saleData.products[i].total_making_charge_discount))}
                                                </td>
  
                                                <td style="text-align:left;
                                                    padding-top: 10px;
                                                    font-size: 10px;
                                                    font-weight: 600;
                                                    width: 70px;
                                                    border-bottom: 1px solid
                                                    #1E2757;">
                                                    ${removeCurrencyAndDecimalFromPrice(saleData.products[i].sub_price)}
                                                </td>
                                                <td style="text-align:left;
                                                    padding-top: 10px;
                                                    font-size: 10px;
                                                    font-weight: 600;
                                                    width: 70px;
                                                    border-bottom: 1px solid
                                                    #1E2757;">
                                                    ${removeCurrencyAndDecimalFromPrice(saleData.products[i].total_discount_display)}
                                                </td>
                                                <td style="text-align:left;
                                                    padding-top: 10px;
                                                    font-size: 10px;
                                                    font-weight: 400;
                                                    width: 70px;
                                                    border-bottom: 1px solid
                                                    #1E2757;">
                                                    ${removeCurrencyAndDecimalFromPrice(saleData.products[i].sub_total)}
                                                </td>
                                                <td style="text-align:left;
                                                    padding-top: 10px;
                                                    font-size: 10px;
                                                    font-weight: 400;
                                                    width: 40px;
                                                    border-bottom: 1px solid
                                                    #1E2757;">
                                                    ${removeCurrencyAndDecimalFromPrice(saleData.products[i].tax)}
                                                </td>
                                                <td style="text-align:left;
                                                    padding-top: 10px;
                                                    font-size: 10px;
                                                    font-weight: 600;
                                                    width: 50px;
                                                    border-bottom: 1px solid
                                                    #1E2757;">
                                                    ${removeCurrencyAndDecimalFromPrice(saleData.products[i].total_display)}
                                                </td>
  
                                            </tr>`;
  }
  html += `<tr style="
                                                vertical-align: top;">
                                                <td colspan="6"
                                                    style="
                                                    border:none;">
  
                                                </td>
                                                <td style="">
                                                    <div style="padding-top:5px;">
                                                        <h4 style="margin:
                                                            0;
                                                            text-align:
                                                            left; font-size:
                                                            12px;
                                                            font-weight:
                                                            600; display:
                                                            ;">
                                                            <div>${removeCurrencyAndDecimalFromPrice(totalTagPriceDisplay)}</div></h4>
                                                    </div>
                                                </td>
                                                
                                                <td style="">
                                                    <div style="padding-top:5px;">
                                                        <h4 style="margin:
                                                            0;
                                                            text-align:
                                                            left; font-size:
                                                            12px;
                                                            font-weight:
                                                            600; display:
                                                            ;">
                                                            <div>${removeCurrencyAndDecimalFromPrice(totalSaveDisplay)}</div></h4>
                                                    </div>
                                                </td>
                                                <td colspan="3">
                                                    <div style="float:left; margin-left: -15px; padding-top:5px;">
                                                        <h4 style="
                                                        margin:0;
                                                        text-align: right;
                                                        font-size: 12px;
                                                        font-weight: 400;
                                                        ">
                                                            <div>Sub-Total </div></h4>
                                                    </div>
                                                    <div style="float:left; margin-left:5px;">
                                                        <h4 style="
                                                          margin:0;
                                                          text-align:right;
                                                          font-size: 12px;
                                                          font-weight: 400;
                                                        ">
                                                            <div><input
                                                                type="text"
                                                                value="${removeCurrencyAndDecimalFromPrice(saleData?.taxable_amount)}"
                                                                style="width:
                                                                80px;"></div></h4>
                                                    </div>
                                                </td>
                                            </tr>`;

  if (saleData.is_same_state_trnx) {
    html += `                                 <tr style="
                                              vertical-align: top;">
                                              <td colspan="8"
                                                  style="
                                                  border:none; padding: 0;">
                                              </td>
                                              <td colspan="3">
                                                  <div style="float:left; margin-left: -15px; padding-top:5px;">
                                                      <h4 style="
                                                      margin:0;
                                                      text-align: right;
                                                      font-size: 12px;
                                                      font-weight: 400;
                                                      ">
                                                          <div>CGST Amt </div></h4>
                                                  </div>
                                                  <div style="float:left; margin-left:5px;">
                                                      <h4 style="
                                                        margin:0;
                                                        text-align:right;
                                                        font-size: 12px;
                                                        font-weight: 400;
                                                      ">
                                                          <div><input
                                                              type="text"
                                                              value="${removeCurrencyAndDecimalFromPrice(saleData?.cgst_tax)}"
                                                              style="width:
                                                              80px;"></div></h4>
                                                  </div>
                                              </td>
                                            </tr>
                                            <tr style="
                                              vertical-align: top;">
                                              <td colspan="8"
                                                  style="
                                                  border:none; padding: 0;">
                                              </td>
                                              <td colspan="3">
                                                  <div style="float:left; margin-left: -15px; padding-top:5px;">
                                                      <h4 style="
                                                      margin:0;
                                                      text-align: right;
                                                      font-size: 12px;
                                                      font-weight: 400;
                                                      ">
                                                          <div>SGST Amt </div></h4>
                                                  </div>
                                                  <div style="float:left; margin-left:5px;">
                                                      <h4 style="
                                                        margin:0;
                                                        text-align:right;
                                                        font-size: 12px;
                                                        font-weight: 400;
                                                      ">
                                                          <div><input
                                                              type="text"
                                                              value="${removeCurrencyAndDecimalFromPrice(saleData?.sgst_tax)}"
                                                              style="width:
                                                              80px;"></div></h4>
                                                  </div>
                                              </td>
                                            </tr>`;
  } else {
    html += `                                 <tr style="
                                              vertical-align: top;">
                                              <td colspan="8"
                                                  style="
                                                  border:none; padding: 0;">
                                              </td>
                                              <td colspan="3">
                                                  <div style="float:left; margin-left: -15px; padding-top:5px;">
                                                      <h4 style="
                                                      margin:0;
                                                      text-align: right;
                                                      font-size: 12px;
                                                      font-weight: 400;
                                                      ">
                                                          <div>IGST Amt </div></h4>
                                                  </div>
                                                  <div style="float:left; margin-left:5px;">
                                                      <h4 style="
                                                        margin:0;
                                                        text-align:right;
                                                        font-size: 12px;
                                                        font-weight: 400;
                                                      ">
                                                          <div><input
                                                              type="text"
                                                              value="${removeCurrencyAndDecimalFromPrice(saleData?.igst_tax)}"
                                                              style="width:
                                                              80px;"></div></h4>
                                                  </div>
                                              </td>
                                            </tr>`;
  }

  html += `                                 <tr style="
                                              vertical-align: top;">
                                              <td colspan="8"
                                                  style="
                                                  border:none; padding: 0;">
                                              </td>
                                              <td colspan="3">
                                                  <div style="float:left; margin-left: -15px; padding-top:5px;">
                                                      <h4 style="
                                                      margin:0;
                                                      text-align: right;
                                                      font-size: 12px;
                                                      font-weight: 400;
                                                      ">
                                                          <div>Total Amt </div></h4>
                                                  </div>
                                                  <div style="float:left; margin-left:5px;">
                                                      <h4 style="
                                                        margin:0;
                                                        text-align:right;
                                                        font-size: 12px;
                                                        font-weight: 400;
                                                      ">
                                                          <div><input
                                                              type="text"
                                                              value="${removeCurrencyAndDecimalFromPrice(saleData?.total_amount)}"
                                                              style="width:
                                                              80px;"></div></h4>
                                                  </div>
                                              </td>
                                          </tr>
                                          <tr style="
                                              vertical-align: top;">
                                              <td colspan="8"
                                                  style="
                                                  border:none; padding: 0;">
                                              </td>
                                              <td colspan="3">
                                                  <div style="float:left; margin-left: -15px; padding-top:5px;">
                                                      <h4 style="
                                                      margin:0;
                                                      text-align: right;
                                                      font-size: 12px;
                                                      font-weight: 400;
                                                      ">
                                                          <div>Cash Dist </div></h4>
                                                  </div>
                                                  <div style="float:left; margin-left:5px;">
                                                      <h4 style="
                                                        margin:0;
                                                        text-align:right;
                                                        font-size: 12px;
                                                        font-weight: 400;
                                                      ">
                                                          <div><input
                                                              type="text"
                                                              value="${removeCurrencyAndDecimalFromPrice(saleData?.discount)}"
                                                              style="width:
                                                              80px;"></div></h4>
                                                  </div>
                                              </td>
                                          </tr>
                                          <tr style="
                                              vertical-align: top;">
                                              <td colspan="8"
                                                  style="
                                                  border:none; padding: 0;">
                                              </td>
                                              <td colspan="3">
                                                  <div style="float:left; margin-left: -38px; padding-top:5px;">
                                                      <h4 style="
                                                      margin:0;
                                                      text-align: right;
                                                      font-size: 12px;
                                                      font-weight: 400;
                                                      ">
                                                          <div>Total Payable </div></h4>
                                                  </div>
                                                  <div style="float:left; margin-left:5px;">
                                                      <h4 style="
                                                        margin:0;
                                                        text-align:right;
                                                        font-size: 12px;
                                                        font-weight: 400;
                                                      ">
                                                          <div><input
                                                              type="text"
                                                              value="${removeCurrencyAndDecimalFromPrice(saleData?.total_payable)}"
                                                              style="width:
                                                              80px;"></div></h4>
                                                  </div>
                                              </td>
                                          </tr>
                                          <tr style="
                                              vertical-align: top;">
                                              <td colspan="8"
                                                  style="
                                                  border:none; padding: 0;">
                                              </td>
                                              <td colspan="3">
                                                  <div style="float:left; margin-left: -48px; padding-top:5px;">
                                                      <h4 style="
                                                      margin:0;
                                                      text-align: right;
                                                      font-size: 12px;
                                                      font-weight: 400;
                                                      ">
                                                          <div>Payment Mode </div></h4>
                                                  </div>
                                                  <div style="float:left; margin-left:5px;">
                                                      <h4 style="
                                                        margin:0;
                                                        text-align:right;
                                                        font-size: 12px;
                                                        font-weight: 400;
                                                      ">
                                                          <div><input
                                                              type="text"
                                                              value="${saleData?.payment_mode}"
                                                              style="width:
                                                              80px;"></div></h4>
                                                  </div>
                                              </td>
                                          </tr>
                                          <tr style="
                                              vertical-align: top;">
                                              <td colspan="8"
                                                  style="
                                                  border:none; padding: 0;">
                                                  <div style="float:left; ">
                                                      <h4 style="
                                                        margin:0;
                                                        text-align:left;
                                                        font-size: 12px;
                                                        font-weight: 400;
                                                      ">
                                                          <div><input
                                                              type="text"
                                                              value="${saleData?.due_date}"
                                                              style="width:
                                                              120px;"></div></h4>
                                                  </div>
                                                  <div style="float:left; margin-left:5px; padding-top:5px;">
                                                      <h4 style="
                                                      margin:0;
                                                      text-align: left;
                                                      font-size: 12px;
                                                      font-weight: 400;
                                                      ">
                                                          <div>Due Date </div></h4>
                                                  </div>
                                              </td>
                                              <td colspan="3">
                                                  <div style="float:left; margin-left: -35px; padding-top:5px;">
                                                      <h4 style="
                                                      margin:0;
                                                      text-align: right;
                                                      font-size: 12px;
                                                      font-weight: 400;
                                                      ">
                                                          <div>Paid Amount </div></h4>
                                                  </div>
                                                  <div style="float:left; margin-left:5px;">
                                                      <h4 style="
                                                        margin:0;
                                                        text-align:right;
                                                        font-size: 12px;
                                                        font-weight: 400;
                                                      ">
                                                          <div><input
                                                              type="text"
                                                              value="${removeCurrencyAndDecimalFromPrice(saleData?.paid_amount_display)}"
                                                              style="width:
                                                              80px;"></div></h4>
                                                  </div>
                                              </td>
                                          </tr>
                                          <tr style="
                                              vertical-align: top;">
                                              <td colspan="8"
                                                  style="
                                                  border:none; padding-top: 5px;">
                                                  <div style="float:left; margin-left:-5px;">
                                                      <h4 style="
                                                        margin:0;
                                                        text-align:left;
                                                        font-size: 12px;
                                                        font-weight: 400;
                                                      ">
                                                          <div><input
                                                              type="text"
                                                              value=""
                                                              style="width:
                                                              120px;"></div></h4>
                                                  </div>
                                                  <div style="float:left; margin-left:5px; padding-top:5px;">
                                                      <h4 style="
                                                      margin:0;
                                                      text-align: left;
                                                      font-size: 12px;
                                                      font-weight: 400;
                                                      ">
                                                          <div>Settlement Date </div></h4>
                                                  </div>
                                              </td>
                                              <td colspan="3">
                                                  <div style="float:left; margin-left: -65px; padding-top:5px;">
                                                      <h4 style="
                                                      margin:0;
                                                      text-align: right;
                                                      font-size: 12px;
                                                      font-weight: 400;
                                                      ">
                                                          <div>Rest Due Amount </div></h4>
                                                  </div>
                                                  <div style="float:left; margin-left:5px;">
                                                      <h4 style="
                                                        margin:0;
                                                        text-align:right;
                                                        font-size: 12px;
                                                        font-weight: 400;
                                                      ">
                                                          <div><input
                                                              type="text"
                                                              value="${removeCurrencyAndDecimalFromPrice(saleData?.due_amount_display)}"
                                                              style="width:
                                                              80px;"></div></h4>
                                                  </div>
                                              </td>
                                          </tr>`;

  html += ` <tr style="
                                                      vertical-align: top;">
                                                      
                                                      <td colspan="11"
                                                            style="
                                                            border:none; padding: 0;">
                                                            ${footerhtml}
                                                        </td>
                                                        
    
                                                    </tr>
                                                </tbody>
                                            </table>
  
                                            
                                            <!-- Footer -->
                                            
                                            
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
                                                  <div style="display: table-cell;
                                                      width: 65%;">
                                                      <h5 style="margin: 0px;
                                                          font-size: 8px;
                                                          font-weight:
                                                          600; text-transform:
                                                          uppercase;">NOTE</h5>
                                                      <ul style="margin: 0;
                                                          padding: 0px;
                                                          list-style: none;">
                                                          <span style="margin: 0;
                                                              text-align: left;
                                                              font-size: 7px;
                                                              font-weight: 400; ">*
                                                              Goods once sold will
                                                              be taken back with
                                                              condition</span>
  
                                                          <li style="margin: 0;
                                                              text-align: left;
                                                              font-size: 7px;
                                                              font-weight: 400;
                                                              list-style-type:
                                                              disc; margin-left:
                                                              35px;">Returning
                                                              minimum product
                                                              value of Rs 5000/-
                                                              above</li>
                                                          <li style="margin: 0;
                                                              text-align: left;
                                                              font-size: 7px;
                                                              font-weight: 400;
                                                              list-style-type:
                                                              disc; margin-left:
                                                              35px;">Returning
                                                              product taken back
                                                              Less than 20-30% of
                                                              my billing amount</li>
                                                          <li style="margin: 0;
                                                              text-align: left;
                                                              font-size: 7px;
                                                              font-weight: 400;
                                                              list-style-type:
                                                              disc; margin-left:
                                                              35px;">If any Damage
                                                              charge as per making
                                                              cost only</li>
                                                          <li style="margin: 0;
                                                              text-align: left;
                                                              font-size: 7px;
                                                              font-weight: 400;
                                                              list-style-type:
                                                              disc; margin-left:
                                                              35px;">No Charges
                                                              taken on Sale
                                                              product returning
                                                              within 7 days from
                                                              bill date</li>
                                                          <li style="margin: 0;
                                                              text-align: left;
                                                              font-size: 7px;
                                                              font-weight: 400;
                                                              list-style-type:
                                                              disc; margin-left:
                                                              35px;">All disputes
                                                              are subject to Patna
                                                              Juridiction only</li>
                                                          <li style="margin: 0;
                                                              text-align: left;
                                                              font-size: 7px;
                                                              font-weight: 400;
                                                              list-style-type:
                                                              disc; margin-left:
                                                              35px;">Charges may
                                                              be appling cancel of
                                                              order product making
                                                              only</li>
  
                                                      </ul>
                                                  </div>
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
                                                      <div style="margin-top:5px">
                                                          <p style="font-size:
                                                              8px; margin: 0;
                                                              line-height: 1.2; ">
                                                              Company Name - ${saleData.user_details.company_name}</p>
                                                          <p style="font-size:
                                                              8px; margin: 0;
                                                              line-height: 1.2; ">
                                                              ${saleData.user_details.company_name},<br/>
                                                               Ac. No - ${saleData.user_details.bank_account_no}</p>
                                                          <p style="font-size:
                                                              8px; margin: 0;
                                                              line-height: 1.2; ">
                                                              IFSC Code -
                                                              ${saleData.user_details.bank_ifsc}</p>
                                                      </div>
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

  let file_path = "public/invoices/"+saleData.invoice_number+".pdf";

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
      file_name: saleData.invoice_number+".pdf",
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
    let file_path = "public/invoices/" + saleData.invoice_number + ".pdf";
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
    let file_path = "public/invoices/" + saleData.invoice_number + "_lists.pdf";
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
            file_name: saleData.invoice_number + "_lists.pdf",
            url: getFileAbsulatePathPDF(file_path),
            html: html,
            saleData,
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
                  file_name: saleData.invoice_number + ".pdf",
                  url: getFileAbsulatePath(file_path),
                  saleData,
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
