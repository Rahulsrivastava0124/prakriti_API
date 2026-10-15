const {
  errorCodes,
  formatErrorResponse,
  formatResponse,
} = require("@utils/response.config");
const { getPaginationOptions } = require("@helpers/paginator");
const db = require("@models");
const moment = require("moment");
const { Op, QueryTypes } = require("sequelize");
const {
  transferMaterial,
} = require("@controllers/superadmin/stockMaterialHistory.controller");
const {
  isEmpty,
  generateOrderNo,
  getDateFromToWhere,
  displayAmount,
  priceFormat,
  requiresPaymentApproval,
  canActOnApproval,
} = require("@helpers/helper");
const sequelize = db.sequelize;
const {
  PaymentCollection,
} = require("@resources/superadmin/PaymentCollection");
const {
  getWalletBalance,
  getSuperAdminId,
  isSuperAdmin,
  isAdmin,
  isDistributor,
  updateWalletRemainingBalance,
  getWorkingUserID,
  isSalesExecutive,
  sendNotification,
  updateAdvanceAmount,
  isManager,
  supersededPaymentRowIds,
  paymentNeedsApproval,
  hasWalletFunds,
  walletShortfall,
  liveSaleAmounts,
  getLiveGoldRate,
} = require("@library/common");
const { metalPaymentQuote } = require("@library/liveInvoicePricing");
const {
  recalculatePaymentRemainingBalance,
} = require("@library/paymentBalanceRecalculator");
const PaymentModel = db.payments;
const PurchaseModel = db.purchases;
const SaleModel = db.sales;
const UserModel = db.users;
const RoleModel = db.roles;
const NoticationModel = db.notifiactions;
const OrderModel = db.orders;

/**
 * Retrieve all payments
 * @param req
 * @param res
 */
exports.index = async (req, res) => {
  let { page, limit, date_from, date_to, table_type, table_id } = req.query;
  let conditions = {
    ...getDateFromToWhere(date_from, date_to, "payment_date"),
  };
  if (!isEmpty(table_type)) {
    conditions.table_type = table_type;
  }
  if (!isEmpty(table_id)) {
    conditions.table_id = table_id;
  }

  /*
   * A request that was accepted after newer rows had arrived is represented by
   * the "Accepted" row written above it; the original folds away underneath as
   * history and must not also appear as a row of its own. Same rule the wallet
   * screen follows, so an invoice's payment table and the wallet never disagree
   * about how many rows one payment produced.
   */
  conditions.id = { [Op.notIn]: supersededPaymentRowIds() };

  /*
   * Whose rows: the ones the caller entered. On one invoice's payment table
   * also the ones written onto the caller's own ledger by the other party -
   * a purchase made from a super admin sale has every payment entered by the
   * super admin (payment_by) on the buyer's ledger (payment_belongs), so the
   * buyer's Purchase Details listed none of them.
   */
  const whose = !isEmpty(table_id)
    ? { [Op.or]: [{ payment_by: req.userId }, { payment_belongs: req.userId }] }
    : { payment_by: req.userId };

  const paginatorOptions = getPaginationOptions(page, limit);
  PaymentModel.findAndCountAll({
    order: [["id", "DESC"]],
    where: { ...whose, ...conditions },
    offset: paginatorOptions.offset,
    limit: paginatorOptions.limit,
    include: [
      {
        model: UserModel,
        as: "user",
      },
    ],
  })
    .then(async (data) => {
      let result = {
        items: await PaymentCollection(data.rows),
        total: data.count,
      };
      res.send(formatResponse(result, "All Payments"));
    })
    .catch((err) => {
      res.status(errorCodes.default).send(formatErrorResponse(err));
    });
};

/**
 * Create Payment
 *
 * @param {*} req
 * @param {*} res
 */
exports.store = async (req, res) => {
  let data = req.body;
  compactLog("payment.store payload keys:", data && typeof data === 'object' ? Object.keys(data).length : typeof data); //return false;
  /*if('payment_type' in data && data.payment_type == "advance"){
    return res.status(errorCodes.default).send("Advance payment is currently disabled.");
  }*/

  try {
    data.payment_mode = isEmpty(data.payment_mode) ? "cash" : data.payment_mode;
    let currentUserID = isManager(req)
      ? req.userId
      : await getWorkingUserID(req);
    let amount = parseFloat(data.amount);

    /*
     * Metal is valued here, never taken from the browser: gross weight x the
     * purity's live karat rate - the same cached rate and the same mapping the
     * invoice is priced with, so a metal payment and the invoice it settles
     * cannot quote different rates (and a hand-made request cannot inflate it).
     */
    if (String(data.payment_mode || "").toLowerCase() === "metal" && parseFloat(data.weight) > 0) {
      const purity = !isEmpty(data.purity_id)
        ? await db.purities.findByPk(data.purity_id, { attributes: ["value"] })
        : null;
      const quote = metalPaymentQuote(data.weight, purity ? purity.value : null, await getLiveGoldRate());
      if (!quote) {
        return res
          .status(errorCodes.default)
          .send(formatErrorResponse("Today's gold rate is not available right now. Please try again."));
      }
      Object.assign(data, quote); // weight = gross, effective_weight = fine
      amount = quote.amount;
    }

    /*
     * A wallet must never go negative - you cannot pay out money you do not
     * hold. This endpoint had no such check, so paying an invoice from an empty
     * wallet simply drove the balance below zero.
     *
     * Only payments that take money OUT are checked: settling a purchase
     * invoice, or sending money / advance from the wallet screen. A sale
     * payment brings money in, and metal is not held as a balance.
     */
    /*
     * A user whose portal shows a wallet transacts only through it, so any
     * debit against such a user must be covered by their balance - on every
     * payment mode, and regardless of who initiated the payment.
     *
     * Two parties can be debited here:
     *  - the caller, when settling a purchase invoice or sending money out;
     *  - the counterparty, when the caller records a SALE payment, because the
     *    buyer's mirrored debit is written on their behalf and they are not at
     *    the screen to be asked.
     *
     * Parties with no wallet screen (retailer, customer, supplier) are skipped:
     * they pay with real cash or a bank transfer, so their balance is not the
     * source of the funds.
     */
    const requestPaymentType = String(data.payment_type || "")
      .toLowerCase()
      .trim();
    /*
     * A wallet-screen transfer is NOT an invoice payment, even though the UI
     * stamps table_type="sale" on a Send Money whose recipient is an admin or
     * distributor. Treating that as a sale made the counterparty check fire on
     * the RECEIVER, so an SE with Rs 500 in RTGS was refused because the
     * receiving admin held nothing. A genuine invoice payment always names the
     * invoice it settles, so table_id is required as well.
     */
    const isWalletScreenTransfer = ["send_money", "advance", "payment"].includes(
      requestPaymentType,
    );
    /*
     * The caller is paying out whenever they are settling something they owe
     * (table_type "purchase" - an invoice, an advance given, a wallet-screen
     * "payment"), or sending money from their wallet. The wallet-transfer
     * exclusion below belongs only to the counterparty test; applying it here
     * left payment_type "payment" against a purchase unguarded.
     */
    const callerDebits =
      data.table_type === "purchase" || requestPaymentType === "send_money";
    /* ...except when the super admin records it: the super admin may take
       the buyer's wallet negative (the balance is settled with them later) */
    const counterpartyDebits =
      !isWalletScreenTransfer &&
      data.table_type === "sale" &&
      !isEmpty(data.table_id) &&
      !isSuperAdmin(req);

    const debitChecks = [];
    if (callerDebits) debitChecks.push(currentUserID);
    if (counterpartyDebits && !isEmpty(data.user_id)) debitChecks.push(data.user_id);

    for (const debitUserId of debitChecks) {
      const shortfall = await walletShortfall(
        debitUserId,
        data.payment_mode,
        amount,
      );
      if (shortfall) {
        return res.status(errorCodes.default).send(formatErrorResponse(shortfall));
      }
    }

    /*
     * at_current_rate: the payment is taken against the invoice's Due at
     * today's gold rate (Sale Details shows that figure). The payment below
     * only settles a sale whose STORED status is "due", so the invoice is
     * re-valued first - its stored Total Payable / Due (and its mirrored
     * purchase's) become today's-rate figures - and then paid as usual.
     * Without this a fully paid invoice matched nothing: the payment was
     * recorded nowhere while the metal still moved into stock.
     */
    const atCurrentRate = ["1", "true"].includes(String(data.at_current_rate));
    if (
      atCurrentRate &&
      ["sale", "purchase"].includes(data.table_type) &&
      !isEmpty(data.table_id) &&
      !isWalletScreenTransfer
    ) {
      /* the buyer paying a purchase re-values the sale it was made from */
      let saleId = data.table_id;
      let saleWhere = { sale_by: currentUserID };
      if (data.table_type === "purchase") {
        const purchase = await PurchaseModel.findOne({
          attributes: ["id", "sale_id"],
          where: { id: data.table_id, user_id: currentUserID },
        });
        saleId = purchase ? purchase.sale_id : null;
        saleWhere = {};
      }
      const sale = saleId
        ? await SaleModel.findOne({
            attributes: { exclude: ["req_data"] },
            where: { id: saleId, ...saleWhere },
          })
        : null;
      const live = sale ? (await liveSaleAmounts([sale])).get(sale.id) : null;
      if (!live) {
        return res
          .status(errorCodes.default)
          .send(formatErrorResponse("Today's gold rate is not available right now. Please try again."));
      }
      if (amount > live.due_amount + 0.01) {
        return res
          .status(errorCodes.default)
          .send(formatErrorResponse(`Amount must be less than or equal to the due amount (${live.due_amount}).`));
      }
      const revalued = {
        total_payable: live.total_payable,
        due_amount: live.due_amount,
        status: live.due_amount > 0 ? "due" : "paid",
      };
      compactLog("payment.store re-valued sale", sale.id, "at today's rate:", revalued);
      await SaleModel.update(revalued, { where: { id: sale.id } });
      await PurchaseModel.update(revalued, { where: { sale_id: sale.id } });
    }

    /*
     * One invoice can only take what it owes. The settle loop below pays the
     * due and silently drops the rest, so a metal payment larger than the due
     * credited only the due while the metal moved in full (RV-S-125: 10.24 g
     * worth 152,034.30 recorded as 11,885.28). Refuse it instead.
     */
    if (
      ["sale", "purchase"].includes(data.table_type) &&
      !isEmpty(data.table_id) &&
      !isWalletScreenTransfer
    ) {
      const invoice =
        data.table_type === "sale"
          ? await SaleModel.findOne({
              attributes: ["id", "due_amount", "status"],
              where: { id: data.table_id, sale_by: currentUserID },
            })
          : await PurchaseModel.findOne({
              attributes: ["id", "due_amount", "status"],
              where: { id: data.table_id, user_id: currentUserID },
            });
      /* payments still awaiting acceptance have not lowered the stored due
         yet - without this, repeated pending payments could each pass and
         together pay (and move metal) far beyond what is owed */
      const pending = invoice
        ? parseFloat(
            (await PaymentModel.sum("amount", {
              where: {
                table_type: data.table_type,
                table_id: invoice.id,
                payment_belongs: currentUserID,
                status: "pending",
              },
            })) || 0,
          )
        : 0;
      const due =
        invoice && invoice.status === "due"
          ? Math.max(parseFloat(invoice.due_amount) - pending, 0)
          : 0;
      if (invoice && amount > due + 0.01) {
        return res
          .status(errorCodes.default)
          .send(formatErrorResponse(`Amount must be less than or equal to the due amount (${due.toFixed(2)}).`));
      }
    }

    /* what a metal payment is made of, so a pending one can move the metal
       when it is accepted (see updateStatus) */
    const metalFields =
      String(data.payment_mode || "").toLowerCase() === "metal"
        ? {
            material_id: data.material_id || null,
            purity_id: data.purity_id || null,
            unit_id: data.unit_id || null,
          }
        : {};

    let conditions = { status: "due" };
    if ("table_id" in data && !isEmpty(data.table_id)) {
      conditions.id = data.table_id;
    }
    if ("user_id" in data && !isEmpty(data.user_id)) {
      if (!("payment_type" in data && data.payment_type == "advance")) {
        if (data.table_type == "sale") {
          conditions.user_id = data.user_id;
        } else if (data.table_type == "purchase") {
          conditions.supplier_id = data.user_id;
        }
      }
    }

    if (isSalesExecutive(req)) {
      if ("payment_type" in data) {
        if (data.payment_type == "send_money") {
          //check have money in wallet
          let walletBalance = await getWalletBalance(
            currentUserID,
            data.payment_mode,
          );
          if (amount > 0 && walletBalance < amount) {
            return res
              .status(errorCodes.default)
              .send(formatErrorResponse("Insufficient wallet balance."));
          }
        }
      }
    }

    const trans = await sequelize.transaction(async (t) => {
      if (isSuperAdmin(req)) {
        if ("payment_type" in data && data.payment_type == "advance") {
          let payment = await PaymentModel.create({
            user_id: data.user_id,
            payment_by: req.userId,
            amount: amount,
            payment_mode: data.payment_mode,
            payment_type: data.payment_mode == "metal" ? "gold" : "wallet",
            table_type: data.table_type,
            remaining_balance: 0,
            notes: data.notes || null,
            cheque_no: data.cheque_no || null,
            txn_id: data.txn_id || null,
            weight: data.effective_weight || null,
            metal_rate: data.metal_rate || null,
            gross_weight: data.weight || null,
            status:
              !requiresPaymentApproval(data.payment_mode, data.payment_type)
                ? "success"
                : "pending",
            payment_date: moment(data.payment_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD"),
            payment_belongs: currentUserID,
            due_date: data.due_date
              ? moment(data.due_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD")
              : null,
            type: data.table_type == "purchase" ? "debit" : "credit",
            purpose:
              data.table_type == "sale" ? "admin advance" : "supplier advance",
            can_accept: true,
            is_advance: true,
          });

          await updateWalletRemainingBalance(currentUserID, payment.id);

          if (payment.status == "success") {
            if (data.table_type == "sale") {
              await updateAdvanceAmount(
                payment.user_id,
                payment.payment_belongs,
                payment.amount,
                true,
              );
            } else {
              await updateAdvanceAmount(
                payment.payment_belongs,
                payment.user_id,
                payment.amount,
                true,
              );
            }
          }

          if (data.table_type == "sale") {
            let payment2 = await PaymentModel.create({
              parent_id: payment.id,
              user_id: currentUserID,
              payment_by: req.userId,
              amount: amount,
              payment_mode: data.payment_mode,
              payment_type: data.payment_mode == "metal" ? "gold" : "wallet",
              table_type: "purchase",
              remaining_balance: 0,
              notes: data.notes || null,
              cheque_no: data.cheque_no || null,
              txn_id: data.txn_id || null,
              weight: data.effective_weight || null,
              metal_rate: data.metal_rate || null,
              gross_weight: data.weight || null,
              /*
                 * Bound to the parent row's status, not recomputed. When these two
                 * were decided separately a cash transfer settled this debit on the
                 * spot while the receiver's credit stayed pending - the money left
                 * one wallet and arrived in none.
                 */
                status: payment.status,
              payment_date: moment(data.payment_date, "MM/DD/YYYY").format(
                "YYYY-MM-DD",
              ),
              payment_belongs: data.user_id,
              due_date: data.due_date
                ? moment(data.due_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD")
                : null,
              type: "debit",
              purpose: "superadmin advance",
              can_accept: false,
              is_advance: true,
            });

            await updateWalletRemainingBalance(data.user_id, payment2.id);
          }
        } else {
          if (data.table_type == "sale") {
            compactLog("processing sale payments");
            let tableData = await SaleModel.findAll({
              order: [["id", "ASC"]],
              where: { ...conditions, sale_by: currentUserID },
            });

            for (let i = 0; i < tableData.length; i++) {
              let item = tableData[i];
              let status = "due",
                due_amount = 0,
                paid_amount = 0,
                payment_amount = 0;
              if (parseFloat(item.due_amount) <= amount) {
                due_amount = 0;
                paid_amount = parseFloat(item.total_payable);
                amount = amount - parseFloat(item.due_amount);
                status = "paid";
                payment_amount = parseFloat(item.due_amount);
              } else {
                due_amount = parseFloat(item.due_amount) - amount;
                paid_amount = priceFormat(item.paid_amount) + amount;
                payment_amount = amount;
                amount = 0;
              }

              compactLog("AMOUNT:", amount, "DUE:", due_amount, "PAID:", paid_amount, "STATUS:", status, "PAYMENT:", payment_amount);
              if (
                !requiresPaymentApproval(data.payment_mode, data.payment_type)
              ) {
                await SaleModel.update(
                  {
                    due_amount: due_amount,
                    paid_amount: paid_amount,
                    status: status,
                    due_date: data.due_date
                      ? moment(data.due_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD")
                      : null,
                  },
                  { where: { id: item.id }, transaction: t },
                );

                //update to related purchase table
                await PurchaseModel.update(
                  {
                    due_amount: due_amount,
                    paid_amount: paid_amount,
                    status: status,
                    due_date: data.due_date
                      ? moment(data.due_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD")
                      : null,
                  },
                  { where: { sale_id: item.id }, transaction: t },
                );

                //read notification
                let noticationCon = { type_id: item.id };
                if (due_amount > 0) {
                  noticationCon.type = "sale_due";
                } else {
                  noticationCon = {
                    ...noticationCon,
                    [Op.or]: [
                      { type: "sale_due" },
                      { type: "sale_settlement" },
                    ],
                  };
                }
                await NoticationModel.update(
                  {
                    is_read: true,
                  },
                  { where: noticationCon, transaction: t },
                );
              }

              //payment insert into super admin wallet
              let payment = await PaymentModel.create({
                user_id: data.user_id,
                payment_by: req.userId,
                amount: payment_amount,
                payment_mode: data.payment_mode,
                payment_type: data.payment_mode == "metal" ? "gold" : "wallet",
                remaining_balance: 0,
                notes: data.notes || null,
                cheque_no: data.cheque_no || null,
                txn_id: data.txn_id || null,
                weight: data.effective_weight || null,
                metal_rate: data.metal_rate || null,
                gross_weight: data.weight || null,
                status:
                  !requiresPaymentApproval(data.payment_mode, data.payment_type)
                    ? "success"
                    : "pending",
                payment_date: moment(data.payment_date, "MM/DD/YYYY").format(
                  "YYYY-MM-DD",
                ),
                table_type: data.table_type,
                table_id: item.id,
                payment_belongs: currentUserID,
                due_date: data.due_date
                  ? moment(data.due_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD")
                  : null,
                type: "credit",
                purpose: "sale",
                can_accept: true,
              });

              await updateWalletRemainingBalance(currentUserID, payment.id);

              //payment insert into admin wallet
              let purchase = await PurchaseModel.findOne({
                where: { sale_id: item.id },
              });
              let payment2 = await PaymentModel.create({
                parent_id: payment.id,
                user_id: currentUserID,
                payment_by: req.userId,
                amount: payment_amount,
                payment_mode: data.payment_mode,
                payment_type: data.payment_mode == "metal" ? "gold" : "wallet",
                remaining_balance: 0,
                notes: data.notes || null,
                cheque_no: data.cheque_no || null,
                txn_id: data.txn_id || null,
                weight: data.effective_weight || null,
                metal_rate: data.metal_rate || null,
                gross_weight: data.weight || null,
                /*
                   * Bound to the parent row's status, not recomputed. When these two
                   * were decided separately a cash transfer settled this debit on the
                   * spot while the receiver's credit stayed pending - the money left
                   * one wallet and arrived in none.
                   */
                  status: payment.status,
                payment_date: moment(data.payment_date, "MM/DD/YYYY").format(
                  "YYYY-MM-DD",
                ),
                table_type: "purchase",
                table_id: purchase ? purchase.id : null,
                payment_belongs: data.user_id,
                due_date: data.due_date
                  ? moment(data.due_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD")
                  : null,
                type: "debit",
                purpose: "sale",
                can_accept: false,
              });

              await updateWalletRemainingBalance(data.user_id, payment2.id);

              if (amount == 0) {
                break;
              }
            }
          } else if (data.table_type == "purchase") {
            let tableData = await PurchaseModel.findAll({
              order: [["id", "ASC"]],
              where: { ...conditions, user_id: currentUserID },
            });

            for (let i = 0; i < tableData.length; i++) {
              let item = tableData[i];
              let status = "due",
                due_amount = 0,
                paid_amount = 0,
                payment_amount = 0;
              if (parseFloat(item.due_amount) <= amount) {
                due_amount = 0;
                paid_amount = parseFloat(item.total_payable);
                amount = amount - parseFloat(item.due_amount);
                status = "paid";
                payment_amount = parseFloat(item.due_amount);
              } else {
                due_amount = parseFloat(item.due_amount) - amount;
                paid_amount = priceFormat(item.paid_amount) + amount;
                payment_amount = amount;
                amount = 0;
              }

              if (
                !requiresPaymentApproval(data.payment_mode, data.payment_type)
              ) {
                await PurchaseModel.update(
                  {
                    due_amount: due_amount,
                    paid_amount: paid_amount,
                    status: status,
                    due_date: data.due_date
                      ? moment(data.due_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD")
                      : null,
                  },
                  { where: { id: item.id }, transaction: t },
                );

                //read notification
                let noticationCon = { type_id: item.id, type: "purchase_due" };
                await NoticationModel.update(
                  {
                    is_read: true,
                  },
                  { where: noticationCon, transaction: t },
                );
              }

              let payment = await PaymentModel.create({
                user_id: data.user_id,
                payment_by: req.userId,
                amount: payment_amount,
                payment_mode: data.payment_mode,
                payment_type: data.payment_mode == "metal" ? "gold" : "wallet",
                remaining_balance: 0,
                notes: data.notes || null,
                cheque_no: data.cheque_no || null,
                txn_id: data.txn_id || null,
                weight: data.effective_weight || null,
                metal_rate: data.metal_rate || null,
                gross_weight: data.weight || null,
                status:
                  !requiresPaymentApproval(data.payment_mode, data.payment_type)
                    ? "success"
                    : "pending",
                payment_date: moment(data.payment_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD"),
                table_type: data.table_type,
                table_id: item.id,
                payment_belongs: currentUserID,
                due_date: data.due_date
                  ? moment(data.due_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD")
                  : null,
                type: "debit",
                purpose: "purchase",
                can_accept: true,
              });

              await updateWalletRemainingBalance(currentUserID, payment.id);

              if (amount == 0) {
                break;
              }
            }
          }
        }
      } else if (isAdmin(req)) {
        if (
          "payment_type" in data &&
          (data.payment_type == "advance" || data.payment_type == "send_money")
        ) {
          if (data.payment_type == "send_money") {
            //credit to superadmin
            let payment = await PaymentModel.create({
              user_id: currentUserID,
              payment_by: req.userId,
              amount: amount,
              payment_mode: data.payment_mode,
              payment_type: data.payment_mode == "metal" ? "gold" : "wallet",
              table_type: "send_money",
              remaining_balance: 0,
              notes: data.notes || null,
              cheque_no: data.cheque_no || null,
              txn_id: data.txn_id || null,
              weight: data.effective_weight || null,
              metal_rate: data.metal_rate || null,
              gross_weight: data.weight || null,
              status: "pending",
              payment_date: moment(data.payment_date, "MM/DD/YYYY").format(
                "YYYY-MM-DD",
              ),
              payment_belongs: data.user_id,
              due_date: null,
              type: "credit",
              purpose: "sent from superadmin",
              can_accept: true,
              is_advance: false,
            });
            await updateWalletRemainingBalance(data.user_id, payment.id);

            //debit from sales executive
            let payment2 = await PaymentModel.create({
              parent_id: payment.id,
              user_id: data.user_id,
              payment_by: req.userId,
              table_type: "send_money",
              amount: amount,
              payment_mode: data.payment_mode,
              payment_type: data.payment_mode == "metal" ? "gold" : "wallet",
              remaining_balance: 0,
              notes: data.notes || null,
              cheque_no: data.cheque_no || null,
              txn_id: data.txn_id || null,
              weight: data.effective_weight || null,
              metal_rate: data.metal_rate || null,
              gross_weight: data.weight || null,
              /*
                 * Bound to the parent row's status, not recomputed. When these two
                 * were decided separately a cash transfer settled this debit on the
                 * spot while the receiver's credit stayed pending - the money left
                 * one wallet and arrived in none.
                 */
                status: payment.status,
              payment_date: moment(data.payment_date, "MM/DD/YYYY").format(
                "YYYY-MM-DD",
              ),
              payment_belongs: currentUserID,
              due_date: null,
              type: "debit",
              purpose: "sent to superadmin",
              can_accept: false,
              is_advance: false,
            });
            await updateWalletRemainingBalance(currentUserID, payment2.id);

            //send notification
            sendNotification("send_money", req, { payment: payment });
          } else if (data.payment_type == "advance") {
            let user = await UserModel.findByPk(data.user_id);
            let isPaymentToSuperAdmin = false;
            if (user && isSuperAdmin(user.role_id)) {
              isPaymentToSuperAdmin = true;
            }

            let payment = null;
            if (isPaymentToSuperAdmin) {
              payment = await PaymentModel.create({
                user_id: currentUserID,
                payment_by: req.userId,
                amount: amount,
                payment_mode: data.payment_mode,
                payment_type: data.payment_mode == "metal" ? "gold" : "wallet",
                table_type: "sale",
                remaining_balance: 0,
                notes: data.notes || null,
                cheque_no: data.cheque_no || null,
                txn_id: data.txn_id || null,
                weight: data.effective_weight || null,
                metal_rate: data.metal_rate || null,
                gross_weight: data.weight || null,
                status: "pending",
                payment_date: moment(data.payment_date, "MM/DD/YYYY").format(
                  "YYYY-MM-DD",
                ),
                payment_belongs: data.user_id,
                due_date: data.due_date
                  ? moment(data.due_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD")
                  : null,
                type: "credit",
                purpose: "admin advance",
                can_accept: true,
                is_advance: true,
              });
            }
            let paymentStatus =
              isPaymentToSuperAdmin || requiresPaymentApproval(data.payment_mode, data.payment_type)
                ? "pending"
                : "success";
            let purpose = "",
              type = "";
            if (isPaymentToSuperAdmin) {
              purpose = "superadmin advance";
              type = "debit";
            } else {
              if (data.table_type == "sale") {
                purpose = "distributor advance";
                type = "credit";
              } else {
                purpose = "supplier advance";
                type = "debit";
              }
            }
            let payment2 = await PaymentModel.create({
              parent_id: payment ? payment.id : null,
              user_id: data.user_id,
              payment_by: req.userId,
              table_type: data.table_type,
              amount: amount,
              payment_mode: data.payment_mode,
              payment_type: data.payment_mode == "metal" ? "gold" : "wallet",
              remaining_balance: 0,
              notes: data.notes || null,
              cheque_no: data.cheque_no || null,
              txn_id: data.txn_id || null,
              weight: data.effective_weight || null,
              metal_rate: data.metal_rate || null,
              gross_weight: data.weight || null,
              status: paymentStatus,
              payment_date: moment(data.payment_date, "MM/DD/YYYY").format(
                "YYYY-MM-DD",
              ),
              payment_belongs: currentUserID,
              due_date: data.due_date
                ? moment(data.due_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD")
                : null,
              type: type,
              purpose: purpose,
              can_accept: isPaymentToSuperAdmin ? false : true,
              is_advance: true,
            });

            await updateWalletRemainingBalance(currentUserID, payment2.id);

            if (payment2.status == "success") {
              if (data.table_type == "sale") {
                await updateAdvanceAmount(
                  payment2.user_id,
                  payment2.payment_belongs,
                  payment2.amount,
                  true,
                );
              } else {
                await updateAdvanceAmount(
                  payment2.payment_belongs,
                  payment2.user_id,
                  payment2.amount,
                  true,
                );
              }
            }

            if (!isPaymentToSuperAdmin && data.table_type == "sale") {
              let payment3 = await PaymentModel.create({
                parent_id: payment2.id,
                user_id: currentUserID,
                payment_by: req.userId,
                amount: amount,
                table_type: "purchase",
                payment_mode: data.payment_mode,
                payment_type: data.payment_mode == "metal" ? "gold" : "wallet",
                remaining_balance: 0,
                notes: data.notes || null,
                cheque_no: data.cheque_no || null,
                txn_id: data.txn_id || null,
                weight: data.effective_weight || null,
                metal_rate: data.metal_rate || null,
                gross_weight: data.weight || null,
                /*
                   * Bound to the parent row's status, not recomputed. When these two
                   * were decided separately a cash transfer settled this debit on the
                   * spot while the receiver's credit stayed pending - the money left
                   * one wallet and arrived in none.
                   */
                  status: payment2.status,
                payment_date: moment(data.payment_date, "MM/DD/YYYY").format(
                  "YYYY-MM-DD",
                ),
                payment_belongs: data.user_id,
                due_date: data.due_date
                  ? moment(data.due_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD")
                  : null,
                type: "debit",
                purpose: "admin advance",
                can_accept: false,
                is_advance: true,
              });

              await updateWalletRemainingBalance(data.user_id, payment3.id);
            }
          }
        } else {
          compactLog("======HERE=====");
          if (data.table_type == "sale") {
            let tableData = await SaleModel.findAll({
              order: [["id", "ASC"]],
              where: { ...conditions, sale_by: currentUserID },
            });

            for (let i = 0; i < tableData.length; i++) {
              let item = tableData[i];
              let status = "due",
                due_amount = 0,
                paid_amount = 0,
                payment_amount = 0;
              if (parseFloat(item.due_amount) <= amount) {
                due_amount = 0;
                paid_amount = parseFloat(item.total_payable);
                amount = amount - parseFloat(item.due_amount);
                status = "paid";
                payment_amount = parseFloat(item.due_amount);
              } else {
                due_amount = parseFloat(item.due_amount) - amount;
                paid_amount = priceFormat(item.paid_amount) + amount;
                payment_amount = amount;
                amount = 0;
              }

              if (
                !requiresPaymentApproval(data.payment_mode, data.payment_type)
              ) {
                await SaleModel.update(
                  {
                    due_amount: due_amount,
                    paid_amount: paid_amount,
                    status: status,
                    due_date: data.due_date
                      ? moment(data.due_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD")
                      : null,
                  },
                  { where: { id: item.id }, transaction: t },
                );

                //update to related purchase table
                await PurchaseModel.update(
                  {
                    due_amount: due_amount,
                    paid_amount: paid_amount,
                    status: status,
                    due_date: data.due_date
                      ? moment(data.due_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD")
                      : null,
                  },
                  { where: { sale_id: item.id }, transaction: t },
                );

                //read notification
                let noticationCon = { type_id: item.id };
                if (due_amount > 0) {
                  noticationCon.type = "sale_due";
                } else {
                  noticationCon = {
                    ...noticationCon,
                    [Op.or]: [
                      { type: "sale_due" },
                      { type: "sale_settlement" },
                    ],
                  };
                }
                await NoticationModel.update(
                  {
                    is_read: true,
                  },
                  { where: noticationCon, transaction: t },
                );
              }

              //payment insert into super admin wallet
              let payment = await PaymentModel.create({
                user_id: data.user_id,
                payment_by: req.userId,
                amount: payment_amount,
                payment_mode: data.payment_mode,
                payment_type: data.payment_mode == "metal" ? "gold" : "wallet",
                remaining_balance: 0,
                notes: data.notes || null,
                cheque_no: data.cheque_no || null,
                txn_id: data.txn_id || null,
                weight: data.effective_weight || null,
                metal_rate: data.metal_rate || null,
                gross_weight: data.weight || null,
                status:
                  !requiresPaymentApproval(data.payment_mode, data.payment_type)
                    ? "success"
                    : "pending",
                payment_date: moment(data.payment_date, "MM/DD/YYYY").format(
                  "YYYY-MM-DD",
                ),
                table_type: data.table_type,
                table_id: item.id,
                payment_belongs: currentUserID,
                due_date: data.due_date
                  ? moment(data.due_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD")
                  : null,
                type: "credit",
                purpose: "sale",
                can_accept: true,
              });

              await updateWalletRemainingBalance(currentUserID, payment.id);

              //payment insert into admin wallet
              let purchase = await PurchaseModel.findOne({
                where: { sale_id: item.id },
              });
              let payment2 = await PaymentModel.create({
                parent_id: payment.id,
                user_id: currentUserID,
                payment_by: req.userId,
                amount: payment_amount,
                payment_mode: data.payment_mode,
                payment_type: data.payment_mode == "metal" ? "gold" : "wallet",
                remaining_balance: 0,
                notes: data.notes || null,
                cheque_no: data.cheque_no || null,
                txn_id: data.txn_id || null,
                weight: data.effective_weight || null,
                metal_rate: data.metal_rate || null,
                gross_weight: data.weight || null,
                /*
                   * Bound to the parent row's status, not recomputed. When these two
                   * were decided separately a cash transfer settled this debit on the
                   * spot while the receiver's credit stayed pending - the money left
                   * one wallet and arrived in none.
                   */
                  status: payment.status,
                payment_date: moment(data.payment_date, "MM/DD/YYYY").format(
                  "YYYY-MM-DD",
                ),
                table_type: "purchase",
                table_id: purchase ? purchase.id : null,
                payment_belongs: data.user_id,
                due_date: data.due_date
                  ? moment(data.due_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD")
                  : null,
                type: "debit",
                purpose: "sale",
                can_accept: false,
              });

              await updateWalletRemainingBalance(data.user_id, payment2.id);

              if (amount == 0) {
                break;
              }
            }
          } else if (data.table_type == "purchase") {
            compactLog("======purchase=====");
            let tableData = await PurchaseModel.findAll({
              order: [["id", "ASC"]],
              where: { ...conditions, user_id: currentUserID },
            });
            /*
             * Who is being paid. "Pay Now" on the invoice screen sends no
             * user_id, so fall back to the supplier recorded on the invoice.
             * Without this the receiver was unknown: no credit row was written
             * into their wallet - so an admin paying a super admin never showed
             * up in the super admin's wallet history - and the approval rule
             * could not see the pair, leaving a UPI payment to settle on the
             * spot when only SE <-> retailer may do that.
             */
            let receiverId = data.user_id;
            if (isEmpty(receiverId)) {
              const firstInvoice = tableData[0];
              receiverId = firstInvoice ? firstInvoice.supplier_id : null;
            }
            let user = await UserModel.findByPk(receiverId);
            let isPaymentToSuperAdmin = false;
            if (user && isSuperAdmin(user.role_id)) {
              isPaymentToSuperAdmin = true;
            }
            compactLog(
              data.due_date ? moment(data.due_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD") : null,
            );
            let metalMoved = false;
            for (let i = 0; i < tableData.length; i++) {
              let item = tableData[i];
              let status = "due",
                due_amount = 0,
                paid_amount = 0,
                payment_amount = 0;
              if (parseFloat(item.due_amount) <= amount) {
                due_amount = 0;
                paid_amount = parseFloat(item.total_payable);
                amount = amount - parseFloat(item.due_amount);
                status = "paid";
                payment_amount = parseFloat(item.due_amount);
              } else {
                due_amount = parseFloat(item.due_amount) - amount;
                paid_amount = priceFormat(item.paid_amount) + amount;
                payment_amount = amount;
                amount = 0;
              }
              compactLog(
                "======isPaymentToSuperAdmin=====",
                isPaymentToSuperAdmin,
              );
              compactLog("======AMOUNT=====", amount);
              compactLog("======DUE AMOUNT=====", due_amount);
              compactLog("======PAID AMOUNT=====", paid_amount);
              compactLog("======STATUS=====", status);
              compactLog("======PAYMENT AMOUNT=====", payment_amount);
              //return false;
              //if ((!isPaymentToSuperAdmin && !requiresPaymentApproval(data.payment_mode, data.payment_type)) || data.payment_mode == "metal") {
              if (!isPaymentToSuperAdmin && !requiresPaymentApproval(data.payment_mode, data.payment_type)) {
                await PurchaseModel.update(
                  {
                    due_amount: due_amount,
                    paid_amount: paid_amount,
                    status: status,
                    due_date: data.due_date
                      ? moment(data.due_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD")
                      : null,
                  },
                  { where: { id: item.id }, transaction: t },
                );

                //read notification
                let noticationCon = { type_id: item.id, type: "purchase_due" };
                await NoticationModel.update(
                  {
                    is_read: true,
                  },
                  { where: noticationCon, transaction: t },
                );
              }

              // Supplier is itself a wallet-holding admin and this purchase is
              // linked to that admin's sale (B2B). Keep their sale ledger in
              // sync so the payment reflects on both sides.
              const isAdminSupplier =
                !isPaymentToSuperAdmin &&
                user &&
                isAdmin(user.role_id) &&
                item.sale_id;

              if (isAdminSupplier && !requiresPaymentApproval(data.payment_mode, data.payment_type)) {
                await SaleModel.update(
                  {
                    due_amount: due_amount,
                    paid_amount: paid_amount,
                    status: status,
                    due_date: data.due_date
                      ? moment(data.due_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD")
                      : null,
                  },
                  { where: { id: item.sale_id }, transaction: t },
                );
              }

              /*
               * Relationship-aware: only an SE paying their own retailer settles
               * cash / UPI on the spot. Every other pair waits on every mode.
               * The mode-only test let an admin's UPI payment auto-accept.
               */
              let paymentStatus =
                isPaymentToSuperAdmin ||
                (await paymentNeedsApproval(
                  data.payment_mode,
                  data.payment_type,
                  currentUserID,
                  receiverId,
                ))
                  ? "pending"
                  : "success";

              let payment = null;
              if (isPaymentToSuperAdmin) {
                payment = await PaymentModel.create({
                  user_id: currentUserID,
                  payment_by: req.userId,
                  amount: payment_amount,
                  payment_mode: data.payment_mode,
                  payment_type:
                    data.payment_mode == "metal" ? "gold" : "wallet",
                  remaining_balance: 0,
                  notes: data.notes || null,
                  cheque_no: data.cheque_no || null,
                  txn_id: data.txn_id || null,
                  weight: data.effective_weight || null,
                  metal_rate: data.metal_rate || null,
                  gross_weight: data.weight || null,
                  ...metalFields,
                  status: "pending",
                  payment_date: moment(data.payment_date, "MM/DD/YYYY").format(
                    "YYYY-MM-DD",
                  ),
                  table_type: "sale",
                  table_id: item.sale_id,
                  payment_belongs: receiverId,
                  due_date: data.due_date
                    ? moment(data.due_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD")
                    : null,
                  type: "credit",
                  purpose: "sale",
                  can_accept: true,
                });
              }

              let payment2 = await PaymentModel.create({
                parent_id: payment ? payment.id : null,
                // The counterparty, resolved from the invoice when Pay Now
                // sends no user_id.
                user_id: receiverId,
                payment_by: req.userId,
                amount: payment_amount,
                payment_mode: data.payment_mode,
                payment_type: data.payment_mode == "metal" ? "gold" : "wallet",
                remaining_balance: 0,
                notes: data.notes || null,
                cheque_no: data.cheque_no || null,
                txn_id: data.txn_id || null,
                weight: data.effective_weight || null,
                metal_rate: data.metal_rate || null,
                gross_weight: data.weight || null,
                ...metalFields,
                status: paymentStatus,
                payment_date: moment(data.payment_date, "MM/DD/YYYY").format(
                  "YYYY-MM-DD",
                ),
                table_type: data.table_type,
                table_id: item.id,
                payment_belongs: currentUserID,
                due_date: data.due_date
                  ? moment(data.due_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD")
                  : null,
                type: "debit",
                purpose: "purchase",
                can_accept: isPaymentToSuperAdmin ? false : true,
              });

              await updateWalletRemainingBalance(currentUserID, payment2.id);

              /*
               * A metal payment that settled on the spot (not to the super
               * admin - those wait for acceptance and move the metal then)
               * moves the metal now: payer -> supplier, written to the stock
               * history, the payer's stock allowed below zero. Once per
               * request, however many invoices the amount was spread over.
               */
              if (
                !metalMoved &&
                payment2.status === "success" &&
                metalFields.material_id &&
                metalFields.purity_id &&
                parseFloat(data.weight) > 0 &&
                !isEmpty(receiverId)
              ) {
                metalMoved = true;
                await transferMaterial(
                  req,
                  {
                    from_user_id: currentUserID,
                    to_user_id: receiverId,
                    material_id: metalFields.material_id,
                    purity_id: metalFields.purity_id,
                    unit_id: metalFields.unit_id,
                    quantity: 0,
                    payment_mode: "metal",
                    amount: data.amount,
                    metal_rate: data.metal_rate || null,
                    ref_no: item.invoice_number,
                    weight: data.weight,
                    effective_weight: data.effective_weight || data.weight,
                  },
                  { allowNegative: true },
                );
              }

              /*
               * Mirror the payment as a credit into the supplier's wallet.
               *
               * This used to require the supplier be an admin AND the purchase
               * be linked to a sale, so an SE or distributor supplier never saw
               * money an admin had paid them - it existed only in the payer's
               * ledger. A super admin supplier already has its credit row
               * written above, so it is excluded here to avoid a duplicate.
               */
              /*
               * Only for a supplier that actually holds a wallet. A plain
               * supplier (role 8) has no panel and no wallet screen, so a
               * credit row there would be invisible and meaningless - those
               * purchases keep the single-sided record they always had.
               */
              const creditSupplier =
                !isPaymentToSuperAdmin &&
                !isEmpty(receiverId) &&
                user &&
                canActOnApproval(user.role_id);
              if (creditSupplier) {
                let supplierPayment = await PaymentModel.create({
                  parent_id: payment2.id,
                  user_id: currentUserID,
                  payment_by: req.userId,
                  amount: payment_amount,
                  payment_mode: data.payment_mode,
                  payment_type:
                    data.payment_mode == "metal" ? "gold" : "wallet",
                  remaining_balance: 0,
                  notes: data.notes || null,
                  cheque_no: data.cheque_no || null,
                  txn_id: data.txn_id || null,
                  weight: data.effective_weight || null,
                  metal_rate: data.metal_rate || null,
                  gross_weight: data.weight || null,
                  ...metalFields,
                  // In step with the payer's debit - the two halves of one
                  // payment must never settle independently.
                  status: payment2.status,
                  payment_date: moment(data.payment_date, "MM/DD/YYYY").format(
                    "YYYY-MM-DD",
                  ),
                  // Reference the linked sale when there is one; otherwise the
                  // purchase this payment was made against.
                  table_type: item.sale_id ? "sale" : "purchase",
                  table_id: item.sale_id || item.id,
                  payment_belongs: receiverId,
                  due_date: data.due_date
                    ? moment(data.due_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD")
                    : null,
                  type: "credit",
                  purpose: "sale",
                  can_accept: false,
                });

                await updateWalletRemainingBalance(
                  receiverId,
                  supplierPayment.id,
                );
              }

              if (amount == 0) {
                break;
              }
            }
          }
        }
      } else if (isDistributor(req)) {
        if (
          "payment_type" in data &&
          (data.payment_type == "advance" || data.payment_type == "send_money")
        ) {
          if (data.payment_type == "send_money") {
            //credit to admin
            let payment = await PaymentModel.create({
              user_id: currentUserID,
              payment_by: req.userId,
              amount: amount,
              payment_mode: data.payment_mode,
              table_type: "send_money",
              remaining_balance: 0,
              notes: data.notes || null,
              cheque_no: data.cheque_no || null,
              txn_id: data.txn_id || null,
              weight: data.effective_weight || null,
              metal_rate: data.metal_rate || null,
              gross_weight: data.weight || null,
              status: "pending",
              payment_date: moment(data.payment_date, "MM/DD/YYYY").format(
                "YYYY-MM-DD",
              ),
              payment_belongs: data.user_id,
              due_date: null,
              type: "credit",
              purpose: "sent from distributor",
              can_accept: true,
              is_advance: false,
            });
            await updateWalletRemainingBalance(data.user_id, payment.id);

            //debit from sales executive
            let payment2 = await PaymentModel.create({
              parent_id: payment.id,
              user_id: data.user_id,
              payment_by: req.userId,
              table_type: "send_money",
              amount: amount,
              payment_mode: data.payment_mode,
              remaining_balance: 0,
              notes: data.notes || null,
              cheque_no: data.cheque_no || null,
              txn_id: data.txn_id || null,
              weight: data.effective_weight || null,
              metal_rate: data.metal_rate || null,
              gross_weight: data.weight || null,
              /*
                 * Bound to the parent row's status, not recomputed. When these two
                 * were decided separately a cash transfer settled this debit on the
                 * spot while the receiver's credit stayed pending - the money left
                 * one wallet and arrived in none.
                 */
                status: payment2.status,
              payment_date: moment(data.payment_date, "MM/DD/YYYY").format(
                "YYYY-MM-DD",
              ),
              payment_belongs: currentUserID,
              due_date: null,
              type: "debit",
              purpose: "sent to admin",
              can_accept: false,
              is_advance: false,
            });
            await updateWalletRemainingBalance(currentUserID, payment2.id);

            //send notification
            sendNotification("send_money", req, { payment: payment });
          } else if (data.payment_type == "advance") {
            let user = await UserModel.findByPk(data.user_id);
            let isPaymentToAdmin = false;
            if (user && isAdmin(user.role_id)) {
              isPaymentToAdmin = true;
            }

            let payment = null;
            if (isPaymentToAdmin) {
              payment = await PaymentModel.create({
                user_id: currentUserID,
                payment_by: req.userId,
                amount: amount,
                payment_mode: data.payment_mode,
                table_type: "sale",
                remaining_balance: 0,
                notes: data.notes || null,
                cheque_no: data.cheque_no || null,
                txn_id: data.txn_id || null,
                weight: data.effective_weight || null,
                metal_rate: data.metal_rate || null,
                gross_weight: data.weight || null,
                status: "pending",
                payment_date: moment(data.payment_date, "MM/DD/YYYY").format(
                  "YYYY-MM-DD",
                ),
                payment_belongs: data.user_id,
                due_date: data.due_date
                  ? moment(data.due_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD")
                  : null,
                type: "credit",
                purpose: "distributor advance",
                can_accept: true,
                is_advance: true,
              });
            }
            let paymentStatus =
              isPaymentToAdmin || requiresPaymentApproval(data.payment_mode, data.payment_type)
                ? "pending"
                : "success";
            let purpose = "";
            if (isPaymentToAdmin) {
              purpose = "admin advance";
            } else {
              purpose = "retailer advance";
            }

            let payment2 = await PaymentModel.create({
              parent_id: payment ? payment.id : null,
              user_id: data.user_id,
              payment_by: req.userId,
              amount: amount,
              table_type: data.table_type,
              payment_mode: data.payment_mode,
              remaining_balance: 0,
              notes: data.notes || null,
              cheque_no: data.cheque_no || null,
              txn_id: data.txn_id || null,
              weight: data.effective_weight || null,
              metal_rate: data.metal_rate || null,
              gross_weight: data.weight || null,
              status: paymentStatus,
              payment_date: moment(data.payment_date, "MM/DD/YYYY").format(
                "YYYY-MM-DD",
              ),
              payment_belongs: currentUserID,
              due_date: data.due_date
                ? moment(data.due_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD")
                : null,
              type: isPaymentToAdmin ? "debit" : "credit",
              purpose: purpose,
              can_accept: isPaymentToAdmin ? false : true,
              is_advance: true,
            });

            await updateWalletRemainingBalance(currentUserID, payment2.id);

            if (payment2.status == "success") {
              await updateAdvanceAmount(
                payment2.user_id,
                payment2.payment_belongs,
                payment2.amount,
                true,
              );
            }
          }
        } else {
          if (data.table_type == "purchase") {
            let tableData = await PurchaseModel.findAll({
              order: [["id", "ASC"]],
              where: { ...conditions, user_id: currentUserID },
            });
            let user = await UserModel.findByPk(data.user_id);
            let isPaymentToAdmin = false;
            if (user && isAdmin(user.role_id)) {
              isPaymentToAdmin = true;
            }

            for (let i = 0; i < tableData.length; i++) {
              let item = tableData[i];
              let status = "due",
                due_amount = 0,
                paid_amount = 0,
                payment_amount = 0;
              if (parseFloat(item.due_amount) <= amount) {
                due_amount = 0;
                paid_amount = parseFloat(item.total_payable);
                amount = amount - parseFloat(item.due_amount);
                status = "paid";
                payment_amount = parseFloat(item.due_amount);
              } else {
                due_amount = parseFloat(item.due_amount) - amount;
                paid_amount = priceFormat(item.paid_amount) + amount;
                payment_amount = amount;
                amount = 0;
              }

              if (!isPaymentToAdmin && !requiresPaymentApproval(data.payment_mode, data.payment_type)) {
                await PurchaseModel.update(
                  {
                    due_amount: due_amount,
                    paid_amount: paid_amount,
                    status: status,
                    due_date: data.due_date
                      ? moment(data.due_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD")
                      : null,
                  },
                  { where: { id: item.id }, transaction: t },
                );

                //read notification
                let noticationCon = { type_id: item.id, type: "purchase_due" };
                await NoticationModel.update(
                  {
                    is_read: true,
                  },
                  { where: noticationCon, transaction: t },
                );
              }

              let paymentStatus =
                isPaymentToAdmin || requiresPaymentApproval(data.payment_mode, data.payment_type)
                  ? "pending"
                  : "success";

              let payment = null;
              if (isPaymentToAdmin) {
                payment = await PaymentModel.create({
                  user_id: currentUserID,
                  payment_by: req.userId,
                  amount: payment_amount,
                  payment_mode: data.payment_mode,
                  remaining_balance: 0,
                  notes: data.notes || null,
                  cheque_no: data.cheque_no || null,
                  txn_id: data.txn_id || null,
                  weight: data.effective_weight || null,
                  metal_rate: data.metal_rate || null,
                  gross_weight: data.weight || null,
                  status: "pending",
                  payment_date: moment(data.payment_date, "MM/DD/YYYY").format(
                    "YYYY-MM-DD",
                  ),
                  table_type: "sale",
                  table_id: item.sale_id,
                  payment_belongs: receiverId,
                  due_date: data.due_date
                    ? moment(data.due_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD")
                    : null,
                  type: "credit",
                  purpose: "sale",
                  can_accept: true,
                });
              }

              let payment2 = await PaymentModel.create({
                parent_id: payment ? payment.id : null,
                user_id: data.user_id,
                payment_by: req.userId,
                amount: payment_amount,
                payment_mode: data.payment_mode,
                remaining_balance: 0,
                notes: data.notes || null,
                cheque_no: data.cheque_no || null,
                txn_id: data.txn_id || null,
                weight: data.effective_weight || null,
                metal_rate: data.metal_rate || null,
                gross_weight: data.weight || null,
                status: paymentStatus,
                payment_date: moment(data.payment_date, "MM/DD/YYYY").format(
                  "YYYY-MM-DD",
                ),
                table_type: data.table_type,
                table_id: item.id,
                payment_belongs: currentUserID,
                due_date: data.due_date
                  ? moment(data.due_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD")
                  : null,
                type: "debit",
                purpose: "purchase",
                can_accept: isPaymentToAdmin ? false : true,
              });

              await updateWalletRemainingBalance(currentUserID, payment2.id);

              if (amount == 0) {
                break;
              }
            }
          } else if (data.table_type == "sale") {
            let tableData = await SaleModel.findAll({
              order: [["id", "ASC"]],
              where: { ...conditions, sale_by: currentUserID },
            });

            for (let i = 0; i < tableData.length; i++) {
              let item = tableData[i];
              let status = "due",
                due_amount = 0,
                paid_amount = 0,
                payment_amount = 0;
              if (parseFloat(item.due_amount) <= amount) {
                due_amount = 0;
                paid_amount = parseFloat(item.total_payable);
                amount = amount - parseFloat(item.due_amount);
                status = "paid";
                payment_amount = parseFloat(item.due_amount);
              } else {
                due_amount = parseFloat(item.due_amount) - amount;
                paid_amount = priceFormat(item.paid_amount) + amount;
                payment_amount = amount;
                amount = 0;
              }

              if (
                !requiresPaymentApproval(data.payment_mode, data.payment_type)
              ) {
                await SaleModel.update(
                  {
                    due_amount: due_amount,
                    paid_amount: paid_amount,
                    status: status,
                    due_date: data.due_date
                      ? moment(data.due_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD")
                      : null,
                  },
                  { where: { id: item.id }, transaction: t },
                );

                //update to related purchase table
                await PurchaseModel.update(
                  {
                    due_amount: due_amount,
                    paid_amount: paid_amount,
                    status: status,
                    due_date: data.due_date
                      ? moment(data.due_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD")
                      : null,
                  },
                  { where: { sale_id: item.id }, transaction: t },
                );

                //read notification
                let noticationCon = { type_id: item.id };
                if (due_amount > 0) {
                  noticationCon.type = "sale_due";
                } else {
                  noticationCon = {
                    ...noticationCon,
                    [Op.or]: [
                      { type: "sale_due" },
                      { type: "sale_settlement" },
                    ],
                  };
                }
                await NoticationModel.update(
                  {
                    is_read: true,
                  },
                  { where: noticationCon, transaction: t },
                );
              }

              //payment insert into super admin wallet
              let payment = await PaymentModel.create({
                user_id: data.user_id,
                payment_by: req.userId,
                amount: payment_amount,
                payment_mode: data.payment_mode,
                remaining_balance: 0,
                notes: data.notes || null,
                cheque_no: data.cheque_no || null,
                txn_id: data.txn_id || null,
                weight: data.effective_weight || null,
                metal_rate: data.metal_rate || null,
                gross_weight: data.weight || null,
                status:
                  !requiresPaymentApproval(data.payment_mode, data.payment_type)
                    ? "success"
                    : "pending",
                payment_date: moment(data.payment_date, "MM/DD/YYYY").format(
                  "YYYY-MM-DD",
                ),
                table_type: data.table_type,
                table_id: item.id,
                payment_belongs: currentUserID,
                due_date: data.due_date
                  ? moment(data.due_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD")
                  : null,
                type: "credit",
                purpose: "sale",
                can_accept: true,
              });

              await updateWalletRemainingBalance(currentUserID, payment.id);

              //payment insert into admin wallet
              let purchase = await PurchaseModel.findOne({
                where: { sale_id: item.id },
              });
              let payment2 = await PaymentModel.create({
                parent_id: payment.id,
                user_id: currentUserID,
                payment_by: req.userId,
                amount: payment_amount,
                payment_mode: data.payment_mode,
                remaining_balance: 0,
                notes: data.notes || null,
                cheque_no: data.cheque_no || null,
                txn_id: data.txn_id || null,
                weight: data.effective_weight || null,
                metal_rate: data.metal_rate || null,
                gross_weight: data.weight || null,
                /*
                   * Bound to the parent row's status, not recomputed. When these two
                   * were decided separately a cash transfer settled this debit on the
                   * spot while the receiver's credit stayed pending - the money left
                   * one wallet and arrived in none.
                   */
                  status: payment.status,
                payment_date: moment(data.payment_date, "MM/DD/YYYY").format(
                  "YYYY-MM-DD",
                ),
                table_type: "purchase",
                table_id: purchase.id,
                payment_belongs: data.user_id,
                due_date: data.due_date
                  ? moment(data.due_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD")
                  : null,
                type: "debit",
                purpose: "sale",
                can_accept: false,
              });

              await updateWalletRemainingBalance(data.user_id, payment2.id);

              if (amount == 0) {
                break;
              }
            }
          }
        }
      } else if (isSalesExecutive(req)) {
        if (
          "payment_type" in data &&
          (data.payment_type == "advance" || data.payment_type == "send_money")
        ) {
          if (data.payment_type == "send_money") {
            //check have money in wallet
            //let walletBalance = await getWalletBalance(currentUserID, data.payment_mode);
            //if(walletBalance < amount){
            //return res.status(errorCodes.default).send(formatErrorResponse("Insufficient wallet balance."));
            //}

            //credit to distributor
            let payment = await PaymentModel.create({
              user_id: currentUserID,
              payment_by: req.userId,
              amount: amount,
              payment_mode: data.payment_mode,
              table_type: "send_money",
              remaining_balance: 0,
              notes: data.notes || null,
              cheque_no: data.cheque_no || null,
              txn_id: data.txn_id || null,
              weight: data.effective_weight || null,
              metal_rate: data.metal_rate || null,
              gross_weight: data.weight || null,
              status: "pending",
              payment_date: moment(data.payment_date, "MM/DD/YYYY").format(
                "YYYY-MM-DD",
              ),
              payment_belongs: data.user_id,
              due_date: null,
              type: "credit",
              purpose: "sent from sales executive",
              can_accept: true,
              is_advance: false,
            });
            await updateWalletRemainingBalance(data.user_id, payment.id);

            /* check data.user_id role */
            let user = await UserModel.findOne({
              where: { id: data.user_id },
              include: [
                {
                  model: RoleModel,
                  as: "role",
                },
              ],
            });
            compactLog(
              "=====USER ROLE=====",
              user && user.role ? user.role.name : null,
            );

            //debit from sales executive
            let payment2 = await PaymentModel.create({
              parent_id: payment.id,
              user_id: data.user_id,
              payment_by: req.userId,
              table_type: "send_money",
              amount: amount,
              payment_mode: data.payment_mode,
              remaining_balance: 0,
              notes: data.notes || null,
              cheque_no: data.cheque_no || null,
              txn_id: data.txn_id || null,
              weight: data.effective_weight || null,
              metal_rate: data.metal_rate || null,
              gross_weight: data.weight || null,
              /*
                 * Bound to the parent row's status, not recomputed. When these two
                 * were decided separately a cash transfer settled this debit on the
                 * spot while the receiver's credit stayed pending - the money left
                 * one wallet and arrived in none.
                 */
                status: payment.status,
              payment_date: moment(data.payment_date, "MM/DD/YYYY").format(
                "YYYY-MM-DD",
              ),
              payment_belongs: currentUserID,
              due_date: null,
              type: "debit",
              purpose: `sent to ${user.role.name}`,
              can_accept: false,
              is_advance: false,
            });
            await updateWalletRemainingBalance(currentUserID, payment2.id);

            //send notification
            sendNotification("send_money", req, { payment: payment });
          } else if (data.payment_type == "advance") {
            let payment = await PaymentModel.create({
              user_id: data.user_id,
              payment_by: req.userId,
              amount: amount,
              payment_mode: data.payment_mode,
              table_type: data.table_type,
              remaining_balance: 0,
              notes: data.notes || null,
              cheque_no: data.cheque_no || null,
              txn_id: data.txn_id || null,
              weight: data.effective_weight || null,
              metal_rate: data.metal_rate || null,
              gross_weight: data.weight || null,
              status:
                !requiresPaymentApproval(data.payment_mode, data.payment_type)
                  ? "success"
                  : "pending",
              payment_date: moment(data.payment_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD"),
              payment_belongs: currentUserID,
              due_date: null,
              type: "credit",
              purpose: "retailer advance",
              can_accept: true,
              is_advance: true,
            });
            await updateWalletRemainingBalance(currentUserID, payment.id);

            if (payment.status == "success") {
              await updateAdvanceAmount(
                payment.user_id,
                payment.payment_belongs,
                payment.amount,
                true,
              );
            }
          }
        } else {
          if (data.table_type == "sale") {
            let tableData = await SaleModel.findAll({
              order: [["id", "ASC"]],
              where: { ...conditions, sale_by: currentUserID },
            });
            for (let i = 0; i < tableData.length; i++) {
              let item = tableData[i];
              let status = "due",
                due_amount = 0,
                paid_amount = 0,
                payment_amount = 0;
              if (parseFloat(item.due_amount) <= amount) {
                due_amount = 0;
                paid_amount = parseFloat(item.total_payable);
                amount = amount - parseFloat(item.due_amount);
                status = "paid";
                payment_amount = parseFloat(item.due_amount);
              } else {
                due_amount = parseFloat(item.due_amount) - amount;
                paid_amount = priceFormat(item.paid_amount) + amount;
                payment_amount = amount;
                amount = 0;
              }

              if (
                !requiresPaymentApproval(data.payment_mode, data.payment_type)
              ) {
                await SaleModel.update(
                  {
                    due_amount: due_amount,
                    paid_amount: paid_amount,
                    status: status,
                    due_date: data.due_date
                      ? moment(data.due_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD")
                      : null,
                  },
                  { where: { id: item.id }, transaction: t },
                );

                //update to related purchase table
                await PurchaseModel.update(
                  {
                    due_amount: due_amount,
                    paid_amount: paid_amount,
                    status: status,
                    due_date: data.due_date
                      ? moment(data.due_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD")
                      : null,
                  },
                  { where: { sale_id: item.id }, transaction: t },
                );

                //read notification
                let noticationCon = { type_id: item.id };
                if (due_amount > 0) {
                  noticationCon.type = "sale_due";
                } else {
                  noticationCon = {
                    ...noticationCon,
                    [Op.or]: [
                      { type: "sale_due" },
                      { type: "sale_settlement" },
                    ],
                  };
                }
                await NoticationModel.update(
                  {
                    is_read: true,
                  },
                  { where: noticationCon, transaction: t },
                );
              }

              //payment insert into super admin wallet
              let payment = await PaymentModel.create({
                user_id: data.user_id,
                payment_by: req.userId,
                amount: payment_amount,
                payment_mode: data.payment_mode,
                remaining_balance: 0,
                notes: data.notes || null,
                cheque_no: data.cheque_no || null,
                txn_id: data.txn_id || null,
                weight: data.effective_weight || null,
                metal_rate: data.metal_rate || null,
                gross_weight: data.weight || null,
                status:
                  !requiresPaymentApproval(data.payment_mode, data.payment_type)
                    ? "success"
                    : "pending",
                payment_date: moment(data.payment_date, "MM/DD/YYYY").format(
                  "YYYY-MM-DD",
                ),
                table_type: data.table_type,
                table_id: item.id,
                payment_belongs: currentUserID,
                due_date: data.due_date
                  ? moment(data.due_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD")
                  : null,
                type: "credit",
                purpose: "sale",
                can_accept: true,
              });

              await updateWalletRemainingBalance(currentUserID, payment.id);

              //payment insert into admin wallet
              let purchase = await PurchaseModel.findOne({
                where: { sale_id: item.id },
              });
              let payment2 = await PaymentModel.create({
                parent_id: payment.id,
                user_id: currentUserID,
                payment_by: req.userId,
                amount: payment_amount,
                payment_mode: data.payment_mode,
                remaining_balance: 0,
                notes: data.notes || null,
                cheque_no: data.cheque_no || null,
                txn_id: data.txn_id || null,
                weight: data.effective_weight || null,
                metal_rate: data.metal_rate || null,
                gross_weight: data.weight || null,
                /*
                   * Bound to the parent row's status, not recomputed. When these two
                   * were decided separately a cash transfer settled this debit on the
                   * spot while the receiver's credit stayed pending - the money left
                   * one wallet and arrived in none.
                   */
                  status: payment.status,
                payment_date: moment(data.payment_date, "MM/DD/YYYY").format(
                  "YYYY-MM-DD",
                ),
                table_type: "purchase",
                table_id: purchase ? purchase.id : null,
                payment_belongs: data.user_id,
                due_date: data.due_date
                  ? moment(data.due_date, ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY"]).format("YYYY-MM-DD")
                  : null,
                type: "debit",
                purpose: "sale",
                can_accept: false,
              });

              await updateWalletRemainingBalance(data.user_id, payment2.id);

              if (amount == 0) {
                break;
              }
            }
          }
        }
      }
    });

    res.send(formatResponse("", "Payment successfully!"));
  } catch (error) {
    compactLog(error);
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse(error.toString()));
  }
};

/**
 * get total due
 *
 * @param {*} req
 * @param {*} res
 */
exports.totalDue = async (req, res) => {
  let dueAmount = await PurchaseModel.sum("due_amount", {
    where: { supplier_id: req.query.user_id },
  });
  res.send(
    formatResponse({
      due_amount: priceFormat(dueAmount),
      due_amount_display: displayAmount(dueAmount),
    }),
  );
};

/**
 * Today's gold rate, as the API prices invoices and metal payments with it.
 * Every screen reads the rate from here so none can quote a different one.
 */
exports.goldRate = async (req, res) => {
  const live = await getLiveGoldRate();
  if (!(live && live.rate > 0)) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Today's gold rate is not available right now."));
  }
  res.send(
    formatResponse({
      rate24: live.rate,
      rate22: live.rate22,
      rate18: live.rate18,
      display: live.display,
      at: live.at,
    }),
  );
};

/**
 * get wallet balance
 *
 * @param {*} req
 * @param {*} res
 */
exports.walletBalance = async (req, res) => {
  let superAdminId = await getWorkingUserID(req);
  let remaining_balance = await getWalletBalance(
    superAdminId,
    req.query.payment_mode,
  );
  res.send(
    formatResponse({
      balance: remaining_balance,
    }),
  );
};

/**
 * Recalculate payment remaining balances
 *
 * @param {*} req
 * @param {*} res
 */
exports.recalculateRemainingBalance = async (req, res) => {
  try {
    const summary = await recalculatePaymentRemainingBalance({
      userId: req.body.user_id ?? req.query.user_id,
      paymentBy: req.body.payment_by ?? req.query.payment_by,
      paymentId: req.body.payment_id ?? req.query.payment_id,
      dryRun: req.body.dry_run ?? req.query.dry_run,
    });

    res.send(
      formatResponse(
        summary,
        "Payment remaining balances recalculated successfully!",
      ),
    );
  } catch (error) {
    compactLog(error);
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse(error.toString()));
  }
};

/**
 * Update payment status
 *
 * @param {*} req
 * @param {*} res
 */
exports.updateStatus = async (req, res) => {
  let data = req.body;
  try {
    let payment = await PaymentModel.findOne({ where: { id: req.params.id } });
    if (!payment)
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse("Payment not found"));

    /*
     * Only the ledger owner may act on a request, and only once. Without the
     * owner check any super-admin-role login (other admins included) could
     * accept any row - even their own debit, moving metal to themselves.
     * The claim is one conditional UPDATE, so a double click (or two tabs)
     * cannot both pass and move the metal twice.
     */
    const currentUserID = isManager(req) ? req.userId : await getWorkingUserID(req);
    if (payment.payment_belongs != currentUserID) {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse("You can only accept or decline payments made to you."));
    }
    const [claimed] = await PaymentModel.update(
      { can_accept: false },
      { where: { id: payment.id, status: "pending", can_accept: true } },
    );
    if (!claimed) {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse("This payment has already been processed."));
    }
    let metalMoved = false;

    try {
    if (data.status == 1) {
      /*
       * An accepted metal payment moves the metal now - from the payer to the
       * receiver, with the debit/credit written to the stock history, and the
       * payer's stock allowed to go below zero (an admin paying in metal they
       * do not hold yet). Only on the pending -> accepted step, so it cannot
       * run twice, and before anything else is marked accepted, so a failed
       * transfer leaves the payment pending. Rows without the purity/material
       * (written before they were stored) keep the old behaviour.
       */
      if (
        payment.status === "pending" &&
        String(payment.payment_mode || "").toLowerCase() === "metal" &&
        payment.material_id &&
        payment.purity_id &&
        parseFloat(payment.gross_weight) > 0
      ) {
        const invoice =
          payment.table_type === "sale"
            ? await SaleModel.findOne({ attributes: ["invoice_number"], where: { id: payment.table_id } })
            : await PurchaseModel.findOne({ attributes: ["invoice_number"], where: { id: payment.table_id } });
        await transferMaterial(
          req,
          {
            from_user_id: payment.user_id,
            to_user_id: payment.payment_belongs,
            material_id: payment.material_id,
            purity_id: payment.purity_id,
            unit_id: payment.unit_id,
            quantity: 0,
            payment_mode: "metal",
            amount: payment.amount,
            metal_rate: payment.metal_rate,
            ref_no: invoice ? invoice.invoice_number : null,
            weight: payment.gross_weight,
            effective_weight: payment.weight || payment.gross_weight,
          },
          { allowNegative: true },
        );
        metalMoved = true;
      }

      // find sender-side mirrored row BEFORE inserting new accepted row
      // (both share parent_id = payment.id, so must look up before creating)
      const senderMirrorRow = await PaymentModel.findOne({
        where: { parent_id: payment.id, status: "pending" },
      });

      /*
       * Where the accepted row goes depends on whether the receiver's ledger
       * has moved on since the request landed.
       *
       * Nothing newer: the row is still the latest thing they have, so it just
       * becomes "Accepted" in place - one row, no duplicate.
       *
       * Something newer: the ledger reads newest-first, so an in-place update
       * would bury the acceptance mid-list. The original is superseded instead
       * and a fresh row carrying the accepted status goes to the top, with the
       * original folded away underneath it as history the UI can expand.
       *
       * "Newer" is judged across the receiver's whole ledger - any row of
       * theirs with a higher id, whoever sent it and whatever type it was.
       */
      const newerRowCount = await PaymentModel.count({
        where: {
          payment_belongs: payment.payment_belongs,
          id: { [Op.gt]: payment.id },
        },
      });
      const isLatestForReceiver = newerRowCount === 0;

      let acceptedPayment;
      if (isLatestForReceiver) {
        const updateObj = { status: "success", can_accept: false };
        if (data.ref_no) updateObj.ref_no = data.ref_no;
        await PaymentModel.update(updateObj, { where: { id: payment.id } });
        acceptedPayment = await PaymentModel.findOne({
          where: { id: payment.id },
        });
      } else {
        // Supersede the original: it keeps status=pending so it still reads as
        // a request, and can_accept=false so it can no longer be acted on.
        const updateObj = { can_accept: false };
        if (data.ref_no) updateObj.ref_no = data.ref_no;
        await PaymentModel.update(updateObj, { where: { id: payment.id } });

        /*
         * The accepted row shares its parent's `payment_belongs`, which is what
         * separates it from a mirrored counterparty row: a mirror lands in the
         * OTHER party's ledger, this one lands in the same ledger it supersedes.
         * The wallet query relies on exactly that to know which originals to
         * fold away - see WalletCollection / wallet.controller.
         */
        acceptedPayment = await PaymentModel.create({
          parent_id: payment.id,
          user_id: payment.user_id,
          payment_by: payment.payment_by,
          amount: payment.amount,
          payment_mode: payment.payment_mode,
          payment_type: payment.payment_type,
          remaining_balance: 0,
          notes: payment.notes || null,
          cheque_no: payment.cheque_no || null,
          txn_id: payment.txn_id || null,
          weight: payment.weight || null,
          gross_weight: payment.gross_weight || null,
          metal_rate: payment.metal_rate || null,
          material_id: payment.material_id || null,
          purity_id: payment.purity_id || null,
          unit_id: payment.unit_id || null,
          ref_no: data.ref_no || payment.ref_no || null,
          status: "success",
          payment_date: moment().format("YYYY-MM-DD"),
          table_type: payment.table_type,
          table_id: payment.table_id,
          payment_belongs: payment.payment_belongs,
          due_date: payment.due_date || null,
          type: payment.type,
          purpose: payment.purpose,
          can_accept: false,
          is_advance: payment.is_advance,
        });
      }
      await updateWalletRemainingBalance(
        acceptedPayment.payment_belongs,
        acceptedPayment.id,
      );

      // update sender-side mirrored row to success so sender panel shows 'Accepted'
      if (senderMirrorRow) {
        const senderUpdateObj = { status: "success", can_accept: false };
        if (data.ref_no) senderUpdateObj.ref_no = data.ref_no;
        await PaymentModel.update(senderUpdateObj, {
          where: { id: senderMirrorRow.id },
        });
        await updateWalletRemainingBalance(
          senderMirrorRow.payment_belongs,
          senderMirrorRow.id,
        );
      }

      // proceed with existing advance/non-advance settlement flow

      if (payment.is_advance) {
        const childPayment = await PaymentModel.findOne({
          where: { parent_id: req.params.id },
        });
        if (childPayment) {
          // do not alter sender side payment rows here
          await updateAdvanceAmount(
            payment.user_id,
            payment.payment_belongs,
            payment.amount,
            true,
          );
        } else {
          if (payment.table_type == "orders") {
            await OrderModel.increment("paid_amount", {
              by: parseFloat(payment.amount),
              where: { id: payment.table_id },
            });
          }
          await updateAdvanceAmount(
            payment.user_id,
            payment.payment_belongs,
            payment.amount,
            true,
          );
        }
      } else {
        let tableData = null;
        if (payment.table_type == "sale")
          tableData = await SaleModel.findOne({
            where: { id: payment.table_id },
          });
        else
          tableData = await PurchaseModel.findOne({
            where: { id: payment.table_id },
          });

        if (tableData) {
          let amount = parseFloat(payment.amount);
          let status = "due",
            due_amount = 0,
            paid_amount = 0;
          if (parseFloat(tableData.due_amount) <= amount) {
            due_amount = 0;
            paid_amount = parseFloat(tableData.total_payable);
            amount = amount - parseFloat(tableData.due_amount);
            status = "paid";
          } else {
            due_amount = parseFloat(tableData.due_amount) - amount;
            paid_amount = priceFormat(tableData.paid_amount) + amount;
            amount = 0;
          }

          if (payment.table_type == "sale") {
            const updateObj = { due_amount, paid_amount, status };
            if (payment.due_date)
              updateObj.due_date = moment(payment.due_date).format(
                "YYYY-MM-DD",
              );
            await SaleModel.update(updateObj, {
              where: { id: payment.table_id },
            });

            if (isSuperAdmin(req) || isAdmin(req)) {
              const childPayment = await PaymentModel.findOne({
                where: { parent_id: req.params.id },
              });
              if (childPayment) {
                // do not modify sender-side payment rows here; only update purchase records when appropriate
                /*
                 * `table_type` is "sale"/"purchase"/"send_money" - it was being
                 * passed where a request-level payment_type belongs, so this
                 * asked a question the helper could not answer. What actually
                 * matters is whether the mirrored row has settled.
                 */
                if (childPayment.status == "success") {
                  const updateObj2 = { due_amount, paid_amount, status };
                  if (payment.due_date)
                    updateObj2.due_date = moment(payment.due_date).format(
                      "YYYY-MM-DD",
                    );
                  await PurchaseModel.update(updateObj2, {
                    where: { sale_id: tableData.id },
                  });
                }
              }
            }

            const noticationCon =
              due_amount > 0
                ? { type_id: tableData.id, type: "sale_due" }
                : {
                    type_id: tableData.id,
                    [Op.or]: [
                      { type: "sale_due" },
                      { type: "sale_settlement" },
                    ],
                  };
            await NoticationModel.update(
              { is_read: true },
              { where: noticationCon },
            );
          } else {
            const updateObj3 = { due_amount, paid_amount, status };
            if (payment.due_date)
              updateObj3.due_date = moment(payment.due_date).format(
                "YYYY-MM-DD",
              );
            await PurchaseModel.update(updateObj3, {
              where: { id: payment.table_id },
            });
            await NoticationModel.update(
              { is_read: true },
              { where: { type_id: payment.table_id, type: "purchase_due" } },
            );
          }
        }
      }
    } else {
      // mark original request as processed and failed (disable accept)
      await PaymentModel.update(
        { status: "failed", reasons: data.reasons || null, can_accept: false },
        { where: { id: payment.id } },
      );
      await updateWalletRemainingBalance(payment.payment_belongs, payment.id);
      const childPayment = await PaymentModel.findOne({
        where: { parent_id: payment.id },
      });
      if (childPayment) {
        await PaymentModel.update(
          { status: "failed", ref_no: data.reasons || null, can_accept: false },
          { where: { id: childPayment.id } },
        );
        await updateWalletRemainingBalance(
          childPayment.payment_belongs,
          childPayment.id,
        );
      }
    }
    } catch (err) {
      /* reopen the request so it can be retried - unless the metal already
         moved, where a retry would move it again (needs a manual look) */
      if (!metalMoved) {
        await PaymentModel.update({ can_accept: true }, { where: { id: payment.id, status: "pending" } });
      }
      throw err;
    }

    res.send(formatResponse("", "Updated successfully!"));
  } catch (error) {
    compactLog(error);
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse(error.toString()));
  }
};
