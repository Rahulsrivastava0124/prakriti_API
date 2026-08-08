const {
  mapConcurrent, isObject, formatDateTime, isEmpty, displayAmount, ucWords } = require("@helpers/helper");
const db = require("@models");
const { Op } = require("sequelize");
const PaymentModel = db.payments;
const {PaymentCollection} = require("@resources/superadmin/PaymentCollection");
const PurchaseProductModel = db.purchase_products;

const PurchaseListCollection = async(data, loadPayments) => {
    if(isObject(data)){
        return await getModelObject(data);
    }else{
        /**
         * One grouped count for the whole page instead of a COUNT(*) per row.
         * Same numbers - the per-row query had no condition beyond purchase_id,
         * and the model's own paranoid scope applies to both - but a 50-row
         * page stops taking 50 connections to answer.
         */
        const counts = await countProductsByPurchase(data.map(item => item.id));
        return await mapConcurrent(data, (item, i) => getModelObject(item, loadPayments, counts));
    }
}

/** purchase_id -> number of purchase products, for the given purchases */
const countProductsByPurchase = async(ids) => {
    const counts = new Map();
    if(!ids.length) return counts;
    const rows = await PurchaseProductModel.findAll({
        attributes: ["purchase_id", [db.sequelize.fn("COUNT", db.sequelize.col("id")), "total"]],
        where: { purchase_id: { [Op.in]: ids } },
        group: ["purchase_id"],
        raw: true,
    });
    rows.forEach(row => counts.set(String(row.purchase_id), parseInt(row.total, 10)));
    return counts;
}

const getModelObject = async(data, loadPayments, counts = null) => {
    let payments = [];
    if(loadPayments){
        payments = await PaymentModel.findAll({order:[['id', 'DESC']], where: {user_id: data.supplier_id}});
        payments = await PaymentCollection(payments);
    }

    let approve_status = 'Pending';
    if(data.is_approved == 1){
        approve_status = "Accepted";
    }else if(data.is_approved == 2){
        approve_status = "Declined";
    }else if(data.is_approved == 3){
        approve_status = "On Approval";
    }else if(data.is_approved == 4){
        approve_status = "Transfer To Purchase";
    }

    if(data.status == "returned"){
        approve_status = "Returned";
    }else if(data.status == "return_pending"){
        approve_status = "Return Pending";
    }
    
    let no_of_products = counts
        ? (counts.get(String(data.id)) || 0)
        : await PurchaseProductModel.count({where: {purchase_id: data.id}});
    return {
        id: data.id,
        supplier_name: data.supplier ? data.supplier.name : '',
        invoice_number: data.invoice_number,
        invoice_date: formatDateTime(data.invoice_date, 8),
        accept_declined_at: data.accept_declined_at ? formatDateTime(data.accept_declined_at, 7) : '',
        total_amount: displayAmount(data.total_amount),
        bill_amount: displayAmount(data.bill_amount),
        total_payable: displayAmount(data.total_payable),
        paid_amount: displayAmount(data.paid_amount),
        return_amount: displayAmount(data.return_amount),
        status: data.status,
        status_display: !isEmpty(data.status) ? ucWords(data.status) : 'Due',
        due_amount: displayAmount(data.due_amount),
        due_date: data.status != "paid" ? formatDateTime(data.due_date, 9) : '',
        payments: payments,
        approve_status: approve_status,
        is_approved: data.is_approved,
        is_assigned: data.is_assigned,
        no_of_products: no_of_products,
        created_myself: isEmpty(data.sale_id) ? true : false
    }
}

module.exports = {
    PurchaseListCollection
}
