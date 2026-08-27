const { isObject, isEmpty, productTypeDisplay } = require("@helpers/helper");
const db = require("@models");
const MaterialModel = db.materials;
const PurityModel = db.purities;

const OrderEditMaterialCollection = async (data) => {
    if (isObject(data)) {
        return await getModelObject(data);
    } else {
        let arr = [];
        for (let i = 0; i < data.length; i++) {
            arr.push(await getModelObject(data[i]));
        }
        return arr;
    }
}

const getModelObject = async (data) => {
    let material = await MaterialModel.findOne({
        where: {id: data.material_id},
        include: [
            {
                model: PurityModel,
                as: 'purities',
            }
        ]
    });


    return {
        id: data.id,
        material_id: data.material_id,
        material_name: !isEmpty(data.material) ? data.material.name : '',
        weight: !isEmpty(data.weight) ? data.weight : '',
        quantity: !isEmpty(data.quantity) ? data.quantity : '',
        unit_id: data.unit_id,
        unit_name: data.unit ? data.unit.name : '',
        purity_name: data.purity ? data.purity.name : '',
        purity_id: data.purity_id,
        purities: material.purities,
        sent_weight: !isEmpty(data.sent_weight) ? data.sent_weight : '',
        sent_quantity: !isEmpty(data.sent_quantity) ? data.sent_quantity : '',
    }
}

module.exports = {
    OrderEditMaterialCollection
}
