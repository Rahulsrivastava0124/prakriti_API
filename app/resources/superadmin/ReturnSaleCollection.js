const { isObject, formatDateTime, priceFormat, displayAmount, isEmpty, weightFormat, ucWords, encodeForStorage, decodeFromStorage } = require("@helpers/helper");
const db = require("@models");
const SaleModel = db.sales;

const ReturnSaleCollection = async(data) => {
    if(isObject(data)){
        return await getModelObject(data);
    }else{
        let arr = [];
        for(let i = 0; i < data.length; i++){
            arr.push(await getModelObject(data[i]));
        }
        return arr;
    }
}

const getModelObject = async(data) => {
    let products = [];
    for(let i = 0; i < data.returnProducts.length; i++){
        let item = data.returnProducts[i];
        let materials = [];
        for(let x = 0; x < item.returnMaterials.length; x++){
            let thisM = item.returnMaterials[x];
            materials.push({
                id: thisM.id,
                material_name: thisM.material ? thisM.material.name : '',
                weight: weightFormat(thisM.weight),
                quantity: thisM.quantity,
                unit_name: (thisM.unit) ? thisM.unit.name : '',
                purity_name: thisM.purity ? thisM.purity.name : '',
            });
        }
        let saleProduct = item.saleProduct;
        products.push({
            product_name: saleProduct.product ? saleProduct.product.name : '',
            product_type: saleProduct.product ? saleProduct.product.type : '',
            category_name: (saleProduct.product && saleProduct.product.category) ? saleProduct.product.category.name : '',
            size_name: saleProduct.size ? saleProduct.size.name : '',
            certificate_no: saleProduct.certificate_no,
            materials: materials,
            sub_total: displayAmount(item.sub_total)
        });
    }
    
    let sale = data.sale;
    /* req_data = new Buffer.from(data.req_data, "base64").toString('ascii');
    req_data = req_data.replace(/[\u0000-\u001F]+/g, ""); // remove invisible and invalid characters
    
    req_data = JSON.parse(req_data); */
    let req_data = decodeFromStorage(req_data);
    let payment_type = req_data.payment_type;
    let return_payment_mode = req_data.return_payment_mode;
    let return_amount_from_wallet = 'return_amount_from_wallet' in req_data ? parseFloat(req_data.return_amount_from_wallet) : 0;

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
        bill_amount: displayAmount(sale.bill_amount),
        products: products,
        status: status,
        status_display: ucWords((status.split("_")).join(" ")),
        payment_type: payment_type,
        return_payment_mode: return_payment_mode,
        return_amount_from_wallet: displayAmount(return_amount_from_wallet),
        from_retailer_customer: data.from_retailer_customer,
        show_superadmin: data.show_superadmin,
        return_amount_from_wallet: data.return_amount_from_wallet ? parseFloat(data.return_amount_from_wallet) : 0
    }

    
}

module.exports = {
    ReturnSaleCollection
}
