'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const addIdx = async (table, name, cols) => {
      try {
        await queryInterface.addIndex(table, cols, { name });
      } catch (e) {
        if (!e.message.includes('Duplicate key name')) throw e;
      }
    };

    // users — most-scanned table; dashboard filters on role_id, own, parent_id
    await addIdx('users', 'ix_users_role_own_parent', ['role_id', 'own', 'parent_id']);
    await addIdx('users', 'ix_users_parent_role',     ['parent_id', 'role_id']);
    await addIdx('users', 'ix_users_role_created',    ['role_id', 'created_at']);
    await addIdx('users', 'ix_users_role_state',      ['role_id', 'state_id']);
    await addIdx('users', 'ix_users_role_district',   ['role_id', 'district_id']);

    // sales — three boolean flags never indexed before
    await addIdx('sales', 'ix_sales_flags_saleby',
      ['is_approval', 'is_assigned', 'is_approved', 'sale_by', 'invoice_date']);
    await addIdx('sales', 'ix_sales_flags_user',
      ['is_approval', 'is_assigned', 'is_approved', 'user_id', 'invoice_date']);

    // stocks — type column never indexed
    await addIdx('stocks', 'ix_stocks_type_user', ['type', 'user_id']);
    await addIdx('stocks', 'ix_stocks_user_type', ['user_id', 'type']);

    // purchases
    await addIdx('purchases', 'ix_purchases_user_flags',
      ['user_id', 'is_approval', 'is_assigned', 'is_approved']);
    await addIdx('purchases', 'ix_purchases_supplier',
      ['supplier_id', 'is_approval', 'is_assigned']);

    // orders — month chart queries
    await addIdx('orders', 'ix_orders_from_created',   ['order_from', 'created_at']);
    await addIdx('orders', 'ix_orders_touser_created', ['to_user_id', 'created_at']);
    await addIdx('orders', 'ix_orders_se_created',     ['sales_executive_id', 'created_at']);

    // join tables used by aggregate queries
    await addIdx('sale_products',   'ix_sale_products_sale',    ['sale_id', 'product_id']);
    await addIdx('stock_materials', 'ix_stock_materials_stock', ['stock_id']);
    await addIdx('user_to_users',   'ix_user_to_users_user',    ['user_id', 'to_role_id', 'created_at']);
  },

  async down(queryInterface) {
    const names = [
      ['users',          'ix_users_role_own_parent'],
      ['users',          'ix_users_parent_role'],
      ['users',          'ix_users_role_created'],
      ['users',          'ix_users_role_state'],
      ['users',          'ix_users_role_district'],
      ['sales',          'ix_sales_flags_saleby'],
      ['sales',          'ix_sales_flags_user'],
      ['stocks',         'ix_stocks_type_user'],
      ['stocks',         'ix_stocks_user_type'],
      ['purchases',      'ix_purchases_user_flags'],
      ['purchases',      'ix_purchases_supplier'],
      ['orders',         'ix_orders_from_created'],
      ['orders',         'ix_orders_touser_created'],
      ['orders',         'ix_orders_se_created'],
      ['sale_products',  'ix_sale_products_sale'],
      ['stock_materials','ix_stock_materials_stock'],
      ['user_to_users',  'ix_user_to_users_user'],
    ];
    for (const [table, name] of names) {
      try { await queryInterface.removeIndex(table, name); } catch (_) {}
    }
  },
};
