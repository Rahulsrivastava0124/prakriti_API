const db = require("@models");

const CompanyDetailModel = db.company_details;

const FIELDS = [
  "logo",
  "company_name",
  "corporate_office_address",
  "head_office_name",
  "gst_no",
  "address",
  "email",
  "phone",
];

const isBlank = (value) =>
  value === null || value === undefined || String(value).trim() === "";

/**
 * The company details a user prints/edits under.
 *
 * Every user can own a row (`user_id`); the super admin's row is the one
 * without an owner and doubles as the fallback, so anything an admin left
 * blank is filled in from it.
 */
const getCompanyDetails = async (userId) => {
  const base = await CompanyDetailModel.findOne({
    where: { user_id: null },
    order: [["id", "ASC"]],
  });

  const own = userId
    ? await CompanyDetailModel.findOne({ where: { user_id: userId } })
    : null;

  const details = {
    id: own ? own.id : base ? base.id : null,
    user_id: own ? own.user_id : null,
  };

  FIELDS.forEach((field) => {
    let value = own && !isBlank(own[field]) ? own[field] : base ? base[field] : null;
    details[field] = value === undefined ? null : value;
  });

  return details;
};

module.exports = { getCompanyDetails };
