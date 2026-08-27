'use strict';

/**
 * Indexes for the joins the view / download-view pages run.
 *
 * `GET /sales/view/:id` joins `purchases` on `sale_id`. No index led with that
 * column, so the join was a full table scan of `purchases` — and because that
 * table carries the `req_data` longtext, scanning 187 rows cost 191 ms of a
 * 244 ms response (measured with EXPLAIN ANALYZE).
 *
 * `stocks.purchase_id` has the same shape: it only appears inside
 * `stocks_indexing (id, product_id, size_id, purchase_id, ...)`, behind the
 * primary key, so it can never be used for a lookup.
 *
 * Indexes only. No column, table or query changes, so no response changes.
 */
const INDEXES = [
  ['purchases', 'ix_purchases_sale', ['sale_id']],
  ['purchases', 'ix_purchases_return', ['return_id']],
  ['stocks', 'ix_stocks_purchase', ['purchase_id']],
];

const hasIndex = async (queryInterface, table, name) => {
  const [rows] = await queryInterface.sequelize.query(
    `SHOW INDEX FROM \`${table}\` WHERE Key_name = '${name}'`
  );
  return rows.length > 0;
};

const hasColumn = async (queryInterface, table, column) => {
  const desc = await queryInterface.describeTable(table);
  return !!desc[column];
};

module.exports = {
  async up(queryInterface) {
    for (const [table, name, fields] of INDEXES) {
      try {
        if (await hasIndex(queryInterface, table, name)) continue;
        if (!(await hasColumn(queryInterface, table, fields[0]))) continue;
        await queryInterface.addIndex(table, fields, { name });
      } catch (err) {
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
