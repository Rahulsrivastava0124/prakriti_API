const {
  errorCodes,
  formatErrorResponse,
  formatResponse,
} = require('@utils/response.config');
const db = require('@models');
const { base64FileUpload, removeFile } = require('@helpers/upload');
const { CompanyDetailCollection } = require('@resources/superadmin/CompanyDetailCollection');
const { getCompanyDetails } = require('@helpers/companyDetails');
const CompanyDetailModel = db.company_details;

/**
 * Fetch admin's company details, blank fields filled from superadmin's row
 */
exports.index = async (req, res) => {
  try {
    const details = await getCompanyDetails(req.userId);
    res.send(formatResponse(CompanyDetailCollection(details), 'Company details'));
  } catch (err) {
    res.status(errorCodes.default).send(formatErrorResponse(err.toString()));
  }
};

/**
 * Create or update admin's own company details row (upsert)
 */
exports.update = async (req, res) => {
  try {
    const data = req.body;
    let record = await CompanyDetailModel.findOne({
      where: { user_id: req.userId },
      order: [['id', 'ASC']],
    });

    let logoPath = record ? record.logo : null;

    if (data.logo && data.logo.startsWith('data:')) {
      try {
        if (logoPath) removeFile(logoPath);
        const result = await base64FileUpload(data.logo, 'company');
        if (result) logoPath = result.path;
      } catch (uploadErr) {
      }
    }

    const payload = {
      user_id: req.userId,
      logo: logoPath,
      company_name: data.company_name || null,
      corporate_office_address: data.corporate_office_address || null,
      head_office_name: data.head_office_name || null,
      gst_no: data.gst_no || null,
      address: data.address || null,
      email: data.email || null,
      phone: data.phone || null,
    };

    if (record) {
      await CompanyDetailModel.update(payload, { where: { id: record.id } });
    } else {
      await CompanyDetailModel.create(payload);
    }

    res.send(formatResponse('', 'Company details updated successfully!'));
  } catch (err) {
    res.status(errorCodes.default).send(formatErrorResponse(err.toString()));
  }
};
