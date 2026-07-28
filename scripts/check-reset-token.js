/**
 * Shows whether a reset token was actually issued for an email.
 * Run from prakriti_API:  node check-reset-token.js <email>
 */
require("dotenv").config();
const mysql = require("mysql2/promise");

const ENV = process.env.NODE_ENV || "development";
const P = ENV === "production" ? "PROD" : ENV === "test" ? "TEST" : "DEV";

(async () => {
  const email = (process.argv[2] || "").trim();
  if (!email) return console.log("usage: node check-reset-token.js <email>");

  const c = await mysql.createConnection({
    host: process.env[`DB_${P}_HOST`],
    port: process.env[`DB_${P}_PORT`],
    user: process.env[`DB_${P}_USERNAME`],
    password: process.env[`DB_${P}_PASSWORD`],
    database: process.env[`DB_${P}_DATABASE`],
    connectTimeout: 8000,
  });

  console.log(`NODE_ENV=${ENV} -> DB ${process.env[`DB_${P}_DATABASE`]}@${process.env[`DB_${P}_HOST`]}:${process.env[`DB_${P}_PORT`]}\n`);

  const [rows] = await c.query(
    `SELECT u.id, u.name, u.email, u.role_id, r.name AS role, r.is_custom,
            u.reset_token IS NOT NULL AS has_token, u.reset_token_expiry
       FROM users u LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.email = ?`,
    [email],
  );

  if (!rows.length) return void (console.log(`No user with email ${email}`), c.end());

  const TEAM = new Set([3, 4, 9, 10]); // distributor, sales_executive, manager, worker
  for (const u of rows) {
    const portal =
      u.role_id === 1 ? "/super-admin/forgot-password"
      : u.role_id === 2 ? "/admin/forgot-password"
      : TEAM.has(u.role_id) || u.is_custom ? "/forgot-password  (team, root)"
      : "NONE — this role has no admin-panel reset page";
    console.log(`#${u.id} ${u.name} <${u.email}>  role=${u.role} (${u.role_id})`);
    console.log(`  correct page : ${portal}`);
    console.log(`  reset_token  : ${u.has_token ? "ISSUED" : "none"}   expiry: ${u.reset_token_expiry || "-"}`);
  }
  await c.end();
})();
