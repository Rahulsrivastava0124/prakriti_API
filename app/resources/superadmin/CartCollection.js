const {
  mapConcurrent, isObject, isEmpty, productTypeDisplay, isArray, priceFormat } = require("@helpers/helper");
const {CartMaterialCollection} = require("@resources/superadmin/CartMaterialCollection");
const {calculateProductPriceCart, isAdmin, isDistributor, isSuperAdmin} = require("@library/common");
const { Op, QueryTypes } = require("sequelize");
const db = require("@models");
const stockModel = db.stocks
const _ = require("lodash");
const sequelize = db.sequelize;
const orderMaterialsModel = db.order_materials;
const orderProductModel = db.order_products;

const CartCollection = async(data, req) => {
    if(isObject(data)){
        return await getModelObject(data, req);
    }else{
        return await mapConcurrent(data, (item, i) => getModelObject(item, req));

    }
}

const getModelObject = async (data, req) => {
    const {order_id, from_order_price} = req.query;
    let cartMaterial = !isEmpty(data.cartMaterial) ? CartMaterialCollection(data.cartMaterial) : [];
    let taxInfo = null;
      if('tax' in data.product && data.product.tax){
        taxInfo = {
            name: data.product.tax.name,
            cgst: parseFloat(data.product.tax.cgst),
            sgst: parseFloat(data.product.tax.sgst),
            igst: parseFloat(data.product.tax.igst),
        }
    }
    let priceFor = 'admin';
    if(isAdmin(req)){
        priceFor = 'distributor';
    }else if(isDistributor(req)){
        priceFor = 'retailer';
    }
    let quantity = 1;
    let priceMaterials = await calculateProductPriceCart(data.cartMaterial, data.product.sub_category, data.product.type == "material", priceFor, null, true);
    cartMaterial.forEach((material, index) => {
        let priceObj = _.filter(priceMaterials.materials, {material_id: material.material_id});
        let amount = 0, rate = 0, per_gram_price = 0, discount_percent = 0, total_gram = 0, discount_amount = 0;
        if(priceObj){
            amount = priceObj[0].price;
            per_gram_price = priceObj[0].mrp;
            rate = priceObj[0].unit_based_mrp;
            discount_percent = priceObj[0].discount_percent;
            total_gram = priceObj[0].total_gram;
            discount_amount = priceObj[0].discount_amount;
        }
        cartMaterial[index].amount = priceFormat(amount + discount_amount);
        cartMaterial[index].per_gram_price = per_gram_price;
        cartMaterial[index].rate = rate;
        cartMaterial[index].discount_percent = discount_percent;
        cartMaterial[index].max_discount_percent = discount_percent;
        cartMaterial[index].discount_amount = discount_amount;
        cartMaterial[index].total_gram = total_gram;
    });


    let making_charge = priceFormat(priceMaterials.making_charge + priceMaterials.making_charge_discount_amount);
    let sub_price = priceFormat(priceMaterials.price + priceMaterials.total_material_discount + making_charge);
    let making_charge_discount_percent = priceFormat(priceMaterials.making_charge_discount_percent, true);
    let making_charge_discount_amount = priceMaterials.making_charge_discount_amount;
    let rep = 0;
    let total = priceFormat(priceMaterials.price + priceMaterials.making_charge);
    let total_weight = priceMaterials.total_weight;
    let total_discount = priceFormat(priceMaterials.total_discount);
    let sub_category = data.product.sub_category;
    let total_amount = priceFormat(priceMaterials.price + priceMaterials.making_charge);


    /**
     * replace price if sale from order and price will come from order
     */
    if(!isEmpty(order_id) && from_order_price == 1){
        let thisCon = {order_id: order_id, product_id: data.product_id};
        if(isEmpty(data.size_id)){
            thisCon = {...thisCon, size_id: 0}
        }else{
            thisCon = {...thisCon, size_id: data.size_id}
        }
        let orderProduct = await orderProductModel.findOne({
            where: thisCon,
            include: [
                {
                  model: orderMaterialsModel,
                  as: 'orderProductMaterials',
                  separate: true
                }
            ]
        });
        let isMatched = false;
        if(orderProduct && orderProduct.orderProductMaterials.length == cartMaterial.length){
            let numMatched = 0;
            for(let i = 0; i < orderProduct.orderProductMaterials.length; i++){
                let item = orderProduct.orderProductMaterials[i];
                let thisM = _.filter(cartMaterial, {material_id: item.material_id});
                if(thisM.length && thisM[0].material_id == item.material_id && thisM[0].purity_id == item.purity_id && thisM[0].unit_id == item.unit_id){
                    numMatched++;
                }
            }
            if(numMatched == orderProduct.orderProductMaterials.length){
                isMatched = true;
            }
        }
        if(isMatched){
            for(let i = 0; i < orderProduct.orderProductMaterials.length; i++){
                let item = orderProduct.orderProductMaterials[i];
                let index =  _.findIndex(cartMaterial, (x) => x.material_id == item.material_id);
                if(index !== -1){
                    cartMaterial[index].amount = item.price;
                    cartMaterial[index].per_gram_price = item.per_gram_price;
                    cartMaterial[index].rate = item.rate;
                    cartMaterial[index].discount_percent = item.discount_percent;
                    cartMaterial[index].max_discount_percent = item.discount_percent;
                    cartMaterial[index].discount_amount = item.discount;
                    cartMaterial[index].total_gram = item.total_gram;
                }
            }

            making_charge = priceFormat(orderProduct.making_charge + orderProduct.making_charge_discount_amount);
            sub_price = orderProduct.sub_price;
            making_charge_discount_percent = priceFormat(orderProduct.making_charge_discount_percent, true);
            making_charge_discount_amount = orderProduct.making_charge_discount_amount;
            total = orderProduct.price_without_tax;
            total_weight = orderProduct.total_weight;
            total_discount = orderProduct.total_discount;
            total_amount = orderProduct.price_without_tax;

        }
    }


    return {
        id: data.id,
        product_id: data.product_id,
        product_type: !isEmpty(data.product) ? data.product.type : '',
        product_name: !isEmpty(data.product) ? data.product.name : '',
        product_code: !isEmpty(data.product) ? data.product.product_code : '',
        certificate_no: data.stock ? data.stock.certificate_no : data.certificate_no,
        current_image:data.current_image,
        size_id: !isEmpty(data.size_id) ? data.size_id : '',
        size_name: !isEmpty(data.size) ? data.size.name : '',
        making_charge: making_charge,
        making_charge_discount_percent: making_charge_discount_percent,
        max_making_charge_discount_percent: making_charge_discount_percent,
        making_charge_discount_amount: making_charge_discount_amount,
        total_discount: total_discount,
        stock_id: data.stock_id,
        quantity: data.quantity,
        sale_product_id: data.sale_product_id,
        category_id: !isEmpty(data.product) ? data.product.category_id : 0,
        sub_category_id: !isEmpty(data.product) ? data.product.sub_category_id : 0,
        total_weight: total_weight,
        sub_price: sub_price,
        rep: rep,
        cgst_tax: 0,
        sgst_tax: 0,
        igst_tax: 0,
        total: total,
        tax_info: taxInfo,
        total_tax: 0,
        materials: cartMaterial,
        sub_cat_making_charge: sub_category ? sub_category.making_charge : 0,
        sub_cat_making_charge_type: sub_category ? sub_category.making_charge_type : '',
        total_amount: total_amount,
        order_product_id: data.order_product_id ?? 0,
        is_held: data.is_held || false,
        hold_message: data.hold_message || '',
        hold_at: data.hold_at || null
    }
}

module.exports = {
    CartCollection
}
