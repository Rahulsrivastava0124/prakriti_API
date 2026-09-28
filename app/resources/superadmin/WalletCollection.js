const {
  mapConcurrent,
  isObject,
  formatDateTime,
  isEmpty,
  displayAmount,
  paymentModeDisplay,
} = require("@helpers/helper");
const { getWalletBalance, getPaymentRowHistory } = require("@library/common");
const db = require("@models");
const PaymentModel = db.payments;

const WalletCollection = async (data, p_mode = null) => {
  if (isObject(data)) {
    return await getModelObject(data, null, p_mode);
  } else {
    return await mapConcurrent(data, (item, i) => getModelObject(item, i, p_mode));

  }
};

/**
 * @param {boolean} withHistory serialise the superseded rows folded under this
 *   one. False for the history entries themselves, so the walk terminates.
 */
const getModelObject = async (
  data,
  index = null,
  p_mode = null,
  withHistory = true,
) => {
  /*
   * A history row is a record of what happened, not a live ledger line. The
   * accepted row above it already carries the money, so repeating the figure
   * here would read as though the amount had landed twice.
   */
  const isHistoryRow = !withHistory;
  let debit_amount = 0;
  let credit_amount = 0;
  if (data.type == "debit") {
    debit_amount = displayAmount(data.amount);
  } else {
    credit_amount = displayAmount(data.amount);
  }

  let companny_name = "",
    user_name = "",
    user_city = "";
  let display_user_details = [];
  if (data.user) {
    companny_name = data.user.company_name || "";
    user_name = data.user.name || "";
    user_city = data.user.city || "";
    display_user_details.push("Company Name: " + companny_name);
    display_user_details.push("Name: " + user_name);
    display_user_details.push("City: " + user_city);
  }

  let payment_mode = paymentModeDisplay(data.payment_mode);
  if (data.payment_mode == "cheque" && !isEmpty(data.cheque_no)) {
    payment_mode += " ( " + data.cheque_no + " )";
  } else if (data.payment_mode == "imps_neft" && !isEmpty(data.txn_id)) {
    payment_mode += " ( " + data.txn_id + " )";
  }

  let action_status = "",
    display_mode = '<p style="margin: 0;">' + payment_mode + "</p>";

  // sender-side send_money rows should map to Sent/Accepted instead of generic Processed
  const isSenderSendMoney =
    data.table_type == "send_money" && data.type == "debit";

  // accepted child exists for this original request row
  let hasAcceptedChild = false;
  if (!data.parent_id && data.status == "pending") {
    /*
     * Scoped to the same ledger. A transfer writes the counterparty's mirror as
     * a child of this row, and that mirror lands in the OTHER party's ledger -
     * so an unscoped lookup read the sender's own debit as proof the receiver
     * had accepted. That is what made a still-pending row show "Processed" and
     * lose its Accept / Decline buttons.
     */
    const acceptedChild = await PaymentModel.findOne({
      where: {
        parent_id: data.id,
        status: "success",
        payment_belongs: data.payment_belongs,
      },
    });
    if (acceptedChild) hasAcceptedChild = true;
  }

  // accepted sibling exists for this child row group
  let hasAcceptedSibling = false;
  if (data.parent_id && data.status == "pending") {
    // Same-ledger rule as above.
    const acceptedSibling = await PaymentModel.findOne({
      where: {
        parent_id: data.parent_id,
        status: "success",
        payment_belongs: data.payment_belongs,
      },
    });
    if (acceptedSibling && acceptedSibling.id != data.id) {
      hasAcceptedSibling = true;
    }
  }

  // Show 'Processed' only for original pending rows that have been acted on (can_accept=false and no parent)
  if (
    data.can_accept === false &&
    !data.parent_id &&
    (data.status == "pending" || data.status == "failed")
  ) {
    /*
     * A declined request is finished and refused, not merely "acted on". This
     * branch labelled both alike, so a decline rendered as "Processed" - green,
     * settled - with the amount still in the money column. Only a row that is
     * still pending and has been superseded is Processed.
     */
    action_status = data.status == "failed" ? "Declined" : "Processed";
    if (data.payment_mode == "cheque") {
      if (!isEmpty(data.ref_no)) {
        display_mode +=
          '<p style="margin: 0;font-size: 12px;">' + data.ref_no + "</p>";
      } else if (!isEmpty(data.reasons)) {
        display_mode +=
          '<p style="margin: 0;font-size: 12px;">' + data.reasons + "</p>";
      }
    } else {
      if (!isEmpty(data.reasons)) {
        display_mode +=
          '<p style="margin: 0;font-size: 12px;">' + data.reasons + "</p>";
      }
    }
  } else if (data.status == "pending") {
    if (isSenderSendMoney && (hasAcceptedChild || hasAcceptedSibling)) {
      action_status = "Accepted";
    } else if (hasAcceptedChild || hasAcceptedSibling) {
      action_status = "Processed";
    } else if (isSenderSendMoney && !data.can_accept) {
      action_status = "Sent";
    } else {
      action_status = data.can_accept ? "Pending" : "Processed";
    }
  } else {
    // not pending: show Accepted/Declined as before
    if (data.payment_mode == "cheque") {
      action_status = data.status == "success" ? "Accepted" : "Declined";
      if (data.status == "success" && !isEmpty(data.ref_no)) {
        display_mode +=
          '<p style="margin: 0;font-size: 12px;">' + data.ref_no + "</p>";
      } else if (data.status != "success" && !isEmpty(data.reasons)) {
        display_mode +=
          '<p style="margin: 0;font-size: 12px;">' + data.reasons + "</p>";
      }
    } else {
      action_status = data.status == "failed" ? "Declined" : "Accepted";
      if (isSenderSendMoney && data.status == "success") {
        action_status = "Accepted";
      }
      if (data.status != "success" && !isEmpty(data.reasons)) {
        display_mode +=
          '<p style="margin: 0;font-size: 12px;">' + data.reasons + "</p>";
      }
    }
  }
  let purpose = [data.purpose];
  if (!isEmpty(data.notes)) {
    purpose.push(data.notes);
  }

  /* show wallet actual wallet balance if payment mode is 'advance' */
  let remaining_balance = 0;
  if (index == 0 && p_mode == "advance") {
    remaining_balance = await getWalletBalance(data.payment_belongs, "Advance");
  } else remaining_balance = data.remaining_balance || 0;
  /*
   * Show "To be processed" only for actionable pending rows.
   *
   * A chip, not coloured text: #ff9800 on the white row is about 2.2:1, and no
   * shade of yellow-orange text clears 4.5:1 while still reading as yellow.
   * Dark text on the same colour as a background is 8.6:1 and unmistakably
   * yellow, which is what makes it stand out at a glance.
   */
  if (data.status == "pending" && data.can_accept) {
    credit_amount = 0;
    display_mode +=
      '<p style="margin:0;font-size:12px;">' +
      '<span style="display:inline-block;padding:1px 8px;border-radius:10px;' +
      "background:#ffd54f;color:#3d2f00;font-size:12px;font-weight:600;" +
      'white-space:nowrap;">To be processed: ' +
      displayAmount(data.amount) +
      "</span></p>";
  }

  // Ensure action buttons are only enabled for truly pending rows that can be accepted.
  const ui_can_accept =
    data.status == "pending" && data.can_accept ? true : false;

  /*
   * Rows this one superseded when it was accepted, oldest first. Present only
   * when the acceptance had to be written as a new row because the ledger had
   * already moved on; a row accepted in place supersedes nothing and carries an
   * empty history, so the UI shows no expander for it.
   */
  let history = [];
  if (withHistory) {
    const historyRows = await getPaymentRowHistory(data);
    history = await mapConcurrent(historyRows, (row) =>
      getModelObject(row, null, p_mode, false),
    );
  }

  if (isHistoryRow) {
    debit_amount = 0;
    credit_amount = 0;
  }

  return {
    history: history,
    has_history: history.length > 0,
    id: data.id,
    amount: displayAmount(data.amount),
    payment_mode: payment_mode,
    notes: data.notes || "",
    cheque_no: data.cheque_no || "",
    debit: debit_amount,
    credit: credit_amount,
    txn_id: data.txn_id || "",
    remaining_balance: displayAmount(remaining_balance),
    payment_date: formatDateTime(data.payment_date, 8),
    payment_to: data.user ? data.user.name : "",
    status: data.status,
    purpose: purpose,
    type: data.type,
    display_user_details: display_user_details,
    action_value: action_status,
    display_mode: display_mode,
    can_accept: ui_can_accept,
  };
};

module.exports = {
  WalletCollection,
};
