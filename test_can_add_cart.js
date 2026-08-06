// Equivalence check for the canStockAddCart rewrite (2 queries -> 1).
// The old code branched on a `stock` row and a separate carts SUM; the new one
// branches on a single joined row. Same truth table, or the listings start
// offering stock that is already fully in someone's cart.
const assert = require("assert");

// old: !stock || !cart.length || !cart[0].total_quantity || cart[0].total_quantity < stock.quantity
const oldWay = (stock, cart) =>
  !stock || !cart.length || !cart[0].total_quantity || cart[0].total_quantity < stock.quantity;

// new: !rows.length || !rows[0].total_quantity || rows[0].total_quantity < rows[0].quantity
const newWay = (rows) =>
  !rows.length || !rows[0].total_quantity || rows[0].total_quantity < rows[0].quantity;

const cases = [
  // [label, stock.quantity or null if no stock row, carts SUM]
  ["no stock row",              null, 5],
  ["no stock row, empty cart",  null, null],
  ["nothing in any cart",       10,   null],   // SUM over no rows -> NULL
  ["zero in cart",              10,   0],
  ["partly carted",             10,   4],
  ["fully carted",              10,   10],
  ["over-carted",               10,   12],
  ["zero-qty stock, carted",    0,    3],
];

for (const [label, quantity, total_quantity] of cases) {
  const stock = quantity === null ? null : { quantity };
  const cart = [{ total_quantity }];           // raw SUM always yields one row
  const rows = quantity === null ? [] : [{ quantity, total_quantity }];
  assert.strictEqual(
    newWay(rows), oldWay(stock, cart),
    `diverged on "${label}": new=${newWay(rows)} old=${oldWay(stock, cart)}`
  );
}

console.log(`canStockAddCart: ${cases.length} cases match the old behaviour`);
