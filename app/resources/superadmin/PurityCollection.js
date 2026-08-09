const {
  mapConcurrent, isObject, isEmpty, displayAmount } = require("@helpers/helper");
const db = require("@models");
const MaterialPricePurityModel = db.material_price_purities;
const MaterialPriceModel = db.material_prices;

const PurityCollection = async(data, params) => {
    if(isObject(data)){
        return await getModelObject(data, params);
    }else{
        return await mapConcurrent(data, (item, i) => getModelObject(item, params));

    }
}

// Every product x material x purity used to run its own MaterialPriceModel
// query here - for an "all products" listing that's thousands of round trips
// for a handful of distinct material/purity combos. Cache the promise (like
// calculateProductPriceCart does) so repeats within one request share it;
// callers that don't pass params.priceCache get the old uncached behavior.
const loadMaterialPrice = (priceCache, material_id, purity_id) => {
    const query = () => MaterialPriceModel.findOne({
        where: {material_id: material_id},
        include: [
            {
                model: MaterialPricePurityModel,
                as: 'materialPricePurities',
                required: true,
                where: {purity_id: purity_id}
            }
        ]
    });
    if(!priceCache) return query();
    const key = material_id + ':' + purity_id;
    if(!priceCache.has(key)) priceCache.set(key, query());
    return priceCache.get(key);
}

const getModelObject = async(data, params) => {
    let mrp_display = '', unit_name = '';
    if(isObject(params) && 'purity_price' in params && params.purity_price == 1){
        let matPrice = await loadMaterialPrice(params.priceCache, params.material_id, data.id);
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
