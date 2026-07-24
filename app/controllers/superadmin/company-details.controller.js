const {
  errorCodes,
  formatErrorResponse,
  formatResponse,
} = require('@utils/response.config');
const db = require('@models');
const { base64FileUpload, removeFile } = require('@helpers/upload');
const { CompanyDetailCollection } = require('@resources/superadmin/CompanyDetailCollection');
const CompanyDetailModel = db.company_details;

/**
 * Fetch company details (singleton)
 */
exports.index = async (req, res) => {
  try {
    let record = await CompanyDetailModel.findOne({ order: [['id', 'ASC']] });
    if (!record) {
      return res.send(formatResponse({}, 'Company details'));
    }
    res.send(formatResponse(CompanyDetailCollection(record), 'Company details'));
  } catch (err) {
    res.status(errorCodes.default).send(formatErrorResponse(err.toString()));
  }
};

/**
 * Create or update company details (upsert)
 */
exports.update = async (req, res) => {
  try {
    const data = req.body;
    let record = await CompanyDetailModel.findOne({ order: [['id', 'ASC']] });

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
        console.error('Logo upload failed:', uploadErr.message);
        // keep existing logoPath — don't block the save
      }
    }
    // if data.logo is empty/null/undefined → keep existing logoPath (no change)

    const payload = {
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
