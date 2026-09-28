const {
  mapConcurrent,
  isObject,
  formatDateTime,
  isEmpty,
  displayAmount,
  paymentModeDisplay,
} = require("@helpers/helper");
const { getPaymentRowHistory } = require("@library/common");
const db = require("@models");
const PaymentModel = db.payments;

const PaymentCollection = async (data) => {
  if (isObject(data)) {
    return await getModelObject(data);
  } else {
    return await mapConcurrent(data, (item) => getModelObject(item));

  }
};

/**
 * @param {boolean} isHistoryRow true when this row is being serialised as one
 *   of the superseded entries folded under an accepted row. Such a row is a
 *   record of what happened, not a live line: it carries no money figure (the
 *   accepted row above it holds that) and no further history of its own.
 */
const getModelObject = async (data, isHistoryRow = false) => {
  let payment_mode = paymentModeDisplay(data.payment_mode);
  if (data.payment_mode == "cheque" && !isEmpty(data.cheque_no)) {
    payment_mode += " ( " + data.cheque_no + " )";
  } else if (data.payment_mode == "imps_neft" && !isEmpty(data.txn_id)) {
    payment_mode += " ( " + data.txn_id + " )";
  }

  let action_status = "",
    display_mode = '<p style="margin: 0;">' + payment_mode + "</p>";

  // If this pending request already has a successful child row, it has been accepted.
  // Keep old request row as "Processed" and hide any action on it.
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
    if (acceptedChild) {
      hasAcceptedChild = true;
    }
  }

  // If this row is a child row and another child with the same parent is already
  // accepted, this pending row is stale and should be shown as Processed.
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

  // Detect if this is the original pending "receiver-side" row viewed by the SENDER.
  // The sender created both records (same payment_by). The receiver-side row has
  // can_accept=true and no parent_id. The sender's mirror debit row has can_accept=false
  // and parent_id pointing here. When the SENDER views this receiver-side row through
  // their own list (filtered by payment_by), it should is still Pending - the sender simply has nothing to act on.
  let isSenderViewingReceiverRow = false;
  if (data.status == "pending" && data.can_accept && !data.parent_id) {
    const senderMirror = await PaymentModel.findOne({
      where: { parent_id: data.id, can_accept: false },
    });
    if (senderMirror) {
      isSenderViewingReceiverRow = true;
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
    if (hasAcceptedChild) {
      action_status = "Processed";
    } else if (
      hasAcceptedSibling &&
      data.table_type == "send_money" &&
      data.parent_id &&
      data.type == "debit"
    ) {
      // sender-side mirrored send_money row becomes Accepted once accepted
      action_status = "Accepted";
    } else if (hasAcceptedSibling) {
      action_status = "Processed";
    } else if (isSenderViewingReceiverRow) {
      // Sender is viewing the receiver-side row — payment is in-flight, waiting for receiver
      action_status = "Pending";
    } else if (data.can_accept || data.parent_id) {
      action_status = "Pending";
    } else {
      action_status = "Processed";
    }
  } else {
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
      if (
        data.status == "success" &&
        data.table_type == "send_money" &&
        data.parent_id &&
        data.type == "debit"
      ) {
        action_status = "Accepted";
      }
      if (data.status != "success" && !isEmpty(data.reasons)) {
        display_mode +=
          '<p style="margin: 0;font-size: 12px;">' + data.reasons + "</p>";
      }
    }
  }

  if (data.parent_id) {
    let parentPay = await PaymentModel.findByPk(data.parent_id);
    if (data.status == "pending") {
      // if same parent already has an accepted child, keep this stale pending row as Processed
      if (
        hasAcceptedSibling &&
        data.table_type == "send_money" &&
        data.type == "debit"
      ) {
        action_status = "Accepted";
      } else if (hasAcceptedSibling) {
        action_status = "Processed";
      }
      // if parent was acted on (can_accept=false), the sender mirror row should show 'Processed'
      else if (parentPay && parentPay.can_accept === false) {
        action_status = "Processed";
      } else if (data.can_accept) {
        action_status = "Pending";
      } else {
        // sender's debit mirror row: payment submitted, waiting for receiver to confirm
        action_status = "Pending";
      }
    }
  }
  let purpose = [data.purpose];
  if (!isEmpty(data.notes)) {
    purpose.push(data.notes);
  }

  /*
   * Accepted and Declined are the only final states. Until a payment reaches
   * one of them the Amount column stays empty and the figure rides beside the
   * payment mode instead, so a row can never read as settled before it is.
   *
   * This tests the label rather than `data.status`, deliberately: a "Processed"
   * row is still `status = 'pending'` underneath, so keying off the raw status
   * would let it print its amount as though it had settled.
   */
  const isFinalStatus =
    action_status === "Accepted" || action_status === "Declined";

  const amount_display = isFinalStatus ? displayAmount(data.amount) : "";

  /*
   * The invoice payment tables bind their Payment Mode column to
   * `payment_mode_display`, which this collection stopped sending - so that
   * column rendered blank on every sale and purchase view. It is the bare mode
   * (the cheque no / txn id have their own columns on those screens and must
   * not be repeated) plus, while the payment is unsettled, the amount as a chip.
   */
  let payment_mode_display = paymentModeDisplay(data.payment_mode);
  if (!isFinalStatus) {
    payment_mode_display +=
      '<span style="display:inline-block;margin-left:6px;padding:1px 8px;' +
      "border-radius:10px;background:#ffd54f;color:#3d2f00;font-size:12px;" +
      'font-weight:600;white-space:nowrap;">' +
      displayAmount(data.amount) +
      "</span>";
  }

  // If this is a pending payment that can be accepted by the current user,
  // represent credit as 0 and show amount as 'To be processed'.
  // Do NOT show this for the sender's view of the receiver-side row.
  let credit_amount = displayAmount(data.amount);
  if (
    data.status == "pending" &&
    data.can_accept &&
    !isSenderViewingReceiverRow &&
    !hasAcceptedChild
  ) {
    credit_amount = 0;
    /*
     * A chip, not coloured text: #ff9800 on the white row is about 2.2:1, and
     * no shade of yellow-orange text clears 4.5:1 while still reading as
     * yellow. Dark text on the same colour as a background is 8.6:1 and
     * unmistakably yellow, which is what makes it stand out at a glance.
     */
    display_mode +=
      '<p style="margin:0;font-size:12px;">' +
      '<span style="display:inline-block;padding:1px 8px;border-radius:10px;' +
      "background:#ffd54f;color:#3d2f00;font-size:12px;font-weight:600;" +
      'white-space:nowrap;">To be processed: ' +
      displayAmount(data.amount) +
      "</span></p>";
  }

  /*
   * Rows this one superseded when it was accepted, oldest first. Present only
   * when the acceptance had to be written as a new row because the ledger had
   * already moved on; a payment accepted in place supersedes nothing and
   * carries an empty history, so the UI shows no expander for it.
   */
  let history = [];
  if (!isHistoryRow) {
    const historyRows = await getPaymentRowHistory(data);
    history = await mapConcurrent(historyRows, (row) =>
      getModelObject(row, true),
    );
  }

  return {
    history: history,
    has_history: history.length > 0,
    id: data.id,
    amount: isHistoryRow ? "" : amount_display,
    // The raw figure, for callers that need it regardless of settlement state.
    amount_value: displayAmount(data.amount),
    payment_mode: paymentModeDisplay(data.payment_mode),
    payment_mode_display: payment_mode_display,
    notes: data.notes || "",
    cheque_no: data.cheque_no || "",
    txn_id: data.txn_id || "",
    weight: data.weight ? data.weight + " GM" : "",
    // Gross weight the quoted rate applies to (fine weight lives in `weight`).
    gross_weight: data.gross_weight ? data.gross_weight + " GM" : "",
    // The rate actually quoted at payment time. Deriving it from amount/weight
    // gives the 24K rate, not the purity rate the operator saw, so prefer the
    // stored value and only derive for rows written before it was captured.
    metal_rate:
      data.payment_mode != "metal"
        ? ""
        : !isEmpty(data.metal_rate)
          ? displayAmount(data.metal_rate)
          : parseFloat(data.weight)
            ? displayAmount(parseFloat(data.amount) / parseFloat(data.weight))
            : "",
    payment_date: formatDateTime(data.payment_date, 8),
    payment_to: data.user ? data.user.name : "",
    purpose: purpose,
    action_value: action_status,
    display_mode: display_mode,
    credit: isHistoryRow ? 0 : credit_amount,
    can_accept:
      !isHistoryRow &&
      data.status == "pending" &&
      data.can_accept &&
      !isSenderViewingReceiverRow &&
      !hasAcceptedChild
        ? true
        : false,
  };
};

module.exports = {
  PaymentCollection,
};
