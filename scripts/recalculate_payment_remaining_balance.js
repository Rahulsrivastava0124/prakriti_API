#!/usr/bin/env node

require("module-alias/register");
require("dotenv").config();

const {
  recalculatePaymentRemainingBalance,
} = require("@library/paymentBalanceRecalculator");

const args = process.argv.slice(2).reduce((acc, item) => {
  if (!item.startsWith("--")) {
    return acc;
  }

  const [rawKey, ...rawValueParts] = item.slice(2).split("=");
  const key = rawKey.trim();
  const value = rawValueParts.length ? rawValueParts.join("=") : "true";
  acc[key] = value;
  return acc;
}, {});

const toBoolean = (value) => {
  if (typeof value !== "string") {
    return Boolean(value);
  }

  return !["false", "0", "no", "off"].includes(value.toLowerCase());
};

const userId = args["user-id"] ?? args.user_id ?? args.userId;
const paymentBy = args["payment-by"] ?? args.payment_by ?? args.paymentBy;
const paymentId = args["payment-id"] ?? args.payment_id ?? args.paymentId;
const dryRun = toBoolean(
  args["dry-run"] ?? args.dry_run ?? args.dryRun ?? false,
);

const main = async () => {
  const summary = await recalculatePaymentRemainingBalance({
    userId,
    paymentBy,
    paymentId,
    dryRun,
  });

  if (!summary.total) {
    console.log("No payments found.");
    return;
  }

  for (const result of summary.results) {
    console.log(JSON.stringify(result));
  }

  console.log(JSON.stringify(summary));
};

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const db = require("@models");
    if (db.sequelize) {
      await db.sequelize.close();
    }
  });
