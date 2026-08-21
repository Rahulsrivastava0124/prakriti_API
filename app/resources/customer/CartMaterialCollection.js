const { isObject, isEmpty, priceFormat, displayAmount, convertUnitToGram } = require("@helpers/helper");
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
    let priceData = await getCartMaterialPrices(data, params.product_type == "material" ? true : false, params.dis_type);
    
    return {
        id: data.id,
        cart_id: data.cart_id,
        material_id: data.material_id,
        material: !isEmpty(data.material) ? data.material.name : '',
        weight: !isEmpty(data.weight) ? data.weight : '',  
        weight_in_gram: convertUnitToGram(data.unit ? data.unit.name : '', !isEmpty(data.weight) ? data.weight : ''),
        quantity: quantity, 
        price: !isEmpty(priceData) ? priceFormat(priceData.price): 0,
        sale_price: !isEmpty(priceData) ? priceFormat(priceData.sale_price): 0,
        discount: !isEmpty(priceData) ? priceData.discount : 0,
        discount_type: 'percent',
        total_price: priceFormat((priceData.sale_price)),
        rate: priceFormat((priceData.rate)),
        discount_percent: priceFormat((priceData.discount_percent)),
        per_gram_price: priceFormat((priceData.per_gram_price)),
        total_price_display: displayAmount(priceFormat((priceData.sale_price))),
        unit_id: data.unit_id,
        unit_name: data.unit ? data.unit.name : '',
        purity_name: data.purity ? data.purity.name : '',
        purity_id: !isEmpty(data.purity_id) ? data.purity_id : 0
    }
}

module.exports = {
    CartMaterialCollection
}
