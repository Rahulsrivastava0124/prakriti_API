const { isObject, formatDateTime, priceFormat, displayAmount, isEmpty, ucWords, weightFormat } = require("@helpers/helper");

const PurchaseViewCollection = (data) => {
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
    let products = [], subCatItems = [];
    for(let i = 0; i < data.purchaseProducts.length; i++){
        let item = data.purchaseProducts[i];
        let materials = [];
        for(let x = 0; x < item.purchaseMaterials.length; x++){
            let thisM = item.purchaseMaterials[x];
            let return_weight = weightFormat(thisM.return_weight);
            let return_qty = thisM.return_qty ? parseInt(thisM.return_qty) : 0;
            materials.push({
                id: thisM.id,
                material_id: thisM.material_id,
                material_name: thisM.material ? thisM.material.name : '',
                weight: weightFormat(thisM.weight),
                pakka_weight: weightFormat(thisM.pakka_weight),
                quantity: thisM.quantity,
                unit_name: (thisM.unit) ? thisM.unit.name : '',
                purity_id: thisM.purity_id,
                purity_name: thisM.purity ? thisM.purity.name : '',
                unit_id: thisM.unit_id,
                rate_display: displayAmount(thisM.rate),
                rate: priceFormat(thisM.rate),
                amount: displayAmount(thisM.amount),
                discount_amount: priceFormat(thisM.discount_amount),
                discount_amount_display: displayAmount(thisM.discount_amount, false, true, false),
                material_cost: priceFormat(thisM.amount - thisM.discount_amount),
                return_weight: return_weight,
                return_qty: return_qty
            });
        }

        /* reorder material so that gold will be always comes as first item if exists */
        // Move the first material whose name contains 'gold' (case-insensitive) to the front
        const goldIndex = materials.findIndex(m => m.material_name && m.material_name.toLowerCase().includes('gold'));
        if (goldIndex > 0) {
            const [goldItem] = materials.splice(goldIndex, 1);
            materials.unshift(goldItem);
        }

        let total_weight = '';
        if(materials.length == 1){
            total_weight = weightFormat(materials[0].weight).toFixed(3) + ' ' + materials[0].unit_name;
        }else{
            total_weight = materials.length > 0?weightFormat(item.total_weight).toFixed(3) + materials[0].unit_name: weightFormat(item.total_weight).toFixed(3) + ' gm';
        }
        let sub_total = !isEmpty(data.sale_id) ? displayAmount(item.sub_price) : displayAmount(parseFloat(item.sub_price) + parseFloat(item.making_charge));
        products.push({
            id: item.id,
            product_name: item.product ? item.product.name : '',
            product_type: item.product ? item.product.type : '',
            product_code: item.product ? item.product.product_code : '',
            category_name: (item.product && item.product.category) ? item.product.category.name : '',
            sub_category_id: (item.product && item.product.sub_category) ? item.product.sub_category.id : '',
            sub_category_name: (item.product && item.product.sub_category) ? item.product.sub_category.name : '',
            sub_category_hsn: (item.product && item.product.sub_category) ? item.product.sub_category.hsn_code : '',
            size_name: item.size ? item.size.name : '',
            certificate_no: item.certificate_no,
            total_weight: total_weight,
            subtotal_price: priceFormat(item.sub_price),
            sub_price: displayAmount(item.sub_price),
            making_charge: priceFormat(item.making_charge),
            making_charge_display: displayAmount(item.making_charge),
            rep: displayAmount(item.rep),
            tax: displayAmount(item.tax),
            total: displayAmount(item.total),
            total_display: displayAmount(item.total),
            total_discount: priceFormat(item.total_discount),
            total_discount_display: displayAmount(item.total_discount),
            materials: materials,
            taxDetails: item.product &&  item.product.tax? item.product.tax : null,
            is_return: item.is_return,
            sub_total: sub_total,
        });
    }

    //console.log("products : ", products);

    let subCatWiseProducts = [];
    //let saleStocks = data.saleStocks;
    //if(saleStocks){
    if(products){
        for(let i = 0; i < products.length; i++){
            //let stockItem = saleStocks[i];
            //let productSelected = products.filter((itm) => itm.id === stockItem.product_id);
            let productSelected = products[i];
            console.log("productSelected : ", productSelected); 
            /* categorise product details by sub categories */
            if(productSelected.product_name != ''){
                //productSelected = productSelected[0];
                if(productSelected.sub_category_id && typeof subCatWiseProducts[productSelected.sub_category_id] === "undefined"){
                    subCatWiseProducts[productSelected.sub_category_id] = [];
                } 

                subCatWiseProducts[productSelected.sub_category_id].push({
                    "product" : productSelected,
                    "qty" : 1//stockItem.quantity
                });
            }
        }

        /* for each  subCatWiseProducts */
        for(let subCatIndex in subCatWiseProducts){
            subCatWiseProduct = subCatWiseProducts[subCatIndex];

            let subCatId = subCatWiseProduct[0].product.sub_category_id;
            let subCatName = subCatWiseProduct[0].product.sub_category_name;
            let subCatHsn = subCatWiseProduct[0].product.sub_category_hsn;
            let subCatWiseQty = subCatWiseProduct.reduce((total, itm) => {
                return total + Math.round(itm.qty);
            }, 0);
            let subCatWiseProductHSNs = subCatWiseProduct.map((itm) => itm.product.product_code);
            subCatWiseProductHSNs = subCatWiseProductHSNs.filter((item, index) => subCatWiseProductHSNs.indexOf(item) === index).join(", ");

            /* subCatWiseProductMaterials */
            let productTax = 0.00;
            let productTaxableAmount = 0.00;
            let subCatWiseProductMaterials = [];
            for (let i = 0; i < subCatWiseProduct.length; i++) {
                const pItem = subCatWiseProduct[i].product;
                productTax = parseFloat(pItem.taxDetails.igst);
                productTaxableAmount += parseFloat(pItem.sub_total.replace(/[^\d]/,''));
                for (let j = 0; j < pItem.materials.length; j++) {
                    const mItem = pItem.materials[j];
                    if(typeof subCatWiseProductMaterials[mItem.material_id] === "undefined"){
                        subCatWiseProductMaterials[mItem.material_id] = {
                            "id" : mItem.material_id,
                            "name" : mItem.material_name,
                            "weight" : parseFloat(mItem.weight),
                            "unit" : mItem.unit_name,
                            "rate" : mItem.rate
                        };
                    } else {
                        /* already exists in array */
                        subCatWiseProductMaterials[mItem.material_id].weight += parseFloat(mItem.weight);
                    }
                }
            }
            subCatWiseProductMaterials = subCatWiseProductMaterials.filter((itm) => itm != null);

            /* crate array */
            subCatItems.push({
                "id" : subCatId,
                "name" : subCatName,
                "qty" : subCatWiseQty,
                "hsn" : subCatHsn, /*subCatWiseProductHSNs,*/
                "material" : subCatWiseProductMaterials,
                "tax" : productTax,
                "taxableAmount" : productTaxableAmount
            });
        }
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

    let company_name = (data.supplier && data.supplier.company_name) ? data.supplier.company_name : '';
    let user_name = data.supplier ? data.supplier.name : '';
    if(isEmpty(company_name)){
        company_name = user_name;
    }
    
    /* tax split display */
    /* check if transaction happened in/between same/different places */
    const supplier_gst = (data.supplier && (data.supplier.gst != null && data.supplier.gst != '')) ? data.supplier.gst : '';
    const purchase_by_gst = (data.purchaseBy && (data.purchaseBy.gst != null && data.purchaseBy.gst != '')) ? data.purchaseBy.gst : '';

    const supplier_gst_state = supplier_gst != ""?supplier_gst.substring(0,2):'';
    const purchase_by_gst_state = purchase_by_gst != ""?purchase_by_gst.substring(0,2):'';

    /* tax display calculation  */
    let cgst_tax = 0.00;
    let sgst_tax = 0.00;
    let igst_tax = data.tax;
    let is_same_state_trnx = false;
    if(supplier_gst_state != '' && purchase_by_gst_state != ''){
        if(supplier_gst_state == purchase_by_gst_state){
            /* same state CGST & SGST */
            cgst_tax = sgst_tax = data.tax/2;
            is_same_state_trnx = true;
        } else {
            /* different state IGST */
            igst_tax = data.tax;
            is_same_state_trnx = false;
        }
    }

    return {
        id: data.id,
        supplier_id: data.supplier_id,
        supplier_name: data.supplier ? data.supplier.name : '',
        supplier_mobile: data.supplier ? data.supplier.mobile : '',
        supplier_details: {
            id: data.supplier_id,
            company_name: company_name,
            gst: (data.supplier && data.supplier.gst) ? data.supplier.gst : '',
            address: (data.supplier && data.supplier.address) ? data.supplier.address : '',
            city: (data.supplier && data.supplier.city) ? data.supplier.city : '',
            pincode: (data.supplier && data.supplier.pincode) ? data.supplier.pincode : '',
            user_name: user_name,
            bank_name: (data.supplier && data.supplier.bank_name) ? data.supplier.bank_name : '',
            bank_account_no: (data.supplier && data.supplier.bank_account_no) ? data.supplier.bank_account_no : '',
            bank_ifsc: (data.supplier && data.supplier.bank_ifsc) ? data.supplier.bank_ifsc : '',
        },
        sale: data.sale,
        purchase_by_id: data.user_id,
        purchase_by_name: data.purchaseBy ? data.purchaseBy.name : '',
        purchase_by_mobile: data.purchaseBy ? data.purchaseBy.mobile : '',
        purchase_by_details: {
            id: data.user_id,
            company_name: (data.purchaseBy && data.purchaseBy.company_name) ? data.purchaseBy.company_name : '',
            gst: (data.purchaseBy && data.purchaseBy.gst) ? data.purchaseBy.gst : '',
            address: (data.purchaseBy && data.purchaseBy.address) ? data.purchaseBy.address : '',
            city: (data.purchaseBy && data.purchaseBy.city) ? data.purchaseBy.city : '',
            pincode: (data.purchaseBy && data.purchaseBy.pincode) ? data.purchaseBy.pincode : '',
            user_name: data.purchaseBy ? data.purchaseBy.name : '',
            bank_name: (data.purchaseBy && data.purchaseBy.bank_name) ? data.purchaseBy.bank_name : '',
            bank_account_no: (data.purchaseBy && data.purchaseBy.bank_account_no) ? data.purchaseBy.bank_account_no : '',
            bank_ifsc: (data.purchaseBy && data.purchaseBy.bank_ifsc) ? data.purchaseBy.bank_ifsc : '',
        },
        added_by_details: {
            id: data.added_by,
            company_name: (data.addedBy && data.addedBy.company_name) ? data.addedBy.company_name : '',
            gst: (data.addedBy && data.addedBy.gst) ? data.addedBy.gst : '',
            address: (data.addedBy && data.addedBy.address) ? data.addedBy.address : '',
            city: (data.addedBy && data.addedBy.city) ? data.addedBy.city : '',
            pincode: (data.addedBy && data.addedBy.pincode) ? data.addedBy.pincode : '',
            user_name: data.addedBy ? data.addedBy.name : '',
            bank_name: (data.addedBy && data.addedBy.bank_name) ? data.addedBy.bank_name : '',
            bank_account_no: (data.addedBy && data.addedBy.bank_account_no) ? data.addedBy.bank_account_no : '',
            bank_ifsc: (data.addedBy && data.addedBy.bank_ifsc) ? data.addedBy.bank_ifsc : '',
        },
        invoice_number: data.invoice_number,
        invoice_date: formatDateTime(data.invoice_date, 9),
        notes: data.notes,
        total_amount: displayAmount(data.total_amount),
        payment_mode: data.payment_mode,
        transaction_no: data.transaction_no,
        tax: displayAmount(data.tax),
        is_same_state_trnx: is_same_state_trnx,
        cgst_tax: displayAmount(cgst_tax),
        sgst_tax: displayAmount(sgst_tax),
        igst_tax: displayAmount(igst_tax),
        discount: displayAmount(data.discount),
        paid_amount: priceFormat(data.paid_amount),
        paid_amount_display: displayAmount(data.paid_amount),
        products: products,
        subCatItems: subCatItems,
        taxable_amount: displayAmount(data.taxable_amount),
        return_amount: displayAmount(data.return_amount),
        bill_amount: displayAmount(data.bill_amount),
        total_payable: displayAmount(data.total_payable),
        due_amount: priceFormat(data.due_amount),
        due_amount_display: displayAmount(data.due_amount),
        due_date: formatDateTime(data.due_date, 8),
        status: data.status,
        status_display: !isEmpty(data.status) ? ucWords(data.status) : 'Due',
        is_approved: data.is_approved,
        approve_status: approve_status,
        is_assigned: data.is_assigned,
        accept_declined_at: data.accept_declined_at ? formatDateTime(data.accept_declined_at, 7) : '',
        no_of_products: products.length,
        created_myself: isEmpty(data.sale_id) ? true : false
    }

    
}

module.exports = {
    PurchaseViewCollection
}
