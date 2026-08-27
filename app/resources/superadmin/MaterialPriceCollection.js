const { isObject, isEmpty} = require("@helpers/helper");
const {MaterialPricePurityCollection} = require("@resources/superadmin/MaterialPricePurityCollection");
const _ = require("lodash");

const MaterialPriceCollection = async(data) => {
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
    let purities = (data.material) ? data.material.purities : [];
    let pricePurities = MaterialPricePurityCollection(data.materialPricePurities);
    for(let i = 0; i < purities.length; i++){
        let index =  _.findIndex(pricePurities, (item) => item.purity_id == purities[i].id);
        if(index === -1){
            pricePurities.push({
                id: 0,
                material_price_id: data.id,
                purity_id: purities[i].id,
                purity_name: purities[i].name,
                price: 0,
                display_price: 0,
                admin_discount: 0,
                distributor_discount: 0,
                se_discount: 0,
                retailer_max_discount: 0,
                customer_discount: 0,
                increase: 0,
                mrp: 0,
                admin_price: 0,
                distributor_price: 0,
                se_price: 0,
                retailer_max_price: 0,
                customer_price: 0,
            })
        }
    }

    return {
        id: data.id,
        material_id: data.material_id,
        material_name: !isEmpty(data.material) ? data.material.name : '',
        unit_name: (!isEmpty(data.material) && !isEmpty(data.material.unit)) ? data.material.unit.name : '',
        purities: pricePurities,
        category_name: (data.material && data.material.category) ? data.material.category.name : ''
    }
}

module.exports = {
    MaterialPriceCollection
}
