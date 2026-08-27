const { isObject, isEmpty, priceFormat, displayAmount, getFileAbsulatePath, isArray } = require("@helpers/helper");
const {CartMaterialCollection} = require("@resources/customer/CartMaterialCollection");

const WishlistCollection = async (data, role) => {
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


    let wishlistMaterials = !isEmpty(data.wishlistMaterial) ? await CartMaterialCollection(data.wishlistMaterial,{sub_category: sub_category,product_type: data.product ? data.product.type : "", dis_type: dis_type}) : [];
    let sub_total = 0, price_sub_total = 0, total_making_charge = 0, total_quantity = 0, total_weight = 0;
    for(let i=0;i<wishlistMaterials.length;i++){
        sub_total += wishlistMaterials[i].sale_price;
        price_sub_total += wishlistMaterials[i].price;
        total_weight += wishlistMaterials[i].weight_in_gram;
        total_quantity += wishlistMaterials[i].quantity;
    }
    
    let making_charge_discount_percent = 0;
    if(sub_category){
        sub_making_charge_type = sub_category ? sub_category.making_charge_type : '';
        sub_making_charge = sub_category ? sub_category.making_charge : '';
        making_charge_discount_percent = sub_category[macking_dis_type] || 0;
        if(sub_making_charge_type == "per_piece"){
            total_making_charge = priceFormat(parseFloat(sub_making_charge));
        }else if(sub_making_charge_type == "per_gram"){
            total_making_charge = priceFormat(total_weight * parseFloat(sub_making_charge));
        }
        let discount_amount = making_charge_discount_percent > 0 ? priceFormat(total_making_charge * making_charge_discount_percent / 100) : 0;
        price_sub_total += total_making_charge;
        total_making_charge = priceFormat(total_making_charge - discount_amount);
    }

    let total_price = priceFormat(priceFormat(sub_total) + total_making_charge);
    let total_gst = 0;
    if(taxInfo){
        let igst = 0;
        let cgst = (!isEmpty(taxInfo.cgst)) ? priceFormat(total_price * parseFloat(taxInfo.cgst) / 100, true) : 0;
        let sgst = (!isEmpty(taxInfo.sgst)) ? priceFormat(total_price * parseFloat(taxInfo.sgst) / 100, true) : 0;
        let p_cgst = (!isEmpty(taxInfo.cgst)) ? priceFormat(price_sub_total * parseFloat(taxInfo.cgst) / 100, true) : 0;
        let p_sgst = (!isEmpty(taxInfo.sgst)) ? priceFormat(price_sub_total * parseFloat(taxInfo.sgst) / 100, true) : 0;
        total_price += (igst + cgst + sgst);
        price_sub_total += (igst + p_cgst + p_sgst);
        total_gst = priceFormat(igst + cgst + sgst);
    }
    let price = priceFormat(total_price);
    total_price = priceFormat(total_price);
    let total_price_without_dis = priceFormat(price_sub_total);

    let image = data.product && !isEmpty(data.product.main_image) ? getFileAbsulatePath(data.product.main_image) : '';
    let current_image = data.stock && !isEmpty(data.stock.current_image) ? getFileAbsulatePath(data.stock.current_image) : '';
   
    return {        
        id: data.id,
        product_id: data.product_id,
        user_id: data.user_id,
        size_id: !isEmpty(data.size_id) ? data.size_id : '',
        quantity: 1,
        size_name: !isEmpty(data.size) ? data.size.name : '',
        product_name: !isEmpty(data.product) ? data.product.name : '',
        product_code: !isEmpty(data.product) ? data.product.product_code : '',
        product_type: !isEmpty(data.product) ? data.product.type : '',
        product_slug: !isEmpty(data.product) ? data.product.slug : '',
        category_id: !isEmpty(data.product) ? data.product.category_id : '',
        sub_category_id: !isEmpty(data.product) ? data.product.sub_category_id : '',
        certificate_no: data.stock && !isEmpty(data.stock.certificate_no) ? data.stock.certificate_no : '',
        product_image: image,
        wishlist_material: wishlistMaterials,
        sub_total: priceFormat(sub_total),
        total_making_charge : priceFormat(total_making_charge),
        price : price,
        total_price : total_price,
        sub_total_display: displayAmount(sub_total),
        total_making_charge_display : displayAmount(total_making_charge),
        total_price_display : displayAmount(total_price),
        total_gst: total_gst,
        total_gst_display: displayAmount(total_gst),
        total_price_without_dis: total_price_without_dis,
        total_price_without_dis_display: displayAmount(total_price_without_dis),
        have_offer: total_price_without_dis > total_price ? true : false,
        making_charge_dis_percent: priceFormat(making_charge_discount_percent, true),
        current_image: current_image
    }
}

module.exports = {
    WishlistCollection
}
