const { isObject, formatDateTime, ucWords, displayAmount, priceFormat, weightFormat } = require("@helpers/helper");
const { isEmpty } = require("lodash");

const SaleCollection = (data) => {
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
    let products = [], subCatItems = [], total_sub_total = 0; 
    for(let i = 0; i < data.saleProducts.length; i++){
        let item = data.saleProducts[i];
        let materials = [];
        for(let x = 0; x < item.saleMaterials.length; x++){
            let thisM = item.saleMaterials[x];
            let return_weight = weightFormat(thisM.return_weight);
            let return_qty = thisM.return_qty ? parseInt(thisM.return_qty) : 0;
            materials.push({
                id: thisM.id,
                material_id: thisM.material_id,
                material_name: thisM.material ? thisM.material.name : '',
                weight: weightFormat(thisM.weight),
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
                discount_percent: thisM.discount_percent,
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
            total_weight = weightFormat(materials[0].weight).toFixed(3);
        }else{
            total_weight = weightFormat(item.total_weight).toFixed(3);
        }

        let total_weight_display = materials.length > 0?total_weight + ' ' + materials[0].unit_name:total_weight + ' gm';

        total_sub_total += priceFormat(item.sub_price - item.total_discount);

        products.push({
            id: item.product ? item.product.id : 0,
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
            total_weight_display: total_weight_display,
            subtotal_price: priceFormat(item.sub_price),
            sub_price: displayAmount(item.sub_price),
            making_charge: priceFormat(item.making_charge),
            making_charge_discount: priceFormat(item.making_charge_discount),
            making_charge_discount_amount: priceFormat(item.making_charge_discount_amount),
            making_charge_display: displayAmount(item.making_charge),
            rep: displayAmount(item.rep),
            tax: displayAmount(item.tax),
            total: priceFormat(item.total),
            total_display: displayAmount(item.total),
            total_discount: priceFormat(item.total_discount),
            total_discount_display: displayAmount(item.total_discount),
            materials: materials,
            taxDetails: item.product &&  item.product.tax? item.product.tax : null,
            total_making_charge_discount: priceFormat(priceFormat(item.making_charge) - priceFormat(item.making_charge_discount_amount)),
            sub_total: displayAmount(item.sub_price - item.total_discount),
            is_return: item.is_return
        });
    }
    //let productsCopy = products.map((prd) => prd);
    let subCatWiseProducts = [];
    //let saleStocks = data.saleStocks;
    //if(saleStocks){
        //for(let i = 0; i < saleStocks.length; i++){
        for(let i = 0; i < products.length; i++){
            /* let stockItem = saleStocks[i];
            let selectedProductIndex = productsCopy.findIndex((itm) => itm.id === stockItem.product_id); */
            
            /* get product details by sub categories */
            /* if(selectedProductIndex != -1){
                let productSelected = productsCopy.splice(selectedProductIndex,1);
                productSelected = productSelected[0]; */
                let productSelected = products[i];
                console.log("productSelected : ", productSelected); 
                if(productSelected.product_name != '' && productSelected.sub_category_id != '' && productSelected.sub_category_id != null){
                    if(productSelected.sub_category_id && typeof subCatWiseProducts[productSelected.sub_category_id] === "undefined"){
                        subCatWiseProducts[productSelected.sub_category_id] = [];
                    } 
                    /* push to array */
                    subCatWiseProducts[productSelected.sub_category_id].push({
                        "product" : productSelected,
                        "qty" : 1 //stockItem.quantity
                    });
                }
           /* } */
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
                
                //const pItem = subCatWiseProduct.product;
                productTax = parseFloat(pItem.taxDetails.igst);
                productTaxableAmount += parseFloat(pItem.sub_total.replace(/[^\d]/,''));
                
                for (let j = 0; j < pItem.materials.length; j++) {
                    const mItem = pItem.materials[j];
                    
                    if(typeof subCatWiseProductMaterials[mItem.material_id] === "undefined"){
                        subCatWiseProductMaterials[mItem.material_id] = {
                            "id" : mItem.material_id,
                            "name" : mItem.material_name,
                            "quantity" : parseInt(mItem.quantity),
                            "weight" : parseFloat(mItem.weight),
                            "unit" : mItem.unit_name,
                            "rate" : mItem.rate,
                            "material_cost" : mItem.material_cost
                        };
                    } else {
                        /* already exists in array */
                        subCatWiseProductMaterials[mItem.material_id].weight += parseFloat(mItem.weight);
                        subCatWiseProductMaterials[mItem.material_id].quantity += parseInt(mItem.quantity);
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
    //}

    let approve_status = 'Pending';
    if(data.is_approved == 1){
        approve_status = "Accepted";
    }else if(data.is_approved == 2){
        approve_status = "Declined";
    }else if(data.is_approved == 3){
        approve_status = "On Approval";
    }else if(data.is_approved == 4){
        approve_status = "Transfer To Sale";
    }

    if(data.status == "returned"){
        approve_status = "Returned";
    }else if(data.status == "return_pending"){
        approve_status = "Return Pending";
    }

    let total_tax = priceFormat(priceFormat(data.cgst_tax) + priceFormat(data.sgst_tax) + priceFormat(data.igst_tax));
    let company_name = (data.user && data.user.company_name) ? data.user.company_name : '';
    let user_name = data.user ? data.user.name : '';
    if(isEmpty(company_name)){
        company_name = user_name;
    }


    /* tax split display */
    /* check if transaction happened in/between same/different places */
    const user_gst = (data.user && (data.user.gst != null && data.user.gst != '')) ? data.user.gst : '';
    const sale_by_gst = (data.saleBy && (data.saleBy.gst != null && data.saleBy.gst != '')) ? data.saleBy.gst : '';

    const user_gst_state = user_gst != ""?user_gst.substring(0,2):'';
    const sale_by_gst_state = sale_by_gst != ""?sale_by_gst.substring(0,2):'';

    /* tax display calculation  */
    /* let cgst_tax = 0.00;
    let sgst_tax = 0.00;
    let igst_tax = data.tax; */
    let is_same_state_trnx = false;
    if(user_gst_state != '' && sale_by_gst_state != ''){
        if(user_gst_state == sale_by_gst_state){
            /* same state CGST & SGST */
            //cgst_tax = sgst_tax = data.tax/2;
            is_same_state_trnx = true;
        } else {
            /* different state IGST */
            //igst_tax = data.tax;
            is_same_state_trnx = false;
        }
    }

    return {
        id: data.id,
        user_id: data.user_id,
        user_name: user_name,
        user_mobile: data.user ? data.user.mobile : '',
        user_details: {
            id: data.user_id,
            company_name: company_name,
            gst: (data.user && data.user.gst) ? data.user.gst : '',
            address: (data.user && data.user.address) ? data.user.address : '',
            city: (data.user && data.user.city) ? data.user.city : '',
            pincode: (data.user && data.user.pincode) ? data.user.pincode : '',
            user_name: user_name,
            bank_name: (data.user && data.user.bank_name) ? data.user.bank_name : '',
            bank_account_no: (data.user && data.user.bank_account_no) ? data.user.bank_account_no : '',
            bank_ifsc: (data.user && data.user.bank_ifsc) ? data.user.bank_ifsc : '',
            mobile: (data.user && data.user.mobile) ? data.user.mobile : '',
        },
        sale_by_id: data.sale_by,
        sale_by_name: data.saleBy ? data.saleBy.name : '',
        sale_by_mobile: data.saleBy ? data.saleBy.mobile : '',
        sale_by_details: {
            id: data.sale_by,
            company_name: (data.saleBy && data.saleBy.company_name) ? data.saleBy.company_name : '',
            gst: (data.saleBy && data.saleBy.gst) ? data.saleBy.gst : '',
            address: (data.saleBy && data.saleBy.address) ? data.saleBy.address : '',
            city: (data.saleBy && data.saleBy.city) ? data.saleBy.city : '',
            pincode: (data.saleBy && data.saleBy.pincode) ? data.saleBy.pincode : '',
            user_name: data.saleBy ? data.saleBy.name : '',
            bank_name: (data.saleBy && data.saleBy.bank_name) ? data.saleBy.bank_name : '',
            bank_account_no: (data.saleBy && data.saleBy.bank_account_no) ? data.saleBy.bank_account_no : '',
            bank_ifsc: (data.saleBy && data.saleBy.bank_ifsc) ? data.saleBy.bank_ifsc : '',
        },
        invoice_number: data.invoice_number,
        invoice_date: formatDateTime(data.invoice_date, 8),
        //due_date: formatDateTime(data.due_date, 8),
        settlement_date: formatDateTime(data.settlement_date, 8),
        report_qty: data.report_qty,
        report_charge: priceFormat(data.report_charge),
        report_charge_display: displayAmount(data.report_charge),
        report_tax_percentage: priceFormat(data.report_tax_percentage),
        cgst_tax: priceFormat(data.cgst_tax),
        sgst_tax: priceFormat(data.sgst_tax),
        igst_tax: priceFormat(data.igst_tax),
        total_tax: priceFormat(total_tax),
        cgst_tax_display: displayAmount(data.cgst_tax),
        sgst_tax_display: displayAmount(data.sgst_tax),
        igst_tax_display: displayAmount(data.igst_tax),
        total_tax_display: displayAmount(total_tax),
        is_same_state_trnx: is_same_state_trnx,
        discount: displayAmount(data.discount),
        total_amount: displayAmount(data.total_amount),
        payment_mode: data.payment_mode,
        transaction_no: data.transaction_no,
        notes: data.notes,
        taxable_amount: displayAmount(data.taxable_amount),
        taxable_amount_raw: data.taxable_amount,
        bill_amount: displayAmount(data.bill_amount),
        total_payable: displayAmount(data.total_payable),
        return_amount: parseFloat(data.return_amount) > 0 ? displayAmount(data.return_amount) : "",
        due_amount: priceFormat(data.due_amount),
        due_amount_display: displayAmount(data.due_amount),
        due_date: data.status != "paid" ? formatDateTime(data.due_date, 8) : '',
        paid_amount_display: displayAmount(data.paid_amount),
        paid_amount: priceFormat(data.paid_amount),
        total_tag_price: displayAmount(data.total_tag_price),
        product_discount: displayAmount(data.product_discount),
        total_sub_total: displayAmount(total_sub_total),
        status_display: ucWords(data.status),
        products: products,
        subCatItems: subCatItems,
        approve_status: approve_status,
        is_approved: data.is_approved,
        is_assigned: data.is_assigned,
        accept_declined_at: data.accept_declined_at ? formatDateTime(data.accept_declined_at, 7) : '',
        no_of_products: products.length
    }
}

module.exports = {
    SaleCollection
}
