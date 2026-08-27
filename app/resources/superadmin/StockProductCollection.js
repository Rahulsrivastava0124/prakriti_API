const { isObject, isEmpty, getFileAbsulatePath, isArray, arrayColumn, productTypeDisplay, priceFormat } = require("@helpers/helper");
const {ProductCertificateCollection} = require("@resources/superadmin/ProductCertificateCollection");

const StockProductCollection = (data) => {
    if(isObject(data)){
        return getModelObject(data);
    }else{
        let arr = [];
        for(let i = 0; i < data.length; i++){
            arr.push(getModelObject(data[i]));
        }
        return arr;
    }
}

const getModelObject = (data) => {
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

    let certificates = ProductCertificateCollection(data.certificates);
    let certificateNames = arrayColumn(certificates, 'name');

    // console.log("---StockCollactionProduct",data);

    return {
        product_id: data.id,
        slug: data.slug,
        name: data.name,
        product_code: data.product_code,
        type: data.type,
        type_diplay: productTypeDisplay(data.type),
        description: data.description,
        licence_no: data.licence_no,
        status_display: data.status ? 'Active' : 'Inactive',
        certified_display: data.certified ? 'Yes' : 'No',
        images: images,
        image: images.length ? images[0].path : '',
        video: video,
        category: data.category ? data.category.name : '',
        sub_category: data.sub_category ? data.sub_category.name : '',
        display_certificate: certificateNames.join(', ')
    }
}

module.exports = {
    StockProductCollection
}
