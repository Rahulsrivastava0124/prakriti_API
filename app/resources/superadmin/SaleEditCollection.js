const { isObject, formatDateTime, ucWords, displayAmount, priceFormat, weightFormat, isEmpty } = require("@helpers/helper");
const db = require("@models");
const moment = require('moment');
const { Op } = require("sequelize");
const SaleProductModel = db.sale_products;
const ReturnPolicyModel = db.return_policy;
const UserModel = db.users;
const RoleModel = db.roles;
const PurchaseProductModel = db.purchase_products;
const StockModel = db.stocks;

const SaleEditCollection = async(data, req) => {
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

const getModelObject = async(data) => {

    let products = [];
    for(let i = 0; i < data.saleProducts.length; i++){
        let p_item = data.saleProducts[i];
        let materials = [];
        for(let x = 0; x < p_item.saleMaterials.length; x++){
            let m_item = p_item.saleMaterials[x];

            let return_weight = weightFormat(m_item.return_weight);
            let return_qty = m_item.return_qty ? parseInt(m_item.return_qty) : 0;
            materials.push({
                id: m_item.id,
                material_id: m_item.material_id,
                material_name: m_item.material ? m_item.material.name : '',
                weight: m_item.weight,
                quantity: m_item.quantity,
                unit_name: m_item.unit ? m_item.unit.name : '',
                unit_id: m_item.unit_id,
                purity: m_item.purity ? m_item.purity.name : '',
                purity_id: m_item.purity_id,
                amount: m_item.amount,
                rate: m_item.rate,
                discount_percent: m_item.discount_percent,
                discount_amount: m_item.discount_amount,
                max_discount_percent: m_item.max_discount_percent,
                total_gram: m_item.total_gram,
                per_gram_price: m_item.per_gram_price,
                avl_qty: (parseInt(m_item.quantity) - return_qty),
                avl_weight: weightFormat(parseFloat(m_item.weight) - return_weight)
            })
        }

        /* reorder material so that gold will be always comes as first item if exists */
        // Move the first material whose name contains 'gold' (case-insensitive) to the front
        const goldIndex = materials.findIndex(m => m.material_name && m.material_name.toLowerCase().includes('gold'));
        if (goldIndex > 0) {
            const [goldItem] = materials.splice(goldIndex, 1);
            materials.unshift(goldItem);
        }

        let return_charge_percent = 0;
        let saleUserRole = data.user && data.user.role ? data.user.role.name : '';
        if(saleUserRole && parseFloat(data.due_amount) <= 0){
            let returnPolicy = await ReturnPolicyModel.findOne({where: {category_id: p_item.product.category_id, role: saleUserRole}});
            if(returnPolicy){
                let today = moment();
                let invoice_date = moment(data.invoice_date);
                if(today.diff(invoice_date, 'days') > parseInt(returnPolicy.days)){
                    return_charge_percent = returnPolicy.amount;
                }
            }
        }

        let total_weight = '';
        if(materials.length == 1){
            total_weight = weightFormat(materials[0].weight).toFixed(3);
        }else{
            total_weight = weightFormat(p_item.total_weight).toFixed(3);
        }

        let total_weight_display = materials.length > 0?total_weight + ' ' + materials[0].unit_name: total_weight + ' gm';

        // Get current_image from PurchaseProduct or Stock by certificate_no
        let current_image = null;
        if (p_item.certificate_no) {
          // First, try to get from PurchaseProduct
          let purchaseProduct = await PurchaseProductModel.findOne({
            where: {
              certificate_no: {
                [Op.like]: p_item.certificate_no
              }
            },
            order: [['id', 'DESC']] // Get the most recent one
          });
          
          if (purchaseProduct && purchaseProduct.current_image) {
            current_image = purchaseProduct.current_image;
          } else {
            // Second, try to get from Stock
            let stock = await StockModel.findOne({
              where: {
                certificate_no: {
                  [Op.like]: p_item.certificate_no
                }
              },
              order: [['id', 'DESC']] // Get the most recent one
            });
            
            if (stock && stock.current_image) {
              current_image = stock.current_image;
            }
          }
        }

        let thisObj = {
            id: p_item.id,
            product_id: p_item.product_id,
            product_type: p_item.product.type,
            product_name: p_item.product.name,
            certificate_no: p_item.certificate_no,
            size_id: p_item.size_id,
            size_name: p_item.size ? p_item.size.name : '',
            materials: materials,
            making_charge: p_item.making_charge,
            stock_id: p_item.stock_id,
            category_id: p_item.product.category_id,
            sub_category_id: p_item.product.sub_category_id,
            total_weight: total_weight,
            total_weight_display: total_weight_display,
            sub_price: p_item.sub_price,
            rep: p_item.rep,
            cgst_tax: p_item.cgst_tax,
            sgst_tax: p_item.sgst_tax,
            igst_tax: p_item.igst_tax,
            total: p_item.total,
            tax_info: p_item.tax_info ? JSON.parse(p_item.tax_info) : null,
            total_tax: p_item.tax,
            sale_product_id: 0,
            making_charge_discount_amount: p_item.making_charge_discount_amount,
            total_discount: p_item.total_discount,
            making_charge_discount_percent: p_item.making_charge_discount_percent,
            max_making_charge_discount_percent: p_item.max_making_charge_discount_percent,
            sub_cat_making_charge: p_item.sub_cat_making_charge,
            sub_cat_making_charge_type: p_item.sub_cat_making_charge_type,
            is_return: p_item.is_return,
            return_amount: 0,
            return_charge: 0,
            return_charge_percent: return_charge_percent,
            current_image: current_image
        }
        

        products.push(thisObj);
    }

    return {
        id: data.id,
        user_id: data.user_id,
        invoice_number: data.invoice_number,
        invoice_date: formatDateTime(data.invoice_date, 9),
        products: products,
        notes: data.notes,
        payment_mode: data.payment_mode,
        transaction_no: data.transaction_no,
        cheque_no: '',
        taxable_amount: data.taxable_amount,
        total_amount: data.total_amount,
        discount: data.discount,
        total_payable: data.total_payable,
        paid_amount: data.paid_amount,
        due_amount: data.due_amount,
        due_date: data.due_date,
        report_qty: data.report_qty,
        report_charge: priceFormat(data.report_charge),
        report_charge_display: displayAmount(data.report_charge),
        report_tax_percentage: priceFormat(data.report_tax_percentage),
        cgst_tax: data.cgst_tax,
        sgst_tax: data.sgst_tax,
        igst_tax: data.igst_tax,
        settlement_date: formatDateTime(data.settlement_date, 9),
        product_discount: data.product_discount,
        total_tag_price: data.total_tag_price,
        total_tax: priceFormat(parseFloat(data.cgst_tax) + parseFloat(data.sgst_tax) + parseFloat(data.igst_tax)),
        image_file: '',
        have_return_charge: true,
        is_approved: data.is_approved
    }
}

module.exports = {
    SaleEditCollection
}
