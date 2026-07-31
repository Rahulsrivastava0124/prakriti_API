/**
 * Change-password helpers — shared by every role's change-password endpoint.
 *
 * Two rules live here so all roles behave identically:
 *  1. A new password must be at least MIN_PASSWORD_LENGTH characters (the same
 *     bar the reset-password flow enforces).
 *  2. A confirmation email is sent on success. Per product decision the whole
 *     operation FAILS if that email cannot be delivered — so the account's
 *     previous password hash is restored before the error is returned.
 *
 * Note: only the NEW password is length-checked. `old_password` deliberately
 * is not, because the legacy `sendpassword` flow issued 4-digit passwords and
 * those users must still be able to change them.
 */

const bcrypt = require("bcryptjs");
const { sendEmail } = require("@library/common");

const MIN_PASSWORD_LENGTH = 8;

/** Placeholder values like "Na"/"N/A" are common in this data set. */
const hasSendableEmail = (email) =>
  !!email && /^\S+@\S+\.\S+$/.test(String(email).trim());

/**
 * Validate a new/confirm password pair.
 * @returns {string|null} an error message, or null when valid
 */
const validateNewPassword = (newPassword, confirmPassword) => {
  if (!newPassword || !confirmPassword) {
    return "New password and confirm password are required.";
  }
  if (String(newPassword).length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (newPassword != confirmPassword) {
    return "Password and confirm password doesn't match";
  }
  return null;
};

const buildChangedEmail = ({ name, label }) => {
  const safeName = name || "there";
  const html = `
  <div style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;padding:32px 16px;">
      <div style="background:#ffffff;border-radius:16px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <h1 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Your password was changed</h1>
        <p style="margin:0 0 16px;font-size:14px;color:#475569;line-height:1.6;">
          Hi ${safeName}, the password for your ${label} account was just changed.
        </p>
        <p style="margin:0 0 16px;font-size:14px;color:#475569;line-height:1.6;">
          If this was you, no further action is needed.
        </p>
        <p style="margin:0;font-size:13px;color:#b91c1c;line-height:1.6;">
          If you did NOT make this change, please contact support immediately —
          someone else may have access to your account.
        </p>
      </div>
      <p style="text-align:center;margin:16px 0 0;font-size:11px;color:#94a3b8;">
        © Prakriti · This is an automated message, please do not reply.
      </p>
    </div>
  </div>`;

  const text = [
    `Hi ${safeName},`,
    ``,
    `The password for your ${label} account was just changed.`,
    ``,
    `If this was you, no further action is needed.`,
    ``,
    `If you did NOT make this change, please contact support immediately -`,
    `someone else may have access to your account.`,
    ``,
    `- Prakriti`,
  ].join("\n");

  return { html, text };
};

/**
 * Persist a new password and notify the user, rolling the password back if the
 * notification cannot be sent.
 *
 * The caller must already have verified the current password / authorisation.
 *
 * @param {object}  opts
 * @param {object}  opts.UserModel     Sequelize users model
 * @param {object}  opts.user          the user row being updated
 * @param {string}  opts.newPassword   plain-text new password
 * @param {string} [opts.accountLabel] wording used in the email ("Prakriti admin")
 * @returns {Promise<{ok:boolean, message?:string}>}
 */
const changePasswordAndNotify = async ({
  UserModel,
  user,
  newPassword,
  accountLabel,
}) => {
  const label = accountLabel || "Prakriti";

  // Checked BEFORE the password is touched: a placeholder email would otherwise
  // mean writing a new hash and immediately rolling it back for nothing.
  if (!hasSendableEmail(user.email)) {
    return {
      ok: false,
      message:
        "No valid email is registered for this account, so we cannot send the confirmation required to change your password. Please contact support.",
    };
  }

  const previousHash = user.password;

  await UserModel.update(
    { password: bcrypt.hashSync(newPassword, 8) },
    { where: { id: user.id } },
  );

  const { html, text } = buildChangedEmail({ name: user.name, label });

  try {
    await sendEmail({
      to: user.email,
      subject: `Your ${label} password was changed`,
      message: html,
      text,
    });
  } catch (mailErr) {
    // Product decision: no confirmation email => the change does not stand.
    await UserModel.update(
      { password: previousHash },
      { where: { id: user.id } },
    );
    return {
      ok: false,
      message:
        "Your password was not changed because the confirmation email could not be sent. Please try again later.",
    };
  }

  return { ok: true };
};

module.exports = {
  MIN_PASSWORD_LENGTH,
  hasSendableEmail,
  validateNewPassword,
  changePasswordAndNotify,
};
