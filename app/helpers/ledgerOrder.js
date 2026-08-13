/**
 * Ordering for the transaction ledgers (passbook view).
 *
 * The ledger reads chronologically — newest transaction first — no matter which
 * invoice each row belongs to. Rows that share a txn_date fall back to `index`,
 * the order the rows were built in (each sale immediately followed by its own
 * payments), so the running balance computed from this order is reproducible
 * rather than left to whatever the sort happens to do with ties.
 *
 * Kept dependency-free on purpose: the sale and purchase ledgers, on screen and
 * in the PDF, all sort through this one comparator, so they cannot drift apart.
 */
const byTxnDateDesc = (a, b) => {
  const byDate = new Date(b.txn_date) - new Date(a.txn_date);
  return byDate !== 0 ? byDate : b.index - a.index;
};

module.exports = { byTxnDateDesc };

// Self-check: `node app/helpers/ledgerOrder.js`
if (require.main === module) {
  const assert = require("assert");

  // Two invoices whose transactions interleave in time. Invoice-based ordering
  // keeps each invoice's rows together; date-based ordering interleaves them.
  const rows = [
    { index: 1, invoice_number: "RV-S-88", txn_date: "2026-05-06", type: "Sale" },
    { index: 2, invoice_number: "RV-S-88", txn_date: "2026-08-02", type: "Payment" },
    { index: 3, invoice_number: "RV-S-121", txn_date: "2026-07-24", type: "Sale" },
    { index: 4, invoice_number: "RV-S-121", txn_date: "2026-08-02", type: "Payment" },
  ];

  const sorted = [...rows].sort(byTxnDateDesc);

  assert.deepStrictEqual(
    sorted.map((r) => r.index),
    [4, 2, 3, 1],
    "rows must run newest date first, ties on build order",
  );

  // The whole point: the 24/07 sale sits between the two 02/08 payments instead
  // of being dragged up next to its own invoice's payment.
  assert.strictEqual(sorted[2].invoice_number, "RV-S-121");
  assert.strictEqual(sorted[3].invoice_number, "RV-S-88");

  // Dates must be non-increasing down the list.
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(
      new Date(sorted[i - 1].txn_date) >= new Date(sorted[i].txn_date),
      `row ${i} breaks date ordering`,
    );
  }

  console.log("ledgerOrder self-check passed");
}
