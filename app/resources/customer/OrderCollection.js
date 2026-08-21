const { isObject, isEmpty, formatDateTime, displayAmount, priceFormat, statusDisplay, getFileAbsulatePath } = require("@helpers/helper");
const {OrderProductCollection} = require("@resources/customer/OrderProductCollection");
const { getOrderStatusProgress, isRetailer } = require("@library/common");
const moment = require('moment');
const db = require("@models");
const ReturnPolicyModel = db.return_policy;
const RoleModel = db.roles;

const OrderCollection = async(data, async) => {
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
    let address = JSON.parse(data.delivery_address);
    let expected_delivery_date = !data.expected_delivery_date ? moment(data.createdAt).add(7, 'days').format('DD MMM, YYYY') : moment(data.expected_delivery_date).format('DD MMM, YYYY');
    let status_progress = getOrderStatusProgress(data);
    let is_due = false; //priceFormat(data.paid_amount) < priceFormat(data.total_amount) ? true : false;
    let orderProducts = !isEmpty(data.orderProducts) ? await OrderProductCollection(data.orderProducts, data.user_id) : [];
    if(data.status == "delivered"){
        let role = 'customer';
        if('orderFrom' in data && data.orderFrom){
            role = isRetailer(data.orderFrom.role_id) ? 'retailer' : role;
        }
        for(let i = 0; i < orderProducts.length; i++){
            let item = orderProducts[i];
            let return_charge_percent = 0;
            let returnPolicy = await ReturnPolicyModel.findOne({where: {category_id: item.category_id, role: role}});
            if(returnPolicy){
                let today = moment();
                let order_date = moment(data.createdAt);
                if(today.diff(order_date, 'days') > parseInt(returnPolicy.days) && !is_due){
                    return_charge_percent = returnPolicy.amount;
                }
            }
            orderProducts[i].return_charge_percent = return_charge_percent;
            orderProducts[i].is_return = item.is_return;
            orderProducts[i].return_amount = 0;
            orderProducts[i].return_charge = 0;
            for(let x = 0; x < item.materials.length; x++){
                orderProducts[i].materials[x].return_qty = '';
                orderProducts[i].materials[x].return_weight = '';
            }
        }
    }
    console.log("data.orderFrom : ", data.orderFrom);
    let customer_name = data.orderFrom ? data.orderFrom.name : '';
    let customer_company_name = data.orderFrom ? data.orderFrom.company_name : '';

    return {
        id: data.id,
        user_id: data.user_id,
        order_no: data.order_no,
        is_viewed: data.is_viewed,
        sub_total: !isEmpty(data.sub_total) ? displayAmount(data.sub_total) : '',
        discount_amount: !isEmpty(data.discount_amount) ? displayAmount(data.discount_amount) : '',
        total_amount: !isEmpty(data.total_amount) ? displayAmount(data.total_amount) : '',
        payment_mode: (data.payment_mode == 'cash') ? 'Cash' : 'Online',
        delivery_address: !isEmpty(address) ? address.formated_address : '',
        status: data.status,
        status_display: statusDisplay(data.status),
        order_date: formatDateTime(data.createdAt, 5),
        delivered_at: data.delivered_at ? formatDateTime(data.delivered_at, 5) : "",
        orderProducts: orderProducts,
        promocode_discount: priceFormat(data.promocode_discount),
        promocode_discount_display: displayAmount(data.promocode_discount),
        promocode: data.promocode,
        promocode_id: data.promocode_id,
        expected_delivery_date: expected_delivery_date,
        status_progress: status_progress,
        customer_name: customer_name,
        customer_company_name: customer_company_name,
        cancel_reason: data.cancel_reason ?? "",
        paid_amount: priceFormat(data.paid_amount),
        notes: data.notes ?? "",
        image: data.image ? getFileAbsulatePath(data.image) : "",
        help_mobile: '+91 98744 45878',
        help_email: 'Prakriti@gmail.com',
        is_due: is_due
    }
}

module.exports = {
    OrderCollection
}
