const { isObject, isEmpty, priceFormat, displayAmount, getFileAbsulatePath, weightFormat } = require("@helpers/helper");
const {CartMaterialCollection} = require("@resources/customer/CartMaterialCollection");
const {getProductSizeMaterials} = require("@library/common");

const CartCollection = async (data, role) => {
    if(isObject(data)){
        return await getModelObject(data, role);
    }else{
        let arr = [];
        for(let i = 0; i < data.length; i++){
            arr.push(await getModelObject(data[i], role));
        }
        return arr;
    }
}

const getModelObject = async(data, role) => {
    let dis_type = 'customer', macking_dis_type = 'customer_discount';
    if(role == 4 || role == 5){
        dis_type = 'retailer';
        macking_dis_type = 'retailer_discount';
    }else{
        dis_type = 'customer';
        macking_dis_type = 'customer_discount';
    }

    let sub_category = data.product && data.product.sub_category ? data.product.sub_category : null;
    let taxInfo = null;
    if(data.product && data.product.tax){
        taxInfo = {
            name: data.product.tax.name,
            cgst: parseFloat(data.product.tax.cgst),
            sgst: parseFloat(data.product.tax.sgst),
            igst: parseFloat(data.product.tax.igst),
        }
    }

    let cartMaterials = !isEmpty(data.cartMaterial) ? await CartMaterialCollection(data.cartMaterial,{sub_category: sub_category,product_type: data.product ? data.product.type : "", dis_type: dis_type}) : [];
    let sub_total = 0, price_sub_total = 0, total_making_charge = 0, total_quantity = 0, total_weight = 0, total_material_discount = 0, total_discount = 0;
    for(let i=0;i<cartMaterials.length;i++){
        sub_total += cartMaterials[i].sale_price;
        price_sub_total += cartMaterials[i].price;
        total_weight += cartMaterials[i].weight_in_gram;
        total_quantity += cartMaterials[i].quantity;
        total_material_discount += cartMaterials[i].discount;
    }
    total_discount += total_material_discount; 
    let making_charge_discount_amount = 0, making_charge_discount_percent = 0;
    if(sub_category){
        sub_making_charge_type = sub_category ? sub_category.making_charge_type : '';
        sub_making_charge = sub_category ? sub_category.making_charge : '';
        making_charge_discount_percent = sub_category[macking_dis_type] || 0;
        if(sub_making_charge_type == "per_piece"){
            total_making_charge = priceFormat(parseFloat(sub_making_charge));
        }else if(sub_making_charge_type == "per_gram"){
            total_making_charge = priceFormat(total_weight * parseFloat(sub_making_charge));
        }
        making_charge_discount_amount = making_charge_discount_percent > 0 ? priceFormat(total_making_charge * making_charge_discount_percent / 100) : 0;
        price_sub_total += total_making_charge;
        total_making_charge = priceFormat(total_making_charge - making_charge_discount_amount);
        total_discount += making_charge_discount_amount;
    }

    let total_price = priceFormat(priceFormat(sub_total) + total_making_charge);
    let price_without_tax = total_price;
    let total_gst = 0, igst = 0, cgst = 0, sgst = 0;
    if(taxInfo){
        igst = 0;
        cgst = (!isEmpty(taxInfo.cgst)) ? priceFormat(total_price * parseFloat(taxInfo.cgst) / 100, true) : 0;
        sgst = (!isEmpty(taxInfo.sgst)) ? priceFormat(total_price * parseFloat(taxInfo.sgst) / 100, true) : 0;
        let p_cgst = (!isEmpty(taxInfo.cgst)) ? priceFormat(price_sub_total * parseFloat(taxInfo.cgst) / 100, true) : 0;
        let p_sgst = (!isEmpty(taxInfo.sgst)) ? priceFormat(price_sub_total * parseFloat(taxInfo.sgst) / 100, true) : 0;
        total_price += (igst + cgst + sgst);
        price_sub_total += (igst + p_cgst + p_sgst);
        total_gst = priceFormat(igst + cgst + sgst);
    }
    let price = priceFormat(total_price);
    total_price = data.is_manual ? priceFormat(total_price) : priceFormat(total_price * data.quantity);
    total_discount = data.is_manual ? priceFormat(total_discount) : priceFormat(total_discount * data.quantity);
    let total_price_without_dis = data.is_manual ? priceFormat(price_sub_total) : priceFormat(price_sub_total * data.quantity);

    let image = data.product && !isEmpty(data.product.main_image) ? getFileAbsulatePath(data.product.main_image) : '';
    let size_materials = await getProductSizeMaterials(data.product.id, data.product.type);
    let manual_weight = data.is_manual ? weightFormat(cartMaterials[0].weight) : '';
    let manual_qty = data.is_manual ? data.quantity : '';

    //new
    let sub_price = priceFormat(sub_total + total_material_discount + total_making_charge);

    return {        
        id: data.id,
        current_image: data.current_image,
        product_id: data.product_id,
        user_id: data.user_id,
        size_id: !isEmpty(data.size_id) ? data.size_id : '',
        stock_id: !isEmpty(data.stock_id) ? data.stock_id : '',
        discount: !isEmpty(data.discount) ? data.discount : '',
        discount_type: !isEmpty(data.discount_type) ? data.discount_type : '',
        rate: !isEmpty(data.rate) ? data.rate : '',
        quantity: data.quantity,
        total_weight: weightFormat(total_weight),
        size_name: !isEmpty(data.size) ? data.size.name : '',
        product_name: !isEmpty(data.product) ? data.product.name : '',
        product_code: !isEmpty(data.product) ? data.product.product_code : '',
        product_type: !isEmpty(data.product) ? data.product.type : '',
        product_slug: !isEmpty(data.product) ? data.product.slug : '',
        category_id: !isEmpty(data.product) ? data.product.category_id : '',
        sub_category_id: !isEmpty(data.product) ? data.product.sub_category_id : '',
        certificate_no: !isEmpty(data.certificate_no) ? data.certificate_no : '',
        product_image: image,
        cart_material: cartMaterials,
        sub_total: priceFormat(sub_total),
        total_making_charge : priceFormat(total_making_charge),
        price : price,
        total_price : total_price,
        sub_total_display: displayAmount(sub_total),
        total_making_charge_display : displayAmount(total_making_charge),
        total_price_display : displayAmount(total_price),
        total_gst: total_gst,
        total_gst_display: displayAmount(total_gst),
        size_materials: size_materials,
        promocode_discount: priceFormat(data.promocode_discount),
        promocode: data.promocode,
        promocode_id: data.promocode_id,
        total_price_without_dis: total_price_without_dis,
        total_price_without_dis_display: displayAmount(total_price_without_dis),
        have_offer: total_price_without_dis > total_price ? true : false,
        is_manual: data.is_manual,
        manual_weight: manual_weight,
        manual_qty: manual_qty,
        sub_price: sub_price,
        making_charge_discount_amount: making_charge_discount_amount,
        making_charge_discount_percent: making_charge_discount_percent,
        total_discount: priceFormat(total_discount),
        price_without_tax: price_without_tax,
        igst: igst,
        cgst: cgst,
        sgst: sgst
    }
}

module.exports = {
    CartCollection
}
