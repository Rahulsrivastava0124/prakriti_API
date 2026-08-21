const {
  isObject,
  formatDateTime,
  ucWords,
  displayAmount,
  priceFormat,
  isEmpty,
} = require("@helpers/helper");
const db = require("@models");
const SaleProductModel = db.sale_products;

const SaleListCollection = async (data, userId) => {
  if (isObject(data)) {
    return await getModelObject(data);
  } else {
    let arr = [];
    for (let i = 0; i < data.length; i++) {
      arr.push(await getModelObject(data[i], userId));
    }


    return await arr;
  }
};

const getModelObject = async (data, userId) => {
//   console.log(" in the getModelObject data", data);

  let approve_status = "Pending";
  if (data.is_approved == 1) {
    approve_status = "Accepted";
  } else if (data.is_approved == 2) {
    approve_status = "Declined";
  } else if (data.is_approved == 3) {
    approve_status = "On Approval";
  } else if (data.is_approved == 4) {
    approve_status = "Transfer To Sale";
  }
  if (data.status == "returned") {
    approve_status = "Returned";
  } else if (data.status == "return_pending") {
    approve_status = "Return Pending";
  }

  let total_tax = priceFormat(
    priceFormat(data.cgst_tax) +
      priceFormat(data.sgst_tax) +
      priceFormat(data.igst_tax)
  );
  let no_of_products = await SaleProductModel.count({
    where: { sale_id: data.id },
  });

  let is_own_sale = true;
  if (userId && userId != data.sale_by) {
    is_own_sale = false;
  }

  let sale_by_name = "";
  if (data.saleBy) {
    sale_by_name = !isEmpty(data.saleBy.company_name)
      ? data.saleBy.company_name
      : data.saleBy.name;
  }
  let user_company_name = data.user ? data.user.company_name : "";
  if (isEmpty(user_company_name)) {
    user_company_name = data.user ? data.user.name : "";
  }

  return {
    id: data.id,
    user_id: data.id,
    user_name: data.user ? data.user.name : "",
    user_mobile: data.user ? data.user.mobile : "",
    user_company_name: user_company_name,
    invoice_number: data.invoice_number,
    invoice_date: formatDateTime(data.invoice_date, 8),
    settlement_date: formatDateTime(data.settlement_date, 8),
    cgst_tax: priceFormat(data.cgst_tax),
    sgst_tax: priceFormat(data.sgst_tax),
    igst_tax: priceFormat(data.igst_tax),
    total_tax: priceFormat(total_tax),
    cgst_tax_display: displayAmount(data.cgst_tax),
    sgst_tax_display: displayAmount(data.sgst_tax),
    igst_tax_display: displayAmount(data.igst_tax),
    total_tax_display: displayAmount(total_tax),
    discount: displayAmount(data.discount),
    total_amount: displayAmount(data.total_amount),
    payment_mode: data.payment_mode,
    transaction_no: data.transaction_no,
    notes: data.notes,
    taxable_amount: displayAmount(data.taxable_amount),
    bill_amount: displayAmount(data.bill_amount),
    total_payable: displayAmount(data.total_payable),
    return_amount: displayAmount(data.return_amount),
    due_amount: priceFormat(data.due_amount),
    due_amount_display: displayAmount(data.due_amount),
    due_date: data.status != "paid" ? formatDateTime(data.due_date, 8) : "",
    status: data.status,
    paid_amount: displayAmount(data.paid_amount),
    total_tag_price: displayAmount(data.total_tag_price),
    product_discount: displayAmount(data.product_discount),
    status_display: ucWords(data.status),
    approve_status: approve_status,
    is_approved: data.is_approved,
    is_assigned: data.is_assigned,
    accept_declined_at: data.accept_declined_at
      ? formatDateTime(data.accept_declined_at, 7)
      : "",
    no_of_products: no_of_products,
    is_own_sale: is_own_sale,
    sale_by_name: sale_by_name,
  };
};

module.exports = {
  SaleListCollection,
    getModelObject,
};
