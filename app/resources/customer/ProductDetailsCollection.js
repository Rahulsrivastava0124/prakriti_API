const { isObject, isEmpty, getFileAbsulatePath, isArray, arrayColumn, productTypeDisplay, priceFormat, displayAmount, weightFormat, convertUnitToGram } = require("@helpers/helper");
const {ProductSizeCollection} = require("@resources/superadmin/ProductSizeCollection");
const {ProductCertificateCollection} = require("@resources/customer/ProductCertificateCollection");
const {calculateProductPrice, getProductSizeMaterials, productHaveWishlist} = require("@library/common");
const db = require("@models");
const { Op } = require("sequelize");
const ProductSizeMaterialModel = db.product_size_materials;
const MaterialModel = db.materials;
const SizeModel = db.sizes;
const UnitModel = db.units;
const PurityModel = db.purities;
const MaterialPricePurityModel = db.material_price_purities;
const MaterialPriceModel = db.material_prices;
const _ = require("lodash");

const ProductDetailsCollection = async(data, req) => {
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
    let main_image = '';
    if(!isEmpty(data.main_image)){
        main_image = getFileAbsulatePath(data.main_image);
        images.push(main_image);
    }
    if(isArray(data.images)){
        for(let i = 0; i < data.images.length; i++){
            images.push(getFileAbsulatePath(data.images[i].path))
        }
    }
    
    let video = '';
    if(!isEmpty(data.video)){
        video = getFileAbsulatePath(data.video);
    }

    let sizes = ProductSizeCollection(data.sizes);
    sizes.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));

    let certificates = ProductCertificateCollection(data.certificates);

    let taxInfo = null;
    if('tax' in data && data.tax){
        taxInfo = {
            name: data.tax.name,
            cgst: parseFloat(data.tax.cgst),
            sgst: parseFloat(data.tax.sgst),
            igst: parseFloat(data.tax.igst),
        }
    }

    let size_materials = await getProductSizeMaterials(data.id, data.type, true, req.role, taxInfo, data.sub_category);

    /*for(let i = 0; i < size_materials.length; i++){
        let size_material = size_materials[i];

        let total_mrp_price = 0, total_sale_price = 0, total_weight = 0, total_quantity = 0;
        for(let x = 0; x < size_material.materials.length; x++){
            let material = size_material.materials[x];
            let purityIds = arrayColumn(material.purities, 'id');
            let purities = [];
            let materialPriceObj = await MaterialPriceModel.findOne({ where: { material_id: material.material_id },
                include: [
                    {
                        model: MaterialPricePurityModel,
                        as: 'materialPricePurities',
                        where: {purity_id: {[Op.in]: purityIds}},
                        separate: true,
                    }
                ]
            });
            let material_price = 0, mrp_price = 0, discount_percent = 0;
            if(materialPriceObj && materialPriceObj.materialPricePurities.length){
                total_gram = convertUnitToGram(material.unit_name, material.weight);
                total_weight += parseFloat(total_gram);
                total_quantity += parseInt(material.quantity);
                for(let p = 0; p < materialPriceObj.materialPricePurities.length; p++){
                    let materialPrice = materialPriceObj.materialPricePurities[p];
                    let discount = materialPrice[dis_type] ? materialPrice[dis_type] : 0
                    let price = materialPrice.per_gram_price - (materialPrice.per_gram_price * discount / 100);
                    price = priceFormat(price * parseFloat(total_gram));
                    let price_without_dis = priceFormat(materialPrice.per_gram_price * parseFloat(total_gram));
                    let m = _.filter(material.purities, {id: materialPrice.purity_id});
                    purities.push({
                        id: materialPrice.purity_id,
                        name: m[0].name,
                        price: price,
                        mrp_price: price_without_dis,
                        is_selected: p == 0 ? true : false,
                        discount_percent: priceFormat(discount, true)
                    });
                    if(p == 0){
                        total_mrp_price += price_without_dis;
                        total_sale_price += price;
                        material_price = price;
                        mrp_price = price_without_dis;
                        discount_percent = priceFormat(discount, true);
                    }
                }
            }

            //set price data
            size_material.materials[x].purities = purities;
            size_material.materials[x].price = material_price;
            size_material.materials[x].mrp_price = mrp_price;
            size_material.materials[x].discount_percent = discount_percent;
        }

        //manage making charge & tax
        let total_making_charge = 0;
        total_weight = weightFormat(total_weight);
        let making_charge_type = data.sub_category.making_charge_type;
        let making_charge = data.sub_category.making_charge;
        let making_charge_discount_percent = data.sub_category[macking_dis_type] || 0;
        if(making_charge_type == "per_piece"){
            total_making_charge = priceFormat(parseFloat(making_charge));
        }else if(making_charge_type == "per_gram"){
            total_making_charge = priceFormat(total_weight * parseFloat(making_charge));
        }
        let discount_amount = making_charge_discount_percent > 0 ? priceFormat(total_making_charge * making_charge_discount_percent / 100) : 0;
        total_mrp_price += total_making_charge;
        let total_making_charge_mrp = total_making_charge;
        total_making_charge = priceFormat(total_making_charge - discount_amount);
        total_sale_price += total_making_charge;

        let total_gst = 0;
        if(taxInfo){
            let igst = 0;
            let cgst = (!isEmpty(taxInfo.cgst)) ? priceFormat(total_sale_price * parseFloat(taxInfo.cgst) / 100, true) : 0;
            let sgst = (!isEmpty(taxInfo.sgst)) ? priceFormat(total_sale_price * parseFloat(taxInfo.sgst) / 100, true) : 0;
            let cgst_m = (!isEmpty(taxInfo.cgst)) ? priceFormat(total_mrp_price * parseFloat(taxInfo.cgst) / 100, true) : 0;
            let sgst_m = (!isEmpty(taxInfo.sgst)) ? priceFormat(total_mrp_price * parseFloat(taxInfo.sgst) / 100, true) : 0;
            total_mrp_price += (igst + cgst_m + sgst_m);
            total_sale_price += (igst + cgst + sgst);
            total_gst = priceFormat(igst + cgst + sgst);
        }

        let product_weight_display = '';
        if(data.type == "material"){
            product_weight_display = size_material.materials[0].weight + ' ' + size_material.materials[0].unit_name;
        }else{
            product_weight_display = total_weight + ' gram';
        }

        let discount_percent = total_mrp_price > total_sale_price ? Math.round(priceFormat(((total_mrp_price - total_sale_price) / total_mrp_price) * 100)) : 0;

        size_materials[i].mrp_price = priceFormat(total_mrp_price);
        size_materials[i].sale_price = priceFormat(total_sale_price);
        size_materials[i].making_charge = priceFormat(total_making_charge);
        size_materials[i].making_charge_mrp = priceFormat(total_making_charge_mrp);
        size_materials[i].total_gst = total_gst;
        size_materials[i].have_offer = total_mrp_price > total_sale_price ? true : false,
        size_materials[i].making_charge_dis_percent = priceFormat(making_charge_discount_percent, true);
        size_materials[i].product_weight_display = product_weight_display;
        size_materials[i].product_weight_display = product_weight_display;
        size_materials[i].discount_percent = discount_percent;
    }*/

    let has_wishlist = await productHaveWishlist(data.id, req.userId);

    return {
        id: data.id,
        name: data.name,
        product_code: data.product_code,
        description: data.description,
        short_desc: data.short_desc,
        keywords: data.keywords,
        meta_title: data.meta_title,
        type: data.type,
        type_diplay: productTypeDisplay(data.type),
        description: data.description,
        licence_no: data.licence_no,
        certified: data.certified,
        certified_display: data.certified ? 'Yes' : 'No',
        images: images,
        video: video,
        sizes: sizes,
        certificates: certificates,
        category: data.category ? data.category.name : '',
        category_slug: data.category ? data.category.slug : '',
        sub_category: data.sub_category ? data.sub_category.name : '',
        sub_category_slug: data.sub_category ? data.sub_category.slug : '',
        tax_info: taxInfo,
        default_image: main_image,
        size_materials: size_materials,
        rating: parseFloat(parseFloat(data.avg_rating).toFixed(1)),
        has_wishlist: has_wishlist
    }
}

module.exports = {
    ProductDetailsCollection
}
