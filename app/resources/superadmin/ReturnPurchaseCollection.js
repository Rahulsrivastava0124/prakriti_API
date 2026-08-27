const { isObject, formatDateTime, priceFormat, displayAmount, isEmpty, weightFormat, ucWords } = require("@helpers/helper");
const db = require("@models");
const SaleModel = db.sales;

const ReturnPurchaseCollection = async(data) => {
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
        let purchaseProduct = item.purchaseProduct;
        products.push({
            product_name: purchaseProduct.product ? purchaseProduct.product.name : '',
            product_type: purchaseProduct.product ? purchaseProduct.product.type : '',
            category_name: (purchaseProduct.product && purchaseProduct.product.category) ? purchaseProduct.product.category.name : '',
            size_name: purchaseProduct.size ? purchaseProduct.size.name : '',
            certificate_no: purchaseProduct.certificate_no,
            materials: materials,
            sub_total: displayAmount(item.sub_total)
        });
    }
    
    let purchase = data.purchase;

    return {
        id: data.id,
        supplier_id: purchase.supplier_id,
        supplier_name: purchase.supplier ? purchase.supplier.name : '',
        supplier_mobile: purchase.supplier ? purchase.supplier.mobile : '',
        invoice_number: purchase.invoice_number,
        invoice_date: formatDateTime(purchase.invoice_date, 9),
        return_date: data.return_date ? formatDateTime(data.return_date, 9) : '',
        return_amount: displayAmount(data.total_amount),
        bill_amount: displayAmount(purchase.bill_amount),
        products: products,
        status: data.status,
        status_display: ucWords(data.status)
    }

    
}

module.exports = {
    ReturnPurchaseCollection
}
