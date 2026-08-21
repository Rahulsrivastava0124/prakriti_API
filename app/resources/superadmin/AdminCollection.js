const {
  isObject,
  getFileAbsulatePath,
  isEmpty,
  isArray,
  displayAmount,
  priceFormat,
} = require("@helpers/helper");
const {
  getAdvanceAmount,
  getSuperAdminId,
  getTotalStockByUser,
  getTotalStockPriceByUser,
  getWalletBalance,
} = require("@library/common");
const db = require("@models");
const { Op } = require("sequelize");
const SaleModel = db.sales;

const AdminCollection = async (data, saleByUserId = null) => {
  if (isObject(data)) {
    return await getModelObject(data, saleByUserId);
  } else {
    let arr = [];
    for (let i = 0; i < data.length; i++) {
      arr.push(await getModelObject(data[i], saleByUserId));
    }
    return arr;
  }
};

const getModelObject = async (data, saleByUserId = null) => {
  let documents = [];
  if (isArray(data.documents)) {
    for (let i = 0; i < data.documents.length; i++) {
      documents.push({
        file_name: data.documents[i].file_name,
        path: getFileAbsulatePath(data.documents[i].path),
      });
    }
  }

  let superAdminId = await getSuperAdminId();
  let sellerUserId = saleByUserId || superAdminId;
  let saleWhere = {
    user_id: data.id,
    sale_by: sellerUserId,
    is_approved: { [Op.ne]: 2 },
    is_assigned: false,
    is_approval: false,
  };

  let total_sale = await SaleModel.sum("bill_amount", { where: saleWhere });
  let total_payable_amount = await SaleModel.sum("total_payable", {
    where: saleWhere,
  });
  let total_sale_due = await SaleModel.sum("due_amount", { where: saleWhere });
  let total_sale_paid = await SaleModel.sum("paid_amount", {
    where: saleWhere,
  });
  let total_return = await SaleModel.sum("return_amount", { where: saleWhere });

  let totalStock = await getTotalStockByUser(data.id);
  let totalStockPrice = await getTotalStockPriceByUser(null, data.id);
  let walletBalance = await getWalletBalance(data.id);

  let advance_amount = await getAdvanceAmount(data.id, sellerUserId);

  return {
    id: data.id,
    name: data.name,
    user_name: data.user_name || "",
    email: data.email || "",
    mobile: data.mobile,
    adhar: data.adhar || "",
    pan: data.pan || "",
    address: data.address || "",
    city: data.city || "",
    landmark: data.landmark || "",
    pincode: data.pincode || "",
    district_id: data.district_id || "",
    state_id: data.state_id || "",
    country_id: data.country_id || "",
    p_address: data.p_address || "",
    p_city: data.p_city || "",
    p_pincode: data.p_pincode || "",
    p_district_id: data.p_district_id || "",
    p_state_id: data.p_state_id || "",
    p_country_id: data.p_country_id || "",
    company_name: data.company_name || "",
    gst: data.gst || "",
    bank_name: data.bank_name || "",
    bank_account_no: data.bank_account_no || "",
    bank_ifsc: data.bank_ifsc || "",
    profile_image: !isEmpty(data.profile_image)
      ? getFileAbsulatePath(data.profile_image)
      : "",
    pan_image: !isEmpty(data.pan_image)
      ? getFileAbsulatePath(data.pan_image)
      : "",
    adhar_image: !isEmpty(data.adhar_image)
      ? getFileAbsulatePath(data.adhar_image)
      : "",
    company_logo: !isEmpty(data.company_logo)
      ? getFileAbsulatePath(data.company_logo)
      : "",
    status: data.status ? 1 : 0,
    own: data.own ? 1 : 0,
    district_name: data.district ? data.district.name : "",
    state_name: data.state ? data.state.name : "",
    country_name: data.country ? data.country.name : "",
    status_display: data.status ? "Active" : "Inactive",
    role_name: "role" in data && data.role ? data.role.name : "",
    documents: documents,
    advance_amount: priceFormat(advance_amount),
    advance_amount_display: displayAmount(advance_amount),
    total_return: priceFormat(total_return),
    due_amount: priceFormat(total_sale_due),
    paid_amount: priceFormat(total_sale_paid),
    total_amount: priceFormat(total_sale),
    total_payable_amount: priceFormat(total_payable_amount),
    due_amount_display: displayAmount(total_sale_due),
    paid_amount_display: displayAmount(total_sale_paid),
    total_amount_display: displayAmount(total_sale),
    total_payable_amount_display: displayAmount(total_payable_amount),
    total_return_display: displayAmount(total_return),
    total_stock: totalStock,
    total_stock_price: totalStockPrice,
    wallet_balance: walletBalance,
  };
};

module.exports = {
  AdminCollection,
};
