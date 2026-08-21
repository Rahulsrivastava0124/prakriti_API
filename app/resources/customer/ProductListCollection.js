const { isObject, isEmpty, getFileAbsulatePath, isArray, arrayColumn, productTypeDisplay, priceFormat, displayAmount, weightFormat, convertUnitToGram } = require("@helpers/helper");
const {ProductSizeCollection} = require("@resources/superadmin/ProductSizeCollection");
const {calculateProductPrice, productHaveWishlist, getProductSizeMaterials} = require("@library/common");
const db = require("@models");
const { Op } = require("sequelize");
const ProductSizeMaterialModel = db.product_size_materials;
const MaterialPricePurityModel = db.material_price_purities;
const MaterialPriceModel = db.material_prices;
const MaterialModel = db.materials;
const SizeModel = db.sizes;
const UnitModel = db.units;
const _ = require("lodash");

const ProductListCollection = async(data, req) => {
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

const getModelObject = async(data, req) => {
    let images = [];
    if(isArray(data.images)){
        for(let i = 0; i < data.images.length; i++){
            images.push({
                file_name: data.images[i].file_name,
                path: getFileAbsulatePath(data.images[i].path),
            })
        }
    }
    let main_image = !isEmpty(data.main_image) ? getFileAbsulatePath(data.main_image) : '';
    let video = '';
    if(!isEmpty(data.video)){
        video = getFileAbsulatePath(data.video);
    }

    let taxInfo = null;
    if('tax' in data && data.tax){
        taxInfo = {
            name: data.tax.name,
            cgst: parseFloat(data.tax.cgst),
            sgst: parseFloat(data.tax.sgst),
            igst: parseFloat(data.tax.igst),
        }
    }

    let size_materials = await getProductSizeMaterials(data.id, data.type, true, req.role, taxInfo, data.sub_category, true);
    let total_mrp_price = size_materials.length ? size_materials[0].mrp_price : 0;
    let total_sale_price = size_materials.length ? size_materials[0].sale_price : 0;
    let making_charge_dis_percent = size_materials.length ? size_materials[0].making_charge_dis_percent : 0;
    let discount_percent = size_materials.length ? size_materials[0].discount_percent : 0;

    let has_wishlist = await productHaveWishlist(data.id, req.userId);

    return {
        id: data.id,
        name: data.name,
        slug: data.slug,
        product_code: data.product_code,
        description: data.description,
        short_desc: data.short_desc,
        keywords: data.keywords,
        meta_title: data.meta_title,
        type: data.type,
        type_diplay: productTypeDisplay(data.type),
        description: data.description,
        licence_no: data.licence_no,
        status: data.status,
        certified: data.certified,
        certified_display: data.certified ? 'Yes' : 'No',
        images: images,
        video: video,
        default_image: main_image,
        size_materials: size_materials,
        mrp: total_mrp_price,
        mrp_display: displayAmount(priceFormat(total_mrp_price).toFixed(0), false, true, false),
        sale_price: total_sale_price,
        sale_price_display: displayAmount(priceFormat(total_sale_price).toFixed(0), false, true, false),
        have_offer: total_mrp_price > total_sale_price ? true : false,
        total_save: total_mrp_price > total_sale_price ? displayAmount(priceFormat(total_mrp_price - total_sale_price).toFixed(0), false, true, false) : 0,
        making_charge_dis_percent: making_charge_dis_percent,
        has_wishlist: has_wishlist,
        discount_percent: discount_percent
    }
}

module.exports = {
    ProductListCollection
}
