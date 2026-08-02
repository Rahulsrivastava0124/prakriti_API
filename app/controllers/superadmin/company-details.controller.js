const {
  errorCodes,
  formatErrorResponse,
  formatResponse,
} = require('@utils/response.config');
const db = require('@models');
const { base64FileUpload, removeFile } = require('@helpers/upload');
const { CompanyDetailCollection } = require('@resources/superadmin/CompanyDetailCollection');
const { getCompanyDetails } = require('@helpers/companyDetails');
const { getRoleId } = require('@library/common');
const CompanyDetailModel = db.company_details;

/**
 * The row the caller owns. The super admin keeps the unowned row, which is
 * what every other role falls back to.
 */
const getOwnerId = (req) =>
  Number(req.role) === getRoleId('superadmin') ? null : req.userId;

/**
 * Fetch company details of the logged in user, filled in with the super
 * admin's for whatever is blank
 */
exports.index = async (req, res) => {
  try {
    const details = await getCompanyDetails(getOwnerId(req));
    res.send(formatResponse(CompanyDetailCollection(details), 'Company details'));
  } catch (err) {
    res.status(errorCodes.default).send(formatErrorResponse(err.toString()));
  }
};

/**
 * Create or update the company details of the logged in user (upsert)
 */
exports.update = async (req, res) => {
  try {
    const data = req.body;
    const ownerId = getOwnerId(req);
    let record = await CompanyDetailModel.findOne({
      where: { user_id: ownerId },
      order: [['id', 'ASC']],
    });

    // keep existing logo path by default
    let logoPath = record ? record.logo : null;

    // only upload when frontend sends a fresh base64 image
    if (data.logo && data.logo.startsWith('data:')) {
      try {
        if (logoPath) removeFile(logoPath);
        const result = await base64FileUpload(data.logo, 'company');
        if (result) {
          logoPath = result.path;
        }
      } catch (uploadErr) {
        // keep existing logoPath — don't block the save
      }
    }
    // if data.logo is empty/null/undefined → keep existing logoPath (no change)

    const payload = {
      user_id: ownerId,
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
