'use strict';

/**
 * Lookup indexes for the columns the list endpoints actually filter on.
 *
 * The existing `*_indexing` keys all lead with `id`, which is the primary key
 * and therefore unique - MySQL cannot use them to find rows by a foreign key,
 * so `WHERE product_id = ?` fell back to a table scan. Measured on the stock
 * list: the certificates join scanned all 1,759 product_certificates rows per
 * stock row and accounted for ~1.0 s of the 1.1 s response.
 *
 * Indexes only. No column, table or query changes, so no response changes.
 */
const INDEXES = [
  ['product_certificates', 'ix_product_certificates_product', ['product_id']],
  ['product_certificates', 'ix_product_certificates_certificate', ['certificate_id']],
  ['carts', 'ix_carts_stock', ['stock_id']],
  ['carts', 'ix_carts_user_type', ['user_id', 'type']],
  ['purchase_products', 'ix_purchase_products_purchase', ['purchase_id']],
  ['purchase_product_materials', 'ix_ppm_purchase_product', ['purchase_product_id']],
  ['purchase_product_materials', 'ix_ppm_purchase', ['purchase_id']],
  ['sale_product_materials', 'ix_spm_sale_product', ['sale_product_id']],
  ['sale_product_materials', 'ix_spm_sale', ['sale_id']],
  ['payments', 'ix_payments_user', ['user_id']],
  ['payments', 'ix_payments_table', ['table_type', 'table_id']],
];

const hasIndex = async (queryInterface, table, name) => {
  const [rows] = await queryInterface.sequelize.query(
    `SHOW INDEX FROM \`${table}\` WHERE Key_name = '${name}'`
  );
  return rows.length > 0;
};

module.exports = {
  async up(queryInterface) {
    for (const [table, name, fields] of INDEXES) {
      try {
        if (await hasIndex(queryInterface, table, name)) continue;
        await queryInterface.addIndex(table, fields, { name });
      } catch (err) {
        // a missing table must not block the rest of the indexes
        console.log(`skip ${name} on ${table}: ${err.message}`);
      }
    }
  },

  async down(queryInterface) {
    for (const [table, name] of INDEXES) {
      try {
        if (!(await hasIndex(queryInterface, table, name))) continue;
        await queryInterface.removeIndex(table, name);
      } catch (err) {
        console.log(`skip drop ${name} on ${table}: ${err.message}`);
      }
    }
  },
};
