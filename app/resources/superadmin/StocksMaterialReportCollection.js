const { isObject, isEmpty, displayAmount, priceFormat, weightFormat, noImage } = require("@helpers/helper");
const {StockProductCollection} = require("@resources/superadmin/StockProductCollection");
const {PurityCollection} = require("@resources/superadmin/PurityCollection");
const {calculateProductPriceReport, getSuperAdminId, canStockAddCart} = require("@library/common");
const { Op, QueryTypes } = require("sequelize");
const db = require("@models");
const stockModel = db.stocks;
const sequelize = db.sequelize;
const cartsModel = db.carts;


const StocksMaterialCollection = async (data, user_id, roleName = null) => {
    if(isObject(data)){
        return await getModelObject(data, user_id, roleName);
    }else{
        let arr = [];
        for(let i = 0; i < data.length; i++){
            arr.push(await getModelObject(data[i], user_id, roleName));
        }
        return arr;
    }
}

const getModelObject = async (data, user_id, roleName = null) => {
    console.log(data)
    let sub_category = null, isMaterial = true;
    let materialItem = [], materialString = [];
    let taxInfo = null, purity_name = '';
    let priceMaterials = await calculateProductPriceReport(data.stockMaterials, sub_category, isMaterial, roleName, taxInfo);
    let weight_display = [], unit_display = [];
    for(let item of data.stockMaterials){
        //let str = item.material.name + ' <span style="padding-right: 18px; float: right;">' + weightFormat(item.weight) +(item.unit ? (' '+item.unit.name) : '') + '</span>';
        let str = item.material.name;
        materialItem.push({
            stockMaterialId: item.id,
            material_id: item.material_id,
            material_name: item.material ? item.material.name : '',
            weight: item.weight,
            unit_name: item.unit ? item.unit.name : '',
            quantity: item.quantity,
            unit_id: item.unit_id,
            purity_id: item.purity_id,
            purity_name: item.purity ? item.purity.name : '',
            purity_value: item.purity? item.purity.value : '',
            purities: !isEmpty(data.material.purities) ? await PurityCollection(data.material.purities) : [],
        });
        purity_name = item.purity ? item.purity.name : '';
        materialString.push(str);
        weight_display.push(weightFormat(item.quantity));
        unit_display.push((item.unit ? item.unit.name : '-'));
    }

    let total_weight_display = '';
    if(materialItem.length == 1){
        total_weight_display = weightFormat(materialItem[0].weight) + ' ' + materialItem[0].unit_name;
    }else{
        total_weight_display = weightFormat(data.total_weight) + ' gm';
    }

    let can_add_cart = await canStockAddCart(data.id, "material", user_id, data.certificate_no);


    return {
        name: data.material.name,
        type: "material",
        image: noImage(),
        current_image:data.current_image,
        id: data.id,
        purity_name: purity_name,
        purity_id: data.purity_id,
        size_id: data.size_id,
        quantity: data.quantity,
        size_name: !isEmpty(data.size) ? data.size.name : '',
        certificate_no: data.certificate_no,
        total_weight: weightFormat(data.total_weight),
        total_weight_display: total_weight_display,
        stock_materials: materialItem,
        stock_material_display: materialString,
        mrp: priceMaterials.total_mrp_price,
        mrp_display: displayAmount(priceMaterials.total_mrp_price),
        can_add_cart: can_add_cart,
        weight_display: weight_display,
        unit_display: unit_display
    }
}

module.exports = {
    StocksMaterialCollection
}
