const { isObject, formatDateTime, isEmpty, displayAmount, weightFormat, priceFormat } = require("@helpers/helper");
const db = require("@models");
const moment = require('moment');
const ReturnPolicyModel = db.return_policy;
const {isAdmin, isDistributor} = require("@library/common");

const PurchaseEditCollection = async(data, req) => {
    if(isObject(data)){
        return await getModelObject(data, req);
    }else{
        let arr = [];
        for(let i = 0; i < data.length; i++){
            arr.push(await getModelObject(data[i], req));
        }
        return arr;
    }
}

const getModelObject = async(data, req) => {

    let products = [], total_sub_total = 0;
    let total_amount_acc = 0;
    let tax_acc = 0;
    for(let i = 0; i < data.purchaseProducts.length; i++){
        let item = data.purchaseProducts[i];
        let materials = [];
        for(let x = 0; x < item.purchaseMaterials.length; x++){
            let thisM = item.purchaseMaterials[x];
            let puritiesArr = [];
            let purities = thisM.material ? thisM.material.purities : [];
            for(let pitm of purities){
                puritiesArr.push(pitm.name);
            }
            let purity_name = '';
            if('purity' in thisM && thisM.purity){
                purity_name = thisM.purity.name;
            }
            let return_weight = weightFormat(thisM.return_weight);
            let return_qty = thisM.return_qty || 0;
            materials.push({
                id: thisM.id,
                material_id: thisM.material_id,
                material_name: thisM.material ? thisM.material.name : '',
                weight: weightFormat(thisM.weight),
                pakka_weight: weightFormat(thisM.pakka_weight),
                quantity: thisM.quantity,
                purities: puritiesArr.join(", "),
                unit_name: (thisM.unit) ? thisM.unit.name : '',
                purity_id: thisM.purity_id,
                purity_info: thisM.purity,
                purity_name: purity_name,
                unit_id: thisM.unit_id,
                rate: thisM.rate,
                amount: thisM.amount,
                avl_qty: (parseFloat(thisM.quantity) - parseFloat(return_qty)),
                avl_weight: weightFormat(parseFloat(thisM.weight) - parseFloat(return_weight)),
                return_qty: '',
                return_weight: '',
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
        let return_charge_percent = 0;
        if(isAdmin(req) || isDistributor(req)){
            let returnPolicy = null;
            if(isAdmin(req) && item.product && item.product.category_id){
                returnPolicy = await ReturnPolicyModel.findOne({where: {category_id: item.product.category_id, role: 'admin'}});
            }else if(isDistributor(req) && item.product && item.product.category_id){
                returnPolicy = await ReturnPolicyModel.findOne({where: {category_id: item.product.category_id, role: 'distributor'}});
            }
            if(returnPolicy){
                let today = moment();
                let invoice_date = moment(data.invoice_date);
                if(today.diff(invoice_date, 'days') > parseInt(returnPolicy.days)){
                    return_charge_percent = returnPolicy.amount;
                }
            }
        }
        
        let product_name = item.product ? item.product.name : '';
        let product_type = item.product ? item.product.type : '';
        if(isEmpty(item.product_id) && isEmpty(item.size_id)){
            product_type = 'material';
            product_name = materials.length ? materials[0].material_name : ''
        }
        products.push({
            id: item.id,
            product_id: item.product_id,
            worker_id: item.worker_id,
            product_name: product_name,
            product_type: product_type,
            size_id: item.size_id,
            size_name: item.size ? item.size.name : '',
            certificate_no: item.certificate_no,
            total_weight: total_weight,
            sub_price: item.sub_price,
            making_charge: item.making_charge,
            rep: item.rep,
            tax: item.tax,
            total: item.total,
            materials: materials,
            is_return: item.is_return,
            return_amount: 0,
            return_charge: 0,
            return_charge_percent: return_charge_percent
        });
        total_sub_total += parseFloat(item.sub_price);
        total_sub_total += parseFloat(item.making_charge);
        // accumulate product totals and tax for defensive recomputation
        total_amount_acc += parseFloat(item.total || 0);
        tax_acc += parseFloat(item.tax || 0);
    }

    let supplier = data.supplier;
    return {
        id: data.id,
        supplier_id: data.supplier_id,
        supplier_details: {
            name: (!isEmpty(supplier) && !isEmpty(supplier.name)) ? supplier.name : '',
            company_name: (!isEmpty(supplier) && !isEmpty(supplier.company_name)) ? supplier.company_name : '',
            mobile: (!isEmpty(supplier) && !isEmpty(supplier.mobile)) ? supplier.mobile : '',
            city: (!isEmpty(supplier) && !isEmpty(supplier.city)) ? supplier.city : '',
            gst: (!isEmpty(supplier) && !isEmpty(supplier.gst)) ? supplier.gst : '',
            address: (!isEmpty(supplier) && !isEmpty(supplier.address)) ? supplier.address : '',
            pincode: (!isEmpty(supplier) && !isEmpty(supplier.pincode)) ? supplier.pincode : '',
        },
        //supplier_name: data.supplier ? data.supplier.name : '',
        sale:data.sale,
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
        payment_mode: data.payment_mode,
        transaction_no: data.transaction_no,
        tax: data.tax,
        discount: data.discount,
        paid_amount: data.paid_amount,
        products: products,
        taxable_amount: priceFormat(data.taxable_amount || 0),
        // compute total_amount from products and derive total_payable defensively
        total_amount: priceFormat(total_amount_acc),
        tax: priceFormat(tax_acc),
        total_payable: priceFormat((total_amount_acc || 0) - (parseFloat(data.discount || 0) || 0) - (parseFloat(data.return_amount || 0) || 0)),
        due_amount: priceFormat(data.due_amount),
        due_date: formatDateTime(data.due_date, 9),
        total_sub_total: priceFormat(total_sub_total),
        have_return_charge: !isEmpty(data.sale_id) ? true : false,
        is_assigned: data.is_assigned,
        created_myself: isEmpty(data.sale_id) ? true : false,
        is_approved: data.is_approved,
    }

    
}

module.exports = {
    PurchaseEditCollection
}
