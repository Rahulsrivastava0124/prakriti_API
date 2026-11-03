/**
 * Self-check for the invoice summary maths used by downloadInvoiceInfo in the
 * sale/purchase controllers: the per-material tax, the making charge tax
 * (derived as the remainder) and the before/tax/after totals must reconcile.
 *
 * Run: node scripts/invoiceTotals.check.js
 */
const assert = require("assert");

/* Mirrors the accumulation in the controllers' grouped-table branch. */
function summarise(subCatItems, totalMakingCharge, report) {
  let totalTaxableAmt = 0;
  let totalTax = 0;
  let totalMaterialTax = 0;
  let materialTotals = {};

  for (const item of subCatItems) {
    const taxableAmt = parseFloat(item.taxableAmount) || 0;
    const taxPercent = parseFloat(item.tax) || 0;
    totalTaxableAmt += taxableAmt;
    totalTax += (taxableAmt * taxPercent) / 100;
    for (const mat of item.material) {
      const key = mat.name;
      if (!materialTotals[key]) materialTotals[key] = { amount: 0, tax: 0 };
      const matAmount = mat.weight * mat.rate;
      materialTotals[key].amount += matAmount;
      materialTotals[key].tax += (matAmount * taxPercent) / 100;
      totalMaterialTax += (matAmount * taxPercent) / 100;
    }
  }

  const makingChargeTax = totalTax - totalMaterialTax;
  const totalReportCharge = report.qty * report.rate;
  const taxOnReportCharge = (totalReportCharge * report.taxPercent) / 100;
  const totalBeforeTax = totalTaxableAmt + totalReportCharge;
  const totalTaxAll = totalTax + taxOnReportCharge;

  return {
    materialTotals,
    makingChargeTax,
    totalMakingCharge,
    totalReportCharge,
    taxOnReportCharge,
    totalBeforeTax,
    totalTaxAll,
    totalAfterTax: totalBeforeTax + totalTaxAll,
  };
}

const close = (a, b, msg, tol = 0.02) =>
  assert.ok(Math.abs(a - b) < tol, `${msg}: ${a.toFixed(2)} vs ${b.toFixed(2)}`);

/* RV-S-168: two nose pin rows at 3%, 2000 making charge, 4 reports x 500 @ 18%. */
const r = summarise(
  [
    {
      tax: 3,
      taxableAmount: 14841.65,
      material: [
        { name: "Gold yellow", weight: 0.392, rate: 10386.89 },
        { name: "10-Diamond", weight: 7.0, rate: 410.0 },
        { name: "20-Diamond", weight: 12.0, rate: 600.0 },
      ],
    },
    {
      tax: 3,
      taxableAmount: 11112.78,
      material: [
        { name: "Gold yellow", weight: 0.55, rate: 10386.91 },
        { name: "10-Diamond", weight: 10.0, rate: 410.0 },
      ],
    },
  ],
  2000,
  { qty: 4, rate: 500, taxPercent: 18 },
);

close(r.materialTotals["10-Diamond"].amount, 6970.0, "10-Diamond amount");
close(r.materialTotals["10-Diamond"].tax, 209.1, "10-Diamond tax");
close(r.materialTotals["20-Diamond"].amount, 7200.0, "20-Diamond amount");
close(r.materialTotals["20-Diamond"].tax, 216.0, "20-Diamond tax");
close(r.materialTotals["Gold yellow"].amount, 9784.46, "Gold yellow amount");
close(r.makingChargeTax, 60.0, "making charge tax");
close(r.taxOnReportCharge, 360.0, "report charge tax");
close(r.totalBeforeTax, 27954.43, "total before tax");
close(r.totalTaxAll, 1138.63, "total tax");
close(r.totalAfterTax, 29093.06, "total after tax");

/* The gross column the invoice prints is amount + tax, row by row. */
close(
  r.materialTotals["10-Diamond"].amount + r.materialTotals["10-Diamond"].tax,
  7179.1,
  "10-Diamond gross",
);
close(r.totalMakingCharge + r.makingChargeTax, 2060.0, "making charge gross");
close(r.totalReportCharge + r.taxOnReportCharge, 2360.0, "report charge gross");

/* Those grosses must add up to the Total row's right-hand figure. */
const gross = Object.values(r.materialTotals).reduce(
  (s, m) => s + m.amount + m.tax,
  0,
);
close(
  gross + r.totalMakingCharge + r.makingChargeTax + r.totalReportCharge + r.taxOnReportCharge,
  r.totalAfterTax,
  "gross rows sum to total after tax",
  0.05,
);

/* The parts must always add up to the whole, whatever the numbers. */
const matTax = Object.values(r.materialTotals).reduce((s, m) => s + m.tax, 0);
close(
  matTax + r.makingChargeTax + r.taxOnReportCharge,
  r.totalTaxAll,
  "tax rows sum to total tax",
);
const matAmt = Object.values(r.materialTotals).reduce((s, m) => s + m.amount, 0);
close(
  matAmt + r.totalMakingCharge + r.totalReportCharge,
  r.totalBeforeTax,
  "amount rows sum to total before tax",
  /* taxableAmount arrives pre-rounded from the DB, so allow a few paise. */
  0.05,
);

console.log("invoice totals check: ok");
