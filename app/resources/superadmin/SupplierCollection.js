const { isObject, getFileAbsulatePath, isEmpty, displayAmount, priceFormat, isArray } = require("@helpers/helper");
const {getAdvanceAmount, getDistributorAdmin} = require("@library/common");
const db = require("@models");
const { Op } = require("sequelize");
const PurchaseModel = db.purchases;


const SupplierCollection = async(data, currentUserID, can_edit_delete) => {
    if(isObject(data)){
        return await getModelObject(data, currentUserID, can_edit_delete);
    }else{
        let arr = [];
        for(let i = 0; i < data.length; i++){
            arr.push(await getModelObject(data[i], currentUserID, can_edit_delete));
        }
        return arr;
    }
}

const getModelObject = async(data, currentUserID, can_edit_delete) => {
    let dueAmount = await PurchaseModel.sum('due_amount', { where: { supplier_id: data.id, user_id: currentUserID, is_approved: {[Op.ne]: 2 },  is_assigned: false, is_approval: false } });
    let paidAmount = await PurchaseModel.sum('paid_amount', { where: { supplier_id: data.id, user_id: currentUserID, is_approved: {[Op.ne]: 2 },  is_assigned: false, is_approval: false, status: {[Op.ne]: 'returned'} } });
    let totalAmount = await PurchaseModel.sum('bill_amount', { where: { supplier_id: data.id, user_id: currentUserID, is_approved: {[Op.ne]: 2 },  is_assigned: false, is_approval: false } });
    let totalPayableAmount = await PurchaseModel.sum('total_payable', { where: { supplier_id: data.id, user_id: currentUserID, is_approved: {[Op.ne]: 2 },  is_assigned: false, is_approval: false } });
    let totalReturn = await PurchaseModel.sum('return_amount', { where: { supplier_id: data.id, user_id: currentUserID, is_approved: {[Op.ne]: 2 },  is_assigned: false, is_approval: false } });
    let documents = [];
    if(isArray(data.documents)){
        for(let i = 0; i < data.documents.length; i++){
            documents.push({
                file_name: data.documents[i].file_name,
                path: getFileAbsulatePath(data.documents[i].path),
            })
        }
    }

    let advance_amount = currentUserID ? await getAdvanceAmount(currentUserID, data.id, true) : 0;

    return {
        id: data.id,
        name: data.name,
        user_name: data.user_name || '',
        email: data.email || '',
        mobile: data.mobile,
        adhar: data.adhar || '',
        pan: data.pan || '',
        address: data.address || '',
        city: data.city || '',
        landmark: data.landmark || '',
        pincode: data.pincode || '',
        district_id: data.district_id || '',
        state_id: data.state_id || '',
        country_id: data.country_id || '',
        p_address: data.p_address || '',
        p_city: data.p_city || '',
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
        advance_amount: priceFormat(advance_amount),
        advance_amount_display: displayAmount(advance_amount),
        due_amount: priceFormat(dueAmount),
        total_amount: priceFormat(totalAmount),
        total_payable_amount: priceFormat(totalPayableAmount),
        paid_amount: priceFormat(paidAmount),
        total_return: priceFormat(totalReturn),
        due_amount_display: displayAmount(dueAmount),
        paid_amount_display: displayAmount(paidAmount),
        total_amount_display: displayAmount(totalAmount),
        total_return_display: displayAmount(totalReturn),
        documents: documents,
        can_edit_delete: can_edit_delete === false ? false : true,
        own: (data.role_id == 1 || data.own) ? 1 : 0,
    }
}

module.exports = {
    SupplierCollection
}
