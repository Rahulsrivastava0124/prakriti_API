const { isObject, ucWords, isEmpty, formatDateTime, weightFormat } = require("@helpers/helper");

const StockHistoriesCollection = (data) => {
    if(isObject(data)){
        return getModelObject(data);
    }else{
        let arr = [];
        for(let i = 0; i < data.length; i++){
            arr.push(getModelObject(data[i]));
        }
        return arr;
    }
}

const getModelObject = (data) => {
    let action_value = data.status == "declined" ? "Declined" : "";

    return {
        id: data.id,
        batch_id: data.batch_id,
        from_user_id: data.from_user_id,
        to_user_id: data.to_user_id,
        from_user_name: data.fromUser ? data.fromUser.name : '',
        to_user_name: data.toUser ? data.toUser.name : '',
        type: data.type,
        type_display: ucWords(data.type),
        material_id: data.material_id,
        material_name: data.material ? data.material.name : '',
        purity_name: data.purity ? data.purity.name : '',
        unit_name: data.unit ? data.unit.name : '',
        pakka_weight: weightFormat(data.pakka_weight),
        weight: weightFormat(data.weight),
        quantity: data.quantity ?? '',
        status: data.status,
        status_display: ucWords(data.status),
        date: formatDateTime(data.date, 8),
        action_value: action_value,
        can_accept: data.can_accept,
        display_user_name: data.type == "credit" ? (data.fromUser ? data.fromUser.name : '') : (data.toUser ? data.toUser.name : '')
        
    }
}

module.exports = {
    StockHistoriesCollection
}
