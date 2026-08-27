const { isObject, formatDateTime, isEmpty, displayAmount, ucWords } = require("@helpers/helper");
const db = require("@models");
const PaymentModel = db.payments;
const {PaymentCollection} = require("@resources/superadmin/PaymentCollection");
const PurchaseProductModel = db.purchase_products;

const PurchaseListCollection = async(data, loadPayments) => {
    if(isObject(data)){
        return await getModelObject(data);
    }else{
        let arr = [];
        for(let i = 0; i < data.length; i++){
            arr.push(await getModelObject(data[i], loadPayments));
        }
        return arr;
    }
}

const getModelObject = async(data, loadPayments) => {
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
    
    let no_of_products = await PurchaseProductModel.count({where: {purchase_id: data.id}});
    // console.log("--------------PurchasesList",data);
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
