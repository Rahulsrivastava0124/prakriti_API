const {
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
    let arr = [];
    for (let i = 0; i < data.length; i++) {
      arr.push(await getModelObject(data[i]));
    }
    return arr;
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
  // Keep old request row as "processed" and hide any action on it.
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
  // accepted, this pending row is stale and should be shown as processed.
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
  // their own list (filtered by payment_by), it should show "process" not "Pending".
  let isSenderViewingReceiverRow = false;
  if (data.status == "pending" && data.can_accept && !data.parent_id) {
    const senderMirror = await PaymentModel.findOne({
      where: { parent_id: data.id, can_accept: false },
    });
    if (senderMirror) {
      isSenderViewingReceiverRow = true;
    }
  }

  // Show 'processed' only for original pending rows that have been acted on (can_accept=false and no parent)
  if (
    data.can_accept === false &&
    !data.parent_id &&
    (data.status == "pending" || data.status == "failed")
  ) {
    action_status = "processed";
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
      action_status = "processed";
    } else if (
      hasAcceptedSibling &&
      data.table_type == "send_money" &&
      data.parent_id &&
      data.type == "debit"
    ) {
      // sender-side mirrored send_money row becomes Accepted once accepted
      action_status = "Accepted";
    } else if (hasAcceptedSibling) {
      action_status = "processed";
    } else if (isSenderViewingReceiverRow) {
      // Sender is viewing the receiver-side row — payment is in-flight, waiting for receiver
      action_status = "process";
    } else if (data.can_accept || data.parent_id) {
      action_status = "Pending";
    } else {
      action_status = "processed";
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
      // if same parent already has an accepted child, keep this stale pending row as processed
      if (
        hasAcceptedSibling &&
        data.table_type == "send_money" &&
        data.type == "debit"
      ) {
        action_status = "Accepted";
      } else if (hasAcceptedSibling) {
        action_status = "processed";
      }
      // if parent was acted on (can_accept=false), the sender mirror row should show 'processed'
      else if (parentPay && parentPay.can_accept === false) {
        action_status = "processed";
      } else if (data.can_accept) {
        action_status = "Pending";
      } else {
        // sender's debit mirror row: payment submitted, waiting for receiver to confirm
        action_status = "process";
      }
    }
  }
  let purpose = [data.purpose];
  if (!isEmpty(data.notes)) {
    purpose.push(data.notes);
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
    display_mode +=
      '<p style="margin:0;font-size:12px;color:#ff9800;">To be processed: ' +
      displayAmount(data.amount) +
      "</p>";
  }

  return {
    id: data.id,
    amount: displayAmount(data.amount),
    payment_mode: paymentModeDisplay(data.payment_mode),
    notes: data.notes || "",
    cheque_no: data.cheque_no || "",
    txn_id: data.txn_id || "",
    weight: data.weight + " GM" || "",
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
