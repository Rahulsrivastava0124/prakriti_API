/**
 * Re-prices a stored sale at today's live gold rate, for the "Current Invoice"
 * download.
 *
 * The normal invoice is a historical document: every rate was frozen onto
 * sale_product_materials when the sale was raised, and it must keep printing
 * those numbers forever. The current invoice answers a different question —
 * "what would this same jewellery cost at today's gold price?" — so only the
 * gold rate moves. Diamond and other stone rates, weights, making charges and
 * discount percentages all stay exactly as sold.
 *
 * NOTHING HERE IS PERSISTED. It mutates an already-loaded Sequelize instance in
 * memory so the existing SaleCollection + invoice template render the new
 * figures; the caller must never .save() that instance.
 *
 * Kept free of DB/helper imports on purpose so the self-check at the bottom runs
 * standalone: `node app/library/liveInvoicePricing.js`
 */

/* Local 2dp round rather than @helpers/helper's priceFormat, which drags in the
   whole model layer (and therefore a live DB connection) just to round. */
const round2 = (n) => {
  const v = parseFloat(n);
  return isNaN(v) ? 0 : Math.round((v + Number.EPSILON) * 100) / 100;
};

const round3 = (n) => {
  const v = parseFloat(n);
  return isNaN(v) ? 0 : Math.round((v + Number.EPSILON) * 1000) / 1000;
};

const num = (v) => {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
};

const isGoldName = (name) => /gold/i.test(name || "");

/**
 * Live per-gram rate for a purity, using the same karat mapping as
 * applyLiveGoldPrice in @library/common: the feed already returns per-karat spot
 * prices, so the purity picks a karat rather than scaling the 24K price (which
 * would discount twice).
 */
const liveRateForPurity = (purityValue, liveRates) => {
  const purity = num(purityValue);
  if (!(purity > 0)) return 0;
  if (purity >= 95) return num(liveRates.rate);
  if (purity >= 85) return num(liveRates.rate22);
  return num(liveRates.rate18);
};

/* The feed quotes per gram. Anything sold by another unit has to be converted,
   mirroring convertPerGramPriceToPerUnit in @helpers/helper. */
const perGramToUnit = (price, unit) => {
  const u = (unit || "").toLowerCase();
  if (u === "carat" || u === "carats" || u === "ct") return price / 5;
  if (u === "ratti" || u === "rati") return price * 0.182;
  if (u === "cent") return price / 500;
  return price; // gram / gm / blank
};

/**
 * How much of the list price a material was actually charged at, as a fraction.
 *
 * discount_percent cannot be trusted for this: some sales store 45 there with
 * discount_amount 0, because the column records the discount the seller was
 * *allowed* to give, not the one they gave. Only discount_amount says what
 * actually came off. So the ratio is derived from the stored money:
 *
 *     charged / list  =  (weight × rate − discount_amount) / (weight × rate)
 *
 * 1 means full list price, 0.55 means 45% off was genuinely applied.
 */
const chargedRatio = (weight, rate, discountAmount) => {
  const gross = num(weight) * num(rate);
  if (!(gross > 0)) return 1;
  const ratio = (gross - num(discountAmount)) / gross;
  return ratio > 0 && ratio <= 1 ? ratio : 1;
};

/**
 * The live feed quotes a NET market rate. To make a material cost exactly
 * weight × liveRate once its own discount comes off again, the list rate has to
 * be grossed back up by the same ratio the sale actually charged at.
 */
const listRateFor = (liveNetRate, ratio) =>
  round2(ratio > 0 ? num(liveNetRate) / ratio : num(liveNetRate));

/**
 * Totals for one sale product. This is the arithmetic the sale itself was built
 * with, verified against stored rows:
 *   sub_price = Σ(weight × rate) + making_charge
 *   discount  = Σ(material discounts) + making_charge × making_charge_discount%
 *   taxable   = sub_price − discount
 *   tax       = taxable × igst%
 *   total     = taxable + tax
 */
const computeProductTotals = ({
  materials,
  makingCharge,
  makingChargeDiscountPercent,
  taxPercent,
}) => {
  let materialsTotal = 0;
  let materialDiscount = 0;

  const priced = materials.map((m) => {
    const amount = round2(num(m.weight) * num(m.rate));
    /* The discount keeps the share of the list price it had when sold, so a row
       that was never discounted stays undiscounted and one sold at 45% off
       stays at 45% off. */
    const discount = round2(amount * (1 - num(m.chargedRatio)));
    materialsTotal += amount;
    materialDiscount += discount;
    return { ...m, amount, discountAmount: discount };
  });

  const mc = round2(makingCharge);
  const mcDiscount = round2((mc * num(makingChargeDiscountPercent)) / 100);
  const subPrice = round2(materialsTotal + mc);
  const totalDiscount = round2(materialDiscount + mcDiscount);
  const taxable = round2(subPrice - totalDiscount);
  const tax = round2((taxable * num(taxPercent)) / 100);

  return {
    materials: priced,
    subPrice,
    makingChargeDiscountAmount: mcDiscount,
    totalDiscount,
    taxable,
    tax,
    total: round2(taxable + tax),
  };
};

const parseTaxInfo = (raw) => {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

/**
 * Walks a loaded sale (with saleProducts → saleMaterials) and rewrites every
 * gold rate to the live one, then rolls the totals back up to the sale.
 *
 * Returns a summary of what moved, so the caller can print "priced at today's
 * rate" on the document instead of silently handing over different numbers.
 */
const repriceSaleAtLiveGold = (sale, liveRates) => {
  const changes = [];
  let saleTaxable = 0;
  let saleTax = 0;
  let saleDiscount = 0;

  const products = sale.saleProducts || [];

  for (const product of products) {
    const taxInfo = parseTaxInfo(product.tax_info);
    const saleMaterials = product.saleMaterials || [];

    const input = saleMaterials.map((m) => {
      const isGold = isGoldName(m.material ? m.material.name : "");
      const livePerGram = isGold
        ? liveRateForPurity(m.purity ? m.purity.value : null, liveRates)
        : 0;
      const unit = m.unit ? m.unit.name : "";
      const ratio = chargedRatio(m.weight, m.rate, m.discount_amount);
      /* Fall back to the sold rate whenever the feed has nothing usable for this
         metal — a dead feed must not silently zero out an invoice. Non-gold rows
         keep their rate and ratio, so they come out byte-identical. */
      const rate =
        livePerGram > 0
          ? listRateFor(perGramToUnit(livePerGram, unit), ratio)
          : num(m.rate);
      if (isGold && livePerGram > 0 && rate !== num(m.rate)) {
        changes.push({
          material: m.material ? m.material.name : "",
          purity: m.purity ? m.purity.name : "",
          old_rate: num(m.rate),
          new_rate: rate,
        });
      }
      return {
        ref: m,
        weight: num(m.weight),
        rate,
        chargedRatio: ratio,
      };
    });

    const totals = computeProductTotals({
      materials: input,
      makingCharge: num(product.making_charge),
      makingChargeDiscountPercent: num(product.making_charge_discount),
      taxPercent: num(taxInfo.igst),
    });

    totals.materials.forEach((m) => {
      // Use setDataValue for Sequelize models, or direct assignment for plain objects
      const setVal = (obj, key, val) => {
        if (obj.setDataValue) obj.setDataValue(key, val);
        else obj[key] = val;
      };
      setVal(m.ref, 'rate', m.rate);
      setVal(m.ref, 'amount', m.amount);
      setVal(m.ref, 'discount_amount', m.discountAmount);
      setVal(m.ref, 'per_gram_price', round2(
        m.weight > 0 ? m.amount / round3(num(m.ref.total_gram) || m.weight) : 0,
      ));
    });

    // Use setDataValue for Sequelize models, or direct assignment for plain objects
    const setProduct = (key, val) => {
      if (product.setDataValue) product.setDataValue(key, val);
      else product[key] = val;
    };
    setProduct('sub_price', totals.subPrice);
    setProduct('making_charge_discount_amount', totals.makingChargeDiscountAmount);
    setProduct('total_discount', totals.totalDiscount);
    setProduct('tax', totals.tax);
    setProduct('total', totals.total);

    /* Keep the product's own split consistent with how it was stored. */
    if (num(product.cgst_tax) > 0 || num(product.sgst_tax) > 0) {
      setProduct('cgst_tax', round2(totals.tax / 2));
      setProduct('sgst_tax', round2(totals.tax / 2));
      setProduct('igst_tax', 0);
    } else {
      setProduct('igst_tax', totals.tax);
    }

    saleTaxable += totals.taxable;
    saleTax += totals.tax;
    saleDiscount += totals.totalDiscount;
  }

  saleTaxable = round2(saleTaxable);
  saleTax = round2(saleTax);
  saleDiscount = round2(saleDiscount);

  /* report_charge sits outside the per-product taxable base and is not affected
     by the metal rate, so it rides along untouched. */
  const billAmount = round2(saleTaxable + saleTax - num(sale.discount));

  // Use setDataValue for Sequelize models, or direct assignment for plain objects
  const setSale = (key, val) => {
    if (sale.setDataValue) sale.setDataValue(key, val);
    else sale[key] = val;
  };
  setSale('taxable_amount', saleTaxable);
  setSale('product_discount', saleDiscount);
  if (num(sale.cgst_tax) > 0 || num(sale.sgst_tax) > 0) {
    setSale('cgst_tax', round2(saleTax / 2));
    setSale('sgst_tax', round2(saleTax / 2));
    setSale('igst_tax', 0);
  } else {
    setSale('igst_tax', saleTax);
  }
  setSale('bill_amount', billAmount);
  setSale('total_payable', billAmount);
  setSale('total_amount', billAmount);
  /* What is already paid does not change; only what is still owed does. */
  setSale('due_amount', round2(Math.max(0, billAmount - num(sale.paid_amount))));

  return { changes, taxable: saleTaxable, tax: saleTax, total: billAmount };
};

/**
 * Takes what went back out of a loaded sale, so a current-rate invoice bills
 * only what the customer still holds. Call it BEFORE repriceSaleAtLiveGold:
 * the repricer rolls every sale total up from saleProducts, so whatever is
 * left here is exactly what gets billed.
 *
 *   - a product returned whole (is_return) is dropped, and a certified one
 *     takes its report charge with it (report_qty)
 *   - a loose material returned in part keeps only the weight/qty still held
 *
 * In memory only, like the repricer - the caller must never save the sale.
 */
const withoutReturnedProducts = (sale) => {
  const setVal = (obj, key, val) => {
    if (obj.setDataValue) obj.setDataValue(key, val);
    else obj[key] = val;
  };
  let returnedCertified = 0;
  const kept = [];

  for (const product of sale.saleProducts || []) {
    if (product.is_return) {
      if (product.certificate_no) returnedCertified++;
      continue;
    }
    let held = 0;
    for (const m of product.saleMaterials || []) {
      const back = num(m.return_weight);
      if (back > 0) {
        const weight = round3(num(m.weight) - back);
        /* total_gram is the same weight in grams, so it shrinks in step */
        const gramsPerUnit = num(m.weight) > 0 ? num(m.total_gram) / num(m.weight) : 1;
        setVal(m, "weight", weight);
        setVal(m, "total_gram", round3(weight * gramsPerUnit));
        setVal(m, "quantity", Math.max(0, num(m.quantity) - num(m.return_qty)));
      }
      held += num(m.weight);
    }
    if (held > 0 || !(product.saleMaterials || []).length) kept.push(product);
  }

  setVal(sale, "saleProducts", kept);
  /* an included association lives as a plain property on a Sequelize
     instance too, and that is what sale.saleProducts reads - setDataValue
     alone left every returned piece on the invoice */
  sale.saleProducts = kept;
  setVal(sale, "report_qty", Math.max(0, num(sale.report_qty) - returnedCertified));
  return sale;
};

/**
 * The plain invoice (rates as sold) minus the returned pieces. Drops them
 * like withoutReturnedProducts, then takes exactly their stored share off the
 * stored sale figures - their totals and tax, plus the report charge (and its
 * GST) of each returned certified piece. Nothing is recomputed, so a held
 * piece prints to the paisa as it was sold, and so does the report charge.
 * Returns the products taken out. In memory only; never save the sale.
 */
const withoutReturnedTotals = (sale) => {
  const setVal = (obj, key, val) => {
    if (obj.setDataValue) obj.setDataValue(key, val);
    else obj[key] = val;
  };
  const all = [...(sale.saleProducts || [])];
  const reportQtyBefore = num(sale.report_qty);
  withoutReturnedProducts(sale);
  const returned = all.filter((p) => !sale.saleProducts.includes(p));
  if (!returned.length) return returned;

  const productBack = returned.reduce((t, p) => t + num(p.total), 0);
  const taxBack = returned.reduce((t, p) => t + num(p.tax), 0);
  const reportBack =
    (reportQtyBefore - num(sale.report_qty)) * num(sale.report_charge);
  const reportTaxBack = (reportBack * num(sale.report_tax_percentage)) / 100;

  setVal(sale, "taxable_amount",
    round2(num(sale.taxable_amount) - (productBack - taxBack) - reportBack));
  const allTaxBack = taxBack + reportTaxBack;
  if (num(sale.cgst_tax) > 0 || num(sale.sgst_tax) > 0) {
    setVal(sale, "cgst_tax", round2(num(sale.cgst_tax) - allTaxBack / 2));
    setVal(sale, "sgst_tax", round2(num(sale.sgst_tax) - allTaxBack / 2));
  } else {
    setVal(sale, "igst_tax", round2(num(sale.igst_tax) - allTaxBack));
  }
  const totalAmount = round2(
    num(sale.total_amount) - productBack - reportBack - reportTaxBack,
  );
  setVal(sale, "total_amount", totalAmount);
  setVal(sale, "bill_amount", round2(totalAmount - num(sale.discount)));
  return returned;
};

/**
 * The current-rate invoice: what the customer still holds, at today's gold
 * rate, in the stored sale figures' own terms (report charge and its GST
 * included, as the invoice templates expect).
 *
 *   1. the returned pieces' stored share comes off (withoutReturnedTotals)
 *   2. the held pieces are repriced at the live rate
 *   3. each sale figure moves by exactly what the held pieces' totals and tax
 *      moved, so the report charge and cash discount carry over untouched
 *   4. total_payable = total_amount - discount, due = payable - paid (>= 0)
 *
 * Returns the repricer's summary ({ changes, ... }). In memory only.
 */
const heldAtLiveRate = (sale, liveRates) => {
  const setVal = (obj, key, val) => {
    if (obj.setDataValue) obj.setDataValue(key, val);
    else obj[key] = val;
  };
  withoutReturnedTotals(sale);
  const held = sale.saleProducts || [];
  const before = held.map((p) => ({ total: num(p.total), tax: num(p.tax) }));
  const repricing = repriceSaleAtLiveGold(
    { saleProducts: held, discount: 0, paid_amount: 0 },
    liveRates,
  );
  let dTotal = 0,
    dTax = 0;
  held.forEach((p, i) => {
    dTotal += num(p.total) - before[i].total;
    dTax += num(p.tax) - before[i].tax;
  });

  setVal(sale, "taxable_amount", round2(num(sale.taxable_amount) + dTotal - dTax));
  if (num(sale.cgst_tax) > 0 || num(sale.sgst_tax) > 0) {
    setVal(sale, "cgst_tax", round2(num(sale.cgst_tax) + dTax / 2));
    setVal(sale, "sgst_tax", round2(num(sale.sgst_tax) + dTax / 2));
  } else {
    setVal(sale, "igst_tax", round2(num(sale.igst_tax) + dTax));
  }
  const totalAmount = round2(num(sale.total_amount) + dTotal);
  const payable = round2(totalAmount - num(sale.discount));
  setVal(sale, "total_amount", totalAmount);
  setVal(sale, "bill_amount", payable);
  setVal(sale, "total_payable", payable);
  setVal(sale, "due_amount", round2(Math.max(0, payable - num(sale.paid_amount))));
  return repricing;
};

module.exports = {
  heldAtLiveRate,
  withoutReturnedTotals,
  withoutReturnedProducts,
  repriceSaleAtLiveGold,
  computeProductTotals,
  liveRateForPurity,
  perGramToUnit,
  listRateFor,
  chargedRatio,
};

// Self-check: `node app/library/liveInvoicePricing.js`
if (require.main === module) {
  const assert = require("assert");

  const LIVE = { rate: 15197, rate22: 13930, rate18: 11398 };

  // ── karat mapping matches applyLiveGoldPrice ──
  assert.strictEqual(liveRateForPurity(99.9, LIVE), 15197, "24K");
  assert.strictEqual(liveRateForPurity(91.6, LIVE), 13930, "22K");
  assert.strictEqual(liveRateForPurity(76, LIVE), 11398, "18K");
  assert.strictEqual(liveRateForPurity(0, LIVE), 0, "no purity → no live rate");

  assert.strictEqual(perGramToUnit(500, "Cent"), 1, "cent = 1/500 g");
  assert.strictEqual(perGramToUnit(11398, "GM"), 11398, "grams pass through");

  // ── the stored numbers must reproduce exactly ──
  // Sale RV-S-89, one of its three identical products, as stored in the DB.
  const asSold = computeProductTotals({
    materials: [
      { weight: 0.16, rate: 11550, chargedRatio: 1 },
      { weight: 10, rate: 290, chargedRatio: 1 },
    ],
    makingCharge: 545.45,
    makingChargeDiscountPercent: 45,
    taxPercent: 3,
  });
  assert.strictEqual(asSold.subPrice, 5293.45, "sub_price");
  assert.strictEqual(asSold.makingChargeDiscountAmount, 245.45, "MC discount");
  assert.strictEqual(asSold.taxable, 5048, "taxable");
  assert.strictEqual(asSold.tax, 151.44, "tax @3%");
  assert.strictEqual(asSold.total, 5199.44, "product total");
  // …and roll up to the invoice the user is looking at.
  assert.strictEqual(round2(asSold.taxable * 3), 15144, "invoice taxable");
  assert.strictEqual(round2(asSold.total * 3), 15598.32, "invoice total");

  // ── same product at the live 18K rate ──
  const atLive = computeProductTotals({
    materials: [
      { weight: 0.16, rate: liveRateForPurity(76, LIVE), chargedRatio: 1 },
      { weight: 10, rate: 290, chargedRatio: 1 },
    ],
    makingCharge: 545.45,
    makingChargeDiscountPercent: 45,
    taxPercent: 3,
  });
  // gold 0.160 × 11398 = 1823.68 (was 1848.00); diamond untouched at 2900.
  assert.strictEqual(atLive.materials[0].amount, 1823.68, "gold repriced");
  assert.strictEqual(atLive.materials[1].amount, 2900, "diamond untouched");
  assert.strictEqual(atLive.subPrice, 5269.13, "sub_price at live rate");
  assert.strictEqual(
    atLive.makingChargeDiscountAmount,
    245.45,
    "making charge and its discount do not move with the metal rate",
  );
  assert.strictEqual(atLive.taxable, 5023.68, "taxable at live rate");
  assert.strictEqual(atLive.tax, 150.71, "tax at live rate");
  assert.strictEqual(atLive.total, 5174.39, "product total at live rate");

  // ── list rate vs net rate ──
  // Sale RV-S-129 stores gold as an MRP of 20909.09 with 45% off, i.e. a net of
  // 11500/g. Swapping the live rate straight into `rate` and then still taking
  // 45% off would cost the gold at 6269/g. The live rate is a NET rate, so it
  // has to be grossed back up by the same discount.
  // Sale RV-S-129 stores gold as an MRP of 20909.09 with 45% genuinely taken
  // off (discount_amount 24557.72), i.e. a net of 11500/g. Putting the live rate
  // straight into `rate` and then taking 45% off again would cost the gold at
  // 6269/g, so the live rate is grossed back up by the ratio actually charged.
  // ~0.55 rather than exactly: discount_amount is stored rounded to paise.
  assert.ok(
    Math.abs(chargedRatio(2.61, 20909.09, 24557.72) - 0.55) < 1e-5,
    "45% really applied",
  );
  assert.strictEqual(listRateFor(11398, 0.55), 20723.64, "grossed-up list rate");
  assert.strictEqual(round2(listRateFor(11398, 0.55) * 0.55), 11398, "nets to the live rate");

  const mrp = computeProductTotals({
    materials: [{ weight: 2.61, rate: listRateFor(11398, 0.55), chargedRatio: 0.55 }],
    makingCharge: 0,
    makingChargeDiscountPercent: 0,
    taxPercent: 0,
  });
  /* Within a paisa, not exact: the grossed-up rate is printed at 2dp, so
     rate → amount → discount cannot round-trip perfectly. Landing inside ₹0.01
     on the metal line is the tightest an invoice showing a 2dp rate can be. */
  assert.ok(
    round2(Math.abs(mrp.taxable - round2(2.61 * 11398))) <= 0.01,
    `discounted gold should cost weight × live rate, got ${mrp.taxable}`,
  );

  // ── discount_percent is NOT proof a discount was given ──
  // Sales 122/128 store discount_percent 45 with discount_amount 0: the column
  // records what the seller was allowed to give, not what they gave. Pricing off
  // the percentage would invent a 45% discount that never happened.
  assert.strictEqual(
    chargedRatio(1.49, 20909.09, 0),
    1,
    "percent set but nothing taken off → charged at full list",
  );
  const notDiscounted = computeProductTotals({
    materials: [{ weight: 1.49, rate: listRateFor(11398, 1), chargedRatio: 1 }],
    makingCharge: 0,
    makingChargeDiscountPercent: 0,
    taxPercent: 0,
  });
  assert.strictEqual(notDiscounted.totalDiscount, 0, "no discount invented");
  assert.strictEqual(notDiscounted.taxable, round2(1.49 * 11398), "costed at the live rate");

  // A part-discounted row keeps its share.
  assert.strictEqual(chargedRatio(1, 10000, 2500), 0.75, "25% off");
  const part = computeProductTotals({
    materials: [{ weight: 1, rate: 10000, chargedRatio: 0.75 }],
    makingCharge: 0,
    makingChargeDiscountPercent: 0,
    taxPercent: 0,
  });
  assert.strictEqual(part.totalDiscount, 2500, "same 25% share off the new amount");

  // ── a dead feed must leave the invoice exactly as sold ──
  const sale = {
    discount: 0,
    paid_amount: 0,
    igst_tax: 454.32,
    cgst_tax: 0,
    sgst_tax: 0,
    saleProducts: [
      {
        tax_info: '{"name":"Jewellery","cgst":1.5,"sgst":1.5,"igst":3}',
        making_charge: 545.45,
        making_charge_discount: 45,
        cgst_tax: 0,
        sgst_tax: 0,
        saleMaterials: [
          {
            material: { name: "Gold yellow" },
            purity: { name: "18 Carat", value: "76.00" },
            unit: { name: "GM" },
            weight: "0.160",
            rate: "11550.00",
            discount_amount: "0.00",
            discount_percent: "0.00",
            total_gram: "0.160",
          },
        ],
      },
    ],
  };
  const dead = repriceSaleAtLiveGold(sale, { rate: 0, rate22: 0, rate18: 0 });
  assert.strictEqual(dead.changes.length, 0, "no rate change reported");
  assert.strictEqual(
    sale.saleProducts[0].saleMaterials[0].rate,
    11550,
    "sold rate retained when the feed is down",
  );

  // ── the live path reports what it moved and rolls up to the sale ──
  const sale2 = JSON.parse(JSON.stringify(sale));
  sale2.saleProducts[0].saleMaterials[0].rate = "11550.00";
  const live = repriceSaleAtLiveGold(sale2, LIVE);
  assert.strictEqual(live.changes.length, 1, "one gold rate moved");
  assert.strictEqual(live.changes[0].old_rate, 11550);
  assert.strictEqual(live.changes[0].new_rate, 11398);
  // 0.160 × 11398 = 1823.68, + 545.45 MC − 245.45 MC discount = 2123.68 taxable
  assert.strictEqual(live.taxable, 2123.68, "sale taxable");
  assert.strictEqual(live.tax, 63.71, "sale tax");
  assert.strictEqual(sale2.total_payable, 2187.39, "sale total payable");
  assert.strictEqual(sale2.due_amount, 2187.39, "due follows the new total");

  // ── returned products come off the current invoice ──
  const sale3 = JSON.parse(JSON.stringify(sale));
  sale3.report_qty = 2;
  sale3.saleProducts[0].certificate_no = "A1";
  sale3.saleProducts.push({
    ...JSON.parse(JSON.stringify(sale.saleProducts[0])),
    certificate_no: "A2",
    is_return: true,
  });
  withoutReturnedProducts(sale3);
  assert.strictEqual(sale3.saleProducts.length, 1, "returned product dropped");
  assert.strictEqual(sale3.report_qty, 1, "its report charge goes with it");
  const kept3 = repriceSaleAtLiveGold(sale3, LIVE);
  assert.strictEqual(kept3.taxable, 2123.68, "billed for the kept product only");

  // a loose material returned in part keeps only what is still held
  const loose = {
    saleProducts: [{
      saleMaterials: [{ weight: "10.000", total_gram: "10.000", quantity: 1,
        return_weight: "4.000", return_qty: 0 }],
    }],
  };
  withoutReturnedProducts(loose);
  assert.strictEqual(loose.saleProducts[0].saleMaterials[0].weight, 6, "6 of 10 g held");
  assert.strictEqual(loose.saleProducts[0].saleMaterials[0].total_gram, 6);

  // ── plain invoice: a returned piece takes exactly its stored share off ──
  const plain = {
    report_qty: 2, report_charge: 100, report_tax_percentage: 18,
    taxable_amount: 1200, igst_tax: 36, cgst_tax: 0, sgst_tax: 0,
    total_amount: 1236 + 36, discount: 1, // 1000+200 goods, 200 report
    saleProducts: [
      { certificate_no: "K", total: 515, tax: 15, saleMaterials: [{ weight: 1 }] },
      { certificate_no: "R", total: 515, tax: 15, is_return: true, saleMaterials: [{ weight: 1 }] },
    ],
  };
  const back = withoutReturnedTotals(plain);
  assert.strictEqual(back.length, 1, "one returned product");
  assert.strictEqual(plain.report_qty, 1, "its report charge goes");
  assert.strictEqual(plain.taxable_amount, 1200 - 500 - 100, "goods + report off");
  assert.strictEqual(plain.igst_tax, 36 - 15 - 18, "product GST + report GST off");
  assert.strictEqual(plain.total_amount, 1272 - 515 - 100 - 18, "sub total");
  assert.strictEqual(plain.bill_amount, plain.total_amount - 1, "less cash discount");

  // ── current-rate invoice: held pieces at the live rate, report charge kept ──
  // One held 18K piece (0.160 g, sold at 11550, as RV-S-89) + one returned.
  const gold = (rate) => ({
    material: { name: "Gold yellow" }, purity: { name: "18 Carat", value: "76.00" },
    unit: { name: "GM" }, weight: "0.160", total_gram: "0.160", rate: String(rate),
    discount_amount: "0.00",
  });
  const piece = (extra) => ({
    tax_info: '{"igst":3}', making_charge: 545.45, making_charge_discount: 45,
    cgst_tax: 0, sgst_tax: 0, igst_tax: 72.23, tax: 72.23, total: 2479.91,
    certificate_no: "C", saleMaterials: [gold(11550)], ...extra,
  });
  const cur = {
    report_qty: 2, report_charge: 100, report_tax_percentage: 18,
    // goods 2 x 2407.68 + report 200; GST 2 x 72.23 + 36
    taxable_amount: 5015.36, igst_tax: 180.46, cgst_tax: 0, sgst_tax: 0,
    total_amount: 5195.82, discount: 0.82, paid_amount: 1000,
    saleProducts: [piece(), piece({ is_return: true })],
  };
  heldAtLiveRate(cur, LIVE);
  // held piece at 11398: 0.160 x 11398 = 1823.68 gold -> taxable 2123.68, tax 63.71
  assert.strictEqual(cur.report_qty, 1, "returned piece's report charge off");
  assert.strictEqual(cur.taxable_amount, round2(2123.68 + 100), "held goods at live + its report charge");
  assert.strictEqual(cur.igst_tax, round2(63.71 + 18), "held GST at live + report GST");
  assert.strictEqual(cur.total_amount, round2(2123.68 + 63.71 + 100 + 18), "sub total");
  assert.strictEqual(cur.total_payable, round2(cur.total_amount - 0.82), "payable = total - cash discount");
  assert.strictEqual(cur.due_amount, round2(cur.total_payable - 1000), "due = payable - paid");
}
