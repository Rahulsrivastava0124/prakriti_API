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
  getFileAbsulatePath,
  getFileAbsulatePathPDF,
  formatDateTime,
  weightFormat,
  addLog,
  convertUnitToGram,
  removeBlankZero,
  displayAmount,
  encodeForStorage,
  decodeFromStorage,
  cleanInput,
} = require("@helpers/helper");
const {
  updateOrCreate,
  removeMaterialFromStock,
  getWalletBalance,
  getWorkingUserID,
  isSuperAdmin,
  isAdmin,
  getSuperAdminId,
  isDistributor,
  updateWalletRemainingBalance,
  sendNotification,
  updateStockRawMaterialOutStanding,
  isManager,
  updateAdvanceAmount,
  getPurchaseProducts,
  getPurchaseProductsUser,
  getRoleId,
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
const {
  PaymentCollection,
} = require("@resources/superadmin/PaymentCollection");
const { PurityCollection } = require("@resources/superadmin/PurityCollection");
const { Op, where } = require("sequelize");
const { isSalesExecutive } = require("../../library/common");
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
const PrePurchaseModel = db.pre_purchases;
const PurchaseModel = db.purchases;
const PurchaseProductModel = db.purchase_products;
const PurchaseProductMaterialModel = db.purchase_product_materials;
const stockHistoryModel = db.stock_raw_material_histories;
const taxSlabModel = db.tax_slabs;
const paymentModel = db.payments;
const PaymentModel = db.payments;
const ReturnModel = db.returns;
const ReturnProductModel = db.return_products;
const ReturnProductMaterialModel = db.return_product_materials;
const SaleModel = db.sales;
const SaleProductModel = db.sale_products;
const SaleProductMaterialModel = db.sale_product_materials;
const NoticationModel = db.notifiactions;
const cartsModel = db.carts;
const cartMaterialsModel = db.cart_materials;

const _ = require("lodash");
const { base64FileUpload } = require("../../helpers/upload");
const fs = require("fs");
const html_to_pdf = require("html-pdf-node");

// Note: logging is handled globally in server.js to prevent duplicate wrappers.

// Compact helper for controller-level logs (keeps output small).
const _compact = (v) => {
  if (v === null || v === undefined) return String(v);
  if (typeof v === "string")
    return v.length > 200 ? v.slice(0, 200) + "...[truncated]" : v;
  if (Array.isArray(v)) return `[Array len=${v.length}]`;
  if (typeof v === "object") {
    if (v.id !== undefined) return `[obj id=${v.id}]`;
    try {
      return `[object keys=${Object.keys(v).length}]`;
    } catch (e) {
      return "[object]";
    }
  }
  return String(v);
};

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
    is_assigned,
    is_approval,
    all_purchase,
  } = req.query;
  is_assigned = is_assigned === undefined ? false : true;
  is_approval = is_approval === undefined ? false : true;
  let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
  let addedBy = userID;
  let isAddedByUser = false;
  /* check for manager/worker and other roles */
  if (![1, 2, 3, 4, 5, 6, 7, 8, 11].includes(req.role)) {
    addedBy = req.userId;
    isAddedByUser = true;
    /* check parent and assign as user id */
    let user = await UserModel.findByPk(addedBy);
    if (user) {
      userID = user.parent_id;
    }
  }
  compactLog("userID : ", userID);
  let conditions = { type: { [Op.ne]: "order_purchase" } };
  if (all_purchase == 1) {
    conditions = {
      is_approved: { [Op.ne]: 2 },
      is_assigned: false,
      is_approval: false,
      sale_id: { [Op.is]: null },
    };
  } else {
    if (isAddedByUser) {
      conditions = {
        //user_id: userID,
        added_by: addedBy,
        is_assigned: is_assigned,
        is_approval: is_approval,
      };
    } else {
      conditions = {
        user_id: userID,
        is_assigned: is_assigned,
        is_approval: is_approval,
      };
    }
  }

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
        model: UserModel,
        as: "supplier",
      },
    ],
    distinct: true,
  })
    .then(async (data) => {
      compactLog("data.count : ", data.count);
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
 * Retrive purchase txn ledger
 */
exports.txnLedger = async (req, res) => {
  let {
    page,
    limit,
    supplier_id,
    search,
    is_assigned,
    is_approval,
    status,
    date_from,
    date_to,
  } = req.query;
  is_assigned = is_assigned === undefined ? false : true;
  is_approval = is_approval === undefined ? false : true;
  let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
  let conditions = {
    user_id: userID,
    is_assigned: is_assigned,
  }; /* , is_approval: is_approval */
  if (status !== undefined && status != "") {
    conditions.is_approved = status;
  }
  if (!isEmpty(supplier_id)) {
    conditions.supplier_id = supplier_id;
  }
  if (
    !isEmpty(search) &&
    !(search.toLowerCase() == "purchase" || search.toLowerCase() == "payment")
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
    // Fetch all purchases with their related payments
    const allPurchases = await PurchaseModel.findAll({
      include: [
        {
          model: PaymentModel,
          as: "payments",
          required: false,
          where:
            !isEmpty(search) &&
            !(
              search.toLowerCase() == "purchase" ||
              search.toLowerCase() == "payment"
            )
              ? {
                  [Op.or]: [
                    /* { invoice_number: { [Op.like]: `%${search}%` } }, */
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

    // Flatten purchases and payments into a single table structure
    let tableData = [];
    let c = 1;
    allPurchases.forEach((purchase, index) => {
      let approve_status = "Pending";
      if (purchase.is_approved == 1) {
        approve_status = "Accepted";
      } else if (purchase.is_approved == 2) {
        approve_status = "Declined";
      } else if (purchase.is_approved == 3) {
        approve_status = "On Approval";
      } else if (purchase.is_approved == 4) {
        approve_status = "Transfer To Purchase";
      }

      if (purchase.status == "returned") {
        approve_status = "Returned";
      } else if (purchase.status == "return_pending") {
        approve_status = "Return Pending";
      }

      // Add Purchase row
      tableData.push({
        index: c,
        id: purchase.id,
        date: formatDateTime(purchase.invoice_date, 8),
        txn_date: purchase.invoice_date,
        invoice_number: purchase.invoice_number,
        remarks: purchase.notes || "-",
        purpose: "",
        bill_amount: displayAmount(purchase.bill_amount),
        txn_amount: parseFloat(purchase.bill_amount),
        payment_amount: null,
        payment_mode: purchase.payment_mode || "-",
        type: "Purchase",
        txn_type: "",
        is_approved: purchase.is_approved,
        approve_status: approve_status,
        is_advance: 0,
      });
      c++;

      // Add related payment rows
      purchase.payments.forEach((pay, idx) => {
        tableData.push({
          index: c,
          id: purchase.id,
          date: formatDateTime(pay.payment_date, 8),
          txn_date: pay.payment_date,
          invoice_number: purchase.invoice_number,
          remarks: pay.notes || "-",
          purpose: pay.purpose || "",
          bill_amount: null,
          payment_amount: displayAmount(pay.amount),
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
      //compactLog("----------a.invoice_number,b.invoice_number----------",a.invoice_number.split("").pop(),b.invoice_number.split("").pop());
      return (
        b.invoice_number.split("-").pop() - a.invoice_number.split("-").pop()
      );
    });

    if (
      !isEmpty(search) &&
      (search.toLowerCase() == "purchase" || search.toLowerCase() == "payment")
    ) {
      tableData = tableData.filter(
        (table) => table.type.toLowerCase() == search.toLowerCase(),
      );
    }

    compactLog("tableData:", _compact(tableData));

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
      } else if (tx.type.toLowerCase() == "purchase" && tx.is_approved != 2) {
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
        /* if (tx.type === 'Purchase') {
        runningBalance += tx.txn_amount;
      } else if (tx.type === 'Payment') {
        runningBalance -= tx.txn_amount;
      } */
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

    compactLog("passbook:", _compact(passbook));

    let result = {
      items: passbook,
      total: passbook.length,
    };
    res.send(formatResponse(result, "Purchase Ledger List"));
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
    supplier_id,
    search,
    is_assigned,
    is_approval,
    status,
    date_from,
    date_to,
  } = req.query;
  is_assigned = is_assigned === undefined ? false : true;
  is_approval = is_approval === undefined ? false : true;
  let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
  let conditions = {
    user_id: userID,
    is_assigned: is_assigned,
  }; /* , is_approval: is_approval */
  if (status !== undefined && status != "") {
    conditions.is_approved = status;
  }
  let user = await UserModel.findByPk(userID);

  if (!isEmpty(supplier_id)) {
    conditions.supplier_id = supplier_id;
  }
  if (
    !isEmpty(search) &&
    !(search.toLowerCase() == "purchase" || search.toLowerCase() == "payment")
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
    // Fetch all purchases with their related payments
    const allPurchases = await PurchaseModel.findAll({
      include: [
        {
          model: PaymentModel,
          as: "payments",
          required: false,
          where:
            !isEmpty(search) &&
            !(
              search.toLowerCase() == "purchase" ||
              search.toLowerCase() == "payment"
            )
              ? {
                  [Op.or]: [
                    /* { invoice_number: { [Op.like]: `%${search}%` } }, */
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

    // Flatten purchases and payments into a single table structure
    let tableData = [];
    let c = 1;
    allPurchases.forEach((purchase, index) => {
      let approve_status = "Pending";
      if (purchase.is_approved == 1) {
        approve_status = "Accepted";
      } else if (purchase.is_approved == 2) {
        approve_status = "Declined";
      } else if (purchase.is_approved == 3) {
        approve_status = "On Approval";
      } else if (purchase.is_approved == 4) {
        approve_status = "Transfer To Purchase";
      }

      if (purchase.status == "returned") {
        approve_status = "Returned";
      } else if (purchase.status == "return_pending") {
        approve_status = "Return Pending";
      }

      // Add Purchase row
      tableData.push({
        index: c,
        id: purchase.id,
        date: formatDateTime(purchase.invoice_date, 8),
        txn_date: purchase.invoice_date,
        invoice_number: purchase.invoice_number,
        remarks: purchase.notes || "-",
        purpose: "",
        bill_amount: displayAmount(purchase.bill_amount),
        txn_amount: parseFloat(purchase.bill_amount),
        payment_amount: null,
        pay_amount: null,
        payment_mode: purchase.payment_mode || "-",
        type: "Purchase",
        txn_type: "",
        is_approved: purchase.is_approved,
        approve_status: approve_status,
        is_advance: 0,
      });
      c++;

      // Add related payment rows
      purchase.payments.forEach((pay, idx) => {
        tableData.push({
          index: c,
          id: purchase.id,
          date: formatDateTime(pay.payment_date, 8),
          txn_date: pay.payment_date,
          invoice_number: purchase.invoice_number,
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
      //compactLog("----------a.invoice_number,b.invoice_number----------",a.invoice_number.split("").pop(),b.invoice_number.split("").pop());
      return (
        b.invoice_number.split("-").pop() - a.invoice_number.split("-").pop()
      );
    });

    if (
      !isEmpty(search) &&
      (search.toLowerCase() == "purchase" || search.toLowerCase() == "payment")
    ) {
      tableData = tableData.filter(
        (table) => table.type.toLowerCase() == search.toLowerCase(),
      );
    }

    compactLog("tableData:", _compact(tableData));

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
      } else if (tx.type.toLowerCase() == "purchase" && tx.is_approved != 2) {
        temp_balance = tx.txn_amount;
      }
      //compactLog("temp_invoice_no : ", temp_invoice_no, "temp_balance : ", temp_balance);
    }

    //compactLog("after tableData: ", tableData);

    // Compute running balance (Due Amount)
    let runningBalance = 0;
    let tempAdvanceDebitInvoice_idx = -1;
    let hasAdvanceDebit = false;
    let passbook = tableData
      .reverse()
      .map((tx, index) => {
        /* if (tx.type === 'Purchase') {
        runningBalance += tx.txn_amount;
      } else if (tx.type === 'Payment') {
        runningBalance -= tx.txn_amount;
      } */

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

    passbook = passbook.sort((a, b) => {
      compactLog(
        "----------a.invoice_number,b.invoice_number----------",
        a.invoice_number.split("").pop(),
        b.invoice_number.split("").pop(),
      );
      return (
        b.invoice_number.split("-").pop() - a.invoice_number.split("-").pop()
      );
    });
    compactLog("passbook:", _compact(passbook));

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
                <div class="invoice" style="width: 1000px; padding:15px; margin: 0px; position: absolute; bottom: 0px; background-color: #f9f9f9;">
                    <hr/>
                    <table cellpadding="0" cellspacing="1" width="1000px" style="margin:auto;" >
                        <tbody>
                            <tr>
                                <td><table cellspacing="0" cellpadding="0"
                                      border="0"
                                      align="center" width="90%">
                                      <div style="display: table; width:
                                          100%; font-size: 11px;">
                                          <div style="display: table-cell;
                                              width: 65%;">
                                              <h5 style="margin: 0px;
                                                  font-size: 11px;
                                                  font-weight:
                                                  600; text-transform:
                                                  uppercase;">NOTE</h5>
                                              <ul style="margin: 0;
                                                  padding: 0px;
                                                  list-style: none;">
                                                  <span style="margin: 0;
                                                      text-align: left;
                                                      font-size: 11px;
                                                      font-weight: 400; ">*
                                                      Goods once sold will
                                                      be taken back with
                                                      condition</span>

                                                  <li style="margin: 0;
                                                      text-align: left;
                                                      font-size: 11px;
                                                      font-weight: 400;
                                                      list-style-type:
                                                      disc; margin-left:
                                                      35px;">Returning
                                                      minimum product
                                                      value of Rs 5000/-
                                                      above</li>
                                                  <li style="margin: 0;
                                                      text-align: left;
                                                      font-size: 11px;
                                                      font-weight: 400;
                                                      list-style-type:
                                                      disc; margin-left:
                                                      35px;">Returning
                                                      product taken back
                                                      Less than 20-30% of
                                                      my billing amount</li>
                                                  <li style="margin: 0;
                                                      text-align: left;
                                                      font-size: 11px;
                                                      font-weight: 400;
                                                      list-style-type:
                                                      disc; margin-left:
                                                      35px;">If any Damage
                                                      charge as per making
                                                      cost only</li>
                                                  <li style="margin: 0;
                                                      text-align: left;
                                                      font-size: 11px;
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
                                                      font-size: 11px;
                                                      font-weight: 400;
                                                      list-style-type:
                                                      disc; margin-left:
                                                      35px;">All disputes
                                                      are subject to Patna
                                                      Juridiction only</li>
                                                  <li style="margin: 0;
                                                      text-align: left;
                                                      font-size: 11px;
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
                                        300;">PURCHASE TRANSACTION LEDGER</h1>
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
                                                    font-weight: 600;">Prakriti
                                                    Patna</span></h3>
                                            <h3 style="margin: 0; font-weight: 400;
                                                font-size: 14px;">GST No -
                                                <span style="font-weight: 600;">10CIUPK2654L1ZY</span></h3>
                                            <h3 style="margin: 0; font-weight: 400;
                                                font-size: 12px;">User Id - <span>${user.name}</span></h3>
                                            <h3 style="margin: 0; font-weight: 400;
                                                font-size: 12px;">Address - G100
                                                RBI CPC Colony Kankarbagh Patna
                                                Bihar 800 020</h3>
                                            <h3 style="font-weight: 600; font-size:
                                                12px; margin: 0;">
                                                support@Prakriti.com, +91 98744
                                                45878
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
                                          ${passbook[i].type}
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
      let file_path = "public/purchases/" + filename;
      const options = { format: "A4" };

      (async () => {
        try {
          const file = { content: html };

          // Generate PDF
          const pdfBuffer = await html_to_pdf.generatePdf(file, options);

          // Ensure the destination directory exists before writing
          fs.mkdirSync(file_path.substring(0, file_path.lastIndexOf("/")), {
            recursive: true,
          });

          // Save PDF to file
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
        } catch (error) {
          compactLog("PDF generation failed!", error);
          return res
            .status(errorCodes.default)
            .send(formatErrorResponse(error.toString()));
        }
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
 * Store pre purchase data
 *
 * @param {*} req
 * @param {*} res
 */
exports.pre_store = async (req, res) => {
  let data = req.body;
  let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
  try {
    compactLog("pre purchase store payload :", _compact(data));
    //return false;
    let req_data = data; //JSON.stringify(data);
    //req_data = new Buffer.from(req_data).toString("base64");

    let image_path = await base64FileUpload(data.current_image, "products");

    data.current_image = image_path.path;

    compactLog(
      "pre purchase store payload after image upload :",
      _compact(data.current_image),
    );

    req_data = encodeForStorage(req_data);
    let prePurchaseObj = {
      user_id: userID,
      req_data: req_data,
    };

    /* create and return create id */
    let prePurchase = await PrePurchaseModel.create(prePurchaseObj);
    //prePurchase.record_id = prePurchase.id;

    res.send(
      formatResponse(prePurchase, "Pre Purchase data stored successfully!"),
    );
  } catch (error) {
    addLog("err: " + error.toString());
    return res
      .status(errorCodes.default)
      .send(
        formatErrorResponse(
          "Pre Purchase data does not success due to some error",
        ),
      );
  }
};

/**
 * Fetch all pre purchase data
 */
exports.pre_purchase_list = async (req, res) => {
  try {
    let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
    let prePurchases = await PrePurchaseModel.findAll({
      where: { user_id: userID },
      order: [["createdAt", "DESC"]],
    });

    /* decode req_data and send */
    let items = [];
    prePurchases = prePurchases.map((item) => {
      let decodedData = decodeFromStorage(item.req_data);
      decodedData.id = item.id;
      items.push(decodedData);
    });

    let result = {
      pre_purchase_items: items,
      total: items.length,
    };

    res.send(formatResponse(result, "Pre Purchase data fetched successfully!"));
  } catch (error) {
    addLog("err: " + error.toString());
    return res
      .status(errorCodes.default)
      .send(
        formatErrorResponse(
          "Pre Purchase data does not fetch due to some error",
        ),
      );
  }
};

/**
 * delete pre purchase item single/all
 */
exports.pre_purchase_delete = async (req, res) => {
  let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
  try {
    let id = req.params.id;
    compactLog("----pre purchase delete id", id, userID);
    if (id == "all") {
      await PrePurchaseModel.destroy({
        where: { user_id: userID },
      });
    } else {
      await PrePurchaseModel.destroy({
        where: { id: id, user_id: userID },
      });
    }
    res.send(formatResponse([], "Pre Purchase item deleted successfully!"));
  } catch (error) {
    addLog("err: " + error.toString());
    return res
      .status(errorCodes.default)
      .send(
        formatErrorResponse(
          "Pre Purchase item does not delete due to some error",
        ),
      );
  }
};

/**
 * Store purchase
 *
 * @param {*} req
 * @param {*} res
 */
exports.store = async (req, res) => {
  // compactLog("------------this data is purchases",req)
  let data = req.body;
  const dateFormats = [
    moment.ISO_8601,
    "YYYY-MM-DD",
    "DD/MM/YYYY",
    "MM/DD/YYYY",
  ];
  compactLog("purchase store payload :", _compact(data));
  //return false;
  if (!isEmpty(data.invoice_number)) {
    let purchaseData = await PurchaseModel.findOne({
      where: { invoice_number: data.invoice_number },
    });
    if (purchaseData) {
      /* return res
        .status(errorCodes.default)
        .send(formatErrorResponse("Invoice number is exists.")); */

      /* create new invoice nummber */
      let purchase = await PurchaseModel.findOne({
        attributes: ["id"],
        order: [["id", "DESC"]],
      });
      data.invoice_number = "RV-P-" + (purchase ? purchase.id + 1 : 1);
    }
  }

  let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
  let addedBy = userID;
  /* check for manager/worker and other roles */
  if (![1, 2, 3, 4, 5, 6, 7, 8, 11].includes(req.role)) {
    addedBy = req.userId;
    /* check parent and assign as user id */
    let user = await UserModel.findByPk(addedBy);
    if (user) {
      userID = user.parent_id;
    }
  }

  if (priceFormat(data.paid_amount) > 0) {
    let wallet_balance = await getWalletBalance(userID, data.payment_mode);
    if (priceFormat(data.paid_amount) > wallet_balance) {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse("Insufficient wallet balance."));
    }
  }

  /**
   * Check duplicate certidicate no
   * @param req
   * @param res
   */
  let is_certificate_exist = false;
  for (let i = 0; i < data.products.length; i++) {
    let thisItem = data.products[i];
    /* cretified product must have unique certificate number */
    if (!isEmpty(thisItem.certificate_no)) {
      let stock = await StockModel.findOne({
        where: { certificate_no: thisItem.certificate_no },
      });
      is_certificate_exist = stock ? thisItem.certificate_no : false;
      let purchaseProduct = await PurchaseProductModel.findOne({
        where: { certificate_no: thisItem.certificate_no },
        include: [
          {
            model: PurchaseModel,
            as: "purchase",
            required: true,
            where: { is_approved: { [Op.ne]: 2 } },
          },
        ],
      });
      is_certificate_exist = purchaseProduct
        ? thisItem.certificate_no
        : is_certificate_exist;
    }
  }
  compactLog("is_certificate_exist : ", is_certificate_exist);
  if (is_certificate_exist) {
    return res
      .status(errorCodes.default)
      .send(
        formatErrorResponse(
          `One of the product has certificate no. ${is_certificate_exist} which does exists in stocks or on approval state.`,
        ),
      );
  }

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

  try {
    //const trans = await sequelize.transaction(async (t) => {

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

    if (data.pay_from_advance) {
      if (parseFloat(data.total_payable) >= parseFloat(data.advance_amount)) {
        paid_amount = priceFormat(
          paid_amount + parseFloat(data.advance_amount),
        );
      } else {
        paid_amount = parseFloat(data.total_payable);
      }
    }
    // Compute totals defensively from provided products
    let total_amount_acc = 0;
    let tax_acc = 0;
    let taxable_amount_acc = 0;
    let total_sub_total_acc = 0;
    for (let i = 0; i < (data.products || []).length; i++) {
      let p = data.products[i];
      let sub_price = parseFloat(p.sub_price) || 0;
      let making_charge = parseFloat(p.making_charge) || 0;
      let tax = parseFloat(p.tax) || 0;
      let total = parseFloat(p.total) || sub_price + making_charge + tax;
      total_amount_acc += total;
      tax_acc += tax;
      taxable_amount_acc += sub_price + making_charge;
      total_sub_total_acc += sub_price + making_charge;
    }
    let discount_val = parseFloat(data.discount) || 0;
    let return_amount_val = parseFloat(data.return_amount) || 0;
    let computed_total_payable = priceFormat(
      (total_amount_acc || 0) - (discount_val || 0) - (return_amount_val || 0),
    );
    // compactLog("data is Current image ", data.current_image)
    /* let current_image =
      data.current_image == undefined
        ? null
        : `${(await base64FileUpload(data.current_image, "products")).path}`; */

    // compactLog("current image is the ",current_image)

    let purchaseObj = {
      supplier_id: data.supplier_id,
      user_id: userID,
      added_by: addedBy,
      invoice_number: invoice_number,
      invoice_date: invoiceDate.format("YYYY-MM-DD"),
      notes: data.notes,
      payment_mode: data.payment_mode,
      transaction_no: data.transaction_no,
      // Persist computed totals (defensive)
      total_amount: priceFormat(total_amount_acc),
      tax: priceFormat(tax_acc),
      discount: priceFormat(discount_val),
      paid_amount: paid_amount,
      taxable_amount: priceFormat(taxable_amount_acc),
      bill_amount: priceFormat(computed_total_payable),
      total_payable: priceFormat(computed_total_payable),
      due_amount: due_amount,
      due_date: dueDate ? dueDate.format("YYYY-MM-DD") : null,
      status: status,
      is_approved: data.on_approval ? 3 : 0,
      is_approval: data.on_approval,
      type: data.type,
      return_id: !isEmpty(data.return_sale_id) ? data.return_sale_id : null,
      //req_data: req_data
    };
    let purchase = await PurchaseModel.create(purchaseObj);

    //insert into purchase product table
    for (let i = 0; i < data.products.length; i++) {
      let thisItem = data.products[i];
      // compactLog("--data.product[0].current_image",data.products[i].current_image)

      // Handle current_image upload - check if it exists
      let current_image = null;
      if (
        data.products[i].current_image &&
        data.products[i].current_image !== null &&
        data.products[i].current_image !== undefined &&
        data.products[i].current_image !== ""
      ) {
        try {
          if (
            /^data:([A-Za-z-+/]+);base64,/.test(data.products[i].current_image)
          ) {
            let image_path = await base64FileUpload(
              data.products[i].current_image,
              "products",
            );
            current_image = image_path.path;
          } else {
            current_image = data.products[i].current_image; // Assuming it's a URL or existing path
          }
        } catch (imgErr) {
          compactLog("Image upload error for product " + i + ": ", imgErr);
          current_image = null;
        }
      }

      // compactLog(
      //   "image_path________________________________________________________",
      //   image_path
      // );

      // compactLog(current_image)
      // compactLog("----------current image ",current_image )
      let worker_id = thisItem.worker_id || null;
      let thisObj = {
        current_image: current_image,
        purchase_id: purchase.id,
        product_id: isEmpty(thisItem.product_id) ? null : thisItem.product_id,
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

      compactLog(
        "thisObj_________________________________________________________________________________",
        thisObj,
      );

      let purchaseProduct = await PurchaseProductModel.create(thisObj);
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
          pakka_weight: weightFormat(thisItem.materials[x].pakka_weight),
          quantity: thisItem.materials[x].quantity || 0,
          purity_id: thisItem.materials[x].purity_id,
          unit_id: thisItem.materials[x].unit_id,
          rate: thisItem.materials[x].rate,
          amount: thisItem.materials[x].amount,
        };
        compactLog("thisMObj : ", thisMObj);
        await PurchaseProductMaterialModel.create(thisMObj);

        if (!isEmpty(worker_id)) {
          let stockH = await stockHistoryModel.create({
            from_user_id: worker_id,
            to_user_id: req.userId,
            material_id: thisItem.materials[x].material_id,
            weight: weightFormat(thisItem.materials[x].weight),
            pakka_weight: weightFormat(thisItem.materials[x].pakka_weight),
            unit_id: thisItem.materials[x].unit_id,
            quantity: thisItem.materials[x].quantity,
            date: moment().format("YYYY-MM-DD"),
            type: "debit",
            batch_id: batch_id,
            purchase_id: purchase.id,
          });
          if (batch_id == null) {
            batch_id = stockH.id;
            await stockHistoryModel.update(
              {
                batch_id: batch_id,
              },
              { where: { id: stockH.id } },
            );
          }

          await updateStockRawMaterialOutStanding(
            stockH.id,
            {
              user_id: worker_id,
              material_id: thisItem.materials[x].material_id,
              weight: thisItem.materials[x].weight,
              unit_id: thisItem.materials[x].unit_id,
              quantity: thisItem.materials[x].quantity,
            },
            "debit",
          );
        }

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
      { where: { id: purchase.id } },
    );

    //insert into payment table
    if (priceFormat(data.paid_amount) > 0) {
      let amount = priceFormat(data.paid_amount);
      if (!isEmpty(data.on_approval_id) && parseInt(data.on_approval_id) > 0) {
        let approvalPurchase = await PurchaseModel.findByPk(
          data.on_approval_id,
        );
        if (approvalPurchase && !isEmpty(approvalPurchase.paid_amount)) {
          amount =
            amount >= parseFloat(approvalPurchase.paid_amount)
              ? amount - parseFloat(approvalPurchase.paid_amount)
              : amount;
        }
      }
      if (amount > 0 && isEmpty(data.return_sale_id)) {
        //debit from current user
        let payment = await paymentModel.create({
          payment_mode: data.payment_mode,
          amount: amount,
          user_id: data.supplier_id,
          payment_by: req.userId,
          payment_date: moment().format("YYYY-MM-DD"),
          txn_id: data.transaction_no,
          cheque_no: data.cheque_no,
          status: data.payment_mode == "cheque" ? "pending" : "success",
          type: "debit",
          table_type: "purchase",
          table_id: purchase.id,
          payment_belongs: userID,
          purpose: purchase.is_approval ? "purchase on approval" : "purchase",
          can_accept: true,
        });

        await updateWalletRemainingBalance(userID, payment.id);

        //credit to supplier
        // let payment2 = await paymentModel.create({
        //   parent_id: payment.id,
        //   payment_mode: data.payment_mode,
        //   amount: amount,
        //   user_id: userID,
        //   payment_by: req.userId,
        //   payment_date: moment().format('YYYY-MM-DD'),
        //   txn_id: data.transaction_no,
        //   cheque_no: data.cheque_no,
        //   status: data.payment_mode == 'cheque' ? 'pending' : 'success',
        //   type: 'credit',
        //   table_type: 'purchase',
        //   table_id: purchase.id,
        //   payment_belongs: data.supplier_id,
        //   purpose: 'purchase',
        //   can_accept: false
        // });

        // await updateWalletRemainingBalance(data.supplier_id, payment2.id);
      }
    }

    if (!isEmpty(data.on_approval_id) && parseInt(data.on_approval_id) > 0) {
      await PurchaseModel.update(
        {
          is_approved: 4,
          accept_declined_at: moment().format("YYYY-MM-DD HH:mm:ss"),
        },
        { where: { id: data.on_approval_id } },
      );
    }

    //if paid from advance amount
    if (parseFloat(data.advance_amount) > 0 && data.pay_from_advance) {
      /* let thisAmnt =
        parseFloat(data.total_payable) >= parseFloat(data.advance_amount)
          ? data.advance_amount
          : priceFormat(
              parseFloat(data.advance_amount) - parseFloat(data.total_payable)
            ); */

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
        user_id: userID,
        payment_by: userID,
        payment_date: moment().format("YYYY-MM-DD"),
        // txn_id: data.transaction_no,
        // cheque_no: data.cheque_no,
        status: "success",
        type: "debit", //advance_adjust
        table_type: "purchase",
        table_id: purchase.id,
        payment_belongs: data.supplier_id,
        purpose: "purchase adjust from advance",
        can_accept: true,
        is_advance: true,
      });

      await updateWalletRemainingBalance(data.supplier_id, paymentD.id);

      /* credit remaining advance amount */
      let payment = await paymentModel.create({
        parent_id: paymentD.id,
        payment_mode: data.payment_mode,
        amount: priceFormat(theDebitAmount),
        user_id: userID,
        payment_by: userID,
        payment_date: moment().format("YYYY-MM-DD"),
        // txn_id: data.transaction_no,
        // cheque_no: data.cheque_no,
        status: "success",
        type: "credit", //advance_adjust
        table_type: "purchase",
        table_id: purchase.id,
        payment_belongs: data.supplier_id,
        purpose: "advance amount changed to paid amount for the purchase",
        can_accept: true,
        is_advance: false,
      });

      await updateWalletRemainingBalance(data.supplier_id, payment.id);

      /* let payment = await paymentModel.create({
        payment_mode: "advance",
        amount: priceFormat(thisAmnt),
        user_id: userID,
        payment_by: req.userId,
        payment_date: moment().format("YYYY-MM-DD"),
        // txn_id: data.transaction_no,
        // cheque_no: data.cheque_no,
        status: "success",
        type: "credit", //advance_adjust
        table_type: "purchase",
        table_id: purchase.id,
        payment_belongs: data.supplier_id,
        purpose: "purchase adjust from advance",
        can_accept: true,
        is_advance: true,
      }); */

      /* await updateWalletRemainingBalance(data.supplier_id, payment.id); */

      await updateAdvanceAmount(
        userID,
        data.supplier_id,
        thisCreditAmnt,
        false,
      );
    }

    res.send(formatResponse([], "Purchase successfully!"));
    //});
  } catch (error) {
    compactLog("err: " + error.toString());
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
        this: "rahul this side ",
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
  // compactLog("Status Change", req.body)
  let data = req.body;
  let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
  let purchase = await PurchaseModel.findOne({
    where: { id: req.params.id, user_id: userID },
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
    ],
  });

  // compactLog("-------new Data IS ",JSON.stringify(purchase));

  if (!purchase) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Purchase not found"));
  }

  try {
    let sale_id = null;
    let gold24kPurityId = 3;
    const trans = await sequelize.transaction(async (t) => {
      if (data.approve_status != 4) {
        let purchaseObj = {
          is_approved: data.approve_status,
          accept_declined_at: moment().format("YYYY-MM-DD HH:mm:ss"),
        };
        await PurchaseModel.update(purchaseObj, {
          where: { id: purchase.id },
          transaction: t,
        });
      }

      //let userID = await getWorkingUserID(req);
      /**
       * START - add to user stock
       */
      if (data.approve_status == 1) {
        let req_data = purchase.req_data;
        // compactLog("--------------------------req.data valus ",req_data);

        let stock_con = userID; //isSuperAdmin(req) ? {[Op.is]: null} : userID;
        if (!isEmpty(req_data)) {
          if (req_data) {
            //req_data = new Buffer.from(req_data, "base64").toString("ascii");
            //req_data = JSON.parse(req_data);
            req_data = decodeFromStorage(req_data);
          } else {
            req_data = {
              products: [],
            };
          }

          for (let i = 0; i < req_data.products.length; i++) {
            let thisItem = req_data.products[i];
            // compactLog("------- change status ",base64FileUpload(req_data.products[i].current_image,"products").path)
            let worker_id = thisItem.worker_id || null;
            // Avoid logging full objects (can overflow stdout buffer on large payloads)
            try {
              compactLog(
                "approve: purchase id:",
                purchase && purchase.id ? purchase.id : "n/a",
              );
              compactLog(
                "approve: thisItem product_id:",
                thisItem && thisItem.product_id ? thisItem.product_id : "n/a",
                "certificate_no:",
                thisItem && thisItem.certificate_no
                  ? thisItem.certificate_no
                  : "",
              );
            } catch (logErr) {
              // swallow logging errors to avoid breaking the flow
            }
            let product_type = "",
              product = null,
              category_id = null,
              stock_type = "";
            if (
              purchase.type == "product" ||
              purchase.type == "return_product"
            ) {
              product = await ProductModel.findByPk(thisItem.product_id);
              product_type = product.type;
              category_id = product.category_id;
              stock_type =
                purchase.type == "return_product" ? "return" : "product";
            } else {
              product_type = "material";
              let thisM = await MaterialModel.findByPk(thisItem.material_id);
              category_id = thisM.id;
              stock_type = "material";
            }
            let stock = null;
            if (
              product_type == "material" ||
              (product_type != "material" && isEmpty(thisItem.certificate_no))
            ) {
              let quantity = 0;
              for (let x = 0; x < thisItem.materials.length; x++) {
                quantity += thisItem.materials[x].quantity
                  ? parseInt(thisItem.materials[x].quantity)
                  : 0;
              }

              let Current_image =
                purchase.purchaseProducts &&
                purchase.purchaseProducts[i] &&
                purchase.purchaseProducts[i].current_image
                  ? purchase.purchaseProducts[i].current_image
                  : thisItem.current_image || null;
              let _wC = { user_id: stock_con, type: stock_type },
                _iu_data = {
                  quantity: quantity,
                  total_weight: thisItem.total_weight
                    .toString()
                    .replace(/[^0-9.]/g, ""),
                  user_id: userID, //isSuperAdmin(req) ? null : req.userId,
                  type: stock_type,
                  purchase_id: purchase.id,
                  purchase_product_id: thisItem.id,
                  size_id: thisItem.size_id || null,
                  current_image: Current_image,
                };
              if (purchase.type == "material") {
                _wC.material_id = thisItem.material_id;
                _wC.purity_id =
                  thisItem.material_id == "1" || thisItem.material_id == "2"
                    ? gold24kPurityId
                    : thisItem.materials[0].purity_id; //24K gold //thisItem.materials[0].purity_id;
                _iu_data.material_id = thisItem.material_id;
                _iu_data.purity_id =
                  thisItem.material_id == "1" || thisItem.material_id == "2"
                    ? gold24kPurityId
                    : thisItem.materials[0].purity_id; //thisItem.materials[0].purity_id;
              } else {
                _wC.product_id = thisItem.product_id;
                _iu_data.product_id = thisItem.product_id;
                _wC.purity_id = thisItem.materials[0].purity_id;
                _iu_data.purity_id = thisItem.materials[0].purity_id;
              }
              let result = await updateOrCreate(StockModel, _wC, _iu_data, t, [
                "quantity",
                "total_weight",
              ]);
              stock = result.item;
            } else {
              let query = {
                where: {
                  certificate_no: {
                    [Op.like]: `${thisItem.certificate_no}`,
                  },
                },
              };

              // log only the certificate query filter to avoid huge dumps
              try {
                if (query && query.where && query.where.certificate_no) {
                  compactLog(
                    "certificate_no query: ",
                    query.where.certificate_no,
                  );
                }
              } catch (logErr) {}
              let resData = await StockModel.findAll(query);
              let Current_image =
                purchase.purchaseProducts &&
                purchase.purchaseProducts[i] &&
                purchase.purchaseProducts[i].current_image
                  ? purchase.purchaseProducts[i].current_image
                  : thisItem.current_image || null;
              stock = await StockModel.create(
                {
                  purchase_id: purchase.id,
                  current_image: Current_image,
                  purchase_product_id: thisItem.id,
                  product_id: thisItem.product_id || null,
                  size_id: thisItem.size_id || null,
                  purity_id: thisItem.materials[0].purity_id || null,
                  certificate_no: cleanInput(thisItem.certificate_no),
                  quantity: 1,
                  total_weight: thisItem.total_weight
                    .toString()
                    .replace(/[^0-9.]/g, ""),
                  user_id: userID, //isSuperAdmin(req) ? null : req.userId,
                  type: stock_type,
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
                    to_user_id: userID,
                    material_id: thisItem.materials[x].material_id,
                    weight: weightFormat(thisItem.materials[x].weight),
                    pakka_weight: weightFormat(
                      thisItem.materials[x].pakka_weight,
                    ),
                    unit_id: thisItem.materials[x].unit_id,
                    purity_id: thisItem.materials[x].purity_id,
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
              // compactLog("----stock is ",stockMaterial)
              if (
                product_type == "material" ||
                (product_type != "material" && isEmpty(thisItem.certificate_no))
              ) {
                let stockMaterial = await StockMaterialModel.findOne({
                  where: {
                    stock_id: stock.id,
                    material_id: thisItem.materials[x].material_id,
                    purity_id:
                      thisItem.materials[x].material_id == "1" ||
                      thisItem.materials[x].material_id == "2"
                        ? gold24kPurityId
                        : thisItem.materials[x].purity_id,
                  },
                });
                let unit = await UnitModel.findByPk(
                  thisItem.materials[x].unit_id,
                );
                let actualWeight =
                  thisItem.materials[x].material_id == "1" ||
                  thisItem.materials[x].material_id == "2"
                    ? thisItem.materials[x].pakka_weight
                    : thisItem.materials[x].weight;
                let pakka_weight_in_gram = isEmpty(thisItem.certificate_no)
                  ? convertUnitToGram(unit.name, actualWeight)
                  : convertUnitToGram(unit.name, actualWeight);
                if (stockMaterial) {
                  let thisquantity = thisItem.materials[x].quantity
                    ? parseInt(stockMaterial.quantity) +
                      parseInt(thisItem.materials[x].quantity)
                    : stockMaterial.quantity;
                  await StockMaterialModel.update(
                    {
                      weight: weightFormat(
                        parseFloat(stockMaterial.weight) +
                          weightFormat(actualWeight),
                      ),
                      weight_in_gram: weightFormat(
                        parseFloat(stockMaterial.weight_in_gram) +
                          weightFormat(pakka_weight_in_gram),
                      ),
                      quantity: thisquantity,
                      purity_id:
                        thisItem.materials[x].material_id == "1" ||
                        thisItem.materials[x].material_id == "2"
                          ? gold24kPurityId
                          : thisItem.materials[x].purity_id,
                      unit_id: thisItem.materials[x].unit_id,
                      category_id: category_id,
                    },
                    { where: { id: stockMaterial.id }, transaction: t },
                  );
                } else {
                  await StockMaterialModel.create(
                    {
                      stock_id: stock.id,
                      material_id: thisItem.materials[x].material_id,
                      weight: weightFormat(actualWeight),
                      weight_in_gram: weightFormat(pakka_weight_in_gram),
                      quantity: thisItem.materials[x].quantity || 0,
                      purity_id:
                        thisItem.materials[x].material_id == "1" ||
                        thisItem.materials[x].material_id == "2"
                          ? gold24kPurityId
                          : thisItem.materials[x].purity_id,
                      unit_id: thisItem.materials[x].unit_id,
                      category_id: category_id,
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
                    category_id: category_id,
                  },
                  { transaction: t },
                );
              }
            }
          }

          //delete all payment
          /*await paymentModel.destroy({ where: {
            table_type: 'purchase',
            table_id: purchase.id
          }, transaction: t});*/

          /*if(!isEmpty(purchase.paid_amount)){
            await PurchaseModel.update({
              paid_amount: 0,
              due_amount: purchase.total_payable,
              status: 'due'
            },{where: {id: purchase.id}, transaction: t});
          }*/
        }

        //send notification
        //
        sendNotification("purchase_accept", req, { purchase: purchase });
      } else if (data.approve_status == 4) {
        //don't need to do anything
      } else {
        if (
          isEmpty(purchase.return_id) &&
          !purchase.is_assigned &&
          purchase.paid_amount > 0 /*&& isEmpty(purchase.sale_id)*/
        ) {
          if (data.decline_type == "advance") {
            // let user = await UserModel.findByPk(purchase.user_id);
            // if(user){
            //   let advance_amount = user.advance_amount ? priceFormat(parseFloat(user.advance_amount) + purchase.paid_amount) : purchase.paid_amount;
            //   await UserModel.update({advance_amount: advance_amount}, {where: {id: purchase.user_id}});
            // }
            let paidAmnt = parseFloat(purchase.paid_amount);
            let payment = await paymentModel.findOne({
              where: {
                table_type: "purchase",
                table_id: purchase.id,
                type: "debit",
              },
            });
            if (payment) {
              if (payment.status == "pending") {
                paidAmnt = priceFormat(paidAmnt - parseFloat(payment.amount));
              } else {
                await PaymentModel.update(
                  {
                    is_advance: "1",
                  },
                  { where: { table_type: "purchase", table_id: purchase.id } },
                );
              }
            }
            await updateAdvanceAmount(
              purchase.user_id,
              purchase.supplier_id,
              paidAmnt,
              true,
            );
          } else if (data.decline_type == "return") {
            let paidAmnt = parseFloat(purchase.paid_amount);
            let payment = await paymentModel.findOne({
              where: {
                table_type: "purchase",
                table_id: purchase.id,
                type: "debit",
              },
            });
            if (payment) {
              if (
                payment.payment_mode == "cheque" &&
                payment.status == "pending"
              ) {
                await paymentModel.destroy({
                  where: { table_type: "purchase", table_id: purchase.id },
                });
                if (!isEmpty(purchase.sale_id)) {
                  await paymentModel.destroy({
                    where: { table_type: "sale", table_id: purchase.sale_id },
                  });
                }
                paidAmnt = priceFormat(paidAmnt - parseFloat(payment.amount));
              }
            }
            if (paidAmnt > 0) {
              let payment2 = await paymentModel.create({
                payment_mode: payment ? payment.payment_mode : "cash",
                amount: paidAmnt,
                user_id: isEmpty(purchase.sale_id)
                  ? purchase.user_id
                  : purchase.supplier_id,
                payment_by: userID,
                payment_date: moment().format("YYYY-MM-DD"),
                //txn_id: payment.txn_id,
                //cheque_no: payment.cheque_no,
                status: "success",
                type: "credit",
                table_type: "purchase",
                table_id: purchase.id,
                payment_belongs: isEmpty(purchase.sale_id)
                  ? purchase.supplier_id
                  : purchase.user_id,
                purpose: purchase.is_approval
                  ? "purchase approval declined"
                  : "purchase declined",
              });
              let remaining_balance = await getWalletBalance(
                payment2.payment_belongs,
              );
              await paymentModel.update(
                {
                  remaining_balance: remaining_balance,
                },
                { where: { id: payment2.id } },
              );

              //if(!isEmpty(purchase.sale_id)){
              let payment3 = await paymentModel.create({
                payment_mode: payment ? payment.payment_mode : "cash",
                amount: paidAmnt,
                user_id: isEmpty(purchase.sale_id)
                  ? purchase.supplier_id
                  : purchase.user_id,
                payment_by: userID,
                payment_date: moment().format("YYYY-MM-DD"),
                //txn_id: payment.txn_id,
                //cheque_no: payment.cheque_no,
                status: "success",
                type: "debit",
                table_type: isEmpty(purchase.sale_id) ? "purchase" : "sale",
                table_id: isEmpty(purchase.sale_id)
                  ? purchase.id
                  : purchase.sale_id,
                payment_belongs: isEmpty(purchase.sale_id)
                  ? purchase.user_id
                  : purchase.supplier_id,
                purpose: isEmpty(purchase.sale_id)
                  ? purchase.is_approval
                    ? "purchase approval declined"
                    : "purchase declined"
                  : purchase.is_approval
                    ? "sale approval declined"
                    : "sale declined",
              });
              let remaining_balance2 = await getWalletBalance(
                payment3.payment_belongs,
              );
              await paymentModel.update(
                {
                  remaining_balance: remaining_balance2,
                },
                { where: { id: payment3.id } },
              );
              // }
            }
          }
        }
        //return to upper user stock
        if (isEmpty(purchase.return_id)) {
          if (!isEmpty(purchase.sale_id)) {
            if (
              isAdmin(req) ||
              isDistributor(req) ||
              isSalesExecutive(req) ||
              isSuperAdmin(req)
            ) {
              let parentUserID = purchase.supplier_id; //isAdmin(req) ? await getSuperAdminId() : purchase.supplier_id;
              let req_data = purchase.req_data;
              if (req_data) {
                /* req_data = new Buffer.from(req_data, "base64").toString(
                  "ascii"
                );
                req_data = JSON.parse(req_data); */
                req_data = decodeFromStorage(req_data);
              } else {
                req_data = {
                  products: [],
                };
              }
              for (let i = 0; i < req_data.products.length; i++) {
                let thisItem = req_data.products[i];
                let worker_id = thisItem.worker_id || null;

                let product = await ProductModel.findByPk(thisItem.product_id);
                let stock = null;
                if (
                  product.type == "material" ||
                  (product.type != "material" &&
                    isEmpty(thisItem.certificate_no))
                ) {
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
                      user_id: parentUserID,
                      purity_id:
                        thisItem.materials[x].material_id == "1" ||
                        thisItem.materials[x].material_id == "2"
                          ? gold24kPurityId
                          : thisItem.materials[x].purity_id,
                    },
                    {
                      purchase_id: purchase.id,
                      purchase_product_id: thisItem.id,
                      product_id: thisItem.product_id,
                      quantity: quantity,
                      total_weight: thisItem.total_weight,
                      user_id: parentUserID,
                      purity_id:
                        thisItem.materials[x].material_id == "1" ||
                        thisItem.materials[x].material_id == "2"
                          ? gold24kPurityId
                          : thisItem.materials[x].purity_id,
                    },
                    t,
                    ["quantity", "total_weight"],
                  );
                  stock = result.item;
                } else {
                  // compactLog("----else Stock 888",req_data.products[0].current_image)
                  let current_image_path = await base64FileUpload(
                    req_data.products[i].current_image,
                    "products",
                  );

                  stock = await StockModel.create(
                    {
                      purchase_id: purchase.id,
                      current_image: current_image_path.path,
                      purchase_product_id: thisItem.id,
                      product_id: thisItem.product_id,
                      size_id: thisItem.size_id || null,
                      purity_id: thisItem.materials[0]?.purity_id || null,
                      certificate_no: cleanInput(thisItem.certificate_no),
                      quantity: 1,
                      total_weight: thisItem.total_weight,
                      user_id: parentUserID,
                    },
                    { transaction: t },
                  );
                }

                let batch_id = null;
                for (let x = 0; x < thisItem.materials.length; x++) {
                  /*if(!isEmpty(worker_id)){
                    let stockH = await stockHistoryModel.create({
                      from_user_id: worker_id,
                      to_user_id: userID,
                      material_id: thisItem.materials[x].material_id,
                      weight: weightFormat(thisItem.materials[x].weight),
                      unit_id: thisItem.materials[x].unit_id,
                      quantity: thisItem.materials[x].quantity || 1,
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
                  if (
                    product.type == "material" ||
                    (product.type != "material" &&
                      isEmpty(thisItem.certificate_no))
                  ) {
                    let stockMaterial = await StockMaterialModel.findOne({
                      where: {
                        stock_id: stock.id,
                        material_id: thisItem.materials[x].material_id,
                        purity_id:
                          thisItem.materials[x].material_id == "1" ||
                          thisItem.materials[x].material_id == "2"
                            ? gold24kPurityId
                            : thisItem.materials[x].purity_id,
                      },
                    });
                    let unit = await UnitModel.findByPk(
                      thisItem.materials[x].unit_id,
                    );
                    let actualWeight =
                      thisItem.materials[x].material_id == "1" ||
                      thisItem.materials[x].material_id == "2"
                        ? thisItem.materials[x].pakka_weight
                        : thisItem.materials[x].weight;
                    let pakka_weight_in_gram = convertUnitToGram(
                      unit.name,
                      actualWeight,
                    );
                    if (stockMaterial) {
                      let thisquantity = thisItem.materials[x].quantity
                        ? parseInt(stockMaterial.quantity) +
                          parseInt(thisItem.materials[x].quantity)
                        : stockMaterial.quantity;
                      await StockMaterialModel.update(
                        {
                          weight: weightFormat(
                            parseFloat(stockMaterial.weight) +
                              weightFormat(actualWeight),
                          ),
                          weight_in_gram: weightFormat(
                            parseFloat(stockMaterial.weight_in_gram) +
                              weightFormat(pakka_weight_in_gram),
                          ),
                          quantity: thisquantity,
                          purity_id:
                            thisItem.materials[x].material_id == "1" ||
                            thisItem.materials[x].material_id == "2"
                              ? gold24kPurityId
                              : thisItem.materials[x].purity_id,
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
                          weight: weightFormat(actualWeight),
                          weight_in_gram: weightFormat(pakka_weight_in_gram),
                          quantity: thisItem.materials[x].quantity || 0,
                          purity_id:
                            thisItem.materials[x].material_id == "1" ||
                            thisItem.materials[x].material_id == "2"
                              ? gold24kPurityId
                              : thisItem.materials[x].purity_id,
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
            }
          }
        }

        //send notification
        sendNotification("purchase_declined", req, { purchase: purchase });
      }

      if (!isEmpty(purchase.sale_id)) {
        await SaleModel.update(
          {
            is_approved: data.approve_status,
            accept_declined_at: moment().format("YYYY-MM-DD HH:mm:ss"),
          },
          { where: { id: purchase.sale_id }, transaction: t },
        );
      }
    });

    if (data.approve_status == 1) {
      /**
       * Manage return sale
       */
      if (!isEmpty(purchase.return_id)) {
        let saleReturn = await ReturnModel.findOne({
          where: { id: purchase.return_id },
        });
        let sale = await SaleModel.findOne({
          where: { id: saleReturn.table_id },
        });
        sale_id = sale.id;

        await ReturnModel.update(
          {
            status: "completed",
          },
          { where: { id: purchase.return_id } },
        );
        await StockModel.destroy({ where: { return_id: purchase.return_id } });
        let return_amount_from_wallet = saleReturn.return_amount_from_wallet
          ? parseFloat(saleReturn.return_amount_from_wallet)
          : 0;
        if (return_amount_from_wallet > 0) {
          let payment4 = await paymentModel.create({
            payment_mode: purchase.payment_mode,
            amount: return_amount_from_wallet,
            user_id: saleReturn.user_id,
            payment_by: req.userId,
            payment_date: moment().format("YYYY-MM-DD"),
            txn_id: purchase.transaction_no,
            cheque_no: purchase.cheque_no,
            status: purchase.payment_mode == "cheque" ? "pending" : "success",
            type: "debit",
            table_type: "purchase",
            table_id: purchase.id,
            payment_belongs: userID,
            purpose: "Sale Refund",
            can_accept: true,
          });

          await updateWalletRemainingBalance(userID, payment4.id);
        }

        /* let return_req_data = new Buffer.from(
          saleReturn.req_data,
          "base64"
        ).toString("ascii");
        return_req_data = JSON.parse(return_req_data); */
        let return_req_data = decodeFromStorage(return_req_data);
        let return_products = return_req_data.return_products;
        let return_data = return_req_data.return_data;

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
              { where: { id: saleProduct.id } },
            );
            await SaleProductMaterialModel.update(
              {
                return_qty: total_return_qty,
                return_weight: total_return_weight,
              },
              { where: { id: saleProduct.saleMaterials[0].id } },
            );
          } else {
            await SaleProductModel.update(
              { is_return: true },
              { where: { id: saleProduct.id } },
            );
          }
        }

        //update sale total payable price
        let total_payable = parseFloat(sale.total_payable);
        let return_amount = parseFloat(saleReturn.product_amount);
        total_payable = priceFormat(total_payable - return_amount);
        let paid_amount = parseFloat(sale.paid_amount);
        let due_amount = priceFormat(total_payable - paid_amount, true);
        due_amount = due_amount < 0 ? 0 : due_amount;
        if (paid_amount > total_payable) {
          paid_amount = 0;
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
            status: due_amount > 0 ? "due" : "paid",
          },
          { where: { id: sale.id } },
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
            },
          );
        }
      }

      if (!isEmpty(sale_id)) {
        let total_sale_products = await SaleProductModel.count({
          where: { sale_id: sale_id },
        });
        total_sale_products = total_sale_products ?? 0;
        let allReturn = await SaleProductModel.count({
          where: { sale_id: sale_id, is_return: true },
        });
        allReturn = allReturn ?? 0;
        if (allReturn == total_sale_products) {
          await SaleModel.update(
            {
              status: "returned",
            },
            { where: { id: sale_id } },
          );
        }
      }
    }

    res.send(formatResponse([], "Purchase Status Changed successfully!"));
  } catch (error) {
    addLog("err: " + error.toString());
    compactLog(error);
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
  try {
    let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
    compactLog("purchase view --------------> req.params.id : ", req.params.id);
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

    /* let req_data = new Buffer.from(purchase.req_data, "base64").toString(
      "ascii"
    );
    req_data = JSON.parse(req_data); */

    res.send(
      formatResponse(PurchaseViewCollection(purchase), "Purchase details"),
    );
  } catch (error) {
    return res.status(errorCodes.default).send(formatErrorResponse(error));
  }
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
        separate: true,
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
            separate: true,
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
    formatResponse(
      await PurchaseEditCollection(purchase, req),
      "Purchase edit details",
    ),
  );
};

/**
 * Update Product
 *
 * @param {*} req
 * @param {*} res
 */
exports.update = async (req, res) => {
  let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
  let purchase = await PurchaseModel.findOne({
    where: { id: req.params.id, user_id: userID, is_approved: 0 },
  });

  if (!purchase) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Purchase is not found."));
  }

  let data = req.body;

  try {
    const trans = await sequelize.transaction(async (t) => {
      //insert into purchase table
      let invoice_number = data.invoice_number || null;
      let req_data = data;
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
      // Compute totals defensively from provided products for update
      let total_amount_acc = 0;
      let tax_acc = 0;
      let taxable_amount_acc = 0;
      let total_sub_total_acc = 0;
      for (let i = 0; i < (data.products || []).length; i++) {
        let p = data.products[i];
        let sub_price = parseFloat(p.sub_price) || 0;
        let making_charge = parseFloat(p.making_charge) || 0;
        let tax = parseFloat(p.tax) || 0;
        let total = parseFloat(p.total) || sub_price + making_charge + tax;
        total_amount_acc += total;
        tax_acc += tax;
        taxable_amount_acc += sub_price + making_charge;
        total_sub_total_acc += sub_price + making_charge;
      }
      let discount_val = parseFloat(data.discount) || 0;
      let return_amount_val = parseFloat(data.return_amount) || 0;
      let computed_total_payable = priceFormat(
        (total_amount_acc || 0) - (discount_val || 0) - (return_amount_val || 0),
      );
      let purchaseObj = {
        //supplier_id: data.supplier_id,
        //user_id: userID,
        //invoice_number: invoice_number,
        //invoice_date: moment(data.invoice_date, "MM/DD/YYYY").format('YYYY-MM-DD'),
        notes: data.notes,
        payment_mode: data.payment_mode,
        transaction_no: data.transaction_no,
        total_amount: priceFormat(total_amount_acc),
        tax: priceFormat(tax_acc),
        discount: priceFormat(discount_val),
        paid_amount: paid_amount,
        taxable_amount: priceFormat(taxable_amount_acc),
        bill_amount: priceFormat(computed_total_payable),
        total_payable: priceFormat(computed_total_payable),
        due_amount: due_amount,
        //due_date: moment(data.due_date).format('YYYY-MM-DD'),
        status: status,
        //is_approved: 0,
        //req_data: req_data
      };
      await PurchaseModel.update(purchaseObj, {
        where: { id: purchase.id },
        transaction: t,
      });

      /**
       * delete old stock history
       */
      let stockstockHistorys = await stockHistoryModel.findAll({
        where: { purchase_id: purchase.id },
      });
      for (let i = 0; i < stockstockHistorys.length; i++) {
        await updateStockRawMaterialOutStanding(
          stockstockHistorys[i].id,
          {
            user_id: stockstockHistorys[i].belongs_to,
            material_id: stockstockHistorys[i].material_id,
            weight: stockstockHistorys[i].weight,
            unit_id: stockstockHistorys[i].unit_id,
            quantity: stockstockHistorys[i].quantity,
          },
          "debit",
        );
      }
      await stockHistoryModel.destroy({
        where: { purchase_id: purchase.id },
        transaction: t,
      });

      //insert into purchase product table
      let ppIds = [];
      for (let i = 0; i < data.products.length; i++) {
        let thisItem = data.products[i];
        if (thisItem.id == 0) {
          // Handle current_image upload for new products
          let current_image = null;
          if (
            data.products[i].current_image &&
            data.products[i].current_image !== null &&
            data.products[i].current_image !== undefined &&
            data.products[i].current_image !== ""
          ) {
            try {
              let image_path = await base64FileUpload(
                data.products[i].current_image,
                "products",
              );
              current_image = image_path.path;
            } catch (imgErr) {
              compactLog("Image upload error for product " + i + ": ", imgErr);
              current_image = null;
            }
          }

          let worker_id = thisItem.worker_id || null;
          // compactLog("----------------thisis purchases productv ",thisItem);

          let thisObj = {
            current_image: current_image,
            purchase_id: purchase.id,
            product_id: isEmpty(thisItem.product_id)
              ? null
              : thisItem.product_id,
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
          ppIds.push(purchaseProduct.id);

          //insert into purchase product materials
          for (let x = 0; x < thisItem.materials.length; x++) {
            let thisMObj = {
              purchase_id: purchase.id,
              purchase_product_id: purchaseProduct.id,
              material_id: thisItem.materials[x].material_id,
              weight: weightFormat(thisItem.materials[x].weight),
              pakka_weight: weightFormat(thisItem.materials[x].pakka_weight),
              quantity: thisItem.materials[x].quantity || 0,
              purity_id: thisItem.materials[x].purity_id,
              unit_id: thisItem.materials[x].unit_id,
              rate: thisItem.materials[x].rate,
              amount: thisItem.materials[x].amount,
            };
            await PurchaseProductMaterialModel.create(thisMObj, {
              transaction: t,
            });
          }
        } else {
          ppIds.push(thisItem.id);
        }

        // if (!isEmpty(worker_id)) {
        //   let batch_id = null;
        //   for (let x = 0; x < thisItem.materials.length; x++) {
        //     let stockH = await stockHistoryModel.create({
        //       from_user_id: worker_id,
        //       to_user_id: req.userId,
        //       material_id: thisItem.materials[x].material_id,
        //       weight: weightFormat(thisItem.materials[x].weight),
        //       unit_id: thisItem.materials[x].unit_id,
        //       quantity: thisItem.materials[x].quantity || 0,
        //       date: moment().format('YYYY-MM-DD'),
        //       type: 'debit',
        //       batch_id: batch_id,
        //       purchase_id: purchase.id
        //     }, { transaction: t });
        //     if (batch_id == null) {
        //       batch_id = stockH.id;
        //       await stockHistoryModel.update({
        //         batch_id: batch_id
        //       }, { where: { id: stockH.id }, transaction: t });
        //     }

        //     await updateStockRawMaterialOutStanding(stockH.id, {
        //       user_id: worker_id,
        //       material_id: thisItem.materials[x].material_id,
        //       weight: thisItem.materials[x].weight,
        //       unit_id: thisItem.materials[x].unit_id,
        //       quantity: !isEmpty(thisItem.materials[x].quantity) ? thisItem.materials[x].quantity : 0,
        //     }, "debit");
        //   }
        // }
      }

      //delete which are deleted
      await PurchaseProductModel.destroy({
        where: { purchase_id: purchase.id, id: { [Op.notIn]: ppIds } },
        transaction: t,
      });
      await PurchaseProductMaterialModel.destroy({
        where: {
          purchase_id: purchase.id,
          purchase_product_id: { [Op.notIn]: ppIds },
        },
        transaction: t,
      });

      //req_data = JSON.stringify(req_data);
      //req_data = new Buffer.from(req_data).toString("base64");
      req_data = encodeForStorage(req_data);
      await PurchaseModel.update(
        {
          req_data: req_data,
        },
        { where: { id: purchase.id }, transaction: t },
      );
      res.send(formatResponse([], "Purchase updated successfully!"));
    });
  } catch (error) {
    addLog("err: " + error.toString());
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Purchase does not success due to some error"));
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
      let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
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
 * delete single purchase product
 *
 * @param {*} req
 * @param {*} res
 */
exports.deleteProduct = async (req, res) => {
  try {
    const purchaseId = req.params.purchaseId;
    const productId = req.params.productId;

    // Ensure purchase exists
    const purchase = await PurchaseModel.findOne({ where: { id: purchaseId } });
    if (!purchase) {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse("Purchase not found"));
    }

    // Ensure product exists under this purchase
    const purchaseProduct = await PurchaseProductModel.findOne({
      where: { id: productId, purchase_id: purchaseId },
    });

    if (!purchaseProduct) {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse("Purchase product not found"));
    }

    // Delete product and its materials in a transaction
    await sequelize.transaction(async (t) => {
      await PurchaseProductMaterialModel.destroy({
        where: { purchase_product_id: purchaseProduct.id },
        transaction: t,
      });

      await PurchaseProductModel.destroy({
        where: { id: purchaseProduct.id },
        transaction: t,
      });
    });

    return res.send(
      formatResponse([], "Purchase product deleted successfully"),
    );
  } catch (err) {
    addLog("err: " + err.toString());
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Failed to delete purchase product"));
  }
};

/**
 * get new purchase invoice number
 *
 * @param {*} req
 * @param {*} res
 */
exports.newInvoiceNumber = async (req, res) => {
  let purchase = await PurchaseModel.findOne({
    attributes: ["id"],
    order: [["id", "DESC"]],
  });
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
  let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
  let purchase = await PurchaseModel.findOne({
    where: { id: req.params.id, user_id: userID },
  });
  if (!purchase) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Purchase not found"));
  }

  if (isEmpty(purchase.sale_id) && data.payment_type == "return") {
    // let return_amount_from_wallet = data.return_amount_from_wallet ? parseFloat(data.return_amount_from_wallet) : 0;
    // let walletBalance = await getWalletBalance(userID, data.payment_mode);
    // if (walletBalance < priceFormat(return_amount_from_wallet)) {
    //   return res.status(errorCodes.default).send(formatErrorResponse("Insufficient wallet balance."));
    // }
  }

  let stock_con = userID; //isSuperAdmin(req) ? {[Op.is]: null} : userID;

  //check is stock have that product
  if (purchase.is_approved == 1) {
    for (let i = 0; i < return_products.length; i++) {
      if (!return_products[i].is_return) {
        continue;
      }
      //fetch purchase product by id
      let purchaseProduct = await PurchaseProductModel.findOne({
        where: { id: return_products[i].id },
        include: [
          {
            model: PurchaseProductMaterialModel,
            as: "purchaseMaterials",
          },
        ],
      });

      let stock = null;
      if (
        return_data.products[i].product_type == "material" ||
        (return_data.products[i].product_type != "material" &&
          isEmpty(return_data.products[i].certificate_no))
      ) {
        if (!isEmpty(return_data.products[i].product_id)) {
          stock = await StockModel.findOne({
            where: {
              product_id: return_data.products[i].product_id,
              user_id: stock_con,
            },
          });
        } else {
          stock = await StockModel.findOne({
            where: {
              material_id: return_data.products[i].materials[0].material_id,
              user_id: stock_con,
            },
          });
        }
        if (!stock) {
          return res
            .status(errorCodes.default)
            .send(formatErrorResponse("You doesn't have enough stock."));
        }
        for (let mItem of return_data.products[i].materials) {
          let stockM = await StockMaterialModel.findOne({
            where: { stock_id: stock.id, material_id: mItem.material_id },
          });
          if (!stockM) {
            return res
              .status(errorCodes.default)
              .send(formatErrorResponse("You doesn't have enough stock."));
          }

          // let weight = weightFormat(parseFloat(stockM.weight) - parseFloat(mItem.return_weight));
          // let quantity = (parseFloat(stockM.quantity) - parseInt(mItem.return_qty));
          // if (weight <= 0 && quantity <= 0) {
          //   return res.status(errorCodes.default).send(formatErrorResponse("You doesn't have enough stock."));
          // }
        }
      } else {
        let stock = await StockModel.findOne({
          where: {
            product_id: return_data.products[i].product_id,
            user_id: stock_con,
            certificate_no: cleanInput(return_data.products[i].certificate_no),
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
        if (!stock) {
          return res
            .status(errorCodes.default)
            .send(formatErrorResponse("You doesn't have enough stock."));
        } else {
          let numMatched = 0;
          let stockMaterials = formatStockMaterials(stock.stockMaterials);
          for (let x = 0; x < return_data.products[i].materials.length; x++) {
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
          if (numMatched != return_data.products[i].materials.length) {
            return res
              .status(errorCodes.default)
              .send(formatErrorResponse("You doesn't have enough stock."));
          }
        }
      }
    }
  }

  try {
    const trans = await sequelize.transaction(async (t) => {
      //insert into return table
      /* let req_data = JSON.stringify(data);
      req_data = new Buffer.from(req_data).toString("base64"); */
      let req_data = encodeForStorage(data);
      const returnObj = await ReturnModel.create(
        {
          user_id: userID,
          seller_id: !isEmpty(purchase.sale_id) ? userID : null,
          table_id: purchase.id,
          table_type: "purchases",
          notes: data.notes,
          payment_mode: data.payment_mode,
          txn_id: data.transaction_no,
          cheque_no: data.cheque_no,
          status: !isEmpty(purchase.sale_id) ? "pending" : "success",
          product_amount: data.product_amount,
          charge: data.return_charge,
          total_amount: data.return_amount,
          accepted_at: moment().format("YYYY-MM-DD"),
          return_date: data.return_date
            ? moment(data.return_date, "MM/DD/YYYY").format("YYYY-MM-DD")
            : moment().format("YYYY-MM-DD"),
          req_data: req_data,
        },
        { transaction: t },
      );

      let saleReturnObj = null,
        sale_products = [];
      if (
        (!isSuperAdmin(req) || isManager(req)) &&
        !isEmpty(purchase.sale_id)
      ) {
        let sale = await SaleModel.findOne({
          where: { id: purchase.sale_id },
          include: [
            {
              model: SaleProductModel,
              as: "saleProducts",
            },
          ],
        });
        if (sale) {
          sale_products = sale.saleProducts;
          saleReturnObj = await ReturnModel.create(
            {
              user_id: purchase.supplier_id,
              seller_id: !isEmpty(purchase.sale_id) ? userID : null,
              parent_id: returnObj.id,
              table_id: sale.id,
              table_type: "sales",
              notes: data.notes,
              payment_mode: data.payment_mode,
              txn_id: data.transaction_no,
              cheque_no: data.cheque_no,
              status: "pending",
              product_amount: data.product_amount,
              charge: data.return_charge,
              total_amount: data.return_amount,
              accepted_at: moment().format("YYYY-MM-DD"),
              return_date: data.return_date
                ? moment(data.return_date, "MM/DD/YYYY").format("YYYY-MM-DD")
                : moment().format("YYYY-MM-DD"),
              req_data: req_data,
            },
            { transaction: t },
          );
        }
      }

      for (let i = 0; i < return_products.length; i++) {
        if (!return_products[i].is_return) {
          continue;
        }

        //fetch purchase product by id
        let purchaseProduct = await PurchaseProductModel.findOne({
          where: { id: return_products[i].id },
          include: [
            {
              model: PurchaseProductMaterialModel,
              as: "purchaseMaterials",
            },
          ],
        });

        // insert into return product table
        let returnProduct = await ReturnProductModel.create(
          {
            return_id: returnObj.id,
            table_id: purchaseProduct.id,
            table_type: "purchase_products",
            sub_total: return_data.products[i].return_amount,
          },
          { transaction: t },
        );

        let returnSaleProduct = null;
        if (saleReturnObj) {
          returnSaleProduct = await ReturnProductModel.create(
            {
              return_id: saleReturnObj.id,
              table_id: sale_products[i].id,
              table_type: "sale_products",
              sub_total: return_data.products[i].return_amount,
            },
            { transaction: t },
          );
        }

        // insert into return product materials table
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

          if (returnSaleProduct) {
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
          }
        }

        //update purchase product is return and return weight & qty into purchase product material table
        if (
          return_data.products[i].product_type == "material" ||
          (return_data.products[i].product_type != "material" &&
            isEmpty(return_data.products[i].certificate_no))
        ) {
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
          if (
            return_data.products[i].product_type == "material" ||
            (return_data.products[i].product_type != "material" &&
              isEmpty(return_data.products[i].certificate_no))
          ) {
            if (!isEmpty(return_data.products[i].product_id)) {
              stock = await StockModel.findOne({
                where: {
                  product_id: return_data.products[i].product_id,
                  user_id: stock_con,
                },
              });
            } else {
              stock = await StockModel.findOne({
                where: {
                  material_id: return_data.products[i].materials[0].material_id,
                  user_id: stock_con,
                },
              });
            }
            let quantity = 0,
              weight = 0,
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
                      parseFloat(stockM.quantity) - parseInt(mItem.return_qty),
                  },
                  { where: { id: stockM.id } },
                );
                weight += mItem.return_weight
                  ? parseInt(mItem.return_weight)
                  : 0;
              }
              unit_name = mItem.unit_name;
              weight = convertUnitToGram(unit_name, weight);
              quantity += parseInt(mItem.return_qty);
            }
            if (parseFloat(stock.total_weight) <= weight) {
              await StockModel.destroy({ where: { id: stock.id } });
            } else {
              let return_weight_in_gram = convertUnitToGram(
                unit_name,
                return_data.products[i].materials[0].return_weight,
              );
              await StockModel.update(
                {
                  quantity: parseFloat(stock.quantity) - parseFloat(quantity),
                  total_weight:
                    parseFloat(stock.total_weight) -
                    parseFloat(return_weight_in_gram),
                },
                { where: { id: stock.id } },
              );
            }
          } else {
            let stock = await StockModel.findOne({
              where: {
                product_id: return_data.products[i].product_id,
                user_id: stock_con,
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
            if (stock) {
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
              if (numMatched == return_data.products[i].materials.length) {
                await StockModel.destroy({ where: { id: stock.id } });
                await StockMaterialModel.destroy({
                  where: { stock_id: stock.id },
                });
                let cart = await cartsModel.findOne({
                  where: { type: "sale", stock_id: stock.id },
                });
                if (cart) {
                  await cartsModel.destroy({ where: { id: cart.id } });
                  await cartMaterialsModel.destroy({
                    where: { cart_id: cart.id },
                  });
                }
              }
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
        if (paid_amount > total_payable) {
          paid_amount = total_payable;
        }
        let total_return_amt = priceFormat(
          priceFormat(purchase.return_amount) + return_amount,
        );
        // if (!purchase.is_assigned && advance_amount > 0 && isEmpty(purchase.sale_id)) {
        //   let supplier = await UserModel.findByPk(purchase.supplier_id);
        //   if (supplier) {
        //     advance_amount = priceFormat(advance_amount + supplier.advance_amount);
        //     await UserModel.update({ advance_amount: advance_amount }, { where: { id: purchase.supplier_id }, transaction: t });
        //   }
        // }

        await PurchaseModel.update(
          {
            return_amount: total_return_amt,
            total_payable: total_payable,
            due_amount: due_amount,
          },
          { where: { id: req.params.id }, transaction: t },
        );
      }

      if (
        returnObj.status == "success" &&
        priceFormat(data.return_amount_from_wallet) > 0
      ) {
        if (data.payment_type == "return") {
          let payment2 = await paymentModel.create({
            user_id: purchase.supplier_id,
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
            payment_belongs: userID,
            type: "credit",
            purpose: "return purchase",
            can_accept: false,
            is_advance: false,
          });
          await updateWalletRemainingBalance(userID, payment2.id);
        } else {
          // await PaymentModel.update(
          //   {
          //     is_advance: "1"
          //   },
          //   { where: { table_type: "purchase", table_id: purchase.id } }
          // );
          let payment2 = await paymentModel.create({
            user_id: purchase.supplier_id,
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
            payment_belongs: userID,
            type: "credit",
            purpose: "return purchase",
            can_accept: false,
            is_advance: true,
          });
          await updateWalletRemainingBalance(userID, payment2.id);

          await updateAdvanceAmount(
            userID,
            purchase.supplier_id,
            data.return_amount_from_wallet,
            true,
          );
        }
      }

      res.send(formatResponse([], "Returned successfully!"));
    });
  } catch (error) {
    addLog("err: " + error.toString());
    compactLog(error);
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse(errorCodes.defaultErrorMsg));
  }
};

/**
 * Purchase Product List
 *
 * @param {*} req
 * @param {*} res
 */
exports.purchaseProducts = async (req, res) => {
  let user = await UserModel.findByPk(req.userId);
  let superAdminRoleId = getRoleId("superadmin");
  let purchaseProductsRes =
    user.role_id == superAdminRoleId
      ? await getPurchaseProducts(req.query)
      : await getPurchaseProductsUser(req, req.query);

  res.send(formatResponse(purchaseProductsRes, "all purchases product"));
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
 * Download Invoice
 *
 * @param {*} req
 * @param {*} res
 */
exports.downloadInvoiceInfo = async (req, res) => {
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

  const cwd = process.cwd();
  // const logoUrl = `file://${cwd}/public/images/logo.png`;
  const logoUrl = `public/images/logo.png`;
  // const logoUrl = process.env.BASE_URL + "public/images/logo.png";

  const bitmap = fs.readFileSync(logoUrl);
  const logo = bitmap.toString("base64");

  let footerhtml = `
          
              <div class="invoice" style="width: 1000px; padding:15px; margin: 0px; position: absolute; bottom: 0px; background-color: #f9f9f9;">
                  <hr/>
                  <table cellpadding="0" cellspacing="1" width="1000px" style="margin:auto;" >
                      <tbody>
                          <tr>
                              <td><table cellspacing="0" cellpadding="0"
                                    border="0"
                                    align="center" width="90%">
                                    <div style="display: table; width:
                                        100%; font-size: 11px;">
                                        <div style="display: table-cell;
                                            width: 65%;">
                                            <h5 style="margin: 0px;
                                                font-size: 11px;
                                                font-weight:
                                                600; text-transform:
                                                uppercase;">NOTE</h5>
                                            <ul style="margin: 0;
                                                padding: 0px;
                                                list-style: none;">
                                                <span style="margin: 0;
                                                    text-align: left;
                                                    font-size: 11px;
                                                    font-weight: 400; ">*
                                                    Goods once sold will
                                                    be taken back with
                                                    condition</span>

                                                <li style="margin: 0;
                                                    text-align: left;
                                                    font-size: 11px;
                                                    font-weight: 400;
                                                    list-style-type:
                                                    disc; margin-left:
                                                    35px;">Returning
                                                    minimum product
                                                    value of Rs 5000/-
                                                    above</li>
                                                <li style="margin: 0;
                                                    text-align: left;
                                                    font-size: 11px;
                                                    font-weight: 400;
                                                    list-style-type:
                                                    disc; margin-left:
                                                    35px;">Returning
                                                    product taken back
                                                    Less than 20-30% of
                                                    my billing amount</li>
                                                <li style="margin: 0;
                                                    text-align: left;
                                                    font-size: 11px;
                                                    font-weight: 400;
                                                    list-style-type:
                                                    disc; margin-left:
                                                    35px;">If any Damage
                                                    charge as per making
                                                    cost only</li>
                                                <li style="margin: 0;
                                                    text-align: left;
                                                    font-size: 11px;
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
                                                    font-size: 11px;
                                                    font-weight: 400;
                                                    list-style-type:
                                                    disc; margin-left:
                                                    35px;">All disputes
                                                    are subject to Patna
                                                    Juridiction only</li>
                                                <li style="margin: 0;
                                                    text-align: left;
                                                    font-size: 11px;
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
                                            <div style="margin-top:5px">
                                                <p style="font-size:
                                                    11px; margin: 0;
                                                    line-height: 1.2; ">
                                                    Company Name - ${purchaseData.supplier_details.company_name}</p>
                                                <p style="font-size:
                                                    11px; margin: 0;
                                                    line-height: 1.2; ">
                                                    ${purchaseData.supplier_details.company_name},<br/>
                                                      Ac. No - ${purchaseData.supplier_details.bank_account_no}</p>
                                                <p style="font-size:
                                                    11px; margin: 0;
                                                    line-height: 1.2; ">
                                                    IFSC Code -
                                                    ${purchaseData.supplier_details.bank_ifsc}</p>
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
                                      300;">PURCHASE${purchaseData.is_approved == "3" ? " ON APPROVAL" : ""} TAX INVOICE</h1>
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
                                                  font-weight: 600;">Prakriti
                                                  Patna</span></h3>
                                          <h3 style="margin: 0; font-weight: 400;
                                              font-size: 14px;">GST No -
                                              <span style="font-weight: 600;">10CIUPK2654L1ZY</span></h3>
                                          <h3 style="margin: 0; font-weight: 400;
                                              font-size: 12px;">User Id - <span>${purchaseData.purchase_by_name}</span></h3>
                                          <h3 style="margin: 0; font-weight: 400;
                                              font-size: 12px;">Address - G100
                                              RBI CPC Colony Kankarbagh Patna
                                              Bihar 800 020</h3>
                                          <h3 style="font-weight: 600; font-size:
                                              12px; margin: 0;">
                                              support@Prakriti.com, +91 98744
                                              45878
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
    let fine_metals = 0;
    for (let i = 0; i < purchaseData.subCatItems.length; i++) {
      purchaseData.subCatItems[i].material.map((itm) => {
        if (itm.id == 1) {
          fine_metals += parseFloat(itm.weight);
        }
      });

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
                                                      ? purchaseData
                                                          .subCatItems[i].hsn
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

    let totalReportCharge = 0;
    let taxOnReportCharge = 0;
    let afterTaxTotalReportCharge = 0;
    if (purchaseData.sale) {
      totalReportCharge =
        parseInt(purchaseData.sale.report_qty) *
        parseFloat(purchaseData.sale.report_charge);
      taxOnReportCharge =
        (totalReportCharge *
          parseFloat(purchaseData.sale.report_tax_percentage)) /
        100;
      afterTaxTotalReportCharge = totalReportCharge + taxOnReportCharge;
    }

    html += `<tr style="
                                      vertical-align: top;">
                                      <td colspan="6"
                                          style="
                                          border:none;">

                                      </td>
                                  </tr>`;
    if (purchaseData.sale && purchaseData.sale.report_qty > 0) {
      html += `<tr style="
                                        vertical-align: top;
                                        background-color: #0A8AB8;
                                        font-size: 12px; 
                                        font-weight:400;
                                        color:#ffffff;
                                        ">
                                        <td colspan="2"></td>
                                        <td colspan="3">Rate</td>
                                        <td colspan="2">Total</td>
                                        <td colspan="1">Tax(%)</td>
                                        <td colspan="1">Tax</td>
                                        <td colspan="2">Total</td>
                                        
                                    </tr>`;
      html += `<tr style="
                                        vertical-align: top;
                                        font-size: 14px; 
                                        font-weight:400;
                                        ">
                                        <td colspan="2" style="background-color: #C1BDBD;">Report Charges : </td>
                                        <td colspan="3" style="background-color: #C1BDBD;">${purchaseData.sale.report_qty} Pics x ${parseFloat(purchaseData.sale.report_charge).toFixed(2)} = </td>
                                        <td colspan="2" style="background-color: #C1BDBD;">${totalReportCharge.toFixed(2)}</td>
                                        <td colspan="1" style="background-color: #C1BDBD;">${parseFloat(purchaseData.sale.report_tax_percentage).toFixed(2)}</td>
                                        <td colspan="1" style="background-color: #C1BDBD;">${taxOnReportCharge.toFixed(2)}</td>
                                        <td colspan="2" style="background-color: #C1BDBD;">${afterTaxTotalReportCharge.toFixed(2)}</td>
                                        
                                    </tr>`;
    }
    html += `<tr style="
                                      vertical-align: top;">
                                      <td colspan="6"
                                          style="
                                          border:none;">

                                      </td>
                                  </tr>`;
    if (metalExists) {
      html += `<tr style="
                                      vertical-align: top;">
                                      <td colspan="2" style="background-color: #0A8AB8; border-bottom: 1px solid #fff; font-size: 12px; font-weight:400; color:#ffffff;">Fine Metals : </td>
                                      <td colspan="2" style="background-color: #C1BDBD; border-bottom: 1px solid #fff; font-size: 14px; font-weight:400;">${fine_metals.toFixed(2)} GM</td>
                                      <td colspan="8" style="background-color: #C1BDBD; border-bottom: 1px solid #fff; font-size: 14px; font-weight:400;"></td>
                                  </tr>`;
    }
    if (metalExists) {
      html += `<tr style="
                                      vertical-align: top;">
                                      <td colspan="2" style="background-color: #0A8AB8; border-bottom: 1px solid #fff; font-size: 12px; font-weight:400; color:#ffffff;">Receive Fine Metal : </td>
                                      <td colspan="2" style="background-color: #C1BDBD; border-bottom: 1px solid #fff; font-size: 14px; font-weight:400;">${receive_metal.toFixed(2)} GM</td>
                                      <td colspan="8" style="background-color: #C1BDBD; border-bottom: 1px solid #fff; font-size: 14px; font-weight:400;"></td>
                                  </tr>`;
    }
    if (metalExists) {
      html += `<tr style="
                                      vertical-align: top;">
                                      <td colspan="2" style="background-color: #0A8AB8; border-bottom: 1px solid #fff; font-size: 12px; font-weight:400; color:#ffffff;">Rest : </td>
                                      <td colspan="2" style="background-color: #C1BDBD; border-bottom: 1px solid #fff; font-size: 14px; font-weight:400;">${rest_metal.toFixed(2)} GM</td>
                                      <td colspan="8" style="background-color: #C1BDBD; border-bottom: 1px solid #fff; font-size: 14px; font-weight:400;"></td>
                                  </tr>`;
    }

    html += `   </tbody>
                                          </table>`;
  }
  html += `
                                          <div class="table-footer-area" style="display: table; width:
                                            100%; position:absolute ; bottom: 390px">
                                            <hr/>
                                          </div>
                                          <div

                                              class="table-footer-area"
                                              style="display: table; width:
                                              100%; position:absolute ;bottom:${
                                                payments.length == 0
                                                  ? 240
                                                  : payments.length == 1
                                                    ? 200
                                                    : payments.length == 2
                                                      ? 200
                                                      : payments.length == 3
                                                        ? 200
                                                        : payments.length == 4
                                                          ? 200
                                                          : payments.length == 5
                                                            ? 200
                                                            : 200
                                              }px">
                                              <div style="display:
                                                  table-cell; width:
                                                  74%">
                                                  <div style="
                                                      display: block;
                                                      justify-content: flex-end;
                                                      gap: 10px;
                                                      width: 80%;
                                                      position:absolute; 
                                                      bottom:${
                                                        payments.length == 0
                                                          ? 100
                                                          : payments.length == 1
                                                            ? 130
                                                            : payments.length ==
                                                                2
                                                              ? 120
                                                              : payments.length ==
                                                                  3
                                                                ? 110
                                                                : payments.length ==
                                                                    4
                                                                  ? 95
                                                                  : payments.length ==
                                                                      5
                                                                    ? 80
                                                                    : 180
                                                      }px;
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
                                                                    payments[
                                                                      i
                                                                    ].payment_mode.toLowerCase() ==
                                                                      "metal" &&
                                                                    payments[i]
                                                                      .weight !=
                                                                      null
                                                                      ? payments[
                                                                          i
                                                                        ].weight
                                                                      : payments[
                                                                          i
                                                                        ].amount
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
                                          <div
                                              class="table-footer-area"
                                              style="display: table; width:
                                              100%; position:absolute; bottom:-75px; left: -5px;">
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
          </style>
      </head>
      <body style="box-sizing: border-box; padding: 0px; margin: 0px; font-family:
          'Poppins', sans-serif;"><div class="invoice" style="max-width: 800px; margin:auto; padding:
              5px;
              background-color: #f9f9f9;">
              <hr/>
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
                                                              Company Name - ${purchaseData.user_details.company_name}</p>
                                                          <p style="font-size:
                                                              8px; margin: 0;
                                                              line-height: 1.2; ">
                                                              ${purchaseData.user_details.company_name},<br/>
                                                               Ac. No - ${purchaseData.user_details.bank_account_no}</p>
                                                          <p style="font-size:
                                                              8px; margin: 0;
                                                              line-height: 1.2; ">
                                                              IFSC Code -
                                                              ${purchaseData.user_details.bank_ifsc}</p>
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
      try {
        const file = { content: html };

        // Generate PDF
        const pdfBuffer = await html_to_pdf.generatePdf(file, options);

        // Ensure the destination directory exists before writing
        fs.mkdirSync(file_path.substring(0, file_path.lastIndexOf("/")), {
          recursive: true,
        });

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
      } catch (error) {
        compactLog("PDF generation failed!", error);
        return res
          .status(errorCodes.default)
          .send(formatErrorResponse(error.toString()));
      }
    })();
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
 * Download Invoice Item List
 *
 * @param {*} req
 * @param {*} res
 */
exports.downloadInvoiceItemList = async (req, res) => {
  let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
  let purchase = await PurchaseModel.findOne({
    where: { id: req.params.id /*, user_id: userID*/ },
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

  /* let payments = await PaymentModel.findAll({
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
  payments = await PaymentCollection(payments); */
  const cwd = process.cwd();
  // const logoUrl = `file://${cwd}/public/images/logo.png`;
  const logoUrl = `public/images/logo.png`;
  // const logoUrl = process.env.BASE_URL + "public/images/logo.png";

  const bitmap = fs.readFileSync(logoUrl);
  const logo = bitmap.toString("base64");

  let footerhtml = `
              <div class="invoice" style="width: 96%; margin: 0px; background-color: #f9f9f9;">
                  <hr/>
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
                                            <h5 style="margin: 0px;
                                                font-size: 11px;
                                                font-weight:
                                                600; text-transform:
                                                uppercase;">NOTE</h5>
                                            <ul style="margin: 0;
                                                padding: 0px;
                                                list-style: none;">
                                                <span style="margin: 0;
                                                    text-align: left;
                                                    font-size: 11px;
                                                    font-weight: 400; ">*
                                                    Goods once sold will
                                                    be taken back with
                                                    condition</span>

                                                <li style="margin: 0;
                                                    text-align: left;
                                                    font-size: 11px;
                                                    font-weight: 400;
                                                    list-style-type:
                                                    disc; margin-left:
                                                    35px;">Returning
                                                    minimum product
                                                    value of Rs 5000/-
                                                    above</li>
                                                <li style="margin: 0;
                                                    text-align: left;
                                                    font-size: 11px;
                                                    font-weight: 400;
                                                    list-style-type:
                                                    disc; margin-left:
                                                    35px;">Returning
                                                    product taken back
                                                    Less than 20-30% of
                                                    my billing amount</li>
                                                <li style="margin: 0;
                                                    text-align: left;
                                                    font-size: 11px;
                                                    font-weight: 400;
                                                    list-style-type:
                                                    disc; margin-left:
                                                    35px;">If any Damage
                                                    charge as per making
                                                    cost only</li>
                                                <li style="margin: 0;
                                                    text-align: left;
                                                    font-size: 11px;
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
                                                    font-size: 11px;
                                                    font-weight: 400;
                                                    list-style-type:
                                                    disc; margin-left:
                                                    35px;">All disputes
                                                    are subject to Patna
                                                    Juridiction only</li>
                                                <li style="margin: 0;
                                                    text-align: left;
                                                    font-size: 11px;
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
                                            
                                            <div style="margin-top:5px">
                                                <p style="
                                                  font-size: 11px; 
                                                  margin: 0;
                                                    line-height: 1.2; ">
                                                    Company Name - ${purchaseData.supplier_details.company_name}</p>
                                                <p style="font-size:
                                                    11px; margin: 0;
                                                    line-height: 1.2; ">
                                                      Ac. No - ${purchaseData.supplier_details.bank_account_no}</p>
                                                <p style="font-size:
                                                    11px; margin: 0;
                                                    line-height: 1.2; ">
                                                    IFSC Code -
                                                    ${purchaseData.supplier_details.bank_ifsc}</p>
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
                                      300;">PURCHASE${purchaseData.is_approved == "3" ? " ON APPROVAL" : ""} ITEM LIST INVOICE</h1>
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
                                                  font-weight: 600;">Prakriti
                                                  Patna</span></h3>
                                          <h3 style="margin: 0; font-weight: 400;
                                              font-size: 14px;">GST No -
                                              <span style="font-weight: 600;">10CIUPK2654L1ZY</span></h3>
                                          <h3 style="margin: 0; font-weight: 400;
                                              font-size: 12px;">User Id - <span>${purchaseData.purchase_by_name}</span></h3>
                                          <h3 style="margin: 0; font-weight: 400;
                                              font-size: 12px;">Address - G100
                                              RBI CPC Colony Kankarbagh Patna
                                              Bihar 800 020</h3>
                                          <h3 style="font-weight: 600; font-size:
                                              12px; margin: 0;">
                                              support@Prakriti.com, +91 98744
                                              45878
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
                                                                  0;">${purchaseData.supplier_mobile}</span></li>
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
  for (let i = 0; i < purchaseData.products.length; i++) {
    let bgTrColor = i % 2 == 0 ? "#050508ff" : "#1E2757";
    let grossWeight = parseFloat(purchaseData.products[i].total_weight);
    let stoneWeight = 0;
    let goldAmt = 0;
    let stoneAmt = 0;
    let productAmt = 0;
    for (let x = 0; x < purchaseData.products[i].materials.length; x++) {
      //grossWeight += parseFloat(purchaseData.products[i].total_weight);

      if (
        purchaseData.products[i].materials[x].unit_name.toUpperCase() != "GM"
      ) {
        stoneWeight += parseFloat(purchaseData.products[i].materials[x].weight);
        stoneAmt += purchaseData.products[i].materials[x].material_cost
          ? parseFloat(purchaseData.products[i].materials[x].material_cost)
          : 0;
      } else {
        goldAmt += purchaseData.products[i].materials[x].material_cost
          ? parseFloat(purchaseData.products[i].materials[x].material_cost)
          : 0;
      }
    }
    productAmt =
      goldAmt + stoneAmt + parseFloat(purchaseData.products[i].making_charge);
    totalGrossWeight += grossWeight;
    totalStoneWeight += stoneWeight;
    totalGoldAmt += goldAmt;
    totalStoneAmt += stoneAmt;
    totalMaterialAmt += parseFloat(purchaseData.products[i].making_charge);
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
                                                    purchaseData.products[i]
                                                      .product_name
                                                  } 
                                              </td>
                                              <td style="text-align:
                                                    left; font-size: 11px;
                                                    font-weight: 400; width: 90px; border-bottom: 1px solid #FFFFFF !important;">
                                                    ${
                                                      purchaseData.products[i]
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
                                                    ${priceFormat(purchaseData.products[i].making_charge)}
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
      "public/invoices/" + purchaseData.invoice_number + "_item_list.pdf";
    const options = { format: "A4" };

    (async () => {
      try {
        const file = { content: html };

        // Generate PDF
        const pdfBuffer = await html_to_pdf.generatePdf(file, options);

        // Ensure the destination directory exists before writing
        fs.mkdirSync(file_path.substring(0, file_path.lastIndexOf("/")), {
          recursive: true,
        });

        // Save PDF to file
        fs.writeFileSync(file_path, pdfBuffer);
        compactLog("PDF generated successfully!");

        res.send(
          formatResponse(
            {
              file_name: purchaseData.invoice_number + "_item_list.pdf",
              url: getFileAbsulatePathPDF(file_path),
              html: html,
              purchaseData,
            },
            "Invoice pdf",
          ),
        );
      } catch (error) {
        compactLog("PDF generation failed!", error);
        return res
          .status(errorCodes.default)
          .send(formatErrorResponse(error.toString()));
      }
    })();
  } catch (error) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse(error.toString()));
  }
};

/**
 * Download Invoice
 *
 * @param {*} req
 * @param {*} res
 */
exports.downloadInvoiceItemDetails = async (req, res) => {
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
  const cwd = process.cwd();
  // const logoUrl = `file://${cwd}/public/images/logo.png`;
  const logoUrl = `public/images/logo.png`;
  // const logoUrl = process.env.BASE_URL + "public/images/logo.png";

  const bitmap = fs.readFileSync(logoUrl);
  const logo = bitmap.toString("base64");

  let footerhtml = `
          
              <div class="invoice" style="width: 96%; margin: 0px; background-color: #f9f9f9;">
                  <hr/>
                  <table cellpadding="0" cellspacing="1" style="margin:auto;; width:100%" >
                      <tbody>
                          <tr>
                              <td><table cellspacing="0" cellpadding="0"
                                    border="0"
                                    align="center" width="90%">
                                    <div style="display: table; width:
                                        100%; font-size: 11px;">
                                        <div style="display: table-cell;
                                            width: 65%;">
                                            <h5 style="margin: 0px;
                                                font-size: 11px;
                                                font-weight:
                                                600; text-transform:
                                                uppercase;">NOTE</h5>
                                            <ul style="margin: 0;
                                                padding: 0px;
                                                list-style: none;">
                                                <span style="margin: 0;
                                                    text-align: left;
                                                    font-size: 11px;
                                                    font-weight: 400; ">*
                                                    Goods once sold will
                                                    be taken back with
                                                    condition</span>

                                                <li style="margin: 0;
                                                    text-align: left;
                                                    font-size: 11px;
                                                    font-weight: 400;
                                                    list-style-type:
                                                    disc; margin-left:
                                                    35px;">Returning
                                                    minimum product
                                                    value of Rs 5000/-
                                                    above</li>
                                                <li style="margin: 0;
                                                    text-align: left;
                                                    font-size: 11px;
                                                    font-weight: 400;
                                                    list-style-type:
                                                    disc; margin-left:
                                                    35px;">Returning
                                                    product taken back
                                                    Less than 20-30% of
                                                    my billing amount</li>
                                                <li style="margin: 0;
                                                    text-align: left;
                                                    font-size: 11px;
                                                    font-weight: 400;
                                                    list-style-type:
                                                    disc; margin-left:
                                                    35px;">If any Damage
                                                    charge as per making
                                                    cost only</li>
                                                <li style="margin: 0;
                                                    text-align: left;
                                                    font-size: 11px;
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
                                                    font-size: 11px;
                                                    font-weight: 400;
                                                    list-style-type:
                                                    disc; margin-left:
                                                    35px;">All disputes
                                                    are subject to Patna
                                                    Juridiction only</li>
                                                <li style="margin: 0;
                                                    text-align: left;
                                                    font-size: 11px;
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
                                            <div style="margin-top:5px">
                                                <p style="font-size:
                                                    11px; margin: 0;
                                                    line-height: 1.2; ">
                                                    Company Name - ${purchaseData.supplier_details.company_name}</p>
                                                <p style="font-size:
                                                    11px; margin: 0;
                                                    line-height: 1.2; ">
                                                    Ac. No - ${purchaseData.supplier_details.bank_account_no}</p>
                                                <p style="font-size:
                                                    11px; margin: 0;
                                                    line-height: 1.2; ">
                                                    IFSC Code -
                                                    ${purchaseData.supplier_details.bank_ifsc}</p>
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
          <link rel="preconnect" href="htuser_mobiletps://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <style>
          html {
            -webkit-print-color-adjust: exact;
          }
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
                                      300;">PURCHASE${purchaseData.is_approved == "3" ? " ON APPROVAL" : ""} ITEM DETAILS INVOICE</h1>
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
                                                  font-weight: 600;">Prakriti
                                                  Patna</span></h3>
                                          <h3 style="margin: 0; font-weight: 400;
                                              font-size: 14px;">GST No -
                                              <span style="font-weight: 600;">10CIUPK2654L1ZY</span></h3>
                                          <h3 style="margin: 0; font-weight: 400;
                                              font-size: 12px;">User Id - <span>${purchaseData.purchase_by_name}</span></h3>
                                          <h3 style="margin: 0; font-weight: 400;
                                              font-size: 12px;">Address - G100
                                              RBI CPC Colony Kankarbagh Patna
                                              Bihar 800 020</h3>
                                          <h3 style="font-weight: 600; font-size:
                                              12px; margin: 0;">
                                              support@Prakriti.com, +91 98744
                                              45878
                                          </h3>
                                      </div>
                                  </div>
                              </table>
                              <table cellspacing="0" cellpadding="5" border="0"
                                  align="center" width="100%">
                                  <tbody>
                                      <tr>
                                          <hr style="border: 1px solid #1E2757 width:97%">
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
  for (let i = 0; i < purchaseData.products.length; i++) {
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
                                                    purchaseData.products[i]
                                                      .product_name
                                                  } - ${
                                                    purchaseData.products[i]
                                                      .product_code
                                                      ? purchaseData.products[i]
                                                          .product_code
                                                      : ""
                                                  }
                                              </td>
                                              <td style="text-align: left;
                                                  font-size: 11px;
                                                  font-weight: 400; width: 60px; ">
                                                  ${
                                                    purchaseData.products[i]
                                                      .size_name
                                                  }
                                              </td>
                                              <td style="text-align:
                                                    left; font-size: 11px;
                                                    font-weight: 400; width: 90px;">
                                                    ${
                                                      purchaseData.products[i]
                                                        .certificate_no
                                                    }
                                              </td>
                                              <td colspan="7" style="text-align:
                                                    left; font-size: 11px;
                                                    font-weight: 400;">Gross Weight-
                                                    ${
                                                      purchaseData.products[i]
                                                        .total_weight
                                                    }
                                              </td>
  
                                          </tr>
                                          <tr style="vertical-align: top; background-color: #FFFFFF;">
                                              <td colspan="2" style="border-bottom: 1px solid #1E2757; padding:0;">
                                                  
                                          `;
    for (let x = 0; x < purchaseData.products[i].materials.length; x++) {
      purchaseData.products[i].materials[x].amount == "₹0.00"
        ? null
        : (html += `<div style="display: flex;
                                                  margin: 5px 5px 0px 5px; text-align: left; width:150px;">
                                                  <div style="
                                                      line-height:1; text-align: left;">
                                                      <span
                                                          style="
                                                          font-size:10px;
                                                          font-weight:400;">${
                                                            purchaseData
                                                              .products[i]
                                                              .materials[x]
                                                              .material_name
                                                          } ${
                                                            purchaseData
                                                              .products[i]
                                                              .materials[x]
                                                              .pakka_weight > 0
                                                              ? purchaseData
                                                                  .products[i]
                                                                  .materials[x]
                                                                  .pakka_weight
                                                              : purchaseData
                                                                  .products[i]
                                                                  .materials[x]
                                                                  .weight
                                                          } ${
                                                            purchaseData
                                                              .products[i]
                                                              .materials[x]
                                                              .unit_name
                                                          } x ${removeCurrencyAndDecimalFromPrice(
                                                            purchaseData
                                                              .products[i]
                                                              .materials[x]
                                                              .rate,
                                                          )}
                                                      </span>
                                                      <!-- span
                                                          style="
                                                          font-size:10px;
                                                          font-weight:400;"> = ${
                                                            purchaseData
                                                              .products[i]
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
                                                            purchaseData
                                                              .products[i]
                                                              .materials[x]
                                                              .amount
                                                          }</span>
                                                  </div-->

                                              </div>`);
    }
    html += `
                                              </td>
                                              <td style="border-bottom:1px solid #1E2757;">`;
    for (let x = 0; x < purchaseData.products[i].materials.length; x++) {
      purchaseData.products[i].materials[x].amount == "₹0.00"
        ? null
        : (html += `<div style="display: flex;
                                                      width:50px;
                                                      margin: 0px 5px 0px 0px; text-align: left;">
                                                      <div style="
                                                          line-height:1; text-align: left;">
                                                          <span
                                                              style="
                                                              font-size:10px;
                                                              font-weight:400;"> = ${removeCurrencyAndDecimalFromPrice(
                                                                purchaseData
                                                                  .products[i]
                                                                  .materials[x]
                                                                  .amount,
                                                              )}</span>
                                                      </div>
                                                  </div>`);
    }
    html += `
                                              </td>
                                              <td style="border-bottom:1px solid #1E2757;">`;
    for (let x = 0; x < purchaseData.products[i].materials.length; x++) {
      html += `<div style="width:90px;">`;
      if (isEmpty(purchaseData.products[i].materials[x].discount_amount)) {
        purchaseData.products[i].materials[x].amount == "₹0.00"
          ? null
          : (html += `-`);
      } else {
        html += `<span style="text-align:left; font-size:10px;font-weight:400;">
                                                  Disc@${removeBlankZero(
                                                    removeCurrencyAndDecimalFromPrice(
                                                      purchaseData.products[i]
                                                        .materials[x]
                                                        .discount_percent,
                                                    ),
                                                  )}% ${removeCurrencyAndDecimalFromPrice(
                                                    purchaseData.products[i]
                                                      .materials[x]
                                                      .discount_amount_display,
                                                  )}
                                                </span> 
                                                <!--<span style="text-align:left; font-size:10px; font-weight:400;">${
                                                  purchaseData.products[i]
                                                    .materials[x]
                                                    .discount_amount_display
                                                }</span>-->`;
      }
      html += `</div>`;
    }
    html += `
                                              </td>
                                              <td style="border-bottom: 1px solid #1E2757;">`;
    for (let x = 0; x < purchaseData.products[i].materials.length; x++) {
      purchaseData.products[i].materials[x].amount == "₹0.00"
        ? null
        : (html += `<div style="text-align: left; font-size: 10px; font-weight: 400;
                                                      margin-top: 5px; 
                                                      width: 40px
                                                      line-height:1;">${removeCurrencyAndDecimalFromPrice(
                                                        purchaseData.products[i]
                                                          .materials[x]
                                                          .material_cost,
                                                      )}</div>`);
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
                                                    purchaseData.products[i]
                                                      .making_charge,
                                                  )}@${removeBlankZero(
                                                    removeCurrencyAndDecimalFromPrice(
                                                      purchaseData.products[i]
                                                        .making_charge_discount,
                                                    ),
                                                  )}%=${removeBlankZero(
                                                    removeCurrencyAndDecimalFromPrice(
                                                      purchaseData.products[i]
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
                                                    purchaseData.products[i]
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
                                                    purchaseData.products[i]
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
                                                    purchaseData.products[i]
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
                                                    purchaseData.products[i]
                                                      .tax,
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
                                                    purchaseData.products[i]
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
                                                                purchaseData?.taxable_amount,
                                                              )}"
                                                              style="width:
                                                              80px;"></div></h4>
                                                  </div>
                                              </td>
                                          </tr>`;

  if (purchaseData.is_same_state_trnx) {
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
                                                              purchaseData?.cgst_tax,
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
                                                              purchaseData?.sgst_tax,
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
                                                              purchaseData?.igst_tax,
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
                                                              purchaseData?.total_amount,
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
                                                              purchaseData?.discount,
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
                                                              purchaseData?.total_payable,
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
                                                              purchaseData?.payment_mode
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
                                                              purchaseData?.due_date
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
                                                              purchaseData?.paid_amount_display,
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
                                                              purchaseData?.due_amount_display,
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
          </style>
      </head>
      <body style="box-sizing: border-box; padding: 0px; margin: 0px; font-family:
          'Poppins', sans-serif;"><div class="invoice" style="max-width: 800px; margin:auto; padding:
              5px;
              background-color: #f9f9f9;">
              <hr/>
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
                                                              Company Name - ${purchaseData.user_details.company_name}</p>
                                                          <p style="font-size:
                                                              8px; margin: 0;
                                                              line-height: 1.2; ">
                                                              ${purchaseData.user_details.company_name},<br/>
                                                               Ac. No - ${purchaseData.user_details.bank_account_no}</p>
                                                          <p style="font-size:
                                                              8px; margin: 0;
                                                              line-height: 1.2; ">
                                                              IFSC Code -
                                                              ${purchaseData.user_details.bank_ifsc}</p>
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
      "public/invoices/" + purchaseData.invoice_number + "_item_details.pdf";
    const options = { format: "A4" };

    (async () => {
      try {
        const file = { content: html };

        // Generate PDF
        const pdfBuffer = await html_to_pdf.generatePdf(file, options);

        // Ensure the destination directory exists before writing
        fs.mkdirSync(file_path.substring(0, file_path.lastIndexOf("/")), {
          recursive: true,
        });

        // Save PDF to file
        fs.writeFileSync(file_path, pdfBuffer);
        compactLog("PDF generated successfully!");

        res.send(
          formatResponse(
            {
              file_name: purchaseData.invoice_number + "_item_details.pdf",
              url: getFileAbsulatePathPDF(file_path),
              purchaseData,
              payments,
            },
            "Invoice pdf",
          ),
        );
      } catch (error) {
        compactLog("PDF generation failed!", error);
        return res
          .status(errorCodes.default)
          .send(formatErrorResponse(error.toString()));
      }
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
