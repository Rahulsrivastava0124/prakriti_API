'use strict';

/**
 * Dashboard performance indexes.
 *
 * Why this exists
 * ---------------
 * The only prior index migration (20221201092123-add_index_in_tables.js) created
 * composite indexes that all lead with the `id` column. Because `id` is the unique
 * primary key, MySQL's leftmost-prefix rule means those indexes can only ever
 * serve lookups BY id. The dashboard never filters by id, so every one of its
 * ~134 queries per request falls back to a full table scan.
 *
 * These indexes match the predicates the dashboard actually issues.
 *
 * Two things every index below accounts for:
 *   1. Every model is `paranoid: true`, so Sequelize silently appends
 *      `deleted_at IS NULL` to EVERY query. An index that omits deleted_at
 *      forces MySQL to read the row to evaluate it. It is included throughout.
 *   2. Timestamps are remapped: the JS attribute is `createdAt` but the physical
 *      column is `created_at`. Indexes use the physical name.
 *
 * Safety
 * ------
 * Additive only. Nothing is dropped, no existing index is modified, and no
 * application code needs to change for these to take effect. Rolling back is
 * a clean drop.
 *
 * Run during a low-traffic window. On MySQL 5.6+ / InnoDB these build online,
 * but on large tables they still consume I/O.
 */

const INDEXES = [
  // ── users ────────────────────────────────────────────────────────────────
  // dashboard.controller.js repeatedly does:
  //   { role_id, own, parent_id: { [Op.in]: [...] } }
  {
    table: 'users',
    name: 'ix_users_role_own_parent',
    fields: ['role_id', 'own', 'deleted_at', 'parent_id'],
  },
  // avlStockUserIdsNew walks the tree downward: parent_id first, then role.
  {
    table: 'users',
    name: 'ix_users_parent_role',
    fields: ['parent_id', 'role_id', 'deleted_at'],
  },
  // Month chart: UserModel.count({ role_id, createdAt: BETWEEN })
  {
    table: 'users',
    name: 'ix_users_role_created',
    fields: ['role_id', 'deleted_at', 'created_at'],
  },
  // Admin / distributor branches scope by geography.
  {
    table: 'users',
    name: 'ix_users_role_state',
    fields: ['role_id', 'state_id', 'deleted_at'],
  },
  {
    table: 'users',
    name: 'ix_users_role_district',
    fields: ['role_id', 'district_id', 'deleted_at'],
  },

  // ── sales ────────────────────────────────────────────────────────────────
  // The three approval flags appear as equality predicates on EVERY sales query
  // in the dashboard and are currently indexed nowhere. Leading with them lets
  // MySQL seek straight to the qualifying range, then range-scan invoice_date.
  {
    table: 'sales',
    name: 'ix_sales_flags_saleby',
    fields: ['is_approval', 'is_assigned', 'is_approved', 'deleted_at', 'sale_by', 'invoice_date'],
  },
  {
    table: 'sales',
    name: 'ix_sales_flags_user',
    fields: ['is_approval', 'is_assigned', 'is_approved', 'deleted_at', 'user_id', 'invoice_date'],
  },

  // ── stocks ───────────────────────────────────────────────────────────────
  // getTotalStockByUser / getTotalStockPriceByUser filter on { type, user_id }.
  // `type` is indexed nowhere today. Both column orders are provided because
  // the selectivity depends on your data distribution — see the note at the
  // bottom of this file for how to decide which to keep.
  {
    table: 'stocks',
    name: 'ix_stocks_type_user',
    fields: ['type', 'deleted_at', 'user_id'],
  },
  {
    table: 'stocks',
    name: 'ix_stocks_user_type',
    fields: ['user_id', 'deleted_at', 'type'],
  },

  // ── purchases ────────────────────────────────────────────────────────────
  {
    table: 'purchases',
    name: 'ix_purchases_user_flags',
    fields: ['user_id', 'is_approval', 'is_assigned', 'is_approved', 'deleted_at'],
  },
  {
    table: 'purchases',
    name: 'ix_purchases_supplier_flags',
    fields: ['supplier_id', 'is_approval', 'is_assigned', 'deleted_at'],
  },

  // ── orders (month chart) ─────────────────────────────────────────────────
  {
    table: 'orders',
    name: 'ix_orders_from_created',
    fields: ['order_from', 'deleted_at', 'created_at'],
  },
  {
    table: 'orders',
    name: 'ix_orders_touser_created',
    fields: ['to_user_id', 'deleted_at', 'created_at'],
  },
  {
    table: 'orders',
    name: 'ix_orders_se_created',
    fields: ['sales_executive_id', 'deleted_at', 'created_at'],
  },

  // ── join tables used by the aggregate rewrites ───────────────────────────
  {
    table: 'sale_products',
    name: 'ix_sale_products_sale',
    fields: ['sale_id', 'deleted_at', 'product_id'],
  },
  {
    table: 'user_to_users',
    name: 'ix_user_to_users_lookup',
    fields: ['user_id', 'to_role_id', 'deleted_at', 'created_at'],
  },
];

/**
 * Adding an index that already exists throws. Adding one to a table or column
 * that does not exist also throws. Either would abort the whole migration and
 * leave it half-applied, so each index is attempted independently and skipped
 * with a warning rather than failing the run.
 */
const addIndexSafely = async (queryInterface, spec) => {
  try {
    await queryInterface.addIndex(spec.table, spec.fields, { name: spec.name });
    console.log(`  ✓ ${spec.table}.${spec.name}  (${spec.fields.join(', ')})`);
  } catch (error) {
    const message = String(error && error.message ? error.message : error);
    if (message.includes('Duplicate key name') || message.includes('already exists')) {
      console.log(`  – ${spec.name} already exists, skipping`);
      return;
    }
    console.warn(`  ! ${spec.name} could not be created: ${message}`);
  }
};

const removeIndexSafely = async (queryInterface, spec) => {
  try {
    await queryInterface.removeIndex(spec.table, spec.name);
    console.log(`  ✓ dropped ${spec.name}`);
  } catch (error) {
    console.warn(`  ! ${spec.name} could not be dropped: ${String(error && error.message)}`);
  }
};

module.exports = {
  async up(queryInterface) {
    console.log(`Creating ${INDEXES.length} dashboard performance indexes...`);
    for (const spec of INDEXES) {
      await addIndexSafely(queryInterface, spec);
    }
    console.log('Done. Verify with: node scripts/dashboard_explain_check.js');
  },

  async down(queryInterface) {
    for (const spec of INDEXES) {
      await removeIndexSafely(queryInterface, spec);
    }
  },
};

/**
 * After running, check which indexes MySQL actually chose:
 *
 *   node scripts/dashboard_explain_check.js
 *
 * Then review cardinality and prune:
 *
 *   SHOW INDEX FROM stocks;
 *   SHOW INDEX FROM sales;
 *
 * Two column-order pairs are deliberately provided above
 * (ix_stocks_type_user / ix_stocks_user_type). Keep whichever the optimiser
 * picks and drop the other — a redundant index costs write throughput on every
 * INSERT and UPDATE for no read benefit.
 *
 * If almost every row has is_approval = 0, the flag-led sales indexes will have
 * poor selectivity on their leading column. That is still fine, because the
 * flags are equality predicates and sale_by immediately follows — MySQL seeks
 * to the flag combination then range-scans. But confirm with EXPLAIN rather
 * than assuming; if `rows` is still large, rebuild with sale_by leading.
 */
