/**
 * Password reset (link-based) helpers — shared across superadmin/admin/team auth.
 *
 * A raw token is emailed to the user; only its SHA-256 hash is stored in the DB
 * (users.reset_token) alongside an expiry (users.reset_token_expiry). The link
 * points at the admin portal's role-specific reset page.
 */

const crypto = require("crypto");
const { sendEmail } = require("@library/common");

const RESET_TOKEN_EXPIRES_MINUTES =
  Number(process.env.RESET_TOKEN_EXPIRES_MINUTES) || 60;

/**
 * Each admin portal is served on its own domain in the deployed environments
 * (e.g. dev.super / dev.admin / dev.team .prakriti.one) but from a SINGLE
 * bundle behind one nginx, so the React route prefix still applies on every
 * domain — hence base URL *and* path prefix per portal.
 *
 * Locally all three live on one host (localhost:8888), so the per-portal vars
 * can be left unset and everything falls back to ADMIN_URL.
 */
const PORTALS = {
  superadmin: { env: "SUPERADMIN_URL", path: "/super-admin" },
  admin: { env: "ADMIN_URL", path: "/admin" },
  team: { env: "TEAM_URL", path: "" },
};

const stripTrailingSlash = (url) => url.replace(/\/$/, "");

const getPortalUrl = (role) =>
  stripTrailingSlash(
    (PORTALS[role] && process.env[PORTALS[role].env]) ||
      process.env.ADMIN_URL ||
      "http://localhost:8888",
  );

// Storefront (prakriti_Frontend) — retailer + customer reset pages live here,
// NOT on the admin panel. Note this is deliberately not the `BASE_URL` env var,
// which points at the R2 asset CDN.
const getStorefrontUrl = () =>
  stripTrailingSlash(process.env.STOREFRONT_URL || "http://localhost:8080");

const generateRawToken = () => crypto.randomBytes(32).toString("hex");

const hashToken = (token) =>
  crypto.createHash("sha256").update(String(token)).digest("hex");

const withResetQuery = (base, rawToken, email) =>
  `${base}/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`;

/**
 * Build a reset link for an admin-panel portal.
 * @param {string} role - "superadmin" | "admin" | "team"
 * @param {string} rawToken
 * @param {string} email
 */
const buildResetUrl = (role, rawToken, email) => {
  const portal = PORTALS[role];
  if (!portal) {
    throw new Error(`buildResetUrl: unknown portal role "${role}"`);
  }
  return withResetQuery(
    `${getPortalUrl(role)}${portal.path}`,
    rawToken,
    email,
  );
};

/**
 * Build a reset link for a storefront role.
 * @param {string} rolePrefix - "/retailer", or "" (customer = root)
 * @param {string} rawToken
 * @param {string} email
 */
const buildStorefrontResetUrl = (rolePrefix, rawToken, email) =>
  withResetQuery(`${getStorefrontUrl()}${rolePrefix}`, rawToken, email);

/**
 * Send the styled password-reset email. Resolves true on success; the
 * underlying sendEmail rejects/returns false on failure (callers await + catch).
 */
const sendPasswordResetEmail = ({
  to,
  name,
  resetUrl,
  expiresMinutes,
  accountLabel,
}) => {
  const safeName = name || "there";
  const minutes = expiresMinutes || RESET_TOKEN_EXPIRES_MINUTES;
  // "Prakriti admin" for the admin panel, "Prakriti" for the storefront.
  const label = accountLabel || "Prakriti admin";
  const html = `
  <div style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;padding:32px 16px;">
      <div style="background:#ffffff;border-radius:16px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <h1 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Reset your password</h1>
        <p style="margin:0 0 16px;font-size:14px;color:#475569;line-height:1.6;">
          Hi ${safeName}, we received a request to reset the password for your
          ${label} account. Click the button below to choose a new password.
        </p>
        <p style="text-align:center;margin:28px 0;">
          <a href="${resetUrl}"
             style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;
                    font-weight:700;font-size:14px;padding:12px 28px;border-radius:9999px;">
            Reset Password
          </a>
        </p>
        <p style="margin:0 0 8px;font-size:12px;color:#64748b;line-height:1.6;">
          Or paste this link into your browser:
        </p>
        <p style="margin:0 0 20px;font-size:12px;word-break:break-all;">
          <a href="${resetUrl}" style="color:#0f766e;">${resetUrl}</a>
        </p>
        <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;line-height:1.6;">
          This link expires in ${minutes} minutes and can be used only once.
        </p>
        <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6;">
          If you did not request this, you can safely ignore this email — your
          password will not change.
        </p>
      </div>
      <p style="text-align:center;margin:16px 0 0;font-size:11px;color:#94a3b8;">
        © Prakriti · This is an automated message, please do not reply.
      </p>
    </div>
  </div>`;

  // Plain-text twin of the HTML above. Sending both makes the message
  // multipart/alternative; HTML-only mail is a well-known spam signal.
  const text = [
    `Hi ${safeName},`,
    ``,
    `We received a request to reset the password for your ${label} account.`,
    `Open the link below to choose a new password:`,
    ``,
    resetUrl,
    ``,
    `This link expires in ${minutes} minutes and can be used only once.`,
    ``,
    `If you did not request this, you can safely ignore this email - your`,
    `password will not change.`,
    ``,
    `- Prakriti`,
  ].join("\n");

  return sendEmail({
    to,
    subject: `Reset your ${label} password`,
    message: html,
    text,
  });
};

module.exports = {
  RESET_TOKEN_EXPIRES_MINUTES,
  generateRawToken,
  hashToken,
  buildResetUrl,
  buildStorefrontResetUrl,
  sendPasswordResetEmail,
};
