const { isObject, ucWords, isEmpty, formatDateTime, weightFormat, displayAmount, paymentModeDisplay } = require("@helpers/helper");

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
        // set when the movement came from a payment (metal received against a sale)
        amount: data.amount,
        amount_display: isEmpty(data.amount) ? '' : displayAmount(data.amount),
        payment_mode: data.payment_mode || '',
        payment_mode_display: data.payment_mode ? paymentModeDisplay(data.payment_mode) : '',
        ref_no: data.ref_no || '',
        // The quoted per-gram rate as stored. Older rows have none, so fall back
        // to the derived 24K rate rather than showing nothing.
        metal_rate: data.metal_rate,
        metal_rate_display: !isEmpty(data.metal_rate)
            ? displayAmount(data.metal_rate)
            : (!isEmpty(data.amount) && parseFloat(data.weight)
                ? displayAmount(parseFloat(data.amount) / parseFloat(data.weight))
                : ''),
        status: data.status,
        status_display: ucWords(data.status),
        // transfers never set `date`, so fall back to when the row was written
        date: formatDateTime(data.date || data.createdAt, 8),
        action_value: action_value,
        can_accept: data.can_accept,
        display_user_name: data.type == "credit" ? (data.fromUser ? data.fromUser.name : '') : (data.toUser ? data.toUser.name : '')
        
    }
}

module.exports = {
    StockHistoriesCollection
}
