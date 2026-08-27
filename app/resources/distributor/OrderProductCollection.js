const { isObject, isEmpty, productTypeDisplay, isArray, getFileAbsulatePath, weightFormat, displayAmount } = require("@helpers/helper");
const { OrderEditMaterialCollection } = require("@resources/distributor/OrderEditMaterialCollection");
const { getOrderCartData } = require("@library/orderCart");
const db = require("@models");
const SizeModel = db.sizes;
const ProductModel = db.products;
const SubCategoryModel = db.sub_categories;
const TaxSlabModel = db.tax_slabs;

const OrderProductCollection = async (data, role_id) => {
    if (isObject(data)) {
        return await getModelObject(data, role_id);
    } else {
        let arr = [];
        for (let i = 0; i < data.length; i++) {
            arr.push(await getModelObject(data[i], role_id));
        }
        return arr;
    }
}

const getModelObject = async (data, role_id) => {
    let materials = !isEmpty(data.orderProductMaterials) ? await OrderEditMaterialCollection(data.orderProductMaterials) : [];

    let product = await ProductModel.findOne({
        where: { id: data.product_id },
        include: [
            {
                model: SubCategoryModel,
                as: 'sub_category'
            },
            {
                model: TaxSlabModel,
                as: 'tax',
            }
        ]
    });

    //---
    let weight_display = [], unit_display = [];
    let materialItem = [], materialString = [], purity_display = [];
    for (let item of materials) {
        let str = item.material_name + " (" + item.purity_name + ")";
        materialItem.push({
            material_id: item.material_id,
            material_name: item.material_name,
            weight: item.weight,
            unit_name: item.unit_name,
            quantity: item.quantity,
            unit_id: item.unit_id,
            purity_id: item.purity_id,
            purity_name: item.purity_name
        });
        materialString.push(str);
        if (data.product && data.product.type == "material") {
            weight_display.push(weightFormat(item.quantity));
        } else {
            weight_display.push(weightFormat(item.weight));
        }
        unit_display.push((item.unit_name ? item.unit_name : '-'));
        purity_display.push((item.purity_name));
    }
    let total_weight_display = '';
    if (materialItem.length == 1) {
        total_weight_display = weightFormat(materialItem[0].weight) + ' , ' + materialItem[0].unit_name;
    } else {
        total_weight_display = weightFormat(data.total_weight) + ' , gm';
    }
    //---
    let main_image = data.product && !isEmpty(data.product.main_image) ? getFileAbsulatePath(data.product.main_image) : '';
    if (data.stock && data.stock.current_image && !isEmpty(data.stock.current_image)) {
        main_image = getFileAbsulatePath(data.stock.current_image);
    }

    let taxInfo = null;
    if ('tax' in product && product.tax) {
        taxInfo = {
            name: product.tax.name,
            cgst: parseFloat(product.tax.cgst),
            sgst: parseFloat(product.tax.sgst),
            igst: parseFloat(product.tax.igst),
        }
    }

    let cart_data = await getOrderCartData(data.order_id, data?.id, role_id);

    return {
        id: data.id,
        product_id: data.product_id,
        certificate_no: !isEmpty(data.stock) ? data.stock.certificate_no : '',
        product_type: !isEmpty(data.product) ? data.product.type : '',
        product_type_diplay: !isEmpty(data.product) ? productTypeDisplay(data.product.type) : '',
        product_name: !isEmpty(data.product) ? data.product.name : '',
        product_code: !isEmpty(data.product) ? data.product.product_code : '',
        category_name: !isEmpty(data.product) && 'category' in data.product && data.product.category ? data.product.category.name : '',
        //certificate_no: data.certificate_no,
        size_id: !isEmpty(data.size_id) ? data.size_id : '',
        size_name: !isEmpty(data.size) ? data.size.name : '',
        quantity: data.quantity,
        rate: displayAmount(data.rate),
        old_rate: displayAmount(data.old_rate),
        materials: materials,
        image: main_image,
        total_weight_display: total_weight_display,
        stock_material_display: materialString,
        weight_display: weight_display,
        unit_display: unit_display,
        purity_display: purity_display,
        worker_id: data.worker_id ?? 0,
        status: data.status ?? 'pending',
        cart_data: cart_data,
        worker_name: data.worker ? data.worker.name : ''
    }
}

module.exports = {
    OrderProductCollection
}
