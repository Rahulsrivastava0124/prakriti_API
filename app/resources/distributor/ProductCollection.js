const { isObject, getFileAbsulatePath, isEmpty, productTypeDisplay, displayAmount, priceFormat, isArray } = require("@helpers/helper");
const {calculateProductPriceCart} = require("@library/common");
const {StockMaterialCollection} = require("@resources/distributor/StockMaterialCollection");
const _ = require("lodash");

const ProductCollection = async(data) => {
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
    let images = [];
    if(isArray(data.images)){
        for(let i = 0; i < data.images.length; i++){
            images.push({
                file_name: data.images[i].file_name,
                path: getFileAbsulatePath(data.images[i].path),
            })
        }
    }
    let video = '';
    if(!isEmpty(data.video)){
        video = getFileAbsulatePath(data.video);
    }

    let sizes = [], stock = {};
    if(data.type != "material"){
        for(let i = 0; i < data.stocks.length; i++){
            let thisStock = data.stocks[i];
            let materials = StockMaterialCollection(thisStock.stockMaterials);
            let priceMaterials = await calculateProductPriceCart(thisStock.stockMaterials, data.sub_category, false, 'distributor');
            materials.forEach((material, index) => {
                let priceObj = _.filter(priceMaterials.materials, {material_id: material.material_id});
                let price = 0;
                if(priceObj){
                    price = priceObj[0].price;
                }
                materials[index].price = price;
                materials[index].price_display = displayAmount(price);
            });
            let thisObj = {
                stock_id: thisStock.id,
                size_id: thisStock.size_id,
                size_name: thisStock.size ? thisStock.size.name : '',
                certificate_no: thisStock.certificate_no,
                weight: priceFormat(priceMaterials.total_weight, true),
                materials: materials,
                price: priceMaterials.price,
                making_charge: priceMaterials.making_charge,
                total_price: priceFormat(priceMaterials.making_charge + priceMaterials.price),
                making_charge_display: displayAmount(priceMaterials.making_charge),
                total_price_display: displayAmount(priceFormat(priceMaterials.making_charge + priceMaterials.price))
            }
            sizes.push(thisObj);
        }
    }else{
        let priceMaterials = await calculateProductPriceCart(data.stocks[0].materials, data.sub_category, true, 'distributor');
        let materials = StockMaterialCollection(data.stocks[0].stockMaterials);
        stock = {
            stock_id: data.stocks[0].id,
            quantity: data.stocks[0].quantity,
            materials: materials,
            weight: priceFormat(priceMaterials.total_weight, true),
            price: priceMaterials.price,
            making_charge: priceMaterials.making_charge,
            making_charge_display: displayAmount(priceMaterials.making_charge),
            total_price: priceFormat(priceMaterials.making_charge + priceMaterials.price),
            total_price_display: displayAmount(priceFormat(priceMaterials.making_charge + priceMaterials.price))
        }
    }

    return {
        id: data.id,
        name: data.name,
        slug: !isEmpty(data.slug) ? data.slug : '',
        name: data.name,
        category_id: data.category_id,
        sub_category_id: data.sub_category_id,
        category_name: data.category ? data.category.name : '',
        sub_category_name: data.sub_category ? data.sub_category.name : '',
        images: images,
        video: video,
        product_code: data.product_code,
        description: !isEmpty(data.description) ? data.description : '',
        type: data.type,
        type_diplay: productTypeDisplay(data.type),
        licence_no: !isEmpty(data.licence_no) ? data.licence_no : '',
        sizes: sizes,
        stock: stock
    }
}

module.exports = {
    ProductCollection
}
