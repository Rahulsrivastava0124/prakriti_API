const { isObject, formatDateTime, priceFormat, displayAmount, isEmpty, weightFormat, ucWords } = require("@helpers/helper");
const db = require("@models");
const SaleModel = db.sales;

const ReturnSaleListCollection = (data) => {
    if(isObject(data)){
        return getModelObject(data);
    }else{
        let arr = [];
        for(let i = 0; i < data.length; i++){
            arr.push(getModelObject(data[i]));
        }
        return arr;
    }
}

const getModelObject = (data) => {
    let sale = data.sale;
    let status = data.status;
    if(data.show_superadmin && status == 'completed'){
        status = 'completed_by_superadmin';
    }
    return {
        id: data.id,
        user_id: sale.user_id,
        user_name: sale.user ? sale.user.name : '',
        user_mobile: sale.user ? sale.user.mobile : '',
        invoice_number: sale.invoice_number,
        invoice_date: formatDateTime(sale.invoice_date, 9),
        return_date: data.return_date ? formatDateTime(data.return_date, 9) : '',
        return_amount: displayAmount(data.total_amount),
        /* the returned products at their full value, GST included - the
           return amount above is net of GST, report charge and discount */
        return_amount_with_gst: displayAmount(data.product_amount),
        bill_amount: displayAmount(sale.bill_amount),
        status: status,
        status_display: ucWords((status.split("_")).join(" "))
    }

    
}

module.exports = {
    ReturnSaleListCollection
}
