const { isObject, isEmpty } = require("@helpers/helper");
const { geStatusValue } = require("@library/common");
const {PurityCollection} = require("@resources/superadmin/PurityCollection");


const MaterialCollection = async(data) => {
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
    return {
        id: data.id,
        category_id: data.category_id,
        name: data.name,
        unit_id: !isEmpty(data.unit_id) ? data.unit_id : null,
        status: data.status ? 1 : 0,
        status_display: geStatusValue(data.status),
        category: !isEmpty(data.category) ? data.category.name : '',
        unit: !isEmpty(data.unit) ? data.unit.name : '',
        unit_name: !isEmpty(data.unit) ? data.unit.name : '',
        purities: !isEmpty(data.purities) ? await PurityCollection(data.purities) : [],
    }
}

module.exports = {
    MaterialCollection
}
