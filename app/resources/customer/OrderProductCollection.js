const { isObject, isEmpty, productTypeDisplay, isArray, getFileAbsulatePath, displayAmount, priceFormat } = require("@helpers/helper");
const {OrderMaterialCollection} = require("@resources/customer/OrderMaterialCollection");
const db = require("@models");
const ProductReviewModel = db.product_reviews;

const OrderProductCollection = async(data, userId) => {
    if(isObject(data)){
        return await getModelObject(data, userId);
    }else{
        let arr = [];
        for(let i = 0; i < data.length; i++){
            arr.push(await getModelObject(data[i], userId));
        }
        return arr;
    }
}

const getModelObject = async(data, userId) => {
    let materials = !isEmpty(data.orderProductMaterials) ? OrderMaterialCollection(data.orderProductMaterials) : [];
    let image = '';
    if(data.product && isArray(data.product.images) && !isEmpty(data.product.main_image)){
        image = getFileAbsulatePath(data.product.main_image);
    }

    if(data.stock && data.stock.current_image && !isEmpty(data.stock.current_image)){
        image = getFileAbsulatePath(data.stock.current_image);
    }

    let haveReview = await ProductReviewModel.findOne({where: {user_id: userId, product_id: data.product_id}});

    return {        
        id: data.id,
        product_id: data.product_id,
        certificate_no: !isEmpty(data.stock) ? data.stock.certificate_no : '',
        category_id: !isEmpty(data.product) ? data.product.category_id : 0,
        product_type: !isEmpty(data.product) ? data.product.type : '',
        product_slug: !isEmpty(data.product) ? data.product.slug : '',
        product_type_diplay: !isEmpty(data.product) ? productTypeDisplay(data.product.type) : '',
        product_name: !isEmpty(data.product) ? data.product.name : '',
        size_id: !isEmpty(data.size_id) ? data.size_id : '',
        size_name: !isEmpty(data.size) ? data.size.name : '',
        quantity: data.quantity,
        materials: materials,
        image: image,
        rate: displayAmount(data.rate),
        have_review: haveReview ? true : false,
        making_charge: priceFormat(data.making_charge),
        sub_price: priceFormat(data.sub_price),
        total: parseFloat(data.total)
    }
}

module.exports = {
    OrderProductCollection
}
