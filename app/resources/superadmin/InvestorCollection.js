const { isObject, getFileAbsulatePath, isEmpty, isArray, displayAmount } = require("@helpers/helper");
const { Op, QueryTypes } = require("sequelize");
const db = require("@models");
const sequelize = db.sequelize;

const InvestorCollection = async(data) => {
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

    let query = `SELECT SUM(loan_amount) AS total_loan_amount, SUM(interest_amount) AS total_interest_amount, SUM(total_paid) AS total_paid FROM loans WHERE user_id = ${data.id} AND deleted_at IS NULL`;
    const loanObj = await sequelize.query(query, { type: QueryTypes.SELECT });
    let total_loan_amount = 0, total_with_interest = 0, total_paid = 0;
    if(loanObj.length){
        total_loan_amount = parseFloat(loanObj[0].total_loan_amount);
        total_with_interest = (parseFloat(loanObj[0].total_interest_amount) + total_loan_amount).toFixed(0);
        total_paid = loanObj[0].total_paid;
    }

    return {
        id: data.id,
        name: data.name,
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
        total_loan_amount_display: displayAmount(total_loan_amount),
        total_with_interest_display: displayAmount(total_with_interest),
        total_paid_display: displayAmount(total_paid),
    }
}

module.exports = {
    InvestorCollection
}
