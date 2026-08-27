const { isObject, getFileAbsulatePath, isEmpty, isArray, displayAmount } = require("@helpers/helper");
const db = require("@models");
const { Op } = require("sequelize");
const SaleModel = db.sales;

const DistributorCollection = async(data) => {
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
    let documents = [];
    if(isArray(data.documents)){
        for(let i = 0; i < data.documents.length; i++){
            documents.push({
                file_name: data.documents[i].file_name,
                path: getFileAbsulatePath(data.documents[i].path),
            })
        }
    }

    let total_sale = await SaleModel.sum('total_payable', { where: { user_id: data.id, is_approved: {[Op.ne]: 2 } } });
    let total_sale_due = await SaleModel.sum('due_amount', { where: { user_id: data.id, is_approved: {[Op.ne]: 2 }  } });
    let total_sale_paid = await SaleModel.sum('paid_amount', { where: { user_id: data.id, is_approved: {[Op.ne]: 2 }  } });

    return {
        id: data.id,
        name: data.name,
        email: data.email || '',
        user_name: data.user_name || '',
        mobile: data.mobile,
        adhar: data.adhar || '',
        pan: data.pan || '',
        address: data.address || '',
        city: data.city || '',
        pincode: data.pincode || '',
        district_id: data.district_id || '',
        state_id: data.state_id || '',
        country_id: data.country_id || '',
        created_by: data.createdBy?data.createdBy.name : '',
        p_address: data.p_address || '',
        p_city: data.p_city || '',
        landmark: data.landmark || '',
        p_pincode: data.p_pincode || '',
        p_district_id: data.p_district_id || '',
        p_state_id: data.p_state_id || '',
        p_country_id: data.p_country_id || '',
        company_name: data.company_name || '',
        gst: data.gst || '',
        bank_name: data.bank_name || '',
        bank_account_no: data.bank_account_no || '',
        bank_ifsc: data.bank_ifsc || '',
        profile_image: (!isEmpty(data.profile_image)) ? getFileAbsulatePath(data.profile_image) : '',
        pan_image: (!isEmpty(data.pan_image)) ? getFileAbsulatePath(data.pan_image) : '',
        adhar_image: (!isEmpty(data.adhar_image)) ? getFileAbsulatePath(data.adhar_image) : '',
        company_logo: (!isEmpty(data.company_logo)) ? getFileAbsulatePath(data.company_logo) : '',
        status: data.status,
        district_name: data.district ? data.district.name : '',
        state_name: data.state ? data.state.name : '',
        country_name: data.country ? data.country.name : '',
        status_display: data.status ? 'Active' : 'Inactive',
        documents: documents,
        due_amount_display: displayAmount(total_sale_due),
        paid_amount_display: displayAmount(total_sale_paid),
        total_amount_display: displayAmount(total_sale),
    }
}

module.exports = {
    DistributorCollection
}
