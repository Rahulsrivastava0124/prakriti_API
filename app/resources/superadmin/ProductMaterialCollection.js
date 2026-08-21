const { isObject, isEmpty } = require("@helpers/helper");
const {PurityCollection} = require("@resources/superadmin/PurityCollection");

const ProductMaterialCollection = async(data, params) => {
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
    let unit_name = ('unit' in data && !isEmpty(data.unit)) ? data.unit.name : '';
    params = isObject(params) ? {...params, material_id: data.id, unit_name: unit_name} : params
    console.log("data.product_materials : ", data.product_materials);
    return {
        id: data.id,
        name: data.name,
        group: data.product_materials && 'group' in data.product_materials ? data.product_materials.group : null,
        unit_name: unit_name,
        unit_id: ('unit' in data && !isEmpty(data.unit)) ? data.unit.id : '',
        purities: ('purities' in data && !isEmpty(data.purities)) ? await PurityCollection(data.purities, params) : [],
    }
}

module.exports = {
    ProductMaterialCollection
}
