const { isObject, isEmpty, productTypeDisplay, isArray, priceFormat } = require("@helpers/helper");
const {SaleCartMaterialCollection} = require("@resources/distributor/SaleCartMaterialCollection");
const {calculateProductPriceCart} = require("@library/common");
const _ = require("lodash");

const SaleCartCollection = async(data) => {
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

const getModelObject = async (data) => {
    let cartMaterial = !isEmpty(data.cartMaterial) ? SaleCartMaterialCollection(data.cartMaterial) : [];
    let taxInfo = null;
      if('tax' in data.product && data.product.tax){
        taxInfo = {
            name: data.product.tax.name,
            cgst: parseFloat(data.product.tax.cgst),
            sgst: parseFloat(data.product.tax.sgst),
            igst: parseFloat(data.product.tax.igst),
        }
    }
    let priceMaterials = await calculateProductPriceCart(data.cartMaterial, data.product.sub_category, data.product.type == "material", 'retailer');
    cartMaterial.forEach((material, index) => {
        let priceObj = _.filter(priceMaterials.materials, {material_id: material.material_id});
        let amount = 0, rate = 0, discount_percent = 0, total_gram = 0, discount_amount = 0;
        if(priceObj){
            amount = priceObj[0].price;
            rate = priceObj[0].mrp;
            discount_percent = priceObj[0].discount_percent;
            total_gram = priceObj[0].total_gram;
            discount_amount = priceObj[0].discount_amount;
        }
        cartMaterial[index].amount = amount;
        cartMaterial[index].rate = rate;
        cartMaterial[index].discount_percent = discount_percent;
        cartMaterial[index].discount_amount = discount_amount;
        cartMaterial[index].total_gram = total_gram;
    });
    let sub_price = priceMaterials.price;
    let making_charge = priceMaterials.making_charge;
    let making_charge_discount_percent = priceMaterials.making_charge_discount_percent;
    let making_charge_discount_amount = priceMaterials.making_charge_discount_amount;
    let rep = 0;
    let total_amount = priceFormat(sub_price + making_charge);
    let total_weight = priceMaterials.total_weight;
    let total_discount = priceMaterials.total_discount;

    let sub_category = data.product.sub_category;

    return {        
        id: data.id,
        product_id: data.product_id,
        product_type: !isEmpty(data.product) ? data.product.type : '',
        product_name: !isEmpty(data.product) ? data.product.name : '',
        certificate_no: data.stock.certificate_no,
        size_id: !isEmpty(data.size_id) ? data.size_id : '',
        size_name: !isEmpty(data.size) ? data.size.name : '',
        making_charge: making_charge,
        making_charge_discount_percent: making_charge_discount_percent,
        making_charge_discount_amount: making_charge_discount_amount,
        total_discount: total_discount,
        stock_id: data.stock_id,
        category_id: !isEmpty(data.product) ? data.product.category_id : 0,
        sub_category_id: !isEmpty(data.product) ? data.product.sub_category_id : 0,
        total_weight: total_weight,
        sub_price: sub_price,
        rep: rep,
        cgst_tax: 0,
        sgst_tax: 0,
        igst_tax: 0,
        total_amount: total_amount,
        tax_info: taxInfo,
        total_tax: 0,
        materials: cartMaterial,
        sub_cat_making_charge: sub_category ? sub_category.making_charge : 0,
        sub_cat_making_charge_type: sub_category ? sub_category.making_charge_type : '',
    }
}

module.exports = {
    SaleCartCollection
}
