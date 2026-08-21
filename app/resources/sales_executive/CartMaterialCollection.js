const { isObject, isEmpty, priceFormat, displayAmount } = require("@helpers/helper");
const { getCartMaterialPrices } = require("@library/common");

const CartMaterialCollection = async(data,params) => {
    if(isObject(data)){
        return  await getModelObject(data, params);
    }else{
        let arr = [];
        for(let i = 0; i < data.length; i++){
            arr.push(await getModelObject(data[i], params));
        }
        return arr;
    }
}

const getModelObject = async (data, params) => {
    let sub_making_charge_type = '', sub_making_charge = '',total_making_charge = 0;
    let quantity = !isEmpty(data.quantity) ? parseInt(data.quantity) : 0;
    // get cart material price cal
    let priceData = await getCartMaterialPrices(data, params.product_type == "material" ? true : false);
    
    if(isObject(params) && "sub_category" in params){
        sub_making_charge_type = params.sub_category ? params.sub_category.making_charge_type : '';
        sub_making_charge = params.sub_category ? params.sub_category.making_charge : '';

        if(sub_making_charge_type == "per_piece"){
            total_making_charge = parseFloat(sub_making_charge);
        }else if(sub_making_charge_type == "per_gram"){
            total_making_charge = priceFormat(data.weight * parseFloat(sub_making_charge));
        }

    }
    return {
        id: data.id,
        cart_id: data.cart_id,
        material_id: data.material_id,
        material: !isEmpty(data.material) ? data.material.name : '',
        weight: !isEmpty(data.weight) ? data.weight : '',  
        quantity: quantity, 
        price: !isEmpty(priceData) ? priceFormat(priceData.price): "",
        discount: !isEmpty(priceData) ? priceData.discount : "",
        discount_type: !isEmpty(priceData) ? 'percent' : '',
        making_charge: priceFormat(total_making_charge),
        making_charge_display: displayAmount(total_making_charge),
        total_price: priceFormat((priceData.price)),
        total_price_display: displayAmount(priceFormat((priceData.price))),
        unit_id: data.unit_id,
        unit_name: data.unit ? data.unit.name : '',
        purity_name: data.purity ? data.purity.name : '',
        purity_id: !isEmpty(data.purity_id) ? data.purity_id : 0
    }
}

module.exports = {
    CartMaterialCollection
}
