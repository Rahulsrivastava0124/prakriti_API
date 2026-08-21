const { isObject, isEmpty, displayAmount } = require("@helpers/helper");
const db = require("@models");
const MaterialPricePurityModel = db.material_price_purities;
const MaterialPriceModel = db.material_prices;

const PurityCollection = async(data, params) => {
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
    let mrp_display = '', unit_name = '';
    if(isObject(params) && 'purity_price' in params && params.purity_price == 1){
        let matPrice = await MaterialPriceModel.findOne({
            where: {material_id: params.material_id},
            include: [
                {
                    model: MaterialPricePurityModel,
                    as: 'materialPricePurities',
                    required: true,
                    where: {purity_id: data.id}
                }
            ]
        });
        if(matPrice){
            unit_name = params.unit_name;
            mrp_display = matPrice.materialPricePurities[0].price;
        }
    }
    return {
        id: data.id,
        name: data.name,
        value: !isEmpty(data.value)?parseFloat(data.value).toFixed(2):"",
        unit_name: unit_name,
        mrp_display: mrp_display
    }
}

module.exports = {
    PurityCollection
}
