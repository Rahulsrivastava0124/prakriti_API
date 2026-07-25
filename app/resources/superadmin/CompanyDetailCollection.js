const { getFileAbsulatePath, isEmpty } = require('@helpers/helper');

const CompanyDetailCollection = (data) => {
    if (!data) return null;
    return {
        id: data.id,
        logo: data.logo ? getFileAbsulatePath(data.logo) : null,
        company_name: data.company_name,
        corporate_office_address: data.corporate_office_address,
        head_office_name: data.head_office_name,
        gst_no: data.gst_no,
        address: data.address,
        email: data.email,
        phone: data.phone,
    };
};

module.exports = { CompanyDetailCollection };
