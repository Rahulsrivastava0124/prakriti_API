const { isObject, getFileAbsulatePath, isEmpty, arrayColumn, formatDateTime, priceFormat, displayAmount } = require("@helpers/helper");
const { Op } = require("sequelize");
const db = require("@models");
const ProductModel = db.products;

const PromocodeCollection = async(data) => {
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

const getModelObject = async(data) => {
    let products = data.products.split(",");
    let productsArr = products.length ? await ProductModel.findAll({where: {id: {[Op.in]: products}}, attributes: ['name'], raw : true}) : [];
    let display_products = arrayColumn(productsArr, 'name');
    display_products = display_products.join(", ");
    let discount_display = '';
    if(data.discount_type == "flat"){
        discount_display = displayAmount(data.discount);
    }else{
        discount_display = priceFormat(data.discount, true) + '%';
    }
    products = products.map(function(item) {
        return parseInt(item, 10);
    });


    return {
        id: data.id,
        title: data.title,
        description: data.description,
        category_id: data.category_id,
        sub_category_id: data.sub_category_id,
        discount: data.discount,
        discount_type: data.discount_type,
        code: data.code,
        start_date: formatDateTime(data.start_date, 9),
        end_date: formatDateTime(data.end_date, 9),
        start_date_display: formatDateTime(data.start_date, 8),
        end_date_display: formatDateTime(data.end_date, 8),
        banner: !isEmpty(data.banner) ? getFileAbsulatePath(data.banner) : '',
        display_products: display_products,
        products: products,
        category_name: data.category.name,
        sub_category_name: data.sub_category ? data.sub_category.name : '',
        status: data.status,
        discount_display: discount_display

    }
}

module.exports = {
    PromocodeCollection
}
