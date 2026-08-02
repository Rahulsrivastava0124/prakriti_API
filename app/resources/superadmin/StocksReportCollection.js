const { isObject, isEmpty, displayAmount, priceFormat, weightFormat } = require("@helpers/helper");
const {StockProductCollection} = require("@resources/superadmin/StockProductCollection");
const {calculateProductPriceReport, calculateProductPriceCart, getSuperAdminId, canStockAddCart} = require("@library/common");
const { Op, QueryTypes } = require("sequelize");
const db = require("@models");
const {getFileAbsulatePath} = require("../../helpers/helper");
const stockModel = db.stocks;
const sequelize = db.sequelize;
const cartsModel = db.carts;
// getFileAbsulatePath()

const StocksReportCollection = async (data, user_id, roleName = null) => {
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
    let materialItem = [], materialString = [];
    let taxInfo = null;
    if('tax' in data.product && data.product.tax){
        taxInfo = {
            name: data.product.tax.name,
            cgst: parseFloat(data.product.tax.cgst),
            sgst: parseFloat(data.product.tax.sgst),
            igst: parseFloat(data.product.tax.igst),
        }
    }
    
    let isMaterialStock = data.product.type == "material" || isEmpty(data.certificate_no);

    /**
     * Stock list price must equal the sale page item price after add-to-cart.
     * The sale page starts from the cart calculation (calculateProductPriceCart),
     * so we use the SAME function + the SAME role mapping the cart uses
     * (see CartCollection: superadmin -> admin, admin -> distributor, distributor -> retailer).
     * We then add the (discounted) making charge and GST on top of the material price,
     * because the plain material MRP is "without making cost and tax".
     */
    let priceRole = "admin";
    if (roleName === "admin") {
        priceRole = "distributor";
    } else if (roleName === "distributor") {
        priceRole = "retailer";
    }

    let priceMaterials = await calculateProductPriceCart(data.stockMaterials, data.product.sub_category, isMaterialStock, priceRole, null, true);

    // net material price + net (discounted) making charge = sale page "Price" (pre-tax)
    let netMaterialPrice = priceMaterials.price;
    let netMakingCharge = priceMaterials.making_charge;
    let priceBeforeTax = priceFormat(netMaterialPrice + netMakingCharge);

    // GST: no customer/state context on the stock list, so default to IGST -
    // this mirrors the admin sale page's calculateGST() default (falls back to cgst+sgst).
    let stockTaxAmount = 0;
    if (taxInfo) {
        let gstPercent = !isEmpty(taxInfo.igst)
            ? parseFloat(taxInfo.igst)
            : (parseFloat(taxInfo.cgst || 0) + parseFloat(taxInfo.sgst || 0));
        stockTaxAmount = priceFormat((priceBeforeTax * gstPercent) / 100, true);
    }

    // material + making cost + tax, all added up
    let stockSalePrice = priceFormat(priceBeforeTax + stockTaxAmount);
    let weight_display = [], unit_display = [], purity_display = [];
    for(let item of data.stockMaterials){
        //let str = item.material.name + ' <span style="padding-right: 18px; float: right;">' + weightFormat(item.weight) +(item.unit ? (' '+item.unit.name) : '') + '</span>';
        let str = item.material.name;
        materialItem.push({
            material_id: item.material_id,
            material_name: item.material ? item.material.name : '',
            weight: item.weight,
            unit_name: item.unit ? item.unit.name : '',
            quantity: item.quantity,
            unit_id: item.unit_id,
            purity_id: item.purity_id,
            purity_name: item.purity ? item.purity.name : ''
        });
        materialString.push(str);
        if(data.product.type == "material" || isEmpty(data.certificate_no)){
            weight_display.push(weightFormat(item.quantity));
        }else{
            weight_display.push(weightFormat(item.weight));
        }
        unit_display.push((item.unit ? item.unit.name : '-'));
        //if(data.product.type == "material"){
            purity_display.push((item.purity ? item.purity.name : '-'));
        //}
    }

    /* if(isEmpty(data.certificate_no)){
        purity_display.push((data.spurity ? data.spurity.name : '-'));
    } */

    //purity_display.push(data.stockMaterials[0] && data.stockMaterials[0].purity ? data.stockMaterials[0].purity.name : '-');
    
    let productDetails = StockProductCollection(data.product);
    let total_weight_display = '';
    if(materialItem.length == 1){
        total_weight_display = weightFormat(materialItem[0].weight) + ' ' + materialItem[0].unit_name;
    }else{
        total_weight_display = weightFormat(data.total_weight) + ' gm';
    }
    
    let can_add_cart = await canStockAddCart(data.id, data.product.type, user_id, data.certificate_no);
    let stock_user_name = data.user ? (data.user.company_name ? data.user.company_name : data.user.name) : '';
    

    return {
        ...productDetails,
        id: data.id,
        size_id: data.size_id,
        quantity: data.quantity,
        size_name: !isEmpty(data.size) ? data.size.name : '',
        certificate_no: data.certificate_no,
        total_weight: weightFormat(data.total_weight),
        total_weight_display: total_weight_display,
        stock_materials: materialItem,
        stock_material_display: materialString,
        mrp: stockSalePrice,
        mrp_display: displayAmount(stockSalePrice),
        tax_prize: stockTaxAmount,
        tax_prize_display: displayAmount(stockTaxAmount),
        can_add_cart: can_add_cart,
        current_image:(data.current_image==null?null:getFileAbsulatePath(data.current_image)),
        weight_display: weight_display,
        unit_display: unit_display,
        purity_display: purity_display,
        stock_user_name: stock_user_name
    }
}

module.exports = {
    StocksReportCollection
}
