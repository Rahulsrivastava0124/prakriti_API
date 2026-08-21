const { isObject, isEmpty, getFileAbsulatePath, isArray, arrayColumn, productTypeDisplay, priceFormat, displayAmount, weightFormat, convertUnitToGram } = require("@helpers/helper");
const {ProductSizeCollection} = require("@resources/superadmin/ProductSizeCollection");
const {calculateProductPriceCart, calculateProductPrice, productHaveWishlist, getProductSizeMaterials, calculateProductPriceCartNew} = require("@library/common");
const db = require("@models");
const { Op } = require("sequelize");
const ProductSizeMaterialModel = db.product_size_materials;
const MaterialPricePurityModel = db.material_price_purities;
const MaterialPriceModel = db.material_prices;
const MaterialModel = db.materials;
const SizeModel = db.sizes;
const UnitModel = db.units;
const _ = require("lodash");

const NewProductListCollection = async (data, user_id) => {
    if(isObject(data)){
        return await getModelObject(data, user_id);
    }else{
        let arr = [];
        for(let i = 0; i < data.length; i++){
            arr.push(await getModelObject(data[i], user_id));
        }
        return arr;
    }
}

const getModelObject = async(data, req) => {
    let images = [];
    if(isArray(data.product.images)){
        for(let i = 0; i < data.product.images.length; i++){
            images.push({
                file_name: data.product.images[i].file_name,
                path: getFileAbsulatePath(data.product.images[i].path),
            })
        }
    }
    if(!isEmpty(data.current_image) && data.current_image.indexOf("/") > -1){
        images.unshift({
            file_name: data.current_image.split("/").pop(),
            path: getFileAbsulatePath(data.current_image),
        })
    }

    let main_image = isEmpty(data.current_image)?(!isEmpty(data.product.main_image) ? getFileAbsulatePath(data.product.main_image) : ''):getFileAbsulatePath(data.current_image);
    let video = '';
    if(!isEmpty(data.product.video)){
        video = getFileAbsulatePath(data.product.video);
    }

    let taxInfo = null;
    if('tax' in data.product && data.product.tax){
        taxInfo = {
            name: data.product.tax.name,
            cgst: parseFloat(data.product.tax.cgst),
            sgst: parseFloat(data.product.tax.sgst),
            igst: parseFloat(data.product.tax.igst),
        }
    }
    //console.log("data.product_id : ", data.product_id);
    //console.log("data.product.id : ", data.product.id);
    //let size_materials = await getProductSizeMaterials(data.product_id, data.product.type, true, req.role, taxInfo, data.product.sub_category, true);
    //let product_price_info = await calculateProductPriceCart(data.stockMaterials, data.product.sub_category, data.product.type == "material", 'admin', taxInfo);
    let size_materials = await calculateProductPriceCartNew(data, data.product.sub_category, data.product.type == "material", req.role, taxInfo);
    console.log("size_materials : ", size_materials);
    let total_mrp_price = size_materials.total_mrp_price ? size_materials.total_mrp_price : 0;
    let total_sale_price = size_materials.total_sale_price ? size_materials.total_sale_price : 0;
    let making_charge_dis_percent = size_materials.making_charge_discount_percent ? size_materials.making_charge_discount_percent : 0;
    let discount_percent = size_materials.discount_percent ? size_materials.discount_percent : 0;

    let has_wishlist = await productHaveWishlist(data.product.id, req.userId);

    return {
        id: data.product.id,
        name: data.product.name,
        slug: data.product.slug,
        product_code: data.product.product_code,
        description: data.product.description,
        short_desc: data.product.short_desc,
        keywords: data.product.keywords,
        meta_title: data.product.meta_title,
        type: data.product.type,
        type_diplay: productTypeDisplay(data.product.type),
        description: data.product.description,
        licence_no: data.product.licence_no,
        status: data.product.status,
        certified: data.product.certified,
        certificate_no: data.certificate_no,
        certified_display: data.product.certified ? 'Yes' : 'No',
        images: images,
        video: video,
        default_image: main_image,
        size_materials: [size_materials],
        mrp: total_mrp_price,
        mrp_display: displayAmount(total_mrp_price),
        sale_price: total_sale_price,
        sale_price_display: displayAmount(total_sale_price),
        have_offer: total_mrp_price > total_sale_price ? true : false,
        total_save: total_mrp_price > total_sale_price ? priceFormat(total_mrp_price - total_sale_price) : 0,
        making_charge_dis_percent: making_charge_dis_percent,
        has_wishlist: has_wishlist,
        discount_percent: priceFormat(discount_percent)
    }
}

module.exports = {
    NewProductListCollection
}
