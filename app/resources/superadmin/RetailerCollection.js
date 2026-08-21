const { isObject, getFileAbsulatePath, isEmpty, isArray, priceFormat, displayAmount, defaultProfileImage, formatDateTime } = require("@helpers/helper");
const {getAdvanceAmount, isDistributor, isSalesExecutive, isAdmin} = require("@library/common");
const db = require("@models");
const { Op } = require("sequelize");
const SaleModel = db.sales;


const RetailerCollection = async(data, req, userIds) => {

    if(isObject(data)){
        return await getModelObject(data, req, userIds);
    }else{
        let arr = [];
        for(let i = 0; i < data.length; i++){
            arr.push(await getModelObject(data[i], req, userIds));
        }
        return arr;
    }
}

const getModelObject = async(data, req, userIds) => {
    let documents = [];
    if(isArray(data.documents)){
        for(let i = 0; i < data.documents.length; i++){
            documents.push({
                file_name: data.documents[i].file_name,
                path: getFileAbsulatePath(data.documents[i].path),
            })
        }
    }

    let conditions = { user_id: data.id, is_approved: {[Op.ne]: 2 }, is_assigned: false, is_approval: false };
    if(req && (isDistributor(req) || isSalesExecutive(req))){
        conditions.sale_by = req.userId;
    }else if(req && isAdmin(req) && 'admin_sale_by_userids' in req){
        conditions.sale_by = {[Op.in]: req.admin_sale_by_userids};
    }

    let total_sale = await SaleModel.sum('bill_amount', { where: conditions });
    let total_payable_amount = await SaleModel.sum('total_payable', { where: conditions });
    let total_sale_due = await SaleModel.sum('due_amount', { where: conditions });
    let total_sale_paid = await SaleModel.sum('paid_amount', { where: conditions });
    let total_return = await SaleModel.sum('return_amount', { where: conditions });
    console.log("data.id : ", data.id, " req.userId : ", req.userId);
    let advance_amount = req ? await getAdvanceAmount(data.id, req.userId) : 0;
    console.log("advance_amount : ",advance_amount);
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
        status: data.status ? 1 : 0,
        district_name: data.district ? data.district.name : '',
        state_name: data.state ? data.state.name : '',
        country_name: data.country ? data.country.name : '',
        status_display: data.status ? 'Active' : 'Inactive',
        documents: documents,
        advance_amount: priceFormat(advance_amount),
        advance_amount_display: displayAmount(advance_amount),
        total_return: priceFormat(total_return),
        due_amount: priceFormat(total_sale_due),
        paid_amount: priceFormat(total_sale_paid),
        total_amount: priceFormat(total_sale),
        total_payable_amount: priceFormat(total_payable_amount),
        due_amount_display: displayAmount(total_sale_due),
        paid_amount_display: displayAmount(total_sale_paid),
        total_amount_display: displayAmount(total_sale),
        total_payable_amount_display: displayAmount(total_payable_amount),
        total_return_display: displayAmount(total_return),
        image: (!isEmpty(data.profile_image)) ? getFileAbsulatePath(data.profile_image) : defaultProfileImage(),
        rating: parseFloat(data.avg_rating),
        is_my_retailer: (userIds && userIds.includes(data.id)) ? true : false,
        partner: data.partner == 1?'1':'0',
        created_by: 'createdBy' in data && data.createdBy ? data.createdBy.name : '',
        created_by_display: [
            'createdBy' in data && data.createdBy ? data.createdBy.name : '',
            formatDateTime(data.createdAt, 7)
        ]
    }
}

module.exports = {
    RetailerCollection
}
