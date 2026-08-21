const { isObject, isEmpty, formatDateTime, displayAmount, statusDisplay, getFormatedAddress, priceFormat, paymentModeDisplay, getFileAbsulatePath } = require("@helpers/helper");
const {OrderProductCollection} = require("@resources/distributor/OrderProductCollection");
const { getRoleId } = require("@library/common");

const OrderCollection = async(data) => {
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
    let order_from = ('orderFrom' in data && data.orderFrom) ? data.orderFrom.name : '';
    let can_sell = false, is_customer = false, is_retailer = false, role_id = 0;
    if('orderFrom' in data && data.orderFrom && 'role' in data.orderFrom && data.orderFrom.role){
        order_from += ' ( ' + data.orderFrom.role.name + ' )';
        let admin = getRoleId('admin'), distributor = getRoleId('distributor'), retailer = getRoleId('retailer');
        if(data.status == "pending" && [admin, distributor, retailer].includes(data.orderFrom.role_id)){
            can_sell = true;
        }
        if(data.orderFrom.role.id == 6){
            is_customer = true;
        }else if(data.orderFrom.role.id == 5){
            is_retailer = true;
        }
        role_id = data.orderFrom.role.id;
    }
    let products = data?.orderProducts ? await OrderProductCollection(data?.orderProducts, role_id) : [];
    //let user_mobile = 'orderFrom' in data && data.orderFrom ? data.orderFrom.mobile : '';
    let sale_executive_name = ('saleExecutive' in data && data.saleExecutive) ? data?.saleExecutive.name : '';
    let delivery_address = JSON.parse(data?.delivery_address);
    let mobile = !isEmpty(delivery_address) ? delivery_address.contact : '';
    if(isEmpty(mobile) && 'orderFrom' in data && data?.orderFrom){
        mobile = data.orderFrom.mobile;
    }
    
    let formated_address = getFormatedAddress(delivery_address);
    let pincode = (!isEmpty(delivery_address) && ('zipcode' in delivery_address && !isEmpty(delivery_address.zipcode))) ? delivery_address.zipcode : '';
    let city = (!isEmpty(delivery_address) && ('city' in delivery_address && !isEmpty(delivery_address.city))) ? delivery_address.city : '';

    let order_by = data.order_by == data.user_id ? "Self" : ('orderBy' in data && data.orderBy ? data.orderBy.name : '');

    return {
        id: data.id,
        order_no: data.order_no,
        sub_total: !isEmpty(data.sub_total) ? displayAmount(data.sub_total) : '',
        discount_amount: !isEmpty(data.discount_amount) ? displayAmount(data.discount_amount) : '',
        total_amount: !isEmpty(data.total_amount) ? displayAmount(data.total_amount) : '',
        paid_amount: !isEmpty(data.paid_amount) ? priceFormat(data.paid_amount) : '',
        paid_amount_display: !isEmpty(data.paid_amount) ? displayAmount(data.paid_amount) : '',
        payment_mode: data.payment_mode,
        payment_mode_display: paymentModeDisplay(data.payment_mode),
        delivery_address: data.delivery_address,
        status: data.status,
        status_display: statusDisplay(data.status),
        order_date: formatDateTime(data.createdAt, 7),
        products: products,
        order_from: order_from,
        mobile: mobile,
        user_details: {
            id: data.user_id,
            name: ('orderFrom' in data && data.orderFrom) ? data.orderFrom.name : '',
            company_name: (('orderFrom' in data && data.orderFrom) && !isEmpty(data.orderFrom.company_name)) ? data.orderFrom.company_name : '',
            mobile: (('orderFrom' in data && data.orderFrom) && !isEmpty(data.orderFrom.mobile)) ? data.orderFrom.mobile : '',
            city: city,
            gst: (('orderFrom' in data && data.orderFrom) && !isEmpty(data.orderFrom.gst)) ? data.orderFrom.gst : '',
            address: formated_address,
            pincode: pincode
        },
        can_sell: can_sell,
        sale_executive_name: sale_executive_name,
        formated_address: formated_address,
        no_of_products: products.length,
        city: !isEmpty(delivery_address) && 'city' in delivery_address ? delivery_address.city : '',
        is_customer: is_customer,
        is_retailer: is_retailer,
        order_by: order_by,
        cancel_reason: data.cancel_reason ?? "",
        notes: data.notes ?? "",
        image: data.image ? getFileAbsulatePath(data.image) : "",
        role_id: role_id
    }
}

module.exports = {
    OrderCollection
}
