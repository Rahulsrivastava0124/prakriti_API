const { isObject, isEmpty, getFileAbsulatePath, isArray, productTypeDisplay, displayAmount, priceFormat } = require("@helpers/helper");
const {ProductSizeCollection} = require("@resources/retailer/ProductSizeCollection");
const {ProductMaterialCollection} = require("@resources/retailer/ProductMaterialCollection");
//const {StocksCollection} = require("@resources/retailer/StocksCollection");
const {calculateProductPriceByPurity} = require("@library/common");


const ProductCollection = async (data) => {
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

    let stocks = [];
    let sub_making_charge_type = data.sub_category ? data.sub_category.making_charge_type : '';
    let sub_making_charge = data.sub_category ? data.sub_category.making_charge : '';
    for(let i = 0; i < data.stocks.length; i++){
        let thisStock = data.stocks[i];
        let size_id = thisStock.size_id;
        let size_name = thisStock.size ? thisStock.size.name : '';
        let priceMaterials = await calculateProductPriceByPurity(thisStock.stockMaterials, sub_making_charge, sub_making_charge_type, data.type == "material" ? true : false);
        stocks.push({
            stock_id: thisStock.id,
            size_id: size_id,
            size_name: size_name,
            quantity: thisStock.quantity,
            total_weight: priceMaterials.total_weight,
            materials: priceMaterials.materials,
            price: priceMaterials.price,
            making_charge: priceMaterials.making_charge,
            making_charge_display: displayAmount(priceMaterials.making_charge),
            total_price: priceFormat(priceMaterials.making_charge + priceMaterials.price),
            total_price_display: displayAmount(priceFormat(priceMaterials.making_charge + priceMaterials.price))
        });
    }

    let certificate_details = {
        name: data.certificate ? data.certificate.name : '',
        website: data.certificate ? data.certificate.website : '',
        logo: (data.certificate && !isEmpty(data.logo)) ? getFileAbsulatePath(data.certificate.logo): '',
    }
 
    return {
        id: data.id,
        name: data.name,
        slug: !isEmpty(data.slug) ? data.slug : '',
        category_name: data.category ? data.category.name : '',
        sub_category_name: data.sub_category ? data.sub_category.name : '',
        description: !isEmpty(data.description) ? data.description : '',
        type: data.type,
        type_diplay: productTypeDisplay(data.type),
        licence_no: !isEmpty(data.licence_no) ? data.licence_no : '',
        product_code: !isEmpty(data.product_code) ? data.product_code : '',
        images: images,
        video: video,
        stocks: stocks,
        certificate: certificate_details
    }
}

module.exports = {
    ProductCollection
}
