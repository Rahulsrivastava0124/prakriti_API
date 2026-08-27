const { isObject, isEmpty, priceFormat, displayAmount, getFileAbsulatePath, isArray } = require("@helpers/helper");
const {CartMaterialCollection} = require("@resources/retailer/CartMaterialCollection");

const CartCollection = async (data) => {
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
    let cartMaterials = !isEmpty(data.cartMaterial) ? await CartMaterialCollection(data.cartMaterial,{sub_category: data.product && data.product.sub_category ? data.product.sub_category : null,product_type: data.product ? data.product.type : ""}) : [];
    let sub_total=0; total_making_charge = 0;
    for(let i=0;i<cartMaterials.length;i++){
        sub_total += cartMaterials[i].price;
        total_making_charge += cartMaterials[i].making_charge;
    }

    let image = '';
    if(data.product && isArray(data.product.images) && data.product.images.length){
        image = getFileAbsulatePath(data.product.images[0].path);
    }
   
    return {        
        id: data.id,
        product_id: data.product_id,
        user_id: data.user_id,
        size_id: !isEmpty(data.size_id) ? data.size_id : '',
        stock_id: !isEmpty(data.stock_id) ? data.stock_id : '',
        discount: !isEmpty(data.discount) ? data.discount : '',
        discount_type: !isEmpty(data.discount_type) ? data.discount_type : '',
        rate: !isEmpty(data.rate) ? data.rate : '',
        quantity: data.quantity,
        size_name: !isEmpty(data.size) ? data.size.name : '',
        product_name: !isEmpty(data.product) ? data.product.name : '',
        product_code: !isEmpty(data.product) ? data.product.product_code : '',
        certificate_no: !isEmpty(data.certificate_no) ? data.certificate_no : '',
        product_image: image,
        cart_material: cartMaterials,
        sub_total: priceFormat(sub_total),
        total_making_charge : priceFormat(total_making_charge),
        total_price : priceFormat(sub_total) + priceFormat(total_making_charge),
        sub_total_display: displayAmount(sub_total),
        total_making_charge_display : displayAmount(total_making_charge),
        total_price_display : displayAmount(priceFormat(sub_total) + priceFormat(total_making_charge))
    }
}

module.exports = {
    CartCollection
}
