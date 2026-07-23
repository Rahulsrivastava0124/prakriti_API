const config = require("@config/auth.config");
const {
  errorCodes,
  formatErrorResponse,
  formatResponse,
} = require("@utils/response.config");
const db = require("@models");
const moment = require("moment");
const { base64FileUpload, removeFile } = require("@helpers/upload");
const {
  isEmpty,
  getDateFromToWhere,
  priceFormat,
  getFileAbsulatePath,
  getFileAbsulatePathPDF,
  addLog,
  displayAmount,
  weightFormat,
  convertUnitToGram,
  arrayColumn,
  removeBlankZero,
  formatDateTime,
  encodeForStorage,
  decodeFromStorage,
  cleanInput,
} = require("@helpers/helper");
const {
  updateOrCreate,
  removeMaterialFromStock,
  getWorkingUserID,
  isSuperAdmin,
  getSuperAdminId,
  updateWalletRemainingBalance,
  isDistributor,
  isSalesExecutive,
  sendNotification,
  isRetailer,
  getRoleId,
  insertVisit,
  isManager,
  getDistributorAdmin,
  isAdmin,
  getWalletBalance,
  getOwnUserSaleProducts,
  getUserColumnValue,
  avlStockUserIdsNew,
} = require("@library/common");
const { getPaginationOptions } = require("@helpers/paginator");
const { SaleCollection } = require("@resources/superadmin/SaleCollection");
const {
  SaleListCollection,
} = require("@resources/superadmin/SaleListCollection");
const {
  SaleEditCollection,
} = require("@resources/superadmin/SaleEditCollection");
const {
  PaymentCollection,
} = require("@resources/superadmin/PaymentCollection");
const {
  ReportChargeCollection,
} = require("@resources/superadmin/ReportChargeCollection");
const { PurityCollection } = require("@resources/superadmin/PurityCollection");
const { Op, json } = require("sequelize");
const sequelize = db.sequelize;
const ProductModel = db.products;
const UserModel = db.users;
const CategoryModel = db.categories;
const SubCategoryModel = db.sub_categories;
const PurityModel = db.purities;
const ReportChargeModel = db.report_charge;
const UnitModel = db.units;
const MaterialModel = db.materials;
const SizeModel = db.sizes;
const StockModel = db.stocks;
const StockMaterialModel = db.stock_materials;
const SaleModel = db.sales;
const SaleProductModel = db.sale_products;
const SaleProductMaterialModel = db.sale_product_materials;
const stockHistoryModel = db.stock_raw_material_histories;
const taxSlabModel = db.tax_slabs;
const paymentModel = db.payments;
const orderModel = db.orders;
const cartModel = db.carts;
const RoleModel = db.roles;
const cartMaterialsModel = db.cart_materials;
const PaymentModel = db.payments;
const PurchaseModel = db.purchases;
const PurchaseProductModel = db.purchase_products;
const PurchaseProductMaterialModel = db.purchase_product_materials;
const UserToUserModel = db.user_to_users;
const ReturnModel = db.returns;
const ReturnProductModel = db.return_products;
const ReturnProductMaterialModel = db.return_product_materials;
const NoticationModel = db.notifiactions;
const fs = require("fs");
const _ = require("lodash");

/* -------------- commented by Soumalya Nandy ------------ */
//const puppeteer = require("puppeteer");
/* -------------- commented by Soumalya Nandy ------------ */

const html_to_pdf = require("html-pdf-node");

const { updateAdvanceAmount } = require("../../library/common");
const orderProductModel = db.order_products;
const env = process.env.NODE_ENV;
/**
 * Retrieve all sales
 *
 * @param req
 * @param res
 */
exports.index = async (req, res) => {
  let {
    page,
    limit,
    user_id,
    search,
    date_from,
    date_to,
    status,
    is_assigned,
    is_approval,
    own_sale,
    is_own_sale,
  } = req.query;

  is_assigned = is_assigned === undefined ? false : true;
  is_approval = is_approval === undefined ? false : true;
  let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
  let conditions = { is_assigned: is_assigned, is_approval: is_approval };
  if (status !== undefined && status != "") {
    conditions.is_approved = status;
  }
  if (!isEmpty(user_id)) {
    conditions.user_id = user_id;
    if (isSuperAdmin(req) && isAdmin(req) && isDistributor(req)) {
      conditions.sale_by = userID;
    }
  } else {
    if (isSalesExecutive(req) && !isEmpty(search)) {
    } else {
      conditions.sale_by = userID;
    }
  }

  /* check get the selected user legs ids */
  const userIds = await avlStockUserIdsNew(req);
  compactLog("sale_by userIds for sale list:", userIds);
  if (userIds.length > 0 && is_approval) {
    conditions.sale_by = { [Op.in]: userIds };
  }

  if (!isEmpty(search)) {
    conditions.invoice_number = { [Op.like]: `%${search}%` };
  }

  if (is_own_sale == 1) {
    conditions.sale_by = userID;
  }

  if (own_sale == 1) {
    let ownUsers = await UserModel.findAll({
      attributes: ["id"],
      where: { own: true },
    });
    let ownUserIds = arrayColumn(ownUsers, "id");
    ownUserIds.push(userID);
    conditions.sale_by = { [Op.in]: ownUserIds };
  }

  const superAdminId = await getSuperAdminId();
  if (isSuperAdmin(req)) {
    conditions.sale_by = superAdminId;
    if (isEmpty(user_id)) {
      delete conditions.user_id;
    }
  } else if (!isEmpty(user_id) && Number(user_id) === Number(superAdminId)) {
    conditions.sale_by = superAdminId;
    delete conditions.user_id;
  }

  compactLog(
    "this the sales data in the sales controller111 =====",
    conditions,
  );
  conditions = {
    ...conditions,
    ...getDateFromToWhere(date_from, date_to, "invoice_date"),
  };

  compactLog(
    "this the sales data in the sales controller222 =====",
    conditions,
  );

  const paginatorOptions = getPaginationOptions(page, limit);

  SaleModel.findAndCountAll({
    order: [["id", "DESC"]],
    where: conditions,
    offset: paginatorOptions.offset,
    limit: paginatorOptions.limit,
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
      compactLog(
        "this the transfer 0 data in the sales controller =====",
        data.count,
      );

      let result = {
        items: await SaleListCollection(data.rows, userID),
        total: data.count,
      };
      res.send(formatResponse(result, "Sales List"));
    })
    .catch((err) => {
      res.status(errorCodes.default).send(formatErrorResponse(err));
    });
};

/**
 * Retrive purchase txn ledger
 */
exports.txnLedger = async (req, res) => {
  let {
    page,
    limit,
    user_id,
    search,
    date_from,
    date_to,
    status,
    is_assigned,
    is_approval,
  } = req.query;
  is_assigned = is_assigned === undefined ? false : true;
  is_approval = is_approval === undefined ? false : true;
  let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
  let conditions = {
    is_assigned: is_assigned,
  }; /* , is_approval: is_approval */
  if (status !== undefined && status != "") {
    conditions.is_approved = status;
  }
  conditions.sale_by = userID;
  if (!isEmpty(user_id)) {
    conditions.user_id = user_id;
  }
  if (
    !isEmpty(search) &&
    !(search.toLowerCase() == "sale" || search.toLowerCase() == "payment")
  ) {
    conditions[Op.or] = [
      { invoice_number: { [Op.like]: `%${search}%` } },
      { notes: { [Op.like]: `%${search}%` } },
      { bill_amount: { [Op.like]: `%${search}%` } },
      { payment_mode: { [Op.like]: `%${search}%` } },
    ];
  }
  conditions = {
    ...conditions,
    ...getDateFromToWhere(date_from, date_to, "invoice_date"),
  };
  const paginatorOptions = getPaginationOptions(page, limit);

  try {
    // Fetch all sales with their related payments
    const allSales = await SaleModel.findAll({
      include: [
        {
          model: PaymentModel,
          as: "payments",
          required: false,
          where:
            !isEmpty(search) &&
            !(
              search.toLowerCase() == "sale" ||
              search.toLowerCase() == "payment"
            )
              ? {
                  [Op.or]: [
                    { amount: { [Op.like]: `%${search}%` } },
                    { payment_mode: { [Op.like]: `%${search}%` } },
                    { notes: { [Op.like]: `%${search}%` } },
                  ],
                }
              : undefined,
        },
      ],
      where: conditions,
      order: [["invoice_date", "DESC"]],
      offset: paginatorOptions.offset,
      limit: paginatorOptions.limit,
    });

    // Flatten sales and payments into a single table structure
    let tableData = [];
    let c = 1;
    allSales.forEach((sale, index) => {
      let approve_status = "Pending";
      if (sale.is_approved == 1) {
        approve_status = "Accepted";
      } else if (sale.is_approved == 2) {
        approve_status = "Declined";
      } else if (sale.is_approved == 3) {
        approve_status = "On Approval";
      } else if (sale.is_approved == 4) {
        approve_status = "Transfer To Sale";
      }

      if (sale.status == "returned") {
        approve_status = "Returned";
      } else if (sale.status == "return_pending") {
        approve_status = "Return Pending";
      }

      // Add Purchase row
      tableData.push({
        index: c,
        id: sale.id,
        date: formatDateTime(sale.invoice_date, 8),
        txn_date: sale.invoice_date,
        invoice_number: sale.invoice_number,
        remarks: sale.notes || "-",
        purpose: "",
        bill_amount: displayAmount(sale.bill_amount),
        txn_amount: parseFloat(sale.bill_amount),
        payment_amount: null,
        pay_amount: null,
        payment_mode: sale.payment_mode || "-",
        type: "Sale",
        txn_type: "",
        is_approved: sale.is_approved,
        approve_status: approve_status,
        is_advance: 0,
      });
      c++;
      // Add related payment rows
      sale.payments.forEach((pay, idx) => {
        tableData.push({
          index: c,
          id: sale.id,
          date: formatDateTime(pay.payment_date, 8),
          txn_date: pay.payment_date,
          invoice_number: sale.invoice_number,
          remarks: pay.notes || "-",
          purpose: pay.purpose || "",
          bill_amount: null,
          payment_amount: displayAmount(pay.amount),
          pay_amount: pay.amount,
          txn_amount: parseFloat(pay.amount),
          payment_mode: pay.payment_mode,
          type: "Payment",
          txn_type: pay.type,
          is_approved: 1,
          approve_status: "Accepted",
          is_advance: pay.is_advance,
        });
        c++;
      });
    });

    //compactLog("before tableData: ", tableData);

    tableData.sort((a, b) => new Date(b.index) - new Date(a.index));
    // Sort transactions by txn_date descending
    tableData.sort((a, b) => new Date(b.txn_date) - new Date(a.txn_date));
    tableData.sort((a, b) => {
      /* compactLog(
        "----------a.invoice_number,b.invoice_number----------",
        a.invoice_number.split("").pop(),
        b.invoice_number.split("").pop(),
      ); */
      return (
        b.invoice_number.split("-").pop() - a.invoice_number.split("-").pop()
      );
    });

    if (
      !isEmpty(search) &&
      (search.toLowerCase() == "sale" || search.toLowerCase() == "payment")
    ) {
      tableData = tableData.filter(
        (table) => table.type.toLowerCase() == search.toLowerCase(),
      );
    }

    //compactLog("tableData: ", tableData);

    let temp_invoice_no = "";
    let temp_invoice_index = -1;
    let temp_balance = 0;
    for (let i = 0; i < tableData.length; i++) {
      let tx = tableData[i];

      if (temp_invoice_no == "") {
        temp_invoice_no = tx.invoice_number;
        temp_invoice_index = i;
      } else if (
        temp_invoice_no != "" &&
        temp_invoice_no != tx.invoice_number
      ) {
        tableData[temp_invoice_index].txn_amount = temp_balance;
        //tableData[temp_invoice_index].payment_amount = displayAmount(temp_balance);
        temp_invoice_no = tx.invoice_number;
        temp_invoice_index = i;
      }

      if (tx.type.toLowerCase() == "payment" && tx.txn_type == "credit") {
        //compactLog(`temp_balance : ${temp_balance}, credited txn_amount : ${tx.txn_amount}, balance : ${temp_balance - tx.txn_amount}`)
        temp_balance -= tx.txn_amount;
        temp_balance = temp_balance > 0 ? temp_balance : 0;
      } else if (tx.type.toLowerCase() == "sale" && tx.is_approved != 2) {
        temp_balance = tx.txn_amount;
      }
      //compactLog("temp_invoice_no : ", temp_invoice_no, "temp_balance : ", temp_balance);
    }

    //compactLog("after tableData: ", tableData);

    // Compute running balance (Due Amount)
    let runningBalance = 0;
    let tempAdvanceDebitInvoice_idx = -1;
    let hasAdvanceDebit = false;
    const passbook = tableData
      .reverse()
      .map((tx, index) => {
        if (
          tempAdvanceDebitInvoice_idx > -1 &&
          tempAdvanceDebitInvoice_idx + 1 != index
        ) {
          tempAdvanceDebitInvoice_idx = -1;
        }
        if (tx.txn_type == "" && tx.is_approved != 2) {
          runningBalance += tx.txn_amount;
        } else if (
          tx.type.toLowerCase() == "payment" &&
          tx.txn_type == "credit"
        ) {
          runningBalance -= tx.pay_amount;
        } else if (
          tx.txn_type == "credit" &&
          (tempAdvanceDebitInvoice_idx == -1 ||
            (tempAdvanceDebitInvoice_idx > -1 &&
              tempAdvanceDebitInvoice_idx + 1 != index))
        ) {
          runningBalance += tx.txn_amount;
        } else if (tx.txn_type == "debit" && tx.is_advance) {
          runningBalance -= tx.txn_amount;
          ((tempAdvanceDebitInvoice_idx = index), (hasAdvanceDebit = true));
        } else if (tx.txn_type == "debit") {
          runningBalance -= tx.txn_amount;
        }

        runningBalance = runningBalance > 0 ? runningBalance : 0;

        return {
          ...tx,
          txn_date: formatDateTime(tx.txn_date, 8),
          sl_no: index + 1,
          balance: displayAmount(runningBalance),
        };
      })
      .reverse();

    compactLog("passbook:", passbook);

    let result = {
      items: passbook,
      total: passbook.length,
    };
    res.send(formatResponse(result, "Sale Ledger List"));
  } catch (err) {
    console.error("Error:", err);
    res.status(errorCodes.default).send(formatErrorResponse(err));
  }
};

/**
 * Retrive purchase txn ledger pdf
 */
exports.downloadTxnLedger = async (req, res) => {
  let {
    page,
    limit,
    user_id,
    search,
    date_from,
    date_to,
    status,
    is_assigned,
    is_approval,
  } = req.query;
  is_assigned = is_assigned === undefined ? false : true;
  is_approval = is_approval === undefined ? false : true;
  let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
  let user = await UserModel.findByPk(userID);
  let conditions = {
    is_assigned: is_assigned,
  }; /* , is_approval: is_approval */
  if (status !== undefined && status != "") {
    conditions.is_approved = status;
  }
  conditions.sale_by = userID;

  if (!isEmpty(user_id)) {
    conditions.user_id = user_id;
  }
  if (
    !isEmpty(search) &&
    !(search.toLowerCase() == "sale" || search.toLowerCase() == "payment")
  ) {
    conditions[Op.or] = [
      { invoice_number: { [Op.like]: `%${search}%` } },
      { notes: { [Op.like]: `%${search}%` } },
      { bill_amount: { [Op.like]: `%${search}%` } },
      { payment_mode: { [Op.like]: `%${search}%` } },
    ];
  }
  conditions = {
    ...conditions,
    ...getDateFromToWhere(date_from, date_to, "invoice_date"),
  };
  //const paginatorOptions = getPaginationOptions(page, limit);

  try {
    // Fetch all sales with their related payments
    const allSales = await SaleModel.findAll({
      include: [
        {
          model: PaymentModel,
          as: "payments",
          required: false,
          where:
            !isEmpty(search) &&
            !(
              search.toLowerCase() == "sale" ||
              search.toLowerCase() == "payment"
            )
              ? {
                  [Op.or]: [
                    { amount: { [Op.like]: `%${search}%` } },
                    { payment_mode: { [Op.like]: `%${search}%` } },
                    { notes: { [Op.like]: `%${search}%` } },
                  ],
                }
              : undefined,
        },
      ],
      where: conditions,
      order: [["invoice_date", "DESC"]],
      //offset: paginatorOptions.offset,
      //limit: paginatorOptions.limit
    });

    // Flatten sales and payments into a single table structure
    let tableData = [];
    let c = 1;
    allSales.forEach((sale, index) => {
      let approve_status = "Pending";
      if (sale.is_approved == 1) {
        approve_status = "Accepted";
      } else if (sale.is_approved == 2) {
        approve_status = "Declined";
      } else if (sale.is_approved == 3) {
        approve_status = "On Approval";
      } else if (sale.is_approved == 4) {
        approve_status = "Transfer To Sale";
      }

      if (sale.status == "returned") {
        approve_status = "Returned";
      } else if (sale.status == "return_pending") {
        approve_status = "Return Pending";
      }

      // Add Purchase row
      tableData.push({
        index: c,
        id: sale.id,
        date: formatDateTime(sale.invoice_date, 8),
        txn_date: sale.invoice_date,
        invoice_number: sale.invoice_number,
        remarks: sale.notes || "-",
        purpose: "",
        bill_amount: displayAmount(sale.bill_amount),
        txn_amount: parseFloat(sale.bill_amount),
        payment_amount: null,
        pay_amount: null,
        payment_mode: sale.payment_mode || "-",
        type: "Sale",
        txn_type: "",
        is_approved: sale.is_approved,
        approve_status: approve_status,
        is_advance: 0,
      });
      c++;

      // Add related payment rows
      sale.payments.forEach((pay, idx) => {
        tableData.push({
          index: c,
          id: sale.id,
          date: formatDateTime(pay.payment_date, 8),
          txn_date: pay.payment_date,
          invoice_number: sale.invoice_number,
          remarks: pay.notes || "-",
          purpose: pay.purpose || "",
          bill_amount: null,
          payment_amount: displayAmount(pay.amount),
          pay_amount: pay.amount,
          txn_amount: parseFloat(pay.amount),
          payment_mode: pay.payment_mode,
          type: "Payment",
          txn_type: pay.type,
          is_approved: 1,
          approve_status: "Accepted",
          is_advance: pay.is_advance,
        });
        c++;
      });
    });

    tableData.sort((a, b) => new Date(b.index) - new Date(a.index));
    // Sort transactions by txn_date descending
    tableData.sort((a, b) => new Date(b.txn_date) - new Date(a.txn_date));
    tableData.sort((a, b) => {
      /* compactLog(
        "----------a.invoice_number,b.invoice_number----------",
        a.invoice_number.split("").pop(),
        b.invoice_number.split("").pop(),
      ); */
      return (
        b.invoice_number.split("-").pop() - a.invoice_number.split("-").pop()
      );
    });

    if (
      !isEmpty(search) &&
      (search.toLowerCase() == "sale" || search.toLowerCase() == "payment")
    ) {
      tableData = tableData.filter(
        (table) => table.type.toLowerCase() == search.toLowerCase(),
      );
    }

    compactLog(
      "tableData length:",
      Array.isArray(tableData) ? tableData.length : typeof tableData,
    );

    let temp_invoice_no = "";
    let temp_invoice_index = -1;
    let temp_balance = 0;
    for (let i = 0; i < tableData.length; i++) {
      let tx = tableData[i];

      if (temp_invoice_no == "") {
        temp_invoice_no = tx.invoice_number;
        temp_invoice_index = i;
      } else if (
        temp_invoice_no != "" &&
        temp_invoice_no != tx.invoice_number
      ) {
        tableData[temp_invoice_index].txn_amount = temp_balance;
        //tableData[temp_invoice_index].payment_amount = displayAmount(temp_balance);
        temp_invoice_no = tx.invoice_number;
        temp_invoice_index = i;
      }

      if (tx.type.toLowerCase() == "payment" && tx.txn_type == "credit") {
        //compactLog(`temp_balance : ${temp_balance}, credited txn_amount : ${tx.txn_amount}, balance : ${temp_balance - tx.txn_amount}`)
        temp_balance -= tx.txn_amount;
        temp_balance = temp_balance > 0 ? temp_balance : 0;
      } else if (tx.type.toLowerCase() == "sale" && tx.is_approved != 2) {
        temp_balance = tx.txn_amount;
      }
      //compactLog("temp_invoice_no : ", temp_invoice_no, "temp_balance : ", temp_balance);
    }

    //compactLog("after tableData: ", tableData);

    // Compute running balance (Due Amount)
    let runningBalance = 0;
    let tempAdvanceDebitInvoice_idx = -1;
    let hasAdvanceDebit = false;
    const passbook = tableData
      .reverse()
      .map((tx, index) => {
        if (
          tempAdvanceDebitInvoice_idx > -1 &&
          tempAdvanceDebitInvoice_idx + 1 != index
        ) {
          tempAdvanceDebitInvoice_idx = -1;
        }
        if (tx.txn_type == "" && tx.is_approved != 2) {
          runningBalance += tx.txn_amount;
        } else if (
          tx.type.toLowerCase() == "payment" &&
          tx.txn_type == "credit"
        ) {
          runningBalance -= tx.pay_amount;
        } else if (
          tx.txn_type == "credit" &&
          (tempAdvanceDebitInvoice_idx == -1 ||
            (tempAdvanceDebitInvoice_idx > -1 &&
              tempAdvanceDebitInvoice_idx + 1 != index))
        ) {
          runningBalance += tx.txn_amount;
        } else if (tx.txn_type == "debit" && tx.is_advance) {
          runningBalance -= tx.txn_amount;
          ((tempAdvanceDebitInvoice_idx = index), (hasAdvanceDebit = true));
        } else if (tx.txn_type == "debit") {
          runningBalance -= tx.txn_amount;
        }

        return {
          ...tx,
          txn_date: formatDateTime(tx.txn_date, 8),
          sl_no: index + 1,
          balance: displayAmount(runningBalance),
        };
      })
      .reverse();

    compactLog(
      "passbook length:",
      Array.isArray(passbook) ? passbook.length : typeof passbook,
    );

    /* let result = {
      items: passbook,
      total: passbook.length,
    }; */
    //res.send(formatResponse(result, "Purchase Ledger List"));

    const logoUrl = `public/images/logo.png`;
    // const logoUrl = process.env.BASE_URL + "public/images/logo.png";

    const bitmap = fs.readFileSync(logoUrl);
    const logo = bitmap.toString("base64");

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
                                        300;">SALE TRANSACTION LEDGER</h1>
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
                                                font-size: 12px;">User Id - <span>${user.name}</span></h3>
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
                                                    IN ${user.gst != null ? user.gst : ""} </span>
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
                                                                    0;">${user.company_name}</span></li>
                                                            <li><span
                                                                    style="font-weight:
                                                                    400; font-size:
                                                                    12px; margin:
                                                                    0;">GST IN</span>
                                                                <span
                                                                    style="font-weight:
                                                                    600; font-size:
                                                                    12px; margin:
                                                                    0;">${user.gst != null ? user.gst : ""}</span></li>
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
                                                                    0;">${user.mobile}</span>
                                                            <li><span
                                                                    style="font-weight:
                                                                    400; font-size:
                                                                    12px; margin:
                                                                    0;">Invoice Date
                                                                    -
                                                                </span> </li>
                                                                    
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
                                                                    0;">${user.address != null ? user.address : ""}</span></li>
                                                          
                                                            <li><span
                                                                    style="font-weight:
                                                                    400; font-size:
                                                                    12px; margin:
                                                                    0;">Invoice No -
                                                                </span> </li>
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
                                                                    0;">${user.city != null ? user.city : ""}</span></li>
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
                                                                    0;">${user.pincode != null ? user.pincode : ""}</span></li>
                                                                    </ul>
                                                    </div>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>`;
    if (passbook.length > 0) {
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
                                          font-weight: 400; ">Date</th>
                                      <th style="text-align: left; color:
                                          #fff; font-size: 12px;
                                          font-weight: 400; ">Invoice No</th>
                                      <th  style="text-align: left; color:
                                          #fff; font-size: 12px;
                                          font-weight: 400; ">Remarks</th>
                                      <th  style="text-align: left; color:
                                          #fff; font-size: 12px;
                                          font-weight: 400; ">Purpose</th>
                                      <th style="text-align: left; color:
                                          #fff; font-size: 12px;
                                          font-weight: 400;">Bill Amt</th>
                                      <th style="text-align: left; color:
                                          #fff; font-size: 12px;
                                          font-weight: 400; ">Payment Amt</th>
                                      <th style="text-align: left; color:
                                          #fff; font-size: 12px;
                                          font-weight: 400;">Mode</th>
                                      <th style="text-align: left; color:
                                          #fff; font-size: 12px;
                                          font-weight: 400;">Type</th>
                                      <th style="text-align: left; color:
                                          #fff; font-size: 12px;
                                          font-weight: 400;">Status</th>
                                      <th style="text-align: left; color:
                                          #fff; font-size: 12px;
                                          font-weight: 400;">Balance(Due)</th>
                                  </tr>
                              </thead>
                              <tbody>`;
      for (let i = 0; i < passbook.length; i++) {
        let bgTrColor = i % 2 == 0 ? "#C1BDBD" : "#C4BEED";
        html += `<tr style="background-color: ${bgTrColor}">
                                      <td style="text-align: left;
                                          font-size: 11px;
                                          font-weight: 400;">
                                          ${passbook[i].sl_no}
                                      </td>
                                      <td style="text-align: left;
                                          font-size: 11px;
                                          font-weight: 400;font-size: 10px;">
                                          ${passbook[i].txn_date}
                                      </td>
                                      <td style="text-align: left;
                                          font-size: 11px;
                                          font-weight: 400;">
                                          ${passbook[i].invoice_number}
                                      </td>
                                      <td style="text-align:
                                          left; font-size: 11px;
                                          font-weight: 400;">
                                          ${passbook[i].remarks}
                                      </td>
                                      <td style="text-align:
                                          left; font-size: 11px;
                                          font-weight: 400;">
                                          ${passbook[i].purpose}
                                      </td>
                                      <td  style="text-align:
                                          left; font-size: 11px;
                                          font-weight: 400;">
                                          ${
                                            passbook[i].bill_amount != null
                                              ? passbook[i].bill_amount
                                              : ""
                                          }
                                      </td>
                                      <td  style="text-align:
                                          left; font-size: 11px;
                                          font-weight: 400;">
                                          ${
                                            passbook[i].payment_amount != null
                                              ? passbook[i].payment_amount
                                              : ""
                                          }
                                      </td>
                                      <td  style="text-align:
                                          left; font-size: 11px;
                                          font-weight: 400;">
                                          ${passbook[i].payment_mode}
                                      </td>
                                      <td style="text-align:
                                          left; font-size: 11px;
                                          font-weight: 400;">
                                          ${
                                            passbook[i].type
                                          }${passbook[i].is_advance ? "(Advance)" : ""}
                                      </td>
                                      <td style="text-align:
                                          left; font-size: 11px;
                                          font-weight: 400;">
                                          ${passbook[i].approve_status}
                                      </td>
                                      <td style="text-align:
                                          left; font-size: 11px;
                                          font-weight: 400;">
                                          ${passbook[i].balance}
                                      </td>
                                  </tr>`;
      }
      html += `
                                      </tbody>
                                  </table>`;
    }

    html += `
                                            <!-- Footer -->
                                            
                                            ${footerhtml}
                                        </td>
                                    </tr>
    
                                </tbody>
                            </table>
                        </div>
                    </body>
                </html>`;

    try {
      let filename =
        user.name.replace(" ", "_") +
        "_" +
        new Date().getTime() +
        "_ledger.pdf";
      let file_path = "public/sales/" + filename;
      const options = { format: "A4" };

      (async () => {
        const file = { content: html };

        // Generate PDF
        const pdfBuffer = await html_to_pdf.generatePdf(file, options);

        // Save PDF to file
        fs.mkdirSync("public/sales", { recursive: true });
        fs.writeFileSync(file_path, pdfBuffer);
        compactLog("PDF generated successfully!");

        res.send(
          formatResponse(
            {
              file_name: filename,
              url: getFileAbsulatePathPDF(file_path),
              items: passbook,
              total: passbook.length,
            },
            "Ledger pdf",
          ),
        );
      })();
    } catch (error) {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse(error.toString()));
    }
  } catch (err) {
    console.error("Error:", err);
    res.status(errorCodes.default).send(formatErrorResponse(err));
  }
};

/**
 * Store sale
 *
 * @param {*} req
 * @param {*} res
 */
exports.store = async (req, res) => {
  let data = req.body;
  compactLog(
    "sale store payload:",
    data && typeof data === "object" ? Object.keys(data).length : typeof data,
  );
  let reportCharge = await ReportChargeModel.findAll({
    order: [["amount", "ASC"]],
    where: {},
  });
  reportCharge = await ReportChargeCollection(reportCharge);

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

  if (
    !data.is_assigned &&
    data.settlement_date &&
    (isDistributor(req) || isSalesExecutive(req))
  ) {
    let invObj = moment(data.invoice_date, "MM/DD/YYYY");
    let sttlObj = moment(data.settlement_date);
    if (sttlObj.diff(invObj, "days") > 30) {
      return res
        .status(errorCodes.default)
        .send(
          formatErrorResponse("Settlement date should be maximum 30 days."),
        );
    }
  }

  let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
  // if (data.advance_amount > 0 && data.due_amount == 0) {
  //   let walletBalance = await getWalletBalance(userID, data.payment_mode);
  //   if (walletBalance < priceFormat(data.total_payable)) {
  //     return res.status(errorCodes.default).send(formatErrorResponse("Insufficient wallet balance for adjust sale amount from advance."));
  //   }
  // }

  try {
    //const trans = await sequelize.transaction(async (t) => {
    //upload banner
    let image = null;
    if (data.image_file && data.image_file != "") {
      let uploadResult = await base64FileUpload(data.image_file, "sales");
      if (uploadResult) {
        image = uploadResult.path;
      }
    }
    //insert into sale table
    let invoice_number = data.invoice_number || null;
    /* let req_data = JSON.stringify(data);
    req_data = new Buffer.from(req_data).toString("base64"); */
    let req_data = encodeForStorage(data);
    let req_data_for_purchase = data;
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
    let is_approved = 0;
    if (isDistributor(req) || isSalesExecutive(req)) {
      let userObj = await UserModel.findByPk(data.user_id);
      if (userObj && userObj.role_id == 5) {
        // retailer
        is_approved = 1;
      }
    }
    if (data.order_from_customer) {
      is_approved = 1; // customer
    }

    if (data.already_paid_amount && data.already_paid_amount > 0) {
      paid_amount = priceFormat(
        paid_amount + parseFloat(data.already_paid_amount),
      );
    }

    if (data.pay_from_advance) {
      if (parseFloat(data.total_payable) >= parseFloat(data.advance_amount)) {
        paid_amount = priceFormat(
          paid_amount + parseFloat(data.advance_amount),
        );
      } else {
        paid_amount = parseFloat(data.total_payable);
      }
    }

    let saleObj = {
      user_id: data.user_id,
      is_assigned: data.is_assigned,
      order_id: data.order_id || null,
      sale_by: userID,
      invoice_number: invoice_number,
      invoice_date: moment(data.invoice_date).format("YYYY-MM-DD"), //, "MM/DD/YYYY"
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
      paid_amount: paid_amount,
      taxable_amount: priceFormat(data.taxable_amount),
      bill_amount: priceFormat(data.total_payable),
      total_payable: priceFormat(data.total_payable),
      due_amount: due_amount,
      due_date: data.due_date
        ? moment(data.due_date).format("YYYY-MM-DD")
        : null,
      settlement_date: data.settlement_date
        ? moment(data.settlement_date).format("YYYY-MM-DD")
        : null,
      product_discount: priceFormat(data.product_discount),
      total_tag_price: priceFormat(data.total_tag_price),
      is_approved: data.on_approval ? 3 : is_approved,
      is_approval: data.on_approval,
      req_data: req_data,
      status: status,
      image: image,
    };
    compactLog(
      "sale create:",
      saleObj && typeof saleObj === "object"
        ? Object.keys(saleObj).length
        : typeof saleObj,
    );
    let sale = await SaleModel.create(saleObj);

    let purchase = null;
    //if(!isSuperAdmin(req)){
    //if (!data.on_approval && !data.order_from_customer) {
    if (!data.order_from_customer) {
      let purchaseObj = {
        supplier_id: userID,
        is_assigned: data.is_assigned,
        sale_id: sale.id,
        user_id: data.user_id,
        invoice_number: invoice_number,
        invoice_date: moment(data.invoice_date, "MM/DD/YYYY").format(
          "YYYY-MM-DD",
        ),
        notes: data.notes,
        payment_mode: data.payment_mode,
        current_image: data.current_image,
        transaction_no: data.transaction_no,
        total_amount: priceFormat(data.total_amount),
        tax: priceFormat(data.cgst_tax + data.sgst_tax + data.igst_tax),
        discount: priceFormat(data.discount),
        paid_amount: paid_amount,
        taxable_amount: priceFormat(data.taxable_amount),
        bill_amount: priceFormat(data.total_payable),
        total_payable: priceFormat(data.total_payable),
        due_amount: due_amount,
        due_date: data.due_date
          ? moment(data.due_date).format("YYYY-MM-DD")
          : null,
        status: status,
        is_approved: data.on_approval ? 3 : is_approved,
        is_approval: data.on_approval,
        image: image,
      };
      compactLog(
        "purchase create:",
        purchaseObj && typeof purchaseObj === "object"
          ? Object.keys(purchaseObj).length
          : typeof purchaseObj,
      );
      purchase = await PurchaseModel.create(purchaseObj);
    }
    //}

    //insert into sale product table
    let saleProductIds = [];
    for (let i = 0; i < data.products.length; i++) {
      let thisItem = data.products[i];
      let thisObj = {
        sale_id: sale.id,
        stock_id: thisItem.stock_id,
        product_id: thisItem.product_id,
        size_id: thisItem.size_id || null,
        certificate_no: cleanInput(thisItem.certificate_no),
        total_weight: weightFormat(thisItem.total_weight),
        sub_price: priceFormat(thisItem.sub_price),
        making_charge: priceFormat(thisItem.making_charge),
        rep: priceFormat(thisItem.rep),
        tax: priceFormat(thisItem.total_tax),
        cgst_tax: priceFormat(thisItem.cgst_tax),
        sgst_tax: priceFormat(thisItem.sgst_tax),
        igst_tax: priceFormat(thisItem.igst_tax),
        total: priceFormat(thisItem.total),
        total_discount: priceFormat(thisItem.total_discount),
        rate: priceFormat(thisItem.rate),
        making_charge_discount: priceFormat(
          thisItem.making_charge_discount_percent,
        ),
        making_charge_discount_amount: priceFormat(
          thisItem.making_charge_discount_amount,
        ),
        tax_info: thisItem.tax_info ? JSON.stringify(thisItem.tax_info) : null,
        making_charge_discount_percent: thisItem.making_charge_discount_percent,
        max_making_charge_discount_percent:
          thisItem.max_making_charge_discount_percent,
        sub_cat_making_charge: thisItem.sub_cat_making_charge,
        sub_cat_making_charge_type: thisItem.sub_cat_making_charge_type,
        order_product_id: thisItem.order_product_id
          ? thisItem.order_product_id
          : null,
      };
      compactLog(
        "sale product create:",
        thisObj && typeof thisObj === "object"
          ? Object.keys(thisObj).length
          : typeof thisObj,
      );
      let saleProduct = await SaleProductModel.create(thisObj);
      let product = await ProductModel.findByPk(thisItem.product_id);

      let sale_product_id = null;
      if ("sale_product_id" in thisItem && !isEmpty(thisItem.sale_product_id)) {
        sale_product_id = thisItem.sale_product_id;
        saleProductIds.push(thisItem.sale_product_id);
      }

      //insert into order product
      if (!isEmpty(thisObj.order_product_id)) {
        await orderProductModel.update(
          {
            total_weight: weightFormat(thisItem.total_weight),
            rate: priceFormat(thisItem.total),
            making_charge: priceFormat(thisItem.making_charge),
            making_charge_discount_amount: priceFormat(
              thisItem.making_charge_discount_amount,
            ),
            making_charge_discount_percent:
              thisItem.making_charge_discount_percent,
            total_discount: priceFormat(thisItem.total_discount),
            sub_price: priceFormat(thisItem.sub_price),
            total: priceFormat(thisItem.total),
            price_without_tax: priceFormat(
              priceFormat(thisObj.total) - priceFormat(thisObj.total_tax),
            ),
            igst: priceFormat(thisItem.igst_tax),
            cgst: priceFormat(thisItem.cgst_tax),
            sgst: priceFormat(thisItem.sgst_tax),
          },
          { where: { id: thisObj.order_product_id } },
        );
      }

      let purchaseProduct = null;
      //if(!isSuperAdmin(req)){
      // compactLog("--------thisItem", data);

      if (purchase) {
        let query = {
          where: {
            certificate_no: {
              [Op.like]: `${thisItem.certificate_no}`,
            },
          },
        };
        let resData = await PurchaseProductModel.findAll(query);
        let current_image =
          resData && resData.length > 0 && resData[0].current_image
            ? resData[0].current_image
            : null;

        let thisObj2 = {
          purchase_id: purchase.id,
          product_id: thisItem.product_id,
          current_image: current_image,
          size_id: thisItem.size_id || null,
          certificate_no: cleanInput(thisItem.certificate_no),
          total_weight: weightFormat(thisItem.total_weight),
          sub_price: priceFormat(thisItem.sub_price),
          making_charge: priceFormat(thisItem.making_charge),
          rep: priceFormat(thisItem.rep),
          tax: priceFormat(thisItem.total_tax),
          total: priceFormat(thisItem.total),
          total_discount: priceFormat(thisItem.total_discount),
        };
        compactLog(
          "purchase product create:",
          thisObj2 && typeof thisObj2 === "object"
            ? Object.keys(thisObj2).length
            : typeof thisObj2,
        );
        purchaseProduct = await PurchaseProductModel.create(thisObj2);
        req_data_for_purchase.products[i].id = purchaseProduct.id;
      }
      //}
      compactLog("remove stock id:", thisItem && thisItem.stock_id);
      compactLog(
        "thisItem.certificate_no:",
        thisItem && thisItem.certificate_no,
      );
      compactLog("has certificate_no:", !!!isEmpty(thisItem.certificate_no));
      //remove stock
      if (
        isEmpty(sale_product_id) &&
        product.type != "material" &&
        !isEmpty(thisItem.certificate_no)
      ) {
        compactLog("removed!");
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
          quantity: thisItem.materials[x].quantity || 0,
          purity_id: thisItem.materials[x].purity_id,
          unit_id: thisItem.materials[x].unit_id,
          rate: thisItem.materials[x].rate,
          amount: thisItem.materials[x].amount,
          discount_amount: thisItem.materials[x].discount_amount,
          discount_percent: thisItem.materials[x].discount_percent || 0,
          max_discount_percent: thisItem.materials[x].max_discount_percent,
          total_gram: thisItem.materials[x].total_gram,
          per_gram_price: thisItem.materials[x].per_gram_price,
        };
        compactLog("sale product material create : ", thisMObj);
        await SaleProductMaterialModel.create(thisMObj);

        //if(!isSuperAdmin(req)){
        if (purchase) {
          let thisMObj2 = {
            purchase_id: purchase.id,
            purchase_product_id: purchaseProduct.id,
            material_id: thisItem.materials[x].material_id,
            weight: weightFormat(thisItem.materials[x].weight),
            quantity: thisItem.materials[x].quantity || 0,
            purity_id: thisItem.materials[x].purity_id,
            unit_id: thisItem.materials[x].unit_id,
            rate: thisItem.materials[x].rate,
            amount: thisItem.materials[x].amount,
            discount_amount: thisItem.materials[x].discount_amount,
          };
          compactLog("purchase product material create : ", thisMObj2);
          await PurchaseProductMaterialModel.create(thisMObj2);
        }
        //}

        /**
         * remove from stock materials
         */
        if (isEmpty(sale_product_id)) {
          if (
            product.type == "material" ||
            (product.type != "material" && isEmpty(thisItem.certificate_no))
          ) {
            let stockMaterial = await StockMaterialModel.findOne({
              where: {
                material_id: thisItem.materials[x].material_id,
                purity_id: thisItem.materials[x].purity_id,
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
                    parseFloat(stockMaterial.quantity) -
                    parseFloat(thisItem.materials[x].quantity),
                },
                { where: { id: stockMaterial.id } },
              );
              compactLog(
                "stockMaterial.weight : ",
                parseFloat(stockMaterial.weight),
                " - thisItem.materials[x].weight = ",
                thisItem.materials[x].weight,
              );
              if (
                parseFloat(stockMaterial.weight) -
                  parseFloat(thisItem.materials[x].weight) <=
                0
              ) {
                compactLog("stock material delete : ", thisItem.stock_id);
                await StockModel.destroy({ where: { id: thisItem.stock_id } });
              } else {
                let stock = await StockModel.findOne({
                  where: { id: thisItem.stock_id },
                });
                if (stock) {
                  await StockModel.update(
                    {
                      quantity:
                        parseFloat(stockMaterial.quantity) -
                        parseFloat(thisItem.materials[x].quantity),
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
      }

      /**
       * START - add to admin stock
       */
      /*let stock = null;
      if(product.type == "material"){
        let quantity = 0;
        for(let x = 0; x < thisItem.materials.length; x++){
          quantity += thisItem.materials[x].quantity ? parseInt(thisItem.materials[x].quantity) : 0;
        }
        let result = await updateOrCreate(StockModel, {product_id: thisItem.product_id, user_id: data.user_id}, {product_id: thisItem.product_id, quantity: quantity, user_id: data.user_id, total_weight: thisItem.total_weight}, null, ['quantity', 'total_weight']);
        stock = result.item;
      }else{
        stock = await StockModel.create({
          product_id: thisItem.product_id,
          size_id: thisItem.size_id || null,
          certificate_no: thisItem.certificate_no,
          quantity: 1,
          user_id: data.user_id,
          sale_id: sale.id,
          total_weight: thisItem.total_weight
        });
      }*/

      //insert into stock materials
      let batch_id2 = null;
      /**
       * add to stock materials
       */
      /*for(let x = 0; x < thisItem.materials.length; x++){
        if(product.type == "material"){
          let stockMaterial = await StockMaterialModel.findOne({where: {stock_id: stock.id, material_id: thisItem.materials[x].material_id}});
          if(stockMaterial){
            await StockMaterialModel.update({
              weight: weightFormat(stockMaterial.weight + weightFormat(thisItem.materials[x].weight)),
              quantity: (stockMaterial.quantity + thisItem.materials[x].quantity),
              purity_id: thisItem.materials[x].purity_id,
              unit_id: thisItem.materials[x].unit_id,
              category_id: product.category_id
            },{where: {id: stockMaterial.id}});
          }else{
            await StockMaterialModel.create({
              stock_id: stock.id,
              material_id: thisItem.materials[x].material_id,
              weight: weightFormat(thisItem.materials[x].weight),
              quantity: thisItem.materials[x].quantity,
              purity_id: thisItem.materials[x].purity_id,
              unit_id: thisItem.materials[x].unit_id,
              category_id: product.category_id
            });
          }
        }else{
          await StockMaterialModel.create({
            stock_id: stock.id,
            material_id: thisItem.materials[x].material_id,
            weight: weightFormat(thisItem.materials[x].weight),
            quantity: thisItem.materials[x].quantity,
            purity_id: thisItem.materials[x].purity_id,
            unit_id: thisItem.materials[x].unit_id,
            category_id: product.category_id
          });
        }

      }*/

      /**
       * END - add to admin stock
       */
    }

    //update invoice no if not sent
    let purchase_invoice_number = invoice_number;
    if (isEmpty(invoice_number)) {
      invoice_number = "RV-S-" + sale.id;
      purchase_invoice_number = "RV-P-" + purchase.id; //invoice_number; //
      await SaleModel.update(
        {
          invoice_number: invoice_number,
        },
        { where: { id: sale.id } },
      );
    }

    if (purchase) {
      /* req_data_for_purchase = JSON.stringify(req_data_for_purchase);
      req_data_for_purchase = new Buffer.from(req_data_for_purchase).toString(
        "base64"
      ); */
      req_data_for_purchase = encodeForStorage(req_data_for_purchase);
      await PurchaseModel.update(
        {
          invoice_number: purchase_invoice_number,
          req_data: req_data_for_purchase,
        },
        { where: { id: purchase.id } },
      );
    }

    //insert into payment table
    if (!data.is_assigned && priceFormat(data.paid_amount) > 0) {
      let amount = priceFormat(data.paid_amount);
      if (!isEmpty(data.on_approval_id) && parseInt(data.on_approval_id) > 0) {
        let approvalSale = await SaleModel.findByPk(data.on_approval_id);
        if (approvalSale && !isEmpty(approvalSale.paid_amount)) {
          amount =
            amount >= parseFloat(approvalSale.paid_amount)
              ? amount - parseFloat(approvalSale.paid_amount)
              : amount;
        }
      }

      if (amount > 0) {
        let payment = await paymentModel.create({
          payment_mode: data.payment_mode,
          amount: amount,
          user_id: data.user_id,
          payment_by: req.userId,
          payment_date: moment().format("YYYY-MM-DD"),
          txn_id: data.transaction_no,
          cheque_no: data.cheque_no,
          status: data.payment_mode == "cheque" ? "pending" : "success",
          type: "credit",
          table_type: "sale",
          table_id: sale.id,
          payment_belongs: userID,
          purpose: sale.is_approval ? "sale on approval" : "sale",
          can_accept: true,
        });

        await updateWalletRemainingBalance(userID, payment.id);

        //debit from down user
        let payment2 = await paymentModel.create({
          parent_id: payment.id,
          payment_mode: data.payment_mode,
          amount: priceFormat(data.paid_amount),
          user_id: userID,
          payment_by: req.userId,
          payment_date: moment().format("YYYY-MM-DD"),
          txn_id: data.transaction_no,
          cheque_no: data.cheque_no,
          status: "success",
          type: "debit",
          table_type: "purchase",
          table_id: purchase ? purchase.id : sale.id,
          payment_belongs: data.user_id,
          purpose: sale.is_approval ? "purchase on approval" : "purchase",
          can_accept: false,
        });

        await updateWalletRemainingBalance(data.user_id, payment2.id);
      }
    }

    //if paid from advance amount
    if (parseFloat(data.advance_amount) > 0 && data.pay_from_advance) {
      let theDebitAmount =
        parseFloat(data.total_payable) >= parseFloat(data.advance_amount)
          ? parseFloat(data.advance_amount)
          : parseFloat(data.total_payable);

      let thisCreditAmnt =
        parseFloat(data.total_payable) >= parseFloat(data.advance_amount)
          ? 0.0
          : priceFormat(
              parseFloat(data.advance_amount) - parseFloat(data.total_payable),
            );

      /* debit advance amount */
      let paymentD = await paymentModel.create({
        //payment_mode: "advance",
        payment_mode: data.payment_mode,
        amount: priceFormat(theDebitAmount),
        user_id: data.user_id,
        payment_by: userID,
        payment_date: moment().format("YYYY-MM-DD"),
        // txn_id: data.transaction_no,
        // cheque_no: data.cheque_no,
        status: "success",
        type: "debit", //advance_adjust
        table_type: "sale",
        table_id: sale.id,
        payment_belongs: userID,
        purpose: "sale adjust from advance",
        can_accept: true,
        is_advance: true,
      });

      await updateWalletRemainingBalance(userID, paymentD.id);

      /* credit advance amount as paid amount */
      let payment = await paymentModel.create({
        parent_id: paymentD.id,
        payment_mode: data.payment_mode,
        amount: priceFormat(theDebitAmount),
        user_id: data.user_id,
        payment_by: userID,
        payment_date: moment().format("YYYY-MM-DD"),
        // txn_id: data.transaction_no,
        // cheque_no: data.cheque_no,
        status: "success",
        type: "credit", //advance_adjust
        table_type: "sale",
        table_id: sale.id,
        payment_belongs: userID,
        purpose: "advance amount changed to paid amount for the sale",
        can_accept: true,
        is_advance: false,
      });

      await updateWalletRemainingBalance(userID, payment.id);

      await updateAdvanceAmount(data.user_id, userID, thisCreditAmnt, false);
    }

    //complete order
    if (!isEmpty(data.order_id) && !data.order_from_customer) {
      await orderModel.update(
        {
          status: "delivered",
        },
        { where: { id: data.order_id } },
      );
    }

    if (!isEmpty(data.order_id)) {
      await orderModel.update(
        {
          paid_amount: sale.paid_amount,
          sub_total: sale.total_amount,
          total_amount: sale.total_payable,
        },
        { where: { id: data.order_id } },
      );
    }

    let carts = await cartModel.findAll({ where: { user_id: userID } });
    let cartIds = arrayColumn(carts, "id");
    await cartMaterialsModel.destroy({
      where: { cart_id: { [Op.in]: cartIds } },
    });
    await cartModel.destroy({ where: { user_id: userID } });

    /**
     * Add Retailer relationship with se
     */
    if (isSalesExecutive(req)) {
      let user = await UserModel.findByPk(data.user_id);
      if (user && isRetailer(user.role_id)) {
        let roleId = getRoleId("retailer");
        await UserToUserModel.create({
          user_id: req.userId,
          to_user_id: data.user_id,
          to_role_id: roleId,
        });
        await insertVisit({ user_id: req.userId, visit_user_id: data.user_id });
      }
    }

    //restore into stock
    if (
      saleProductIds.length > 0 &&
      !isEmpty(data.on_approval_id) &&
      parseInt(data.on_approval_id) > 0
    ) {
      compactLog("restore into stock .................");
      let saleApproval = await SaleModel.findOne({
        where: { id: data.on_approval_id },
        include: [
          {
            model: SaleProductModel,
            as: "saleProducts",
            separate: true,
            include: [
              {
                model: SaleProductMaterialModel,
                as: "saleMaterials",
                separate: true,
                include: [
                  {
                    model: UnitModel,
                    as: "unit",
                  },
                ],
              },
            ],
          },
        ],
      });
      if (saleApproval) {
        await SaleModel.update(
          {
            is_approved: 4,
            accept_declined_at: moment().format("YYYY-MM-DD HH:mm:ss"),
          },
          { where: { id: saleApproval.id } },
        );

        /* check if purchase on approval record exists */
        let purchaseOnApproval = await PurchaseModel.findOne({
          where: { sale_id: saleApproval.id },
        });
        /* update status only for purchase on approval if sale on approval change to sale */
        if (!isEmpty(purchaseOnApproval)) {
          await PurchaseModel.update(
            {
              is_approved: 4,
              accept_declined_at: moment().format("YYYY-MM-DD HH:mm:ss"),
            },
            { where: { id: purchaseOnApproval.id } },
          );
        }

        compactLog("saleOnApproval & purchaseOnApproval updated : ", {
          is_approved: 4,
          accept_declined_at: moment().format("YYYY-MM-DD HH:mm:ss"),
        });
        let parentUserID = userID; //isSuperAdmin(req) ? null : req.userId;
        compactLog("parentUserId : ", parentUserID);
        compactLog("saleProductIds : ", saleProductIds);
        for (let i = 0; i < saleApproval.saleProducts.length; i++) {
          let thisItem = saleApproval.saleProducts[i];
          if (saleProductIds.includes(thisItem.id)) {
            continue;
          }

          let product = await ProductModel.findByPk(thisItem.product_id);
          let stock = null;
          if (
            product.type == "material" ||
            (product.type != "material" && isEmpty(thisItem.certificate_no))
          ) {
            let quantity = 0;
            for (let x = 0; x < thisItem.saleMaterials.length; x++) {
              quantity += thisItem.saleMaterials[x].quantity
                ? parseInt(thisItem.saleMaterials[x].quantity)
                : 0;
            }
            let result = await updateOrCreate(
              StockModel,
              {
                product_id: thisItem.product_id,
                user_id: parentUserID,
                purity_id: thisItem.saleMaterials[0].purity_id,
              },
              {
                product_id: thisItem.product_id,
                quantity: quantity,
                total_weight: thisItem.total_weight,
                user_id: parentUserID,
                purity_id: thisItem.saleMaterials[0].purity_id,
              },
              null,
              ["quantity", "total_weight"],
            );
            stock = result.item;
          } else {
            stock = await StockModel.create({
              product_id: thisItem.product_id,
              size_id: thisItem.size_id || null,
              purity_id: thisItem.saleMaterials[0]?.purity_id || null,
              certificate_no: cleanInput(thisItem.certificate_no),
              current_image: thisItem.current_image,
              quantity: 1,
              total_weight: thisItem.total_weight,
              user_id: parentUserID,
            });
          }
          compactLog("stock created : ", stock.id);
          for (let x = 0; x < thisItem.saleMaterials.length; x++) {
            let saleMaterial = thisItem.saleMaterials[x];
            /**
             * add to stock materials
             */
            let weight_in_gram = convertUnitToGram(
              saleMaterial.unit.name,
              saleMaterial.weight,
            );
            if (
              product.type == "material" ||
              (product.type != "material" && isEmpty(thisItem.certificate_no))
            ) {
              let stockMaterial = await StockMaterialModel.findOne({
                where: {
                  stock_id: stock.id,
                  material_id: saleMaterial.material_id,
                  purity_id: saleMaterial.purity_id,
                },
              });
              if (stockMaterial) {
                let thisquantity = saleMaterial.quantity
                  ? parseInt(stockMaterial.quantity) +
                    parseInt(saleMaterial.quantity)
                  : stockMaterial.quantity;
                await StockMaterialModel.update(
                  {
                    weight: weightFormat(
                      parseFloat(stockMaterial.weight) +
                        weightFormat(saleMaterial.weight),
                    ),
                    weight_in_gram: weightFormat(
                      parseFloat(stockMaterial.weight_in_gram) +
                        weightFormat(weight_in_gram),
                    ),
                    quantity: thisquantity,
                    purity_id: saleMaterial.purity_id,
                    unit_id: saleMaterial.unit_id,
                    category_id: product.category_id,
                  },
                  { where: { id: stockMaterial.id } },
                );
                compactLog("stock material updated : ", stockMaterial.id);
              } else {
                await StockMaterialModel.create({
                  stock_id: stock.id,
                  material_id: saleMaterial.material_id,
                  weight: weightFormat(saleMaterial.weight),
                  weight_in_gram: weightFormat(weight_in_gram),
                  quantity: saleMaterial.quantity || 0,
                  purity_id: saleMaterial.purity_id,
                  unit_id: saleMaterial.unit_id,
                  category_id: product.category_id,
                });
                compactLog("stock material created : ", {
                  stock_id: stock.id,
                  material_id: saleMaterial.material_id,
                  weight: weightFormat(saleMaterial.weight),
                  weight_in_gram: weightFormat(weight_in_gram),
                  quantity: saleMaterial.quantity || 0,
                  purity_id: saleMaterial.purity_id,
                  unit_id: saleMaterial.unit_id,
                  category_id: product.category_id,
                });
              }
            } else {
              await StockMaterialModel.create({
                stock_id: stock.id,
                material_id: saleMaterial.material_id,
                weight: weightFormat(saleMaterial.weight),
                weight_in_gram: weightFormat(weight_in_gram),
                quantity: saleMaterial.quantity || 0,
                purity_id: saleMaterial.purity_id,
                unit_id: saleMaterial.unit_id,
                category_id: product.category_id,
              });
              compactLog("stock material created for type product : ", {
                stock_id: stock.id,
                material_id: saleMaterial.material_id,
                weight: weightFormat(saleMaterial.weight),
                weight_in_gram: weightFormat(weight_in_gram),
                quantity: saleMaterial.quantity || 0,
                purity_id: saleMaterial.purity_id,
                unit_id: saleMaterial.unit_id,
                category_id: product.category_id,
              });
            }
          }
        }
      }
    }

    //send notification
    if (purchase && purchase.is_approval == 1) {
      sendNotification("purchase_on_approval", req, {
        sale: sale,
        purchase: purchase,
      });
    } else {
      sendNotification("sale", req, { sale: sale, purchase: purchase });
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
 * Status Change
 * @param {*} req
 * @param {*} res
 * @returns
 */
exports.statuschange = async (req, res) => {
  let data = req.body;
  let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
  compactLog("status change data =================: ", data);
  try {
    let sale = await SaleModel.findOne({
      where: { id: req.params.id, sale_by: userID },
      include: [
        {
          model: SaleProductModel,
          as: "saleProducts",
          separate: true,
          include: [
            {
              model: SaleProductMaterialModel,
              as: "saleMaterials",
              separate: true,
              include: [
                {
                  model: UnitModel,
                  as: "unit",
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
        .send(formatErrorResponse("Sale not found"));
    }

    let return_payment_mode = data.return_payment_mode
      ? data.return_payment_mode
      : "cash";
    if (data.approve_status == 2 && data.decline_type == "return") {
      let paidAmnt = parseFloat(sale.paid_amount);
      let payment = await paymentModel.findOne({
        where: { table_type: "sale", table_id: sale.id },
      });
      if (payment) {
        if (payment.payment_mode == "cheque" && payment.status == "pending") {
          paidAmnt = priceFormat(paidAmnt - parseFloat(payment.amount));
        }
      }
      if (paidAmnt > 0) {
        let walletBalance = await getWalletBalance(userID, return_payment_mode);
        if (walletBalance < paidAmnt) {
          return res
            .status(errorCodes.default)
            .send(formatErrorResponse("Insufficient wallet balance."));
        }
      }
    }

    if (data.approve_status != 4) {
      await SaleModel.update(
        {
          is_approved: data.approve_status,
          accept_declined_at: moment().format("YYYY-MM-DD HH:mm:ss"),
        },
        { where: { id: sale.id } },
      );
      /* if sale is declined */
      if (data.approve_status == 2) {
        /* check if purchase on approval record exists */
        let purchaseExists = await PurchaseModel.findOne({
          where: { sale_id: sale.id },
        });
        /* update status only for purchase on approval if sale is declined */
        if (
          !isEmpty(purchaseExists) &&
          purchaseExists.is_approved == 3 &&
          purchaseExists.is_approval == 1
        ) {
          await PurchaseModel.update(
            {
              is_approved: data.approve_status,
              accept_declined_at: moment().format("YYYY-MM-DD HH:mm:ss"),
            },
            { where: { id: purchaseExists.id } },
          );
        }
      }
    }

    if (data.approve_status == 2) {
      if (data.decline_type == "return") {
        let paidAmnt = parseFloat(sale.paid_amount);
        let payment = await paymentModel.findOne({
          where: { table_type: "sale", table_id: sale.id },
        });
        if (payment) {
          if (payment.payment_mode == "cheque" && payment.status == "pending") {
            await paymentModel.destroy({ where: { id: payment.id } });
            await paymentModel.destroy({
              where: { table_type: "purchase", table_id: sale.id },
            });
            paidAmnt = priceFormat(paidAmnt - parseFloat(payment.amount));
          }
        }
        if (paidAmnt > 0) {
          let payment2 = await paymentModel.create({
            payment_mode: return_payment_mode,
            amount: paidAmnt,
            user_id: sale.user_id,
            payment_by: userID,
            payment_date: moment().format("YYYY-MM-DD"),
            //txn_id: payment.txn_id,
            //cheque_no: payment.cheque_no,
            status: "success",
            type: "debit",
            table_type: "purchase",
            payment_belongs: userID,
            purpose:
              sale.is_approval == 1 ? "sale on apporval refund" : "sale refund",
          });

          await updateWalletRemainingBalance(userID, payment2.id);

          let payment3 = await paymentModel.create({
            payment_mode: return_payment_mode,
            amount: paidAmnt,
            user_id: userID,
            payment_by: userID,
            payment_date: moment().format("YYYY-MM-DD"),
            //txn_id: payment.txn_id,
            //cheque_no: payment.cheque_no,
            status: "success",
            type: "credit",
            table_type: "purchase",
            payment_belongs: sale.user_id,
            purpose: "purchase refund",
          });

          await updateWalletRemainingBalance(sale.user_id, payment3.id);
        }
      } else if (data.decline_type == "advance") {
        let paidAmnt = parseFloat(sale.paid_amount);
        let payment = await paymentModel.findOne({
          where: { table_type: "sale", table_id: sale.id },
        });
        if (payment && payment.status == "pending") {
          paidAmnt = priceFormat(paidAmnt - parseFloat(payment.amount));
        } else {
          await paymentModel.update(
            {
              is_advance: "1",
            },
            { where: { table_type: "sale", table_id: sale.id } },
          );
        }

        await updateAdvanceAmount(sale.user_id, sale.sale_by, paidAmnt, true);
      }

      //restore stock
      let parentUserID = userID; //isSuperAdmin(req) ? null : req.userId;
      for (let i = 0; i < sale.saleProducts.length; i++) {
        let thisItem = sale.saleProducts[i];

        let product = await ProductModel.findByPk(thisItem.product_id);
        let stock = null;
        if (
          product.type == "material" ||
          (product.type != "material" && isEmpty(thisItem.certificate_no))
        ) {
          let quantity = 0;
          for (let x = 0; x < thisItem.saleMaterials.length; x++) {
            quantity += thisItem.saleMaterials[x].quantity
              ? parseInt(thisItem.saleMaterials[x].quantity)
              : 0;
          }
          let result = await updateOrCreate(
            StockModel,
            {
              product_id: thisItem.product_id,
              user_id: parentUserID,
              purity_id: thisItem.saleMaterials[0].purity_id,
            },
            {
              product_id: thisItem.product_id,
              quantity: quantity,
              total_weight: thisItem.total_weight,
              user_id: parentUserID,
              purity_id: thisItem.saleMaterials[0].purity_id,
            },
            null,
            ["quantity", "total_weight"],
          );
          stock = result.item;
        } else {
          // Try to get current_image from multiple sources
          let current_image = null;

          if (thisItem.certificate_no) {
            // First, check Stock records (most recent/updated - has the latest image)
            let stockQuery = {
              where: {
                certificate_no: {
                  [Op.like]: thisItem.certificate_no,
                },
              },
              order: [["id", "DESC"]], // Get the most recent one
            };
            let existingStock = await StockModel.findOne(stockQuery);
            if (existingStock && existingStock.current_image) {
              current_image = existingStock.current_image;
            } else {
              // Second, check PurchaseProduct by certificate_no (fallback)
              let purchaseQuery = {
                where: {
                  certificate_no: {
                    [Op.like]: thisItem.certificate_no,
                  },
                },
                order: [["id", "DESC"]], // Get the most recent one
              };
              let purchaseProduct =
                await PurchaseProductModel.findOne(purchaseQuery);
              if (purchaseProduct && purchaseProduct.current_image) {
                current_image = purchaseProduct.current_image;
              } else if (thisItem.stock_id) {
                // Third, check by stock_id if available
                let stockById = await StockModel.findOne({
                  where: { id: thisItem.stock_id },
                });
                if (stockById && stockById.current_image) {
                  current_image = stockById.current_image;
                }
              }
            }
          }

          stock = await StockModel.create({
            product_id: thisItem.product_id,
            size_id: thisItem.size_id || null,
            purity_id: thisItem.saleMaterials[0]?.purity_id || null,
            certificate_no: cleanInput(thisItem.certificate_no),
            current_image: current_image,
            quantity: 1,
            total_weight: thisItem.total_weight,
            user_id: parentUserID,
          });
        }

        for (let x = 0; x < thisItem.saleMaterials.length; x++) {
          let saleMaterial = thisItem.saleMaterials[x];
          /**
           * add to stock materials
           */
          let weight_in_gram = convertUnitToGram(
            saleMaterial.unit.name,
            saleMaterial.weight,
          );
          if (
            product.type == "material" ||
            (product.type != "material" && isEmpty(thisItem.certificate_no))
          ) {
            let stockMaterial = await StockMaterialModel.findOne({
              where: {
                stock_id: stock.id,
                material_id: saleMaterial.material_id,
                purity_id: saleMaterial.purity_id,
              },
            });
            if (stockMaterial) {
              let thisquantity = saleMaterial.quantity
                ? parseInt(stockMaterial.quantity) +
                  parseInt(saleMaterial.quantity)
                : stockMaterial.quantity;
              await StockMaterialModel.update(
                {
                  weight: weightFormat(
                    parseFloat(stockMaterial.weight) +
                      weightFormat(saleMaterial.weight),
                  ),
                  weight_in_gram: weightFormat(
                    parseFloat(stockMaterial.weight_in_gram) +
                      weightFormat(weight_in_gram),
                  ),
                  quantity: thisquantity,
                  purity_id: saleMaterial.purity_id,
                  unit_id: saleMaterial.unit_id,
                  category_id: product.category_id,
                },
                { where: { id: stockMaterial.id } },
              );
            } else {
              await StockMaterialModel.create({
                stock_id: stock.id,
                material_id: saleMaterial.material_id,
                weight: weightFormat(saleMaterial.weight),
                weight_in_gram: weightFormat(weight_in_gram),
                quantity: saleMaterial.quantity || 1,
                purity_id: saleMaterial.purity_id,
                unit_id: saleMaterial.unit_id,
                category_id: product.category_id,
              });
            }
          } else {
            await StockMaterialModel.create({
              stock_id: stock.id,
              material_id: saleMaterial.material_id,
              weight: weightFormat(saleMaterial.weight),
              weight_in_gram: weightFormat(weight_in_gram),
              quantity: saleMaterial.quantity || 1,
              purity_id: saleMaterial.purity_id,
              unit_id: saleMaterial.unit_id,
              category_id: product.category_id,
            });
          }
        }
      }
    } else if (data.approve_status == 4) {
      /**
       * Clear cart data
       */
      let carts = await cartModel.findAll({ where: { user_id: userID } });
      let cartIds = arrayColumn(carts, "id");
      await cartMaterialsModel.destroy({
        where: { cart_id: { [Op.in]: cartIds } },
      });
      await cartModel.destroy({ where: { user_id: userID } });

      for (let item of sale.saleProducts) {
        let quantity = 1;
        let product = await ProductModel.findByPk(item.product_id);
        if (
          (product && product.type == "material") ||
          (product.type != "material" && isEmpty(item.certificate_no))
        ) {
          quantity = item.saleMaterials[0].quantity;
        }
        let cart = await cartModel.create({
          user_id: userID,
          stock_id: null,
          product_id: item.product_id,
          size_id: item.size_id || null,
          quantity: quantity,
          total_weight: item.total_weight || null,
          certificate_no: cleanInput(item.certificate_no),
          sale_product_id: item.id,
          type: "sale",
        });
        for (let x = 0; x < item.saleMaterials.length; x++) {
          let material = item.saleMaterials[x];
          await cartMaterialsModel.create({
            cart_id: cart.id,
            material_id: material.material_id,
            purity_id: material.purity_id,
            weight: material.weight,
            unit_id: material.unit_id,
            quantity: material.quantity,
          });
        }
      }
    }

    res.send(formatResponse([], "Status Changed successfully!"));
  } catch (error) {
    compactLog("status change error: ", error);
    return res.status(errorCodes.default).send(formatErrorResponse(error));
  }
};
/**
 * View Sale
 *
 * @param {*} req
 * @param {*} res
 */
exports.view = async (req, res) => {
  let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
  let sale = await SaleModel.findOne({
    where: { id: req.params.id /*, sale_by: userID*/ },
    /* include: [
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
    ], */

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
  res.send(formatResponse(SaleCollection(sale), "Sale details"));
};

/**
 * Edit Sale
 *
 * @param {*} req
 * @param {*} res
 */
exports.edit = async (req, res) => {
  let userID = await getWorkingUserID(req);
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
        include: [
          {
            model: RoleModel,
            as: "role",
          },
        ],
      },
    ],
  });
  if (!sale) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Sale not found"));
  }

  res.send(
    formatResponse(
      await SaleEditCollection(sale, req),
      "Purchase edit details",
    ),
  );
};

/**
 * Return sale
 *
 * @param {*} req
 * @param {*} res
 */
exports.returnSale = async (req, res) => {
  let sale = await SaleModel.findOne({
    where: { id: req.params.id },
    include: [
      {
        model: SaleProductModel,
        as: "saleProducts",
      },
    ],
  });
  if (!sale) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Sale not found"));
  }

  let data = req.body;
  let return_products = req.body.return_products;
  let return_data = req.body.return_data;
  let userID = isManager(req) ? req.userId : await getWorkingUserID(req);

  let is_return_stock = false;
  for (let i = 0; i < return_products.length; i++) {
    if (!return_products[i].is_return) {
      continue;
    }
    if (return_data.products[i].return_charge_percent > 0) {
      is_return_stock = true;
      break;
    }
  }
  let from_retailer_customer = false,
    show_superadmin = false;
  if (isSalesExecutive(req) || isDistributor(req)) {
    from_retailer_customer = true;
  } else {
    is_return_stock = false;
  }
  let return_status = "pending";
  if (from_retailer_customer) {
    if (is_return_stock) {
      return_status = "pending";
    } else {
      return_status = "completed";
    }
  } else {
    return_status = "pending";
  }

  //check has amount in wallet
  let return_amount_from_wallet = data.return_amount_from_wallet;
  if (
    data.payment_type == "return" &&
    (!from_retailer_customer ||
      (from_retailer_customer && return_status == "completed"))
  ) {
    let walletBalance = await getWalletBalance(
      userID,
      data.return_payment_mode,
    );
    if (
      return_amount_from_wallet > 0 &&
      walletBalance < return_amount_from_wallet
    ) {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse("Insufficient wallet balance."));
    }
  }

  try {
    const trans = await sequelize.transaction(async (t) => {
      let sale_products = sale.saleProducts;
      /* let req_data = JSON.stringify(data);
      req_data = new Buffer.from(req_data).toString("base64"); */
      let req_data = encodeForStorage(data);
      let saleReturnObj = await ReturnModel.create(
        {
          user_id: sale.user_id,
          seller_id: req.userId,
          table_id: sale.id,
          table_type: "sales",
          notes: return_data.notes,
          payment_mode: return_data.payment_mode,
          txn_id: return_data.transaction_no,
          cheque_no: return_data.cheque_no,
          status: return_status,
          product_amount: data.product_amount,
          charge: data.return_charge,
          total_amount: data.return_amount,
          accepted_at: moment().format("YYYY-MM-DD"),
          return_date: data.return_date
            ? moment(data.return_date, "MM/DD/YYYY").format("YYYY-MM-DD")
            : moment().format("YYYY-MM-DD"),
          req_data: req_data,
          show_superadmin: show_superadmin,
          from_retailer_customer: from_retailer_customer,
          return_amount_from_wallet: return_amount_from_wallet,
        },
        { transaction: t },
      );

      /**
       * Return Products
       */
      for (let i = 0; i < return_products.length; i++) {
        if (!return_products[i].is_return) {
          continue;
        }

        //fetch purchase product by id
        let saleProduct = await SaleProductModel.findOne({
          where: { id: return_products[i].id },
          include: [
            {
              model: SaleProductMaterialModel,
              as: "saleMaterials",
              separate: true,
            },
          ],
        });

        /**
         * moved to stock
         */
        let stock_type = "product";
        if (return_data.products[i].return_charge_percent > 0) {
          stock_type = "return";
        }
        let quantity = 0,
          weight_in_gram = 0;
        for (let x = 0; x < return_data.products[i].materials.length; x++) {
          quantity +=
            return_data.products[i].product_type == "material" ||
            isEmpty(return_data.products[i].certificate_no)
              ? parseFloat(return_data.products[i].materials[x].return_qty)
              : return_data.products[i].materials[x].quantity;
          let thisWeight =
            return_data.products[i].product_type == "material" ||
            isEmpty(return_data.products[i].certificate_no)
              ? parseFloat(return_data.products[i].materials[x].return_weight)
              : return_data.products[i].materials[x].weight;
          weight_in_gram += convertUnitToGram(
            return_data.products[i].materials[x].unit_name,
            thisWeight,
          );
        }
        let stock = null;
        if (
          return_data.products[i].product_type == "material" ||
          isEmpty(return_data.products[i].certificate_no)
        ) {
          if (return_status == "completed") {
            let result = await updateOrCreate(
              StockModel,
              {
                user_id: req.userId,
                type: stock_type,
                product_id: return_data.products[i].product_id,
                purity_id: return_data.products[i].materials[0].purity_id,
              },
              {
                quantity: quantity,
                total_weight: weight_in_gram,
                user_id: req.userId,
                type: stock_type,
                product_id: return_data.products[i].product_id,
                purity_id: return_data.products[i].materials[0].purity_id,
              },
              t,
              ["quantity", "total_weight"],
            );
            stock = result.item;
          } else {
            // compactLog("req =============== 1 ", );
            stock = await StockModel.create(
              {
                product_id: return_data.products[i].product_id,
                quantity: quantity,
                total_weight: weight_in_gram,
                user_id: req.userId,
                type: stock_type,
                return_id: saleReturnObj.id,
                purity_id: return_data.products[i].materials[0].purity_id,
              },
              { transaction: t },
            );
          }
        } else {
          // compactLog("req =============== 2", return_data);

          // Try to get current_image from multiple sources (prioritize most recent/updated image)
          let current_image = null;

          // First, check if current_image is in return_data (if provided)
          if (
            return_data.products[i] &&
            return_data.products[i].current_image
          ) {
            current_image = return_data.products[i].current_image;
          } else if (return_data.products[i].certificate_no) {
            // Second, check Stock records first (most recent/updated - has the latest image)
            let stockQuery = {
              where: {
                certificate_no: {
                  [Op.like]: `${return_data.products[i].certificate_no}`,
                },
              },
              order: [["id", "DESC"]], // Get the most recent one
            };
            let existingStock = await StockModel.findOne(stockQuery, {
              transaction: t,
            });
            if (existingStock && existingStock.current_image) {
              current_image = existingStock.current_image;
            } else {
              // Third, check PurchaseProduct records (fallback)
              let purchaseQuery = {
                where: {
                  certificate_no: {
                    [Op.like]: `${return_data.products[i].certificate_no}`,
                  },
                },
                order: [["id", "DESC"]], // Get the most recent one
              };
              let purchaseProduct = await PurchaseProductModel.findOne(
                purchaseQuery,
                { transaction: t },
              );
              if (purchaseProduct && purchaseProduct.current_image) {
                current_image = purchaseProduct.current_image;
              }
            }
          }

          stock = await StockModel.create(
            {
              product_id: return_data.products[i].product_id,
              size_id: return_data.products[i].size_id || null,
              certificate_no: cleanInput(
                return_data.products[i].certificate_no,
              ),
              quantity:
                return_data.products[i].certificate_no != ""
                  ? 1
                  : return_data.products[i].materials[0]?.quantity,
              current_image: current_image,
              total_weight: weight_in_gram,
              user_id: req.userId,
              type: stock_type,
              return_id: saleReturnObj.id,
            },
            { transaction: t },
          );
        }

        //insert into return product table
        let returnSaleProduct = await ReturnProductModel.create(
          {
            return_id: saleReturnObj.id,
            table_id: sale_products[i].id,
            table_type: "sale_products",
            sub_total: return_data.products[i].return_amount,
          },
          { transaction: t },
        );

        //insert into return product materials table
        for (let x = 0; x < return_data.products[i].materials.length; x++) {
          let thisQty =
            return_data.products[i].product_type == "material" ||
            isEmpty(return_data.products[i].certificate_no)
              ? parseFloat(return_data.products[i].materials[x].return_qty)
              : return_data.products[i].materials[x].quantity;
          let thisWeight =
            return_data.products[i].product_type == "material" ||
            isEmpty(return_data.products[i].certificate_no)
              ? parseFloat(return_data.products[i].materials[x].return_weight)
              : return_data.products[i].materials[x].weight;
          await ReturnProductMaterialModel.create(
            {
              return_id: saleReturnObj.id,
              return_product_id: returnSaleProduct.id,
              material_id: return_data.products[i].materials[x].material_id,
              weight: thisWeight,
              quantity: thisQty,
              purity_id: return_data.products[i].materials[x].purity_id,
              unit_id: return_data.products[i].materials[x].unit_id,
            },
            { transaction: t },
          );

          /**
           * add to stock materials
           */
          let weight_in_gram = convertUnitToGram(
            return_data.products[i].materials[x].unit_name,
            thisWeight,
          );
          if (
            return_data.products[i].product_type == "material" ||
            (return_data.products[i].product_type != "material" &&
              isEmpty(return_data.products[i].certificate_no))
          ) {
            let stockMaterial = await StockMaterialModel.findOne({
              where: {
                stock_id: stock.id,
                material_id: return_data.products[i].materials[x].material_id,
                purity_id: return_data.products[i].materials[x].purity_id,
              },
            });
            if (stockMaterial) {
              let thisquantity = thisQty
                ? parseInt(stockMaterial.quantity) + parseInt(thisQty)
                : stockMaterial.quantity;
              await StockMaterialModel.update(
                {
                  weight: weightFormat(
                    parseFloat(stockMaterial.weight) + weightFormat(thisWeight),
                  ),
                  weight_in_gram: weightFormat(
                    parseFloat(stockMaterial.weight_in_gram) +
                      weightFormat(weight_in_gram),
                  ),
                  quantity: thisquantity,
                  purity_id: return_data.products[i].materials[x].purity_id,
                  unit_id: return_data.products[i].materials[x].unit_id,
                  category_id: return_data.products[i].category_id,
                },
                { where: { id: stockMaterial.id }, transaction: t },
              );
            } else {
              await StockMaterialModel.create(
                {
                  stock_id: stock.id,
                  material_id: return_data.products[i].materials[x].material_id,
                  weight: weightFormat(thisWeight),
                  weight_in_gram: weightFormat(weight_in_gram),
                  quantity: thisQty || 0,
                  purity_id: return_data.products[i].materials[x].purity_id,
                  unit_id: return_data.products[i].materials[x].unit_id,
                  category_id: return_data.products[i].category_id,
                },
                { transaction: t },
              );
            }
          } else {
            await StockMaterialModel.create(
              {
                stock_id: stock.id,
                material_id: return_data.products[i].materials[x].material_id,
                weight: weightFormat(thisWeight),
                weight_in_gram: weightFormat(weight_in_gram),
                quantity: thisQty || 1,
                purity_id: return_data.products[i].materials[x].purity_id,
                unit_id: return_data.products[i].materials[x].unit_id,
                category_id: return_data.products[i].category_id,
              },
              { transaction: t },
            );
          }
        }

        if (
          !from_retailer_customer ||
          (from_retailer_customer && return_status == "completed")
        ) {
          //update sale product is return and return weight & qty into sale product material table
          if (
            return_data.products[i].product_type == "material" ||
            (return_data.products[i].product_type != "material" &&
              isEmpty(return_data.products[i].certificate_no))
          ) {
            let total_return_weight =
              parseFloat(saleProduct.saleMaterials[0].return_weight) +
              parseFloat(return_data.products[i].materials[0].return_weight);
            let total_return_qty =
              parseInt(saleProduct.saleMaterials[0].return_qty) +
              parseInt(return_data.products[i].materials[0].return_qty);
            let is_return =
              total_return_qty >=
                parseInt(saleProduct.saleMaterials[0].quantity) ||
              total_return_weight >=
                parseFloat(saleProduct.saleMaterials[0].weight)
                ? true
                : false;

            await SaleProductModel.update(
              { is_return: is_return },
              { where: { id: saleProduct.id }, transaction: t },
            );
            await SaleProductMaterialModel.update(
              {
                return_qty: total_return_qty,
                return_weight: total_return_weight,
              },
              {
                where: { id: saleProduct.saleMaterials[0].id },
                transaction: t,
              },
            );
          } else {
            await SaleProductModel.update(
              { is_return: true },
              { where: { id: saleProduct.id }, transaction: t },
            );
          }
        }
      }

      if (
        !from_retailer_customer ||
        (from_retailer_customer && return_status == "completed")
      ) {
        //update sale total payable price
        let total_payable = parseFloat(sale.total_payable);
        let return_amount = parseFloat(data.product_amount);
        total_payable = priceFormat(total_payable - return_amount);
        let paid_amount = parseFloat(sale.paid_amount);
        let due_amount = priceFormat(total_payable - paid_amount, true);
        due_amount = due_amount < 0 ? 0 : due_amount;
        if (paid_amount > total_payable) {
          paid_amount = total_payable;
        }

        let return_amount_from_wallet = parseFloat(
          data.return_amount_from_wallet,
        );
        if (return_amount_from_wallet > 0) {
          if (data.payment_type == "return") {
            let payment2 = await PaymentModel.create({
              user_id: sale.user_id,
              payment_by: userID,
              table_type: "sale",
              table_id: sale.id,
              amount: data.return_amount_from_wallet,
              payment_mode: data.return_payment_mode,
              remaining_balance: 0,
              status: "success",
              payment_date: data.return_date
                ? moment(data.return_date, "MM/DD/YYYY").format("YYYY-MM-DD")
                : moment().format("YYYY-MM-DD"),
              payment_belongs: userID,
              type: "debit",
              purpose:
                sale.is_approval == 1
                  ? "sale on apporval refund"
                  : "sale refund",
              can_accept: false,
              is_advance: false,
            });
            await updateWalletRemainingBalance(userID, payment2.id);
          } else {
            // await PaymentModel.update(
            //   {
            //     is_advance: "1"
            //   },
            //   { where: { table_type: "sale", table_id: sale.id } }
            // );
            let payment2 = await PaymentModel.create({
              user_id: sale.user_id,
              payment_by: userID,
              table_type: "sale",
              table_id: sale.id,
              amount: data.return_amount_from_wallet,
              payment_mode: data.return_payment_mode,
              remaining_balance: 0,
              status: "success",
              payment_date: data.return_date
                ? moment(data.return_date, "MM/DD/YYYY").format("YYYY-MM-DD")
                : moment().format("YYYY-MM-DD"),
              payment_belongs: userID,
              type: "credit",
              purpose:
                sale.is_approval == 1
                  ? "sale on apporval refund"
                  : "sale refund",
              can_accept: false,
              is_advance: true,
            });
            await updateWalletRemainingBalance(userID, payment2.id);

            await updateAdvanceAmount(
              sale.user_id,
              userID,
              return_amount_from_wallet,
              true,
            );
          }
        }

        let total_return_amt = priceFormat(
          priceFormat(sale.return_amount) + return_amount,
        );
        await SaleModel.update(
          {
            return_amount: total_return_amt,
            total_payable: total_payable,
            due_amount: due_amount,
            paid_amount: paid_amount,
          },
          { where: { id: req.params.id }, transaction: t },
        );

        if (due_amount <= 0) {
          await NoticationModel.update(
            {
              is_read: true,
            },
            {
              where: {
                type_id: sale.id,
                [Op.or]: [{ type: "sale_due" }, { type: "sale_settlement" }],
              },
              transaction: t,
            },
          );
        }
      } else {
        await SaleModel.update(
          {
            status: "return_pending",
          },
          { where: { id: req.params.id }, transaction: t },
        );
      }
    });

    let allReturn = await SaleProductModel.count({
      where: { sale_id: sale.id, is_return: true },
    });
    allReturn = allReturn ?? 0;
    if (allReturn == sale.saleProducts.length) {
      await SaleModel.update(
        {
          status: "returned",
        },
        { where: { id: req.params.id } },
      );
    }

    res.send(formatResponse([], "Returned successfully!"));
  } catch (error) {
    addLog("err: " + error.toString());
    return res.status(errorCodes.default).send(formatErrorResponse());
  }
};

const formatStockMaterials = (stockMaterials) => {
  let materialItem = [];
  for (let item of stockMaterials) {
    materialItem.push({
      material_id: item.material_id,
      weight: item.weight,
      quantity: item.quantity,
      unit_id: item.unit_id,
      purity_id: item.purity_id,
    });
  }
  return materialItem;
};

/**
 * Return sale new
 *
 * @param {*} req
 * @param {*} res
 */
exports.returnSaleNew = async (req, res) => {
  let retailerRoleId = getRoleId("retailer");

  /* get sale details from id */
  let sale = await SaleModel.findOne({
    where: { id: req.params.id },
    include: [
      {
        model: SaleProductModel,
        as: "saleProducts",
      },
    ],
  });
  if (!sale) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Sale not found"));
  }
  compactLog("---------------------- sale ----------------------");
  /* get purchase details from sale id */
  let purchase = await PurchaseModel.findOne({
    where: { sale_id: sale.id },
    include: [
      {
        model: PurchaseProductModel,
        as: "purchaseProducts",
      },
    ],
  });
  if (!purchase) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Purchase not found"));
  }
  compactLog("---------------------- purchase ----------------------");

  /* posted data */
  let data = req.body;
  let return_products = req.body.return_products;
  let return_data = req.body.return_data;
  let userID = isManager(req) ? req.userId : await getWorkingUserID(req);

  /* buyer */
  let saleToUserId = sale.user_id;
  let saleToUserRole = await getUserColumnValue(saleToUserId, "role_id");

  /* if sold to retailer then the system stock checking will not needed */
  if (retailerRoleId != saleToUserRole) {
    /* --------------- check if product stock is assigned to the buyerId ---------------- */
    for (let i = 0; i < return_products.length; i++) {
      if (!return_products[i].is_return) {
        continue;
      }

      stockPurchse = null;
      if (return_data.products[i].product_type == "material") {
        if (!isEmpty(return_data.products[i].product_id)) {
          /* check for purchase record in stock */
          stockPurchse = await StockModel.findOne({
            where: {
              product_id: return_data.products[i].product_id,
              user_id: sale.user_id,
            },
          });
        } else {
          /* check for purchase record in stock */
          stockPurchse = await StockModel.findOne({
            where: {
              material_id: return_data.products[i].materials[0].material_id,
              purity_id: return_data.products[i].materials[0].purity_id,
              user_id: sale.user_id,
            },
          });
        }

        if (!stockPurchse) {
          return res
            .status(errorCodes.default)
            .send(
              formatErrorResponse(
                `Material with certificate no. ${return_data.products[i].certificate_no} is not available with this user.`,
              ),
            );
        } else {
          /* for each return materials */
          for (let mItem of return_data.products[i].materials) {
            let stockMPurchase = await StockMaterialModel.findOne({
              where: {
                stock_id: stockPurchse.id,
                material_id: mItem.material_id,
                purity_id: mItem.purity_id,
              },
            });

            if (!stockMPurchase) {
              return res
                .status(errorCodes.default)
                .send(
                  formatErrorResponse(
                    `Material ${mItem.material_name} with certificate no. ${return_data.products[i].certificate_no} is not available with this user.`,
                  ),
                );
            }
          }
        }
      } else {
        stockPurchse = await StockModel.findOne({
          where: {
            product_id: return_data.products[i].product_id,
            user_id: sale.user_id,
            certificate_no: cleanInput(return_data.products[i].certificate_no),
            purity_id: return_data.products[i].materials[0].purity_id,
            size_id: return_data.products[i].size_id,
          },
          include: [
            {
              model: StockMaterialModel,
              as: "stockMaterials",
              required: true,
              separate: true,
            },
          ],
        });

        if (stockPurchse) {
          let numMatched = 0;
          let stockMaterials = formatStockMaterials(
            stockPurchse.stockMaterials,
          );
          for (let x = 0; x < return_data.products[i].materials.length; x++) {
            let item = return_data.products[i].materials[x];
            let thisM = _.filter(stockMaterials, {
              material_id: item.material_id,
              purity_id: item.purity_id,
            });
            if (
              thisM.length &&
              thisM[0].material_id == item.material_id &&
              thisM[0].purity_id == item.purity_id &&
              thisM[0].unit_id == item.unit_id
            ) {
              numMatched++;
            }
          }
          compactLog(
            "---------------------- num of materials Matched in stock for existing checking ----------------------",
          );
          compactLog(numMatched);
          compactLog(return_data.products[i].materials.length);
          if (numMatched !== return_data.products[i].materials.length) {
            return res
              .status(errorCodes.default)
              .send(
                formatErrorResponse(
                  `Product with certificate no. ${return_data.products[i].certificate_no} does not have all the materials mentioned in return with this user.`,
                ),
              );
          }
        } else {
          return res
            .status(errorCodes.default)
            .send(
              formatErrorResponse(
                `Product with certificate no. ${return_data.products[i].certificate_no} is not available with this user.`,
              ),
            );
        }
      }
    }
    /* --------------- check if product stock is assigned to the buyerId ---------------- */
  }

  /* check if we returning stocks */
  let is_return_stock = false;
  for (let i = 0; i < return_products.length; i++) {
    if (!return_products[i].is_return) {
      continue;
    }
    /* if charges apply then it will be return stock flow */
    if (return_data.products[i].return_charge_percent > 0) {
      is_return_stock = true;
      break;
    }
  }

  /* returning from retailer customer if requested by SE or distributor */
  let from_retailer_customer = false,
    show_superadmin = false;
  if (isSalesExecutive(req) || isDistributor(req)) {
    from_retailer_customer = true;
  } else {
    is_return_stock = false;
  }

  /* return status will be if from_retailer_customer and (charges not applied) then "completed" else "pending" */
  let return_status = "pending";
  if (from_retailer_customer) {
    if (is_return_stock) {
      return_status = "pending";
    } else {
      return_status = "completed";
    }
  } else {
    return_status = "pending";
  }
  compactLog(
    "---------------------- return_status ----------------------",
    return_status,
  );

  //check has amount in wallet
  let return_amount_from_wallet = data.return_amount_from_wallet;
  if (
    data.payment_type == "return" &&
    (!from_retailer_customer ||
      (from_retailer_customer && return_status == "completed"))
  ) {
    /* not retailer customer or retailer customer and charges not applied */
    let walletBalance = await getWalletBalance(
      userID,
      data.return_payment_mode,
    );
    if (
      return_amount_from_wallet > 0 &&
      walletBalance < return_amount_from_wallet
    ) {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse("Insufficient wallet balance."));
    }
  }

  compactLog("---------------------- returnSaleNew ----------------------");
  try {
    /* start transaction */
    const trans = await sequelize.transaction(async (t) => {
      let sale_products = sale.saleProducts;

      /* convert all return data into Base64 */
      /* let req_data = JSON.stringify(data);
      req_data = new Buffer.from(req_data).toString("base64"); */
      let req_data = encodeForStorage(data);
      let saleReturnObj = await ReturnModel.create(
        {
          user_id: sale.user_id,
          seller_id: req.userId,
          table_id: sale.id,
          table_type: "sales",
          notes: return_data.notes,
          payment_mode: return_data.payment_mode,
          txn_id: return_data.transaction_no,
          cheque_no: return_data.cheque_no,
          status: return_status,
          product_amount: data.product_amount,
          charge: data.return_charge,
          total_amount: data.return_amount,
          accepted_at: moment().format("YYYY-MM-DD"),
          return_date: data.return_date
            ? moment(data.return_date, "MM/DD/YYYY").format("YYYY-MM-DD")
            : moment().format("YYYY-MM-DD"),
          req_data: req_data,
          show_superadmin: show_superadmin,
          from_retailer_customer: from_retailer_customer,
          return_amount_from_wallet: return_amount_from_wallet,
        },
        { transaction: t },
      );
      compactLog(
        "---------------------- ReturnModel create ----------------------",
      );
      /**
       * Return Products
       */
      for (let i = 0; i < return_products.length; i++) {
        if (!return_products[i].is_return) {
          continue;
        }

        //fetch purchase product by id
        let saleProduct = await SaleProductModel.findOne({
          where: { id: return_products[i].id },
          include: [
            {
              model: SaleProductMaterialModel,
              as: "saleMaterials",
              separate: true,
            },
          ],
        });
        compactLog(
          "---------------------- saleProduct fetch ----------------------",
          saleProduct.id,
        );
        let purchaseProduct = await PurchaseProductModel.findOne({
          where: {
            purchase_id: purchase.id,
            product_id: saleProduct.product_id,
            certificate_no: cleanInput(saleProduct.certificate_no),
            size_id: saleProduct.size_id,
          },
          include: [
            {
              model: PurchaseProductMaterialModel,
              as: "purchaseMaterials",
            },
          ],
        });
        compactLog(
          "---------------------- purchaseProduct fetch ----------------------",
          purchaseProduct.id,
        );
        /**
         * moved to stock
         */
        compactLog(
          "---------------------- preparing stock entry ----------------------",
        );
        let stock_type = "product";
        if (return_data.products[i].return_charge_percent > 0) {
          stock_type = "return";
        }
        compactLog(
          "---------------------- stock_type ----------------------",
          stock_type,
        );

        let quantity = 0,
          weight_in_gram = 0;
        for (let x = 0; x < return_data.products[i].materials.length; x++) {
          quantity +=
            return_data.products[i].product_type == "material" ||
            isEmpty(return_data.products[i].certificate_no)
              ? parseFloat(return_data.products[i].materials[x].return_qty)
              : return_data.products[i].materials[x].quantity;
          let thisWeight =
            return_data.products[i].product_type == "material" ||
            isEmpty(return_data.products[i].certificate_no)
              ? parseFloat(return_data.products[i].materials[x].return_weight)
              : return_data.products[i].materials[x].weight;
          weight_in_gram += convertUnitToGram(
            return_data.products[i].materials[x].unit_name,
            thisWeight,
          );
        }
        let stock = null;
        if (return_data.products[i].product_type == "material") {
          if (return_status == "completed") {
            let result = await updateOrCreate(
              StockModel,
              {
                user_id: req.userId,
                type: stock_type,
                product_id: return_data.products[i].product_id,
                purity_id: return_data.products[i].materials[0].purity_id,
              },
              {
                quantity: quantity,
                total_weight: weight_in_gram,
                user_id: req.userId,
                type: stock_type,
                product_id: return_data.products[i].product_id,
                purity_id: return_data.products[i].materials[0].purity_id,
              },
              t,
              ["quantity", "total_weight"],
            );
            stock = result.item;
          } else {
            // compactLog("req =============== 1 ", );
            stock = await StockModel.create(
              {
                product_id: return_data.products[i].product_id,
                quantity: quantity,
                total_weight: weight_in_gram,
                user_id: req.userId,
                type: stock_type, // "return" as stock type
                return_id: saleReturnObj.id,
                purity_id: return_data.products[i].materials[0].purity_id,
              },
              { transaction: t },
            );
          }
        } else {
          // compactLog("req =============== 2", return_data);

          // Try to get current_image from multiple sources (prioritize most recent/updated image)
          let current_image = null;

          // First, check if current_image is in return_data (if provided)
          if (
            return_data.products[i] &&
            return_data.products[i].current_image
          ) {
            current_image = return_data.products[i].current_image;
          } else if (return_data.products[i].certificate_no) {
            // Second, check Stock records first (most recent/updated - has the latest image)
            let stockQuery = {
              where: {
                certificate_no: {
                  [Op.like]: `${return_data.products[i].certificate_no}`,
                },
              },
              order: [["id", "DESC"]], // Get the most recent one
            };
            let existingStock = await StockModel.findOne(stockQuery, {
              transaction: t,
            });
            if (existingStock && existingStock.current_image) {
              current_image = existingStock.current_image;
            } else {
              // Third, check PurchaseProduct records (fallback)
              let purchaseQuery = {
                where: {
                  certificate_no: {
                    [Op.like]: `${return_data.products[i].certificate_no}`,
                  },
                },
                order: [["id", "DESC"]], // Get the most recent one
              };
              let purchaseProduct = await PurchaseProductModel.findOne(
                purchaseQuery,
                { transaction: t },
              );
              if (purchaseProduct && purchaseProduct.current_image) {
                current_image = purchaseProduct.current_image;
              }
            }
          }

          stock = await StockModel.create(
            {
              product_id: return_data.products[i].product_id,
              size_id: return_data.products[i].size_id || null,
              purity_id: return_data.products[i].materials[0].purity_id,
              certificate_no: cleanInput(
                return_data.products[i].certificate_no,
              ),
              quantity: !isEmpty(return_data.products[i].certificate_no)
                ? 1
                : parseInt(return_data.products[i].materials[0].return_qty),
              current_image: current_image,
              total_weight: weight_in_gram,
              user_id: req.userId,
              type: stock_type,
              return_id: saleReturnObj.id,
            },
            { transaction: t },
          );
        }
        compactLog(
          "---------------------- StockModel create as return ----------------------",
        );
        //insert into return product table
        let returnSaleProduct = await ReturnProductModel.create(
          {
            return_id: saleReturnObj.id,
            table_id: sale_products[i].id,
            table_type: "sale_products",
            sub_total: return_data.products[i].return_amount,
          },
          { transaction: t },
        );
        compactLog(
          "---------------------- ReturnProductModel create ----------------------",
        );
        //insert into return product materials table
        for (let x = 0; x < return_data.products[i].materials.length; x++) {
          let thisQty =
            return_data.products[i].product_type == "material" ||
            isEmpty(return_data.products[i].certificate_no)
              ? parseFloat(return_data.products[i].materials[x].return_qty)
              : return_data.products[i].materials[x].quantity;
          let thisWeight =
            return_data.products[i].product_type == "material" ||
            isEmpty(return_data.products[i].certificate_no)
              ? parseFloat(return_data.products[i].materials[x].return_weight)
              : return_data.products[i].materials[x].weight;
          await ReturnProductMaterialModel.create(
            {
              return_id: saleReturnObj.id,
              return_product_id: returnSaleProduct.id,
              material_id: return_data.products[i].materials[x].material_id,
              weight: thisWeight,
              quantity: thisQty,
              purity_id: return_data.products[i].materials[x].purity_id,
              unit_id: return_data.products[i].materials[x].unit_id,
            },
            { transaction: t },
          );
          compactLog(
            "---------------------- ReturnProductMaterialModel create ----------------------",
          );
          /**
           * add to stock materials
           */
          let weight_in_gram = convertUnitToGram(
            return_data.products[i].materials[x].unit_name,
            thisWeight,
          );
          if (return_data.products[i].product_type == "material") {
            let stockMaterial = await StockMaterialModel.findOne({
              where: {
                stock_id: stock.id,
                material_id: return_data.products[i].materials[x].material_id,
                purity_id: return_data.products[i].materials[x].purity_id,
              },
            });
            if (stockMaterial) {
              let thisquantity = thisQty
                ? parseInt(stockMaterial.quantity) + parseInt(thisQty)
                : stockMaterial.quantity;
              await StockMaterialModel.update(
                {
                  weight: weightFormat(
                    parseFloat(stockMaterial.weight) + weightFormat(thisWeight),
                  ),
                  weight_in_gram: weightFormat(
                    parseFloat(stockMaterial.weight_in_gram) +
                      weightFormat(weight_in_gram),
                  ),
                  quantity: thisquantity,
                  purity_id: return_data.products[i].materials[x].purity_id,
                  unit_id: return_data.products[i].materials[x].unit_id,
                  category_id: return_data.products[i].category_id,
                },
                { where: { id: stockMaterial.id }, transaction: t },
              );
            } else {
              await StockMaterialModel.create(
                {
                  stock_id: stock.id,
                  material_id: return_data.products[i].materials[x].material_id,
                  weight: weightFormat(thisWeight),
                  weight_in_gram: weightFormat(weight_in_gram),
                  quantity: thisQty || 1,
                  purity_id: return_data.products[i].materials[x].purity_id,
                  unit_id: return_data.products[i].materials[x].unit_id,
                  category_id: return_data.products[i].category_id,
                },
                { transaction: t },
              );
            }
          } else {
            await StockMaterialModel.create(
              {
                stock_id: stock.id,
                material_id: return_data.products[i].materials[x].material_id,
                weight: weightFormat(thisWeight),
                weight_in_gram: weightFormat(weight_in_gram),
                quantity: thisQty || 1,
                purity_id: return_data.products[i].materials[x].purity_id,
                unit_id: return_data.products[i].materials[x].unit_id,
                category_id: return_data.products[i].category_id,
              },
              { transaction: t },
            );
          }
        }
        compactLog(
          "---------------------- StockMaterialModel create ----------------------",
        );
        /* if (
          !from_retailer_customer ||
          (from_retailer_customer && return_status == "completed")
        ) { */
        //update sale product is return and return weight & qty into sale product material table
        if (return_data.products[i].product_type == "material") {
          compactLog(
            "update sale product is return and return weight & qty into sale & purchase product material table",
          );
          let total_return_weight =
            parseFloat(saleProduct.saleMaterials[0].return_weight) +
            parseFloat(return_data.products[i].materials[0].return_weight);
          let total_return_qty =
            parseInt(saleProduct.saleMaterials[0].return_qty) +
            parseInt(return_data.products[i].materials[0].return_qty);
          let is_return =
            total_return_qty >=
              parseInt(saleProduct.saleMaterials[0].quantity) ||
            total_return_weight >=
              parseFloat(saleProduct.saleMaterials[0].weight)
              ? true
              : false;

          await SaleProductModel.update(
            { is_return: is_return },
            { where: { id: saleProduct.id }, transaction: t },
          );
          await SaleProductMaterialModel.update(
            {
              return_qty: total_return_qty,
              return_weight: total_return_weight,
            },
            { where: { id: saleProduct.saleMaterials[0].id }, transaction: t },
          );

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
          compactLog(
            "---------------------- Weight updated into Product Material for purchae and sale Model ----------------------",
          );
        } else {
          await SaleProductModel.update(
            { is_return: true },
            { where: { id: saleProduct.id }, transaction: t },
          );

          await PurchaseProductModel.update(
            { is_return: true },
            { where: { id: purchaseProduct.id }, transaction: t },
          );
        }
        compactLog(
          "---------------------- Weight updated into Product for purchae and sale Model ----------------------",
        );
        //}

        //if(from_retailer_customer && return_status == "pending") {
        /**
         * START - Remove from stock table
         */
        //if (purchase.is_approved == 1) {
        compactLog(
          "---------------------- Removing from stock ----------------------",
        );
        stock = null;
        stockPurchse = null;
        if (return_data.products[i].product_type == "material") {
          compactLog("+++++++++++++++ material stock +++++++++++++++");
          if (!isEmpty(return_data.products[i].product_id)) {
            compactLog("+++++++++++++++ product stock +++++++++++++++");
            compactLog({
              product_id: return_data.products[i].product_id,
              user_id: req.userId,
            });
            stock = await StockModel.findOne({
              where: {
                product_id: return_data.products[i].product_id,
                user_id: req.userId,
              },
            });
            compactLog("+++++++++++++++ purchase stock +++++++++++++++");
            compactLog({
              product_id: return_data.products[i].product_id,
              user_id: sale.userId,
            });
            stockPurchse = await StockModel.findOne({
              where: {
                product_id: return_data.products[i].product_id,
                user_id: sale.user_id,
              },
            });
          } else {
            stock = await StockModel.findOne({
              where: {
                material_id: return_data.products[i].materials[0].material_id,
                user_id: req.userId,
              },
            });
            stockPurchse = await StockModel.findOne({
              where: {
                material_id: return_data.products[i].materials[0].material_id,
                user_id: sale.user_id,
              },
            });
          }

          /* if (!stock) {
            // Try to get current_image from multiple sources
            let current_image = null;
            
            // First, check if image is provided in return_data (from frontend)
            if (return_data.products[i] && return_data.products[i].current_image) {
              // Check if it's a base64 string (needs upload) or a path (already uploaded)
              if (return_data.products[i].current_image.startsWith('data:') || return_data.products[i].current_image.startsWith('iVBOR')) {
                // It's a base64 string, upload it
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
            } else if (return_data.products[i].certificate_no) {
              // Second, check Stock records first (most recent/updated)
              let stockQuery = {
                where: {
                  certificate_no: {
                    [Op.like]: return_data.products[i].certificate_no
                  }
                },
                order: [['id', 'DESC']]
              };
              let existingStock = await StockModel.findOne(stockQuery);
              if (existingStock && existingStock.current_image) {
                current_image = existingStock.current_image;
              } else {
                // Third, check PurchaseProduct by certificate_no
                let purchaseQuery = {
                  where: {
                    certificate_no: {
                      [Op.like]: return_data.products[i].certificate_no
                    }
                  },
                  order: [['id', 'DESC']]
                };
                let purchaseProduct = await PurchaseProductModel.findOne(purchaseQuery);
                if (purchaseProduct && purchaseProduct.current_image) {
                  current_image = purchaseProduct.current_image;
                } else if (return_data.products[i] && return_data.products[i]?.id) {
                  // Fourth, check PurchaseProduct by ID
                  let purchaseProductById = await PurchaseProductModel.findOne({
                    where: { id: return_data.products[i]?.id }
                  });
                  if (purchaseProductById && purchaseProductById.current_image) {
                    current_image = purchaseProductById.current_image;
                  }
                }
              }
            }
            
            stock = await StockModel.create(
              {
                purchase_id: purchase?.id,
                current_image: current_image,
                purchase_product_id: return_data.products[i]?.id,
                product_id: return_data.products[i].product_id,
                size_id: return_data.products[i].size_id || null,
                purity_id: return_data.products[i].materials[0].purity_id,
                certificate_no: return_data.products[i].certificate_no,
                quantity: 1,
                total_weight: return_data.products[i].total_weight,
                user_id: req.userId,
              },
              { transaction: t }
            );
          } */

          let quantity = 0,
            weight = 0,
            unit_name = "";
          for (let mItem of return_data.products[i].materials) {
            let stockM = null;
            let stockMPurchase = null;

            if (stock != null) {
              stockM = await StockMaterialModel.findOne({
                where: {
                  stock_id: stock?.id,
                  material_id: mItem.material_id,
                  purity_id: mItem.purity_id,
                },
                transaction: t,
              });
            }
            if (stockPurchse != null) {
              stockMPurchase = await StockMaterialModel.findOne({
                where: {
                  stock_id: stockPurchse?.id,
                  material_id: mItem.material_id,
                  purity_id: mItem.purity_id,
                },
                transaction: t,
              });
            }
            compactLog("---------------------- stockM ----------------------");
            compactLog(stockM);
            compactLog(
              "---------------------- stockMPurchase ----------------------",
            );
            compactLog(stockMPurchase);
            weight += mItem.return_weight ? parseInt(mItem.return_weight) : 0;
            if (stockM) {
              /* await StockMaterialModel.update(
                {
                  weight: weightFormat(
                    parseFloat(stockM.weight) + parseFloat(mItem.return_weight)
                  ),
                  quantity:
                    parseFloat(stockM.quantity) + parseInt(mItem.return_qty),
                },
                { where: { id: stockM?.id }, transaction: t }
              ); */
            } else {
              /* await StockMaterialModel.create(
                {
                  stock_id: stock?.id,
                  material_id: mItem.material_id,
                  weight: weightFormat(mItem.weight),
                  weight_in_gram: weightFormat(mItem.weight_in_gram),
                  quantity: mItem.quantity || 1,
                  purity_id: mItem.purity_id,
                  unit_id: mItem.unit_id,
                  category_id: return_data.products[i].category_id,
                },
                { transaction: t }
              ); */
            }
            compactLog(
              "---------------------- After stockM update ----------------------",
            );
            if (stockMPurchase) {
              await StockMaterialModel.update(
                {
                  weight: weightFormat(
                    parseFloat(stockMPurchase.weight) -
                      parseFloat(mItem.return_weight),
                  ),
                  quantity:
                    parseFloat(stockMPurchase.quantity) -
                    parseInt(mItem.return_qty),
                },
                { where: { id: stockMPurchase?.id }, transaction: t },
              );
            }
            compactLog(
              "---------------------- After stockMPurchase update ----------------------",
            );
            unit_name = mItem.unit_name;
            weight = convertUnitToGram(unit_name, weight);
            quantity += parseInt(mItem.return_qty);
          }

          if (stock && parseFloat(stock.total_weight) <= weight) {
            //await StockModel.destroy({ where: { id: stock.id }, transaction: t });
          } else {
            let return_weight_in_gram = convertUnitToGram(
              unit_name,
              return_data.products[i].materials[0].return_weight,
            );
            /* await StockModel.update(
              {
                quantity: parseFloat(stock.quantity) + parseFloat(quantity),
                total_weight:
                  parseFloat(stock.total_weight) +
                  parseFloat(return_weight_in_gram),
              },
              { where: { id: stock?.id }, transaction: t }
            ); */
          }
          compactLog(
            "---------------------- stockPurchse update ----------------------",
          );
          if (stockPurchse) {
            if (parseFloat(stockPurchse.total_weight) <= weight) {
              await StockModel.destroy({
                where: { id: stockPurchse?.id },
                transaction: t,
              });
            } else {
              let return_weight_in_gram = convertUnitToGram(
                unit_name,
                return_data.products[i].materials[0].return_weight,
              );
              await StockModel.update(
                {
                  quantity:
                    parseFloat(stockPurchse.quantity) - parseFloat(quantity),
                  total_weight:
                    parseFloat(stockPurchse.total_weight) -
                    parseFloat(return_weight_in_gram),
                },
                { where: { id: stockPurchse?.id }, transaction: t },
              );
            }
          }
          compactLog(
            "---------------------- End of stockPurchse update ----------------------",
          );
        } else {
          compactLog("+++++++++++++++ product stock +++++++++++++++");
          stock = await StockModel.findOne({
            where: {
              product_id: return_data.products[i].product_id,
              user_id: req.userId,
              certificate_no: cleanInput(
                return_data.products[i].certificate_no,
              ),
              size_id: return_data.products[i].size_id,
              purity_id: return_data.products[i].materials[0].purity_id,
            },
            include: [
              {
                model: StockMaterialModel,
                as: "stockMaterials",
                required: true,
                separate: true,
              },
            ],
          });
          compactLog(
            "---------------------- Stock to check for create ----------------------",
          );
          compactLog(stock);
          /* if (!stock) {
            // Try to get current_image from multiple sources
            let current_image = null;
            
            // First, check if image is provided in return_data (from frontend)
            if (return_data.products[i] && return_data.products[i].current_image) {
              // Check if it's a base64 string (needs upload) or a path (already uploaded)
              if (return_data.products[i].current_image.startsWith('data:') || return_data.products[i].current_image.startsWith('iVBOR')) {
                // It's a base64 string, upload it
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
            } else if (return_data.products[i].certificate_no) {
              // Second, check Stock records first (most recent/updated)
              let stockQuery = {
                where: {
                  certificate_no: {
                    [Op.like]: return_data.products[i].certificate_no
                  }
                },
                order: [['id', 'DESC']]
              };
              let existingStock = await StockModel.findOne(stockQuery);
              if (existingStock && existingStock.current_image) {
                current_image = existingStock.current_image;
              } else {
                // Third, check PurchaseProduct by certificate_no
                let purchaseQuery = {
                  where: {
                    certificate_no: {
                      [Op.like]: return_data.products[i].certificate_no
                    }
                  },
                  order: [['id', 'DESC']]
                };
                let purchaseProduct = await PurchaseProductModel.findOne(purchaseQuery);
                if (purchaseProduct && purchaseProduct.current_image) {
                  current_image = purchaseProduct.current_image;
                } else if (return_data.products[i].id) {
                  // Fourth, check PurchaseProduct by ID
                  let purchaseProductById = await PurchaseProductModel.findOne({
                    where: { id: return_data.products[i].id }
                  });
                  if (purchaseProductById && purchaseProductById.current_image) {
                    current_image = purchaseProductById.current_image;
                  }
                }
              }
            }
            compactLog("---------------------- current_image ----------------------");
            compactLog(current_image);
            stock = await StockModel.create(
              {
                purchase_id: purchase.id,
                current_image: current_image,
                purchase_product_id: return_data.products[i].id,
                product_id: return_data.products[i].product_id,
                size_id: return_data.products[i].size_id || null,
                purity_id: return_data.products[i].materials[0].purity_id,
                certificate_no: return_data.products[i].certificate_no,
                quantity: return_data.products[i].certificate_no != ""?1:return_data.products[i].materials[0]?.quantity,
                total_weight: return_data.products[i].total_weight,
                user_id: req.userId,
              },
              { transaction: t }
            );
            compactLog("---------------------- Created Stock ----------------------");
            compactLog(stock);
            for (let x = 0; x < return_data.products[i].materials.length; x++) {
              await StockMaterialModel.create(
                {
                  stock_id: stock?.id,
                  material_id: return_data.products[i].materials[x].material_id,
                  weight: weightFormat(
                    return_data.products[i].materials[x].weight
                  ),
                  weight_in_gram: weightFormat(
                    return_data.products[i].materials[x].weight_in_gram
                  ),
                  quantity: return_data.products[i].materials[x].quantity || 1,
                  purity_id: return_data.products[i].materials[x].purity_id,
                  unit_id: return_data.products[i].materials[x].unit_id,
                  category_id: return_data.products[i].category_id,
                },
                { transaction: t }
              );
            }
            compactLog(
              "---------------------- Created Stock Materials ----------------------"
            );
          } */

          stockPurchse = await StockModel.findOne({
            where: {
              product_id: return_data.products[i].product_id,
              user_id: sale.user_id,
              certificate_no: cleanInput(
                return_data.products[i].certificate_no,
              ),
              size_id: return_data.products[i].size_id,
            },
            include: [
              {
                model: StockMaterialModel,
                as: "stockMaterials",
                required: true,
                separate: true,
              },
            ],
          });
          compactLog(
            "---------------------- Stock to check for delete ----------------------",
          );
          compactLog(stock);
          compactLog(stockPurchse);

          /* if (stock) {
            let numMatched = 0;
            let stockMaterials = formatStockMaterials(stock.stockMaterials);
            for (
              let x = 0;
              x < return_data.products[i].materials.length;
              x++
            ) {
              let item = return_data.products[i].materials[x];
              let thisM = _.filter(stockMaterials, {
                material_id: item.material_id,
              });
              if (
                thisM.length &&
                thisM[0].material_id == item.material_id &&
                thisM[0].purity_id == item.purity_id &&
                thisM[0].unit_id == item.unit_id
              ) {
                numMatched++;
              }
            }
            compactLog("---------------------- num of materials Matched in stock ----------------------");
            compactLog(numMatched);
            compactLog(return_data.products[i].materials.length);
            if (numMatched == return_data.products[i].materials.length) {
              await StockMaterialModel.destroy({
                where: { stock_id: stock.id }, transaction: t
              });
              await new Promise((resolve) => setTimeout(resolve, 500)); // Add delay
              let cart = await cartModel.findOne({
                where: { type: "sale", stock_id: stock.id },
              });
              await StockModel.destroy({ where: { id: stock.id }, transaction: t });
              await new Promise((resolve) => setTimeout(resolve, 500)); // Add delay
              if (cart) {
                await cartMaterialsModel.destroy({
                  where: { cart_id: cart.id }, transaction: t
                });
                await new Promise((resolve) => setTimeout(resolve, 500)); // Add delay
                await cartModel.destroy({ where: { id: cart.id } , transaction: t});
              }
            }
          } */

          if (stockPurchse) {
            let numMatched = 0;
            let stockMaterials = formatStockMaterials(
              stockPurchse.stockMaterials,
            );
            for (let x = 0; x < return_data.products[i].materials.length; x++) {
              let item = return_data.products[i].materials[x];
              let thisM = _.filter(stockMaterials, {
                material_id: item.material_id,
                purity_id: item.purity_id,
              });
              if (
                thisM.length &&
                thisM[0].material_id == item.material_id &&
                thisM[0].purity_id == item.purity_id &&
                thisM[0].unit_id == item.unit_id
              ) {
                numMatched++;
              }
            }
            compactLog(
              "---------------------- num of materials Matched in stock ----------------------",
            );
            compactLog(numMatched);
            compactLog(return_data.products[i].materials.length);
            if (numMatched == return_data.products[i].materials.length) {
              await StockMaterialModel.destroy({
                where: { stock_id: stockPurchse?.id },
                transaction: t,
              });
              await new Promise((resolve) => setTimeout(resolve, 500)); // Add delay
              let cart = await cartModel.findOne({
                where: { type: "sale", stock_id: stockPurchse?.id },
              });
              await StockModel.destroy({
                where: { id: stockPurchse?.id },
                transaction: t,
              });
              await new Promise((resolve) => setTimeout(resolve, 500)); // Add delay
              if (cart) {
                await cartMaterialsModel.destroy({
                  where: { cart_id: cart.id },
                  transaction: t,
                });
                await new Promise((resolve) => setTimeout(resolve, 500)); // Add delay
                await cartModel.destroy({
                  where: { id: cart.id },
                  transaction: t,
                });
              }
            }
          }
        }
        //}
        //}

        /**
         * END - Remove from stock table
         */
      }
      compactLog(
        "---------------------- Delete StockModel, StockMaterialModel and cartModel,cartMaterialsModel  ----------------------",
      );

      if (
        !from_retailer_customer ||
        (from_retailer_customer && return_status == "completed")
      ) {
        //update sale total payable price
        let total_payable = parseFloat(sale.total_payable);
        let return_amount = parseFloat(data.product_amount);
        total_payable = priceFormat(total_payable - return_amount);
        let paid_amount = parseFloat(sale.paid_amount);
        let due_amount = priceFormat(total_payable - paid_amount, true);
        due_amount = due_amount < 0 ? 0 : due_amount;

        let return_amount_from_wallet = parseFloat(
          data.return_amount_from_wallet,
        );

        //paid_amount += return_amount_from_wallet;

        /* if (paid_amount > total_payable) {
          paid_amount = total_payable;
        } */

        if (return_amount_from_wallet > 0) {
          if (data.payment_type == "return") {
            let payment2 = await PaymentModel.create({
              user_id: sale.user_id,
              payment_by: userID,
              table_type: "sale",
              table_id: sale.id,
              amount: data.return_amount_from_wallet,
              payment_mode: data.return_payment_mode,
              remaining_balance: 0,
              status: "success",
              payment_date: data.return_date
                ? moment(data.return_date, "MM/DD/YYYY").format("YYYY-MM-DD")
                : moment().format("YYYY-MM-DD"),
              payment_belongs: userID,
              type: "debit",
              purpose:
                sale.is_approval == 1
                  ? "sale on apporval refund"
                  : "sale refund",
              can_accept: false,
              is_advance: false,
            });
            compactLog(
              "---------------------- PaymentModel create for sale refund ----------------------",
            );
            await new Promise((resolve) => setTimeout(resolve, 500)); // Add delay
            await updateWalletRemainingBalance(userID, payment2.id);
            compactLog(
              "---------------------- updateWalletRemainingBalance for sale refund ----------------------",
            );
            await new Promise((resolve) => setTimeout(resolve, 500)); // Add delay
            let payment3 = await PaymentModel.create({
              user_id: sale.user_id,
              payment_by: userID,
              table_type: "purchase",
              table_id: purchase.id,
              amount: data.return_amount_from_wallet,
              payment_mode: data.return_payment_mode,
              remaining_balance: 0,
              status: "success",
              payment_date: data.return_date
                ? moment(data.return_date, "MM/DD/YYYY").format("YYYY-MM-DD")
                : moment().format("YYYY-MM-DD"),
              payment_belongs: sale.user_id,
              type: "credit",
              purpose: "return purchase",
              can_accept: false,
              is_advance: false,
            });
            compactLog(
              "---------------------- PaymentModel create for return purchase ----------------------",
            );
            await new Promise((resolve) => setTimeout(resolve, 500)); // Add delay
            await updateWalletRemainingBalance(sale.user_id, payment3.id);
            compactLog(
              `---------------------- updateWalletRemainingBalance for return purchase ----------------------`,
            );
            await new Promise((resolve) => setTimeout(resolve, 200)); // Add delay
          } else {
            // await PaymentModel.update(
            //   {
            //     is_advance: "1"
            //   },
            //   { where: { table_type: "sale", table_id: sale.id } }
            // );

            let payment = await PaymentModel.create({
              user_id: sale.user_id,
              payment_by: userID,
              table_type: "sale",
              table_id: sale.id,
              amount: data.return_amount_from_wallet,
              payment_mode: data.return_payment_mode,
              remaining_balance: 0,
              status: "success",
              payment_date: data.return_date
                ? moment(data.return_date, "MM/DD/YYYY").format("YYYY-MM-DD")
                : moment().format("YYYY-MM-DD"),
              payment_belongs: userID,
              type: "credit",
              purpose:
                sale.is_approval == 1
                  ? "sale on apporval refund"
                  : "sale refund",
              can_accept: false,
              is_advance: true,
            });
            compactLog(
              "---------------------- PaymentModel create for return purchase ----------------------",
            );
            await new Promise((resolve) => setTimeout(resolve, 500)); // Add delay
            await updateWalletRemainingBalance(sale.user_id, payment.id);

            await updateAdvanceAmount(
              sale.user_id,
              userID,
              return_amount_from_wallet,
              true,
            );
            await new Promise((resolve) => setTimeout(resolve, 200)); // Add delay
          }
        }
        compactLog(
          "---------------------- update wallet balance ----------------------",
        );
        let total_return_amt = priceFormat(
          priceFormat(sale.return_amount) + return_amount,
        );
        await SaleModel.update(
          {
            return_amount: total_return_amt,
            total_payable: total_payable,
            due_amount: due_amount,
            paid_amount: paid_amount,
          },
          { where: { id: req.params.id }, transaction: t },
        );
        compactLog(
          "---------------------- SaleModel update ----------------------",
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
        await PurchaseModel.update(
          {
            return_amount: total_return_amt,
            total_payable: total_payable,
            due_amount: due_amount,
          },
          { where: { sale_id: sale.id }, transaction: t },
        );
        compactLog(
          "---------------------- PurchaseModel update ----------------------",
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (due_amount <= 0) {
          await NoticationModel.update(
            {
              is_read: true,
            },
            {
              where: {
                type_id: sale.id,
                [Op.or]: [{ type: "sale_due" }, { type: "sale_settlement" }],
              },
              transaction: t,
            },
          );
        }
        compactLog(
          "---------------------- NoticationModel update ----------------------",
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
        /* make return as complete */
        await ReturnModel.update(
          {
            status: "completed",
          },
          { where: { id: saleReturnObj.id }, transaction: t },
        );
        compactLog(
          "---------------------- ReturnModel update ----------------------",
        );
        stock = await StockModel.findOne({
          where: {
            return_id: saleReturnObj.id,
          },
          transaction: t,
        });
        compactLog(
          "---------------------- StockModel find for return_id ----------------------",
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
        /* if(stock){
          await StockMaterialModel.destroy({
            where: { stock_id: stock.id },
            transaction: t,
          });
        } */
        compactLog(
          "---------------------- StockMaterialModel destroy for return_id ----------------------",
        );
        await new Promise((resolve) => setTimeout(resolve, 500)); // Add delay
        /* await StockModel.destroy({
          where: { return_id: saleReturnObj.id },
          transaction: t,
        }); */
        compactLog(
          "---------------------- make return as complete ----------------------",
        );
      }
    });

    compactLog(
      "---------------------- update status in sale and purchase ----------------------",
    );

    let allReturnSale = await SaleProductModel.count({
      where: { sale_id: sale.id, is_return: true },
    });
    allReturnSale = allReturnSale ?? 0;
    compactLog(allReturnSale);
    compactLog(sale.saleProducts.length);
    if (allReturnSale == sale.saleProducts.length) {
      await SaleModel.update(
        {
          status: return_status == "completed" ? "returned" : "return_pending",
        },
        { where: { id: req.params.id } },
      );
    }
    compactLog(
      "---------------------- SaleModel Status Update ----------------------",
    );
    let allReturnPurchase = await PurchaseProductModel.count({
      where: { purchase_id: purchase.id, is_return: true },
    });
    allReturnPurchase = allReturnPurchase ?? 0;
    compactLog(allReturnPurchase);
    compactLog(purchase.purchaseProducts.length);
    if (allReturnPurchase == purchase.purchaseProducts.length) {
      await PurchaseModel.update(
        {
          status: return_status == "completed" ? "returned" : "return_pending",
        },
        { where: { sale_id: sale.id } },
      );
    }
    compactLog(
      "---------------------- PurchaseModel Status Update ----------------------",
    );

    res.send(formatResponse([], "Returned successfully!"));
  } catch (error) {
    compactLog(error.toString());
    addLog("err: " + error.toString());
    return res.status(errorCodes.default).send(formatErrorResponse());
  }
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
    let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
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
            { product_id: product.id, user_id: userID },
            { product_id: product.id },
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
                  purity_id: thisItem.purity_id,
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
        if (product.type == "material" || isEmpty(product.certificate_no)) {
          let stock2 = await StockModel.findOne({
            where: { product_id: product.id, user_id: sale.user_id },
          });
          let quantity = 0;
          for (let mItem of sale.saleProducts[i].saleMaterials) {
            let stockM = await StockMaterialModel.findOne({
              where: {
                stock_id: stock2.id,
                material_id: mItem.material_id,
                purity_id: mItem.purity_id,
              },
            });
            if (stockM) {
              await StockMaterialModel.update(
                {
                  weight: weightFormat(
                    parseFloat(stockM.weight) - parseFloat(mItem.weight),
                  ),
                  quantity:
                    parseFloat(stockM.quantity) - parseFloat(mItem.quantity),
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
 * Return Stock Transfer
 *
 * @param {*} req
 * @param {*} res
 */
exports.returnStockTransfer = async (req, res) => {
  try {
    let data = req.body;
    let user = await UserModel.findByPk(req.userId);
    let admin_id = await getDistributorAdmin(user.parent_id);
    let userID = await getWorkingUserID(req);
    let invoice_number = null;
    let req_data = {};
    let req_data_for_purchase = data;
    let status = "paid",
      paid_amount = 0,
      due_amount = 0;
    let is_approved = 0;
    let saleObj = {
      user_id: admin_id,
      is_assigned: true,
      sale_by: userID,
      invoice_number: invoice_number,
      invoice_date: moment().format("YYYY-MM-DD"),
      is_approved: is_approved,
      status: status,
    };
    let sale = await SaleModel.create(saleObj);

    let purchase = null;
    if (!data.on_approval && !data.order_from_customer) {
      let purchaseObj = {
        supplier_id: userID,
        is_assigned: true,
        sale_id: sale.id,
        user_id: admin_id,
        invoice_number: invoice_number,
        invoice_date: moment().format("YYYY-MM-DD"),
        status: status,
        is_approved: is_approved,
        type: "return_product",
      };
      purchase = await PurchaseModel.create(purchaseObj);
    }

    let stocks = await StockModel.findAll({
      where: { id: { [Op.in]: data.stock_ids } },
      include: [
        {
          model: StockMaterialModel,
          as: "stockMaterials",
          required: true,
          separate: true,
          include: [
            {
              model: MaterialModel,
              as: "material",
            },
            {
              model: UnitModel,
              as: "unit",
            },
          ],
        },
      ],
    });
    let reqDataP = [];
    for (let i = 0; i < stocks.length; i++) {
      let thisItem = stocks[i];
      let thisObj = {
        sale_id: sale.id,
        product_id: thisItem.product_id,
        size_id: thisItem.size_id || null,
        certificate_no: cleanInput(thisItem.certificate_no),
        total_weight: weightFormat(thisItem.total_weight),
      };
      let saleProduct = await SaleProductModel.create(thisObj);
      //let product = await ProductModel.findByPk(thisItem.product_id);
      let thisObj2 = {
        purchase_id: purchase.id,
        product_id: thisItem.product_id,
        size_id: thisItem.size_id || null,
        certificate_no: cleanInput(thisItem.certificate_no),
        total_weight: weightFormat(thisItem.total_weight),
        current_image: thisItem.current_image || null,
      };
      let purchaseProduct = await PurchaseProductModel.create(thisObj2);

      //insert into sale product materials
      let reqDataM = [];
      for (let x = 0; x < thisItem.stockMaterials.length; x++) {
        let thisMObj = {
          sale_id: sale.id,
          sale_product_id: saleProduct.id,
          material_id: thisItem.stockMaterials[x].material_id,
          weight: weightFormat(thisItem.stockMaterials[x].weight),
          quantity: thisItem.stockMaterials[x].quantity || 0,
          purity_id: thisItem.stockMaterials[x].purity_id,
          unit_id: thisItem.stockMaterials[x].unit_id,
        };
        await SaleProductMaterialModel.create(thisMObj);

        if (purchase) {
          let thisMObj2 = {
            purchase_id: purchase.id,
            purchase_product_id: purchaseProduct.id,
            material_id: thisItem.stockMaterials[x].material_id,
            weight: weightFormat(thisItem.stockMaterials[x].weight),
            quantity: thisItem.stockMaterials[x].quantity || 0,
            purity_id: thisItem.stockMaterials[x].purity_id,
            unit_id: thisItem.stockMaterials[x].unit_id,
          };
          await PurchaseProductMaterialModel.create(thisMObj2);
        }

        reqDataM.push({
          material_id: thisItem.stockMaterials[x].material_id,
          weight: weightFormat(thisItem.stockMaterials[x].weight),
          quantity: thisItem.stockMaterials[x].quantity || 0,
          purity_id: thisItem.stockMaterials[x].purity_id,
          unit_id: thisItem.stockMaterials[x].unit_id,
          weight_in_gram: thisItem.stockMaterials[x].weight_in_gram,
        });

        /**
         * remove from stocks
         */
        await StockModel.destroy({ where: { id: thisItem.id } });
        await StockMaterialModel.destroy({ where: { stock_id: thisItem.id } });
      }

      reqDataP.push({
        id: purchaseProduct.id,
        product_id: thisItem.product_id,
        size_id: thisItem.size_id,
        certificate_no: cleanInput(thisItem.certificate_no),
        total_weight: thisItem.total_weight,
        current_image: thisItem.current_image || null,
        materials: reqDataM,
        worker_id: "",
      });
    }

    req_data.products = reqDataP;

    //update invoice no if not sent
    let purchase_invoice_number = invoice_number;
    if (isEmpty(invoice_number)) {
      invoice_number = "RV-T-" + sale.id;
      purchase_invoice_number = invoice_number;
      /* req_data = JSON.stringify(req_data);
      req_data = new Buffer.from(req_data).toString("base64"); */
      req_data = encodeForStorage(req_data);

      await SaleModel.update(
        {
          invoice_number: invoice_number,
          req_data: req_data,
        },
        { where: { id: sale.id } },
      );
    }

    if (purchase) {
      await PurchaseModel.update(
        {
          invoice_number: purchase_invoice_number,
          req_data: req_data,
        },
        { where: { id: purchase.id } },
      );
    }

    //send notification
    if (purchase) {
      purchase = await PurchaseModel.findByPk(purchase.id);
      sendNotification("sale", req, { sale: sale, purchase: purchase });
    }

    res.send(
      formatResponse([], "Transfer successfully. Waiting for approval."),
    );
  } catch (error) {
    addLog("error: " + error.toString());
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Transfer does not success due to some error"));
  }
};

/**
 * Sale Product List
 *
 * @param {*} req
 * @param {*} res
 */
exports.saleProducts = async (req, res) => {
  //let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
  //let adminRoleId = getRoleId("admin");
  let superAdminRoleId = getRoleId("superadmin");
  compactLog("req ====> ", req.userId, req.role);
  let saleProductsRes = await getOwnUserSaleProducts(req, req.query, req.role);
  res.send(formatResponse(saleProductsRes));
};

/**
 * Download Invoice
 *
 * @param {*} req
 * @param {*} res
 */
exports.downloadInvoice = async (req, res) => {
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
          
              <div class="invoice" style="max-width: 800px; margin-top: 20px; padding:auto;
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
                                  </table>
                                  <table cellspacing="0" cellpadding="5"  style="margin-top:10px"
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
                                              <td style="text-align:
                                                  left; font-size: 11px;
                                                  font-weight: 400;">
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
                                          <tr style="background-color: #fff;
                                              vertical-align: top;">
                                              <td colspan="3"
                                                  style="border-bottom: 1px solid
                                                  #1E2757; width: 300px; text-align: left;">
                                                  <div style="max-width: 300px; text-align: left;">`;
    for (let x = 0; x < saleData.products[i].materials.length; x++) {
      html += `<div style="display: flex;
                                                          flex-wrap: wrap;
                                                          justify-content: center;
                                                          margin: 0 -5px; text-align: left;">
                                                          <div style="flex-basis:
                                                              calc(69% - 10px);
                                                              margin: 0 0px
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
                                                              margin: 0 0px
                                                              0px; line-height:
                                                              1;">
                                                              <span
                                                                  style="text-align:
                                                                  left; font-size:
                                                                  10px;
                                                                  font-weight:
                                                                  400;">=${saleData.products[i].materials[x].amount}</span>
                                                          </div>
  
                                                      </div>`;
    }

    html += `</div>
  
  
                                                      </td>
                                                      <td style="border-bottom:
                                                          1px solid #1E2757;">`;
    for (let x = 0; x < saleData.products[i].materials.length; x++) {
      html += `<div>`;
      if (isEmpty(saleData.products[i].materials[x].discount_amount)) {
        html += `-`;
      } else {
        html += `<span
                                                                  style="text-align:
                                                                  left; font-size:
                                                                  10px;
                                                                  font-weight:
                                                                  400;">@${removeBlankZero(
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
                                                          #1E2757;">`;
    for (let x = 0; x < saleData.products[i].materials.length; x++) {
      html += `<div>${saleData.products[i].materials[x].material_cost}</div>`;
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
                                          </table>

                                          <div

                                              class="table-footer-area"
                                              style="display: table; width:
                                              90%; bottom:${
                                                payments.length == 0
                                                  ? 80
                                                  : payments.length == 1
                                                    ? 71
                                                    : payments.length == 2
                                                      ? 67
                                                      : payments.length == 3
                                                        ? 50
                                                        : payments.length == 4
                                                          ? 20
                                                          : payments.length == 5
                                                            ? 10
                                                            : 0
                                              }px">
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
                                                              <div>${
                                                                saleData.total_tag_price
                                                              }</div>
                                                              <div>${
                                                                saleData.product_discount
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
                                                              5px;margin-right:10px ;">
                                                              Total <span
                                                                  style="">
                                                                  <input
                                                                      type="text"
                                                                      value="${saleData.total_sub_total}"
                                                                      style="max-width:
                                                                      80px;font-Weight:600"></span></h4>
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
                                                              5px;margin-right:10px ;">
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
                                                              5px;margin-right:10px ;">
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
                                                              5px;margin-right:10px ;">
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
                                                              400; margin-bottom:
                                                              5px;margin-right:10px ;">
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
                                                              5px;margin-right:10px ;">
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
                                                              5px;margin-right:10px ;">
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
                                              90%;  bottom:50px">
                                              <div style="display:
                                                  table-cell; bottom:0px; width:
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
                                                              5px;margin-right:10px ;">
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
                                                              5px;margin-right:10px ;">
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
                                                              5px;margin-right:10px ;">
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
    let file_path = "public/invoices/" + saleData.invoice_number + ".pdf";
    const options = { format: "A4" };

    (async () => {
      const file = { content: html };

      // Generate PDF
      const pdfBuffer = await html_to_pdf.generatePdf(file, options);

      // Ensure the directory exists before writing the file
      fs.mkdirSync("public/invoices", { recursive: true });

      // Save PDF to file
      fs.writeFileSync(file_path, pdfBuffer);
      compactLog("PDF generated successfully!");

      res.send(
        formatResponse(
          {
            file_name: saleData.invoice_number + ".pdf",
            url: getFileAbsulatePathPDF(file_path),
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

const removeCurrencyAndDecimalFromPrice = (str) => {
  //compactLog("str : ", str);
  //compactLog("converted str : ", String(str).replace(/[Rs.|₹]/,"").replace(/[^.]\w*$/, "").replace(/\./, ""));
  //return String(str).replace(/[Rs.|₹]/,"").replace(/[^.]\w*$/, "").replace(/\./, "");
  return parseFloat(String(str).replace("Rs.", "").replace("₹", "")).toFixed(0);
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
                                        <div style="display: table-cell; width: 65%; vertical-align: top;"></div>
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
                                      300;">SALE${saleData.is_approved == "3" ? " ON APPROVAL" : ""} TAX INVOICE</h1>
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
        html += `<div style="display: flex;
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

                                                </div>`;
      }

      html += `</div>


                                            </td>
                                            <td style="border-bottom:
                                                1px solid #1E2757;">`;
      for (let x = 0; x < saleData.products[i].materials.length; x++) {
        html += `<div>`;
        if (isEmpty(saleData.products[i].materials[x].discount_amount)) {
          html += `-`;
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
        html += `<div>${saleData.products[i].materials[x].material_cost}</div>`;
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
                  <table cellspacing="0" cellpadding="0" width="100%" style="border-collapse: collapse; table-layout: fixed; margin-top: 6px;">
                    <tr>
                      <td style="width: 42%; font-size: 11px; font-weight: 400; padding: 2px 6px 2px 0; white-space: nowrap;">Due Date :</td>
                      <td style="width: 58%; padding: 2px 0;"><input type="text" value="${saleData.due_date}" style="display: block; width: 100%; box-sizing: border-box; font-size: 11px; padding: 1px 4px;"></td>
                    </tr>
                    <tr>
                      <td style="width: 42%; font-size: 11px; font-weight: 400; padding: 2px 6px 2px 0; white-space: nowrap;">Settlement Date :</td>
                      <td style="width: 58%; padding: 2px 0;"><input type="text" value="${saleData.settlement_date}" style="display: block; width: 100%; box-sizing: border-box; font-size: 11px; padding: 1px 4px;"></td>
                    </tr>
                  </table>
                            </div>
                          </div>
                          <div style="margin-top: 6px;">
                    <h5 style="margin: 0px 0 1px 0; font-size: 10px; font-weight: 600; text-transform: uppercase;">NOTE</h5>
                    <div style="display: flex; flex-wrap: wrap; font-size: 10px; font-weight: 400;">
                      <div style="width: 100%;">* Goods once sold will be taken back with condition</div>
                      <div style="width: 50%; padding-right: 4px;">• Returning minimum product value of Rs 5000/- above</div>
                      <div style="width: 50%;">• Returning product taken back Less than 20-30% of my billing amount</div>
                      <div style="width: 50%; padding-right: 4px;">• If any Damage charge as per making cost only</div>
                      <div style="width: 50%;">• No Charges taken on Sale product returning within 7 days from bill date</div>
                      <div style="width: 50%; padding-right: 4px;">• All disputes are subject to Patna Juridiction only</div>
                      <div style="width: 50%;">• Charges may be appling cancel of order product making only</div>
                    </div>
                    ${saleData.notes && saleData.notes.trim() ? `<div style="margin-top: 3px; padding-top: 3px; border-top: 1px solid #ccc; font-size: 10px;"><span style="font-weight: 600;">Notes: </span><span style="font-weight: 400;">${saleData.notes}</span></div>` : ""}
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

      // Ensure the directory exists before writing the file
      fs.mkdirSync("public/invoices", { recursive: true });

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

/**
 * Download Invoice Item List
 *
 * @param {*} req
 * @param {*} res
 */
exports.downloadInvoiceItemList = async (req, res) => {
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
                                        <div style="display: table-cell; width: 35%; vertical-align: top;">
                                            ${saleData.notes ? `<div style="display: flex; flex-direction: column; margin-top: 4px;"><span style="font-size: 11px; font-weight: 600;">Notes:</span><span style="font-size: 11px; font-weight: 400;">${saleData.notes}</span></div>` : ""}
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
          <div class="invoice" style="width: 96%; margin: 15px;  background-color: #f9f9f9;">
              <table cellpadding="0" cellspacing="0" width="100%">
                  <tbody>
                      <tr>
                          <td>
                              <table cellspacing="0" cellpadding="0" border="0"
                                  align="center" width="100%">
                                  <h1 style="font-size: 14px; text-align:
                                      center; margin-bottom: 5px; font-weight:
                                      300;">SALE${saleData.is_approved == "3" ? " ON APPROVAL" : ""} ITEM LIST INVOICE</h1>
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
                                                  font-weight: 400; width: 50px;">Certificate No.</th>
                                              <th style="text-align: left; color:
                                                  #fff; font-size: 12px;
                                                  font-weight: 400; width: 90px;">Gross Wt.</th>
                                              <th style="text-align: left; color:
                                                  #fff; font-size: 12px;
                                                  font-weight: 400;width: 40px;">Stone Wt.</th>
                                              <th style="text-align: left; color:
                                                #fff; font-size: 12px;
                                                font-weight: 400; width: 130px">Gold Amt.</th>
                                              <th style="text-align: left; color:
                                                  #fff; font-size: 12px;
                                                  font-weight: 400;width: 90px;">Stone Amt.</th>
                                              <th style="text-align: left; color:
                                                  #fff; font-size: 12px;
                                                  font-weight: 400;width: 90px;">Making</th>
                                              <th style="text-align: left; color:
                                                  #fff; font-size: 12px;
                                                  font-weight: 400;width: 90px;">Total Amt.</th>
                                          </tr>
                                      </thead>
                                      <tbody>`;

  let totalGrossWeight = 0;
  let totalStoneWeight = 0;
  let totalGoldAmt = 0;
  let totalStoneAmt = 0;
  let totalMaterialAmt = 0;
  let totalAmt = 0;
  for (let i = 0; i < saleData.products.length; i++) {
    let bgTrColor = i % 2 == 0 ? "#1E2757" : "#1E2757";
    let grossWeight = parseFloat(saleData.products[i].total_weight);
    let stoneWeight = 0;
    let goldAmt = 0;
    let stoneAmt = 0;
    let productAmt = 0;
    for (let x = 0; x < saleData.products[i].materials.length; x++) {
      //grossWeight += parseFloat(saleData.products[i].total_weight);

      if (saleData.products[i].materials[x].unit_name.toUpperCase() != "GM") {
        stoneWeight += parseFloat(saleData.products[i].materials[x].weight);
        stoneAmt += saleData.products[i].materials[x].material_cost
          ? parseFloat(saleData.products[i].materials[x].material_cost)
          : 0;
      } else {
        goldAmt += saleData.products[i].materials[x].material_cost
          ? parseFloat(saleData.products[i].materials[x].material_cost)
          : 0;
      }
    }
    productAmt =
      goldAmt + stoneAmt + parseFloat(saleData.products[i].making_charge);
    totalGrossWeight += grossWeight;
    totalStoneWeight += stoneWeight;
    totalGoldAmt += goldAmt;
    totalStoneAmt += stoneAmt;
    totalMaterialAmt += parseFloat(saleData.products[i].making_charge);
    totalAmt += productAmt;
    html += `<tr style="background-color: ${bgTrColor}; color:#FFFFFF;">
                                              <td style="text-align: left;
                                                  font-size: 11px;
                                                  font-weight: 400; width: 25px; border-bottom: 1px solid #FFFFFF !important;">
                                                  ${
                                                    i < 9
                                                      ? "0" + (i + 1)
                                                      : i + 1
                                                  }
                                              </td>
                                              <td style="text-align: left;
                                                  font-size: 11px;
                                                  font-weight: 400;font-size: 10px; width:125px; border-bottom: 1px solid #FFFFFF !important;">
                                                  ${
                                                    saleData.products[i]
                                                      .product_name
                                                  }
                                              </td>
                                              <td style="text-align:
                                                    left; font-size: 11px;
                                                    font-weight: 400; width: 90px; border-bottom: 1px solid #FFFFFF !important;">
                                                    ${
                                                      saleData.products[i]
                                                        .certificate_no
                                                    }
                                              </td>
                                              <td style="text-align:
                                                    left; font-size: 11px;
                                                    font-weight: 400; width: 90px; border-bottom: 1px solid #FFFFFF !important;">
                                                    ${weightFormat(grossWeight)}
                                              </td>
                                              <td style="text-align:
                                                    left; font-size: 11px;
                                                    font-weight: 400; width: 90px; border-bottom: 1px solid #FFFFFF !important;">
                                                    ${weightFormat(stoneWeight)}
                                              </td>
                                              <td style="text-align:
                                                    left; font-size: 11px;
                                                    font-weight: 400; width: 90px; border-bottom: 1px solid #FFFFFF !important;">
                                                    ${priceFormat(goldAmt)}
                                              </td>
                                              <td style="text-align:
                                                    left; font-size: 11px;
                                                    font-weight: 400; width: 90px; border-bottom: 1px solid #FFFFFF !important;">
                                                    ${priceFormat(stoneAmt)}
                                              </td>
                                              <td style="text-align:
                                                    left; font-size: 11px;
                                                    font-weight: 400; width: 90px; border-bottom: 1px solid #FFFFFF !important;">
                                                    ${priceFormat(saleData.products[i].making_charge)}
                                              </td>
                                              <td colspan="7" style="text-align:
                                                    left; font-size: 11px;
                                                    font-weight: 400; border-bottom: 1px solid #FFFFFF !important;">
                                                    ${priceFormat(productAmt)}
                                              </td>
  
                                          </tr>
                                          `;
  }
  html += `<tr style="
                                              vertical-align: top;">
                                              <td colspan="3"
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
                                                          <div>${removeCurrencyAndDecimalFromPrice(
                                                            totalGrossWeight,
                                                          )}</div></h4>
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
                                                          <div>${removeCurrencyAndDecimalFromPrice(
                                                            totalStoneWeight,
                                                          )}</div></h4>
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
                                                          <div>${removeCurrencyAndDecimalFromPrice(
                                                            totalGoldAmt,
                                                          )}</div></h4>
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
                                                          <div>${removeCurrencyAndDecimalFromPrice(
                                                            totalStoneAmt,
                                                          )}</div></h4>
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
                                                          <div>${removeCurrencyAndDecimalFromPrice(
                                                            totalMaterialAmt,
                                                          )}</div></h4>
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
                                                          <div>${removeCurrencyAndDecimalFromPrice(
                                                            totalAmt,
                                                          )}</div></h4>
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

  try {
    let file_path =
      "public/invoices/" + saleData.invoice_number + "_item_list.pdf";
    const options = { format: "A4" };

    (async () => {
      const file = { content: html };

      // Generate PDF
      const pdfBuffer = await html_to_pdf.generatePdf(file, options);

      // Ensure the directory exists before writing the file
      fs.mkdirSync("public/invoices", { recursive: true });

      // Save PDF to file
      fs.writeFileSync(file_path, pdfBuffer);
      compactLog("PDF generated successfully!");

      res.send(
        formatResponse(
          {
            file_name: saleData.invoice_number + "_item_list.pdf",
            url: getFileAbsulatePathPDF(file_path),
            html: html,
            saleData,
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

/**
 * Download Invoice Item Details
 *
 * @param {*} req
 * @param {*} res
 */
exports.downloadInvoiceItemDetails = async (req, res) => {
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
                                        <div style="display: table-cell; width: 65%; vertical-align: top;">
                                            ${saleData.notes ? `<div style="display: flex; flex-direction: column; margin-top: 4px;"><span style="font-size: 11px; font-weight: 600;">Notes:</span><span style="font-size: 11px; font-weight: 400;">${saleData.notes}</span></div>` : ""}
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
                                      300;">SALE${saleData.is_approved == "3" ? " ON APPROVAL" : ""} ITEM DETAILS INVOICE</h1>
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
                                                  ${
                                                    i < 9
                                                      ? "0" + (i + 1)
                                                      : i + 1
                                                  }
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
                                                        .total_weight_display
                                                    }
                                              </td>
  
                                          </tr>
                                          <tr style="vertical-align: top; background-color: #FFFFFF;">
                                              <td colspan="2" style="border-bottom: 1px solid #1E2757; padding:0;">
                                                  
                                          `;
    for (let x = 0; x < saleData.products[i].materials.length; x++) {
      html += `<div style="display: flex;
                                                  margin: 5px 5px 0px 5px; text-align: left; width:150px;">
                                                  <div style="
                                                      line-height:1; text-align: left;">
                                                      <span
                                                          style="
                                                          font-size:10px;
                                                          font-weight:400;">${
                                                            saleData.products[i]
                                                              .materials[x]
                                                              .material_name
                                                          } ${
                                                            saleData.products[i]
                                                              .materials[x]
                                                              .pakka_weight
                                                              ? saleData
                                                                  .products[i]
                                                                  .materials[x]
                                                                  .pakka_weight
                                                              : saleData
                                                                  .products[i]
                                                                  .materials[x]
                                                                  .weight
                                                          } ${
                                                            saleData.products[i]
                                                              .materials[x]
                                                              .unit_name
                                                          } x ${
                                                            saleData.products[i]
                                                              .materials[x].rate
                                                          }
                                                      </span>
                                                      <!-- span
                                                          style="
                                                          font-size:10px;
                                                          font-weight:400;"> = ${
                                                            saleData.products[i]
                                                              .materials[x]
                                                              .amount
                                                          }</span -->
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
                                                          400;"> = ${
                                                            saleData.products[i]
                                                              .materials[x]
                                                              .amount
                                                          }</span>
                                                  </div-->

                                              </div>`;
    }
    html += `
                                              </td>
                                              <td style="border-bottom:1px solid #1E2757;">`;
    for (let x = 0; x < saleData.products[i].materials.length; x++) {
      html += `<div style="display: flex;
                                                      width:50px;
                                                      margin: 0px 5px 0px 0px; text-align: left;">
                                                      <div style="
                                                          line-height:1; text-align: left;">
                                                          <span
                                                              style="
                                                              font-size:10px;
                                                              font-weight:400;"> = ${removeCurrencyAndDecimalFromPrice(
                                                                saleData
                                                                  .products[i]
                                                                  .materials[x]
                                                                  .amount,
                                                              )}</span>
                                                      </div>
                                                  </div>`;
    }
    html += `
                                              </td>
                                              <td style="border-bottom:1px solid #1E2757;">`;
    for (let x = 0; x < saleData.products[i].materials.length; x++) {
      html += `<div style="width:90px;">`;
      if (isEmpty(saleData.products[i].materials[x].discount_amount)) {
        html += `-`;
      } else {
        html += `<span style="text-align:left; font-size:10px;font-weight:400;">
                                                  Disc@${removeBlankZero(
                                                    removeCurrencyAndDecimalFromPrice(
                                                      saleData.products[i]
                                                        .materials[x]
                                                        .discount_percent,
                                                    ),
                                                  )}% ${removeCurrencyAndDecimalFromPrice(
                                                    saleData.products[i]
                                                      .materials[x]
                                                      .discount_amount_display,
                                                  )}
                                                </span> 
                                                <!--<span style="text-align:left; font-size:10px; font-weight:400;">${
                                                  saleData.products[i]
                                                    .materials[x]
                                                    .discount_amount_display
                                                }</span>-->`;
      }
      html += `</div>`;
    }
    html += `
                                              </td>
                                              <td style="border-bottom: 1px solid #1E2757;">`;
    for (let x = 0; x < saleData.products[i].materials.length; x++) {
      html += `<div style="text-align: left; font-size: 10px; font-weight: 400;
                                                      margin-top: 5px; 
                                                      width: 40px
                                                      line-height:1;">${removeCurrencyAndDecimalFromPrice(
                                                        saleData.products[i]
                                                          .materials[x]
                                                          .material_cost,
                                                      )}</div>`;
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
                                                  ${removeCurrencyAndDecimalFromPrice(
                                                    saleData.products[i]
                                                      .making_charge,
                                                  )}@${removeBlankZero(
                                                    removeCurrencyAndDecimalFromPrice(
                                                      saleData.products[i]
                                                        .making_charge_discount,
                                                    ),
                                                  )}%=${removeBlankZero(
                                                    removeCurrencyAndDecimalFromPrice(
                                                      saleData.products[i]
                                                        .total_making_charge_discount,
                                                    ),
                                                  )}
                                              </td>

                                              <td style="text-align:left;
                                                  padding-top: 10px;
                                                  font-size: 10px;
                                                  font-weight: 600;
                                                  width: 70px;
                                                  border-bottom: 1px solid
                                                  #1E2757;">
                                                  ${removeCurrencyAndDecimalFromPrice(
                                                    saleData.products[i]
                                                      .sub_price,
                                                  )}
                                              </td>
                                              <td style="text-align:left;
                                                  padding-top: 10px;
                                                  font-size: 10px;
                                                  font-weight: 600;
                                                  width: 70px;
                                                  border-bottom: 1px solid
                                                  #1E2757;">
                                                  ${removeCurrencyAndDecimalFromPrice(
                                                    saleData.products[i]
                                                      .total_discount_display,
                                                  )}
                                              </td>
                                              <td style="text-align:left;
                                                  padding-top: 10px;
                                                  font-size: 10px;
                                                  font-weight: 400;
                                                  width: 70px;
                                                  border-bottom: 1px solid
                                                  #1E2757;">
                                                  ${removeCurrencyAndDecimalFromPrice(
                                                    saleData.products[i]
                                                      .sub_total,
                                                  )}
                                              </td>
                                              <td style="text-align:left;
                                                  padding-top: 10px;
                                                  font-size: 10px;
                                                  font-weight: 400;
                                                  width: 40px;
                                                  border-bottom: 1px solid
                                                  #1E2757;">
                                                  ${removeCurrencyAndDecimalFromPrice(
                                                    saleData.products[i].tax,
                                                  )}
                                              </td>
                                              <td style="text-align:left;
                                                  padding-top: 10px;
                                                  font-size: 10px;
                                                  font-weight: 600;
                                                  width: 50px;
                                                  border-bottom: 1px solid
                                                  #1E2757;">
                                                  ${removeCurrencyAndDecimalFromPrice(
                                                    saleData.products[i]
                                                      .total_display,
                                                  )}
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
                                                          <div>${removeCurrencyAndDecimalFromPrice(
                                                            totalTagPriceDisplay,
                                                          )}</div></h4>
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
                                                          <div>${removeCurrencyAndDecimalFromPrice(
                                                            totalSaveDisplay,
                                                          )}</div></h4>
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
                                                              value="${removeCurrencyAndDecimalFromPrice(
                                                                saleData?.taxable_amount,
                                                              )}"
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
                                                            value="${removeCurrencyAndDecimalFromPrice(
                                                              saleData?.cgst_tax,
                                                            )}"
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
                                                            value="${removeCurrencyAndDecimalFromPrice(
                                                              saleData?.sgst_tax,
                                                            )}"
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
                                                            value="${removeCurrencyAndDecimalFromPrice(
                                                              saleData?.igst_tax,
                                                            )}"
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
                                                            value="${removeCurrencyAndDecimalFromPrice(
                                                              saleData?.total_amount,
                                                            )}"
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
                                                            value="${removeCurrencyAndDecimalFromPrice(
                                                              saleData?.discount,
                                                            )}"
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
                                                            value="${removeCurrencyAndDecimalFromPrice(
                                                              saleData?.total_payable,
                                                            )}"
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
                                                            value="${
                                                              saleData?.payment_mode
                                                            }"
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
                                                            value="${
                                                              saleData?.due_date
                                                            }"
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
                                                            value="${removeCurrencyAndDecimalFromPrice(
                                                              saleData?.paid_amount_display,
                                                            )}"
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
                                                            value="${removeCurrencyAndDecimalFromPrice(
                                                              saleData?.due_amount_display,
                                                            )}"
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
    let file_path =
      "public/invoices/" + saleData.invoice_number + "_item_details.pdf";
    const options = { format: "A4" };

    (async () => {
      const file = { content: html };

      // Generate PDF
      const pdfBuffer = await html_to_pdf.generatePdf(file, options);

      // Ensure the directory exists before writing the file
      fs.mkdirSync("public/invoices", { recursive: true });

      // Save PDF to file
      fs.writeFileSync(file_path, pdfBuffer);
      compactLog("PDF generated successfully!");

      res.send(
        formatResponse(
          {
            file_name: saleData.invoice_number + "_item_details.pdf",
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
