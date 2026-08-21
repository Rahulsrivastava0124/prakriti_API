const { isObject, isEmpty, displayAmount } = require("@helpers/helper");
const db = require("@models");
const MaterialPricePurityModel = db.material_price_purities;
const MaterialPriceModel = db.material_prices;

const ReportChargeCollection = async(data, params) => {
    if(isObject(data)){
        return await getModelObject(data, params);
    }else{
        let arr = [];
        for(let i = 0; i < data.length; i++){
            arr.push(await getModelObject(data[i], params));
        }
        return arr;
    }
}

const getModelObject = async(data, params) => {
    return {
        id: data.id,
        amount: !isEmpty(data.amount)?parseFloat(data.amount).toFixed(2):"",
        tax: !isEmpty(data.tax)?parseFloat(data.tax).toFixed(2):""
    }
}

module.exports = {
    ReportChargeCollection
}
