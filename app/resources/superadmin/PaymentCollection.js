const {
  mapConcurrent,
  isObject,
  formatDateTime,
  isEmpty,
  displayAmount,
  paymentModeDisplay,
} = require("@helpers/helper");
const db = require("@models");
const PaymentModel = db.payments;

const PaymentCollection = async (data) => {
  if (isObject(data)) {
    return await getModelObject(data);
  } else {
    return await mapConcurrent(data, (item, i) => getModelObject(item));

  }
};

const getModelObject = async (data) => {
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
    const acceptedChild = await PaymentModel.findOne({
      where: { parent_id: data.id, status: "success" },
    });
    if (acceptedChild) {
      hasAcceptedChild = true;
    }
  }

  // If this row is a child row and another child with the same parent is already
  // accepted, this pending row is stale and should be shown as Processed.
  let hasAcceptedSibling = false;
  if (data.parent_id && data.status == "pending") {
    const acceptedSibling = await PaymentModel.findOne({
      where: { parent_id: data.parent_id, status: "success" },
    });
    if (acceptedSibling && acceptedSibling.id != data.id) {
      hasAcceptedSibling = true;
    }
  }

  // Detect if this is the original pending "receiver-side" row viewed by the SENDER.
  // The sender created both records (same payment_by). The receiver-side row has
  // can_accept=true and no parent_id. The sender's mirror debit row has can_accept=false
  // and parent_id pointing here. When the SENDER views this receiver-side row through
  // their own list (filtered by payment_by), it should show "Awaiting Approval"
  // rather than "Pending" - the sender has nothing to act on.
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
    action_status = "Processed";
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
      action_status = "Awaiting Approval";
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
        action_status = "Awaiting Approval";
      }
    }
  }
  let purpose = [data.purpose];
  if (!isEmpty(data.notes)) {
    purpose.push(data.notes);
  }

  /*
   * A pending payment has not moved any money yet, so it must not be printed in
   * the Amount column as though it had. The figure moves under the payment mode
   * instead, on its own line, and the Amount column is left blank until the
   * payment is accepted - at which point the amount appears in the column and
   * nothing trails the mode.
   *
   * `credit` follows the same rule on the wallet screen, where it is the column
   * the money would land in.
   */
  const isAwaitingSettlement = data.status == "pending" && !hasAcceptedChild;

  let amount_display = isAwaitingSettlement ? "" : displayAmount(data.amount);

  if (isAwaitingSettlement) {
    display_mode +=
      '<p style="margin:0;font-size:12px;color:#e6a700;">' +
      displayAmount(data.amount) +
      "</p>";
  }

  let credit_amount = displayAmount(data.amount);
  if (
    data.status == "pending" &&
    data.can_accept &&
    !isSenderViewingReceiverRow &&
    !hasAcceptedChild
  ) {
    credit_amount = 0;
  }

  return {
    id: data.id,
    amount: amount_display,
    // The raw figure, for callers that need it regardless of settlement state.
    amount_value: displayAmount(data.amount),
    payment_mode: paymentModeDisplay(data.payment_mode),
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
    credit: credit_amount,
    can_accept:
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
