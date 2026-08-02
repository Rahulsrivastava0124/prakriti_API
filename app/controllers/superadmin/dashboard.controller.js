const {
  formatResponse,
  formatErrorResponse,
  errorCodes,
} = require("@utils/response.config");
const { UserCollection } = require("@resources/superadmin/UserCollection");
const {
  getRoleId,
  getTotalStockPriceByUser,
  getWalletBalance,
  getWorkingUserID,
  getNextUserName,
  isSuperAdmin,
  getUserColumnValue,
  isDistributor,
  isAdmin,
  getAdminSEWhereCondition,
  isSalesExecutive,
  getTotalStockByUser,
  getMyRetailerIds,
  isManager,
  getPurchaseProducts,
  getPurchaseProductsUser,
  avlStockUserIds,
  avlStockUserIdsNew,
  getOwnUserSaleProducts,
  getAdminDistributorIds,
  getTransferSale,
  getSuperAdminId,
} = require("@library/common");
const {
  displayAmount,
  addLog,
  getDateFromToWhere,
  arrayColumn,
  priceFormat,
  getMonthDateRange,
} = require("@helpers/helper");
const moment = require("moment");
const db = require("@models");
const dbSequelize = db.sequelize;
const { Op, QueryTypes } = require("sequelize");
const { upperFirst } = require("lodash");
const UserModel = db.users;
const RoleModel = db.roles;
const StockModel = db.stocks;
const PurchaseModel = db.purchases;
const OrderModel = db.orders;
const saleModel = db.sales;
const NoticationModel = db.notifiactions;
const UserToUserModel = db.user_to_users;
const RetailerVisitModel = db.retailer_visits;
const {
  NotificationCollection,
} = require("@resources/superadmin/NotificationCollection");

/**
 * Super Admin Dashboard
 *
 * @param req
 * @param res
 */
// 60-second in-memory response cache keyed by userId+role
const _dashCache = new Map();
const _DASH_TTL  = 60 * 1000;
const _dashRemember = async (key, build) => {
  const hit = _dashCache.get(key);
  if (hit && Date.now() - hit.at < _DASH_TTL) return hit.value;
  const value = await build();
  _dashCache.set(key, { value, at: Date.now() });
  return value;
};

exports.index = async (req, res) => {
  const cacheKey = `dash:${req.userId}:${req.role}`;
  try {
    const cached = _dashCache.get(cacheKey);
    if (cached && Date.now() - cached.at < _DASH_TTL) {
      return res.send(formatResponse(cached.value, 'Dashboard'));
    }

    // Request-level memoization — avlStockUserIdsNew is called 2-3x with identical args
    const _avlMemo = new Map();
    const avlMemo = async (reqArg, roleId) => {
      const k = `${roleId}:${reqArg ? (reqArg.userId || reqArg) : 'null'}:${reqArg ? (reqArg.role || '') : ''}`;
      if (_avlMemo.has(k)) return _avlMemo.get(k);
      const v = await avlStockUserIdsNew(reqArg, roleId);
      _avlMemo.set(k, v);
      return v;
    };

    const [user, userID] = await Promise.all([
      UserModel.findByPk(req.userId),
      isManager(req) ? Promise.resolve(req.userId) : getWorkingUserID(req),
    ]);

    const superAdminRoleId      = getRoleId("superadmin");
    const adminRoleId           = getRoleId("admin");
    const distributorRoleId     = getRoleId("distributor");
    const retailerRoleId        = getRoleId("retailer");
    const supplierRoleId        = getRoleId("supplier");
    const customerRoleId        = getRoleId("customer");
    const sales_executiveRoleId = getRoleId("sales_executive");
    const superAdminId          = await getSuperAdminId();
    const state_id              = user.state_id;

    // FIX: all variables properly declared with let (was comma-chain without let = implicit globals)
    let totalAdmin = 0, totalOtherAdmin = 0, totalOtherAdminBuyer = 0,
        totalDistributor = 0, totalOtherDistributor = 0,
        totalRetailer = 0, totalSupplier = 0, totalCustomer = 0,
        totalsales_executive = 0, total_own_sales_executive = 0,
        totalStock = 0, purchaseDueAmount = 0, saleDueAmount = 0,
        saleDueAmountOtherAdminBuyer = 0, otherDistributorSaleDueAmount = 0,
        totalStockPrice = 0, walletBalance = 0, myRetailer = 0,
        myRetailerDueAmunt = 0, totalSeStock = 0, totalSeStockPrice = 0,
        totalOwnSeStock = 0, totalOwnSeStockPrice = 0,
        materialTotalStock = 0, materialTotalStockPrice = 0,
        returnStock = 0, returnStockPrice = 0,
        totalAdminStock = 0, totalAdminStockPrice = 0,
        totalDistributorStock = 0, totalDistributorStockPrice = 0,
        totalOwnUsersSale = 0, totalOwnUsersSaleProducts = 0,
        totalOtherAdminStock = 0, totalOtherAdminStockPrice = 0,
        totalOtherDistributorStock = 0, totalOtherDistributorStockPrice = 0,
        totalPurchase = 0, superAdminTotalAvlStock = 0,
        superAdminTotalTransferStock = 0, superAdminTotalAvlStockPrice = 0,
        superAdminTotalTransferStockPrice = 0,
        totalAvlStock = 0, totalAvlStockPrice = 0,
        totalAvlTransferStock = 0, totalAvlTransferStockPrice = 0,
        total_retailer_due = 0, totalManagerStock = 0, totalManagerStockPrice = 0,
        totalPurchaseProduct = 0, totalReturn = 0, totalReturnProduct = 0,
        avl_stockUser_ids = [], total_avl_stockUser_ids = [];

    // ─────────────────────────────────────────────────────────────
    // SUPERADMIN
    // ─────────────────────────────────────────────────────────────
    if (isSuperAdmin(req)) {

      // ── Batch 1: all fully independent queries ──────────────────
      const [
        _totalCustomer,
        _totalStock, _totalStockPrice,
        _materialTotalStock, _materialTotalStockPrice,
        _returnStock, _returnStockPrice,
        _totalSupplier, _saleDueAmount, _purchaseDueAmount, _walletBalance,
        _avlUserIds,
        _purchaseProductsRes,
        _transferStockData,
        _admins, _otheradmins,
        _ownAdmins, _ownDistributors,
        _managerUsers,
      ] = await Promise.all([
        UserModel.count({ where: { role_id: customerRoleId } }),
        getTotalStockByUser(userID),
        getTotalStockPriceByUser(null, userID),
        getTotalStockByUser(userID, "material"),
        getTotalStockPriceByUser(null, userID, "material"),
        getTotalStockByUser(userID, "return"),
        getTotalStockPriceByUser(null, userID, "return"),
        UserModel.count({ where: { role_id: supplierRoleId, parent_id: userID } }),
        saleModel.sum("due_amount", { where: { sale_by: userID, is_approved: { [Op.ne]: 2 }, is_assigned: false, is_approval: false } }),
        PurchaseModel.sum("due_amount", { where: { user_id: userID, is_approved: { [Op.ne]: 2 }, is_assigned: false, is_approval: false } }),
        getWalletBalance(userID),
        avlMemo(null, superAdminRoleId),
        getPurchaseProducts(),
        getTransferSale(userID),
        UserModel.findAll({ attributes: ["id"], where: { role_id: adminRoleId, own: true } }),
        UserModel.findAll({ attributes: ["id"], where: { role_id: adminRoleId, own: false } }),
        UserModel.findAll({ attributes: ["id"], where: { role_id: adminRoleId, own: true, parent_id: superAdminId } }),
        UserModel.findAll({ attributes: ["id"], where: { role_id: distributorRoleId, own: true, parent_id: superAdminId } }),
        UserModel.findAll({ attributes: ["id"], where: { role_id: getRoleId("manager") } }),
      ]);

      totalCustomer            = _totalCustomer;
      totalStock               = _totalStock;
      totalStockPrice          = _totalStockPrice;
      materialTotalStock       = _materialTotalStock;
      materialTotalStockPrice  = _materialTotalStockPrice;
      returnStock              = _returnStock;
      returnStockPrice         = _returnStockPrice;
      totalSupplier            = _totalSupplier;
      saleDueAmount            = _saleDueAmount   || 0;
      purchaseDueAmount        = _purchaseDueAmount || 0;
      walletBalance            = _walletBalance;
      totalPurchase            = _purchaseProductsRes.total_amount;
      totalPurchaseProduct     = _purchaseProductsRes.total_product;
      totalReturn              = _purchaseProductsRes.total_return_amount;
      totalReturnProduct       = _purchaseProductsRes.total_return_product;
      totalAvlTransferStock    = superAdminTotalTransferStock      = _transferStockData.totalStock;
      totalAvlTransferStockPrice = superAdminTotalTransferStockPrice = _transferStockData.totalPrice;

      const avlUserIds            = _avlUserIds;
      const adminIds              = arrayColumn(_admins,         "id");
      const otheradminIds         = arrayColumn(_otheradmins,    "id");
      const ownAdminIds           = arrayColumn(_ownAdmins,      "id");
      const ownDistributorsIds    = arrayColumn(_ownDistributors, "id");
      const managerUsersIds       = arrayColumn(_managerUsers,   "id");
      totalAdmin      = _admins.length;
      totalOtherAdmin = _otheradmins.length;

      // ── Batch 2: depends on batch 1 ─────────────────────────────
      const [
        _distributors, _otherdistributors, _ownDistributorsOfAdmins,
        _totalAdminStock, _totalAdminStockPrice,
        _totalOtherAdminStock, _totalOtherAdminStockPrice,
        _totalManagerStock, _totalManagerStockPrice,
        _totalRetailer,
      ] = await Promise.all([
        UserModel.findAll({ attributes: ["id"], where: { role_id: distributorRoleId, own: true,  parent_id: { [Op.in]: avlUserIds } } }),
        UserModel.findAll({ attributes: ["id"], where: { role_id: distributorRoleId, own: false, parent_id: { [Op.in]: avlUserIds } } }),
        ownAdminIds.length
          ? UserModel.findAll({ attributes: ["id"], where: { role_id: distributorRoleId, own: true, parent_id: { [Op.in]: ownAdminIds } } })
          : Promise.resolve([]),
        adminIds.length      ? getTotalStockByUser(adminIds)                  : Promise.resolve(0),
        adminIds.length      ? getTotalStockPriceByUser(null, adminIds)       : Promise.resolve(0),
        otheradminIds.length ? getTotalStockByUser(otheradminIds)             : Promise.resolve(0),
        otheradminIds.length ? getTotalStockPriceByUser(null, otheradminIds)  : Promise.resolve(0),
        managerUsersIds.length ? getTotalStockByUser(managerUsersIds)              : Promise.resolve(0),
        managerUsersIds.length ? getTotalStockPriceByUser(null, managerUsersIds)   : Promise.resolve(0),
        UserModel.count({ where: { role_id: retailerRoleId, parent_id: { [Op.in]: avlUserIds } } }),
      ]);

      const distributorIds            = arrayColumn(_distributors,          "id");
      const otherdistributorIds       = arrayColumn(_otherdistributors,     "id");
      const ownDistributorOfAdminsIds = arrayColumn(_ownDistributorsOfAdmins, "id");
      totalDistributor      = _distributors.length;
      totalOtherDistributor = otherdistributorIds.length;
      totalAdminStock       = _totalAdminStock;
      totalAdminStockPrice  = _totalAdminStockPrice;
      totalOtherAdminStock      = _totalOtherAdminStock;
      totalOtherAdminStockPrice = _totalOtherAdminStockPrice;
      totalManagerStock         = _totalManagerStock;
      totalManagerStockPrice    = _totalManagerStockPrice;
      totalRetailer             = _totalRetailer;
      avl_stockUser_ids         = avlUserIds; // already computed — free

      const se_parent_ids = ownDistributorOfAdminsIds.concat(ownDistributorsIds);

      // ── Batch 3: depends on batch 2 ─────────────────────────────
      const [
        _totalDistributorStock, _totalDistributorStockPrice,
        _totalOtherDistributorStock, _totalOtherDistributorStockPrice,
        _otherDistributorSaleDueAmount,
        _seCountAdminDistrs, _seCountOwnDistrs,
        _se,
        _totalAvlStock, _totalAvlStockPrice,
        _ownSaleRows,   // FIX: replaces getOwnUserSaleProducts (heavy 8-level ORM)
        _retailerDueRows, // FIX: replaces broken group+sum returning array
      ] = await Promise.all([
        distributorIds.length      ? getTotalStockByUser(distributorIds)                 : Promise.resolve(0),
        distributorIds.length      ? getTotalStockPriceByUser(null, distributorIds)      : Promise.resolve(0),
        otherdistributorIds.length ? getTotalStockByUser(otherdistributorIds)            : Promise.resolve(0),
        otherdistributorIds.length ? getTotalStockPriceByUser(null, otherdistributorIds) : Promise.resolve(0),
        otherdistributorIds.length
          ? saleModel.sum("due_amount", { where: { user_id: { [Op.in]: otherdistributorIds }, is_approved: { [Op.ne]: 2 }, is_assigned: false, is_approval: false } })
          : Promise.resolve(0),
        ownDistributorOfAdminsIds.length
          ? UserModel.count({ where: { role_id: sales_executiveRoleId, parent_id: { [Op.in]: ownDistributorOfAdminsIds } } })
          : Promise.resolve(0),
        ownDistributorsIds.length
          ? UserModel.count({ where: { role_id: sales_executiveRoleId, parent_id: { [Op.in]: ownDistributorsIds } } })
          : Promise.resolve(0),
        se_parent_ids.length
          ? UserModel.findAll({ attributes: ["id"], where: { role_id: sales_executiveRoleId, parent_id: { [Op.in]: se_parent_ids } } })
          : Promise.resolve([]),
        avlUserIds.length ? getTotalStockByUser(avlUserIds)              : Promise.resolve(0),
        avlUserIds.length ? getTotalStockPriceByUser(null, avlUserIds)   : Promise.resolve(0),
        // Direct SQL — replaces getOwnUserSaleProducts (loads every sale with 8-level include)
        avlUserIds.length
          ? dbSequelize.query(
              `SELECT COALESCE(SUM(sp.total), 0) AS total_amount, COUNT(sp.id) AS total_product
                 FROM sales s JOIN sale_products sp ON sp.sale_id = s.id
                WHERE s.sale_by IN (:ids) AND s.is_approved <> 2
                  AND s.is_assigned = 0 AND s.is_approval = 0 AND sp.is_return = 0`,
              { replacements: { ids: avlUserIds }, type: QueryTypes.SELECT })
          : Promise.resolve([{ total_amount: 0, total_product: 0 }]),
        // FIX: direct SQL for retailer due — saleModel.sum+group returns array not number
        avlUserIds.length
          ? dbSequelize.query(
              `SELECT COALESCE(SUM(s.due_amount), 0) AS total FROM sales s
                JOIN users u ON u.id = s.user_id AND u.role_id = :rid
               WHERE s.is_approved <> 2 AND s.is_assigned = 0
                 AND s.is_approval = 0 AND s.sale_by IN (:ids)`,
              { replacements: { rid: retailerRoleId, ids: avlUserIds }, type: QueryTypes.SELECT })
          : Promise.resolve([{ total: 0 }]),
      ]);

      totalDistributorStock           = _totalDistributorStock;
      totalDistributorStockPrice      = _totalDistributorStockPrice;
      totalOtherDistributorStock      = _totalOtherDistributorStock;
      totalOtherDistributorStockPrice = _totalOtherDistributorStockPrice;
      otherDistributorSaleDueAmount   = _otherDistributorSaleDueAmount || 0;
      totalsales_executive            = _seCountAdminDistrs + _seCountOwnDistrs;
      totalAvlStock = superAdminTotalAvlStock         = _totalAvlStock;
      totalAvlStockPrice = superAdminTotalAvlStockPrice = _totalAvlStockPrice;
      totalOwnUsersSale         = parseFloat(_ownSaleRows[0]?.total_amount || 0);
      totalOwnUsersSaleProducts = parseInt(_ownSaleRows[0]?.total_product  || 0);
      total_retailer_due        = parseFloat(_retailerDueRows[0]?.total    || 0);

      const seIds = arrayColumn(_se, "id");

      // ── Batch 4: depends on seIds ────────────────────────────────
      const [_totalSeStock, _totalSeStockPrice] = await Promise.all([
        seIds.length ? getTotalStockByUser(seIds)             : Promise.resolve(0),
        seIds.length ? getTotalStockPriceByUser(null, seIds)  : Promise.resolve(0),
      ]);
      totalSeStock      = _totalSeStock;
      totalSeStockPrice = _totalSeStockPrice;

    // ─────────────────────────────────────────────────────────────
    // ADMIN
    // ─────────────────────────────────────────────────────────────
    } else if (isAdmin(req)) {

      // ── Batch 1: independent ─────────────────────────────────────
      const [
        _totalCustomer,
        _totalStock, _totalStockPrice,
        _materialTotalStock, _materialTotalStockPrice,
        _saleDueAmount, _purchaseDueAmount, _walletBalance,
        _distributors, _otherdistributors,
        _purchaseProductsRes,
        _transferStockData,
        _avlStockUserIds,
        _otherAdminSuppliers,
        _otherAdminBuyers,
      ] = await Promise.all([
        UserModel.count({ where: { role_id: customerRoleId, state_id: state_id } }),
        getTotalStockByUser(userID),
        getTotalStockPriceByUser(null, userID),
        getTotalStockByUser(userID, "material"),
        getTotalStockPriceByUser(null, userID, "material"),
        saleModel.sum("due_amount", { where: { sale_by: userID, is_approved: { [Op.ne]: 2 }, is_assigned: false, is_approval: false } }),
        PurchaseModel.sum("due_amount", { where: { user_id: userID, is_approved: { [Op.ne]: 2 }, is_assigned: false, is_approval: false } }),
        getWalletBalance(userID),
        UserModel.findAll({ attributes: ["id"], where: { role_id: distributorRoleId, own: true,  state_id: state_id, parent_id: userID } }),
        UserModel.findAll({ attributes: ["id"], where: { role_id: distributorRoleId, own: false, state_id: state_id, parent_id: userID } }),
        getPurchaseProductsUser(req),
        getTransferSale(userID),
        avlMemo(req, adminRoleId),
        PurchaseModel.findAll({ where: { user_id: userID, is_approved: { [Op.ne]: 2 }, is_assigned: false, is_approval: false }, attributes: ["supplier_id"] }),
        PurchaseModel.findAll({ where: { supplier_id: userID, is_approved: { [Op.ne]: 2 }, is_assigned: false, is_approval: false }, attributes: ["user_id"] }),
      ]);

      totalCustomer           = _totalCustomer;
      totalStock              = _totalStock;
      totalStockPrice         = _totalStockPrice;
      materialTotalStock      = _materialTotalStock;
      materialTotalStockPrice = _materialTotalStockPrice;
      saleDueAmount           = _saleDueAmount || 0;
      purchaseDueAmount       = _purchaseDueAmount || 0;
      walletBalance           = _walletBalance;
      totalPurchase           = _purchaseProductsRes.total_amount;
      totalPurchaseProduct    = _purchaseProductsRes.total_product;
      totalReturn             = _purchaseProductsRes.total_return_amount;
      totalReturnProduct      = _purchaseProductsRes.total_return_product;
      totalAvlTransferStock   = superAdminTotalTransferStock       = _transferStockData.totalStock;
      totalAvlTransferStockPrice = superAdminTotalTransferStockPrice = _transferStockData.totalPrice;

      const distributorIds      = arrayColumn(_distributors,      "id");
      const otherdistributorIds = arrayColumn(_otherdistributors, "id");
      totalDistributor      = _distributors.length;
      totalOtherDistributor = otherdistributorIds.length;
      avl_stockUser_ids     = _avlStockUserIds;

      let parentIds = [userID, ...distributorIds];

      // ── Batch 2: depends on batch 1 ─────────────────────────────
      const allDistributors = _distributors.concat(_otherdistributors);
      const [
        _totalDistributorStock, _totalDistributorStockPrice,
        _totalOtherDistributorStock, _totalOtherDistributorStockPrice,
        _otherDistributorSaleDueAmount,
        _totalRetailer,
        _totalSupplier_own,
        _ownSeCount,
        _totalAvlStock, _totalAvlStockPrice,
        _superAvlStock, _superAvlStockPrice,
        _ownSaleRows,
        _adminSEList,
        _otherAdminSupplierObjs,
        _otherAdminBuyerObjs,
      ] = await Promise.all([
        distributorIds.length      ? getTotalStockByUser(distributorIds)                 : Promise.resolve(0),
        distributorIds.length      ? getTotalStockPriceByUser(null, distributorIds)      : Promise.resolve(0),
        otherdistributorIds.length ? getTotalStockByUser(otherdistributorIds)            : Promise.resolve(0),
        otherdistributorIds.length ? getTotalStockPriceByUser(null, otherdistributorIds) : Promise.resolve(0),
        otherdistributorIds.length
          ? saleModel.sum("due_amount", { where: { user_id: { [Op.in]: otherdistributorIds }, is_approved: { [Op.ne]: 2 }, is_assigned: false, is_approval: false } })
          : Promise.resolve(0),
        UserModel.count({ where: { role_id: retailerRoleId, state_id: state_id } }),
        UserModel.count({ where: { role_id: supplierRoleId, parent_id: userID } }),
        UserModel.count({ where: { role_id: sales_executiveRoleId, parent_id: userID } }),
        avl_stockUser_ids.length ? getTotalStockByUser(avl_stockUser_ids)             : Promise.resolve(0),
        avl_stockUser_ids.length ? getTotalStockPriceByUser(null, avl_stockUser_ids)  : Promise.resolve(0),
        avlMemo(null, superAdminRoleId).then(ids => ids.length ? getTotalStockByUser(ids)            : 0),
        avlMemo(null, superAdminRoleId).then(ids => ids.length ? getTotalStockPriceByUser(null, ids) : 0),
        // Direct SQL for own sales
        avl_stockUser_ids.length
          ? dbSequelize.query(
              `SELECT COALESCE(SUM(sp.total), 0) AS total_amount, COUNT(sp.id) AS total_product
                 FROM sales s JOIN sale_products sp ON sp.sale_id = s.id
                WHERE s.sale_by IN (:ids) AND s.is_approved <> 2
                  AND s.is_assigned = 0 AND s.is_approval = 0 AND sp.is_return = 0`,
              { replacements: { ids: avl_stockUser_ids }, type: QueryTypes.SELECT })
          : Promise.resolve([{ total_amount: 0, total_product: 0 }]),
        UserModel.findAll({ attributes: ["id"], where: { role_id: sales_executiveRoleId, parent_id: { [Op.in]: parentIds } } }),
        _otherAdminSuppliers.length
          ? UserModel.findAll({ where: { id: { [Op.in]: _otherAdminSuppliers.map(p => p.supplier_id) }, role_id: adminRoleId } })
          : Promise.resolve([]),
        _otherAdminBuyers.length
          ? UserModel.findAll({ where: { id: { [Op.in]: _otherAdminBuyers.map(p => p.user_id) }, role_id: adminRoleId } })
          : Promise.resolve([]),
      ]);

      totalDistributorStock           = _totalDistributorStock;
      totalDistributorStockPrice      = _totalDistributorStockPrice;
      totalOtherDistributorStock      = _totalOtherDistributorStock;
      totalOtherDistributorStockPrice = _totalOtherDistributorStockPrice;
      otherDistributorSaleDueAmount   = _otherDistributorSaleDueAmount || 0;
      totalRetailer                   = _totalRetailer;
      totalAvlStock                   = _totalAvlStock;
      totalAvlStockPrice              = _totalAvlStockPrice;
      superAdminTotalAvlStock         = _superAvlStock;
      superAdminTotalAvlStockPrice    = _superAvlStockPrice;
      totalOwnUsersSale               = parseFloat(_ownSaleRows[0]?.total_amount || 0);
      totalOwnUsersSaleProducts       = parseInt(_ownSaleRows[0]?.total_product  || 0);

      const seIds = arrayColumn(_adminSEList, "id");
      totalOwnSeStock      = 0;
      totalOwnSeStockPrice = 0;

      totalSupplier = _totalSupplier_own + 1; // +1 for superadmin as supplier
      if (_otherAdminSupplierObjs.length) totalSupplier += _otherAdminSupplierObjs.length;
      totalsales_executive = total_own_sales_executive = _ownSeCount;

      // SE counts from distributors
      const _condOwn = await getAdminSEWhereCondition(_distributors);
      const extraSeCount = await UserModel.count({ where: _condOwn });
      totalsales_executive       += extraSeCount;
      total_own_sales_executive  += extraSeCount;

      const [_totalOwnSeStock, _totalOwnSeStockPrice] = await Promise.all([
        seIds.length ? getTotalStockByUser(seIds)            : Promise.resolve(0),
        seIds.length ? getTotalStockPriceByUser(null, seIds) : Promise.resolve(0),
      ]);
      totalOwnSeStock      = _totalOwnSeStock;
      totalOwnSeStockPrice = _totalOwnSeStockPrice;

      // Other admin buyers due amount
      if (_otherAdminBuyerObjs.length) {
        totalOtherAdminBuyer = _otherAdminBuyerObjs.length;
        saleDueAmountOtherAdminBuyer = await saleModel.sum("due_amount", {
          where: { user_id: { [Op.in]: _otherAdminBuyerObjs.map(a => a.id) }, sale_by: userID, is_approved: { [Op.ne]: 2 }, is_assigned: false, is_approval: false },
        }) || 0;
      }

      // retailer due — direct SQL (consistent with superadmin fix)
      const allSaleByIds = [userID, ...distributorIds, ...otherdistributorIds, ...seIds];
      const _adminRetailerDue = await dbSequelize.query(
        `SELECT COALESCE(SUM(due_amount), 0) AS total FROM sales
          WHERE is_approved <> 2 AND is_assigned = 0 AND is_approval = 0
            AND sale_by IN (:ids)`,
        { replacements: { ids: allSaleByIds }, type: QueryTypes.SELECT }
      );
      total_retailer_due = parseFloat(_adminRetailerDue[0]?.total || 0);

    // ─────────────────────────────────────────────────────────────
    // DISTRIBUTOR
    // ─────────────────────────────────────────────────────────────
    } else if (isDistributor(req)) {

      const [district_id, admin_id] = await Promise.all([
        getUserColumnValue(req.userId, "district_id"),
        getUserColumnValue(req.userId, "parent_id"),
      ]);

      const [
        _totalStock, _totalStockPrice,
        _totalRetailer,
        _myRetailerIds,
        _saleDueAmount, _purchaseDueAmount, _walletBalance,
        _distributors,
        _transferStockData,
      ] = await Promise.all([
        getTotalStockByUser(userID),
        getTotalStockPriceByUser(null, userID),
        UserModel.count({ where: { role_id: retailerRoleId, district_id: district_id } }),
        getMyRetailerIds(req.userId),
        saleModel.sum("due_amount", { where: { is_approved: { [Op.ne]: 2 }, is_assigned: false, is_approval: false, sale_by: { [Op.in]: [userID] } } }),
        PurchaseModel.sum("due_amount", { where: { user_id: userID, is_approved: { [Op.ne]: 2 }, is_assigned: false, is_approval: false } }),
        getWalletBalance(userID),
        UserModel.findAll({ attributes: ["id"], where: { role_id: distributorRoleId, own: true, state_id: state_id, parent_id: admin_id } }),
        getTransferSale(userID),
      ]);

      totalStock      = _totalStock;
      totalStockPrice = _totalStockPrice;
      totalRetailer   = _totalRetailer;
      purchaseDueAmount = _purchaseDueAmount || 0;
      walletBalance     = _walletBalance;
      totalAvlTransferStock      = superAdminTotalTransferStock       = _transferStockData.totalStock;
      totalAvlTransferStockPrice = superAdminTotalTransferStockPrice  = _transferStockData.totalPrice;
      totalSupplier = 1;

      myRetailer = await UserModel.count({ where: { role_id: retailerRoleId, id: { [Op.in]: _myRetailerIds } } });

      const adminDistributors = arrayColumn(_distributors, "id");
      const parentIds         = [admin_id, ...adminDistributors];
      const _condSE           = await getAdminSEWhereCondition(_distributors);

      const [
        _seCountOwn,
        _seCountChain,
        _seList,
        _avlStockIds,
        _superAvlIds,
      ] = await Promise.all([
        UserModel.count({ where: { role_id: sales_executiveRoleId, parent_id: admin_id } }),
        UserModel.count({ where: _condSE }),
        UserModel.findAll({ attributes: ["id"], where: { role_id: sales_executiveRoleId, parent_id: { [Op.in]: parentIds } } }),
        avlMemo({ userId: admin_id, role: adminRoleId }, adminRoleId),
        avlMemo(null, superAdminRoleId),
      ]);

      totalsales_executive      = _seCountOwn + _seCountChain;
      total_own_sales_executive = arrayColumn(_seList, "id").length;
      const seIds               = arrayColumn(_seList, "id");
      avl_stockUser_ids         = _avlStockIds;
      total_avl_stockUser_ids   = _superAvlIds;

      const saleByArr = [...seIds, userID];
      saleDueAmount = await saleModel.sum("due_amount", {
        where: { sale_by: { [Op.in]: saleByArr }, is_approved: { [Op.ne]: 2 }, is_assigned: false, is_approval: false },
      }) || 0;

      const [
        _totalOwnSeStock, _totalOwnSeStockPrice,
        _totalAvlStock, _totalAvlStockPrice,
        _superAvlStock, _superAvlStockPrice,
      ] = await Promise.all([
        seIds.length ? getTotalStockByUser(seIds)             : Promise.resolve(0),
        seIds.length ? getTotalStockPriceByUser(null, seIds)  : Promise.resolve(0),
        avl_stockUser_ids.length       ? getTotalStockByUser(avl_stockUser_ids)              : Promise.resolve(0),
        avl_stockUser_ids.length       ? getTotalStockPriceByUser(null, avl_stockUser_ids)   : Promise.resolve(0),
        total_avl_stockUser_ids.length ? getTotalStockByUser(total_avl_stockUser_ids)        : Promise.resolve(0),
        total_avl_stockUser_ids.length ? getTotalStockPriceByUser(null, total_avl_stockUser_ids) : Promise.resolve(0),
      ]);

      totalOwnSeStock      = _totalOwnSeStock;
      totalOwnSeStockPrice = _totalOwnSeStockPrice;
      totalAvlStock        = _totalAvlStock;
      totalAvlStockPrice   = _totalAvlStockPrice;
      superAdminTotalAvlStock      = _superAvlStock;
      superAdminTotalAvlStockPrice = _superAvlStockPrice;

    // ─────────────────────────────────────────────────────────────
    // SALES EXECUTIVE
    // ─────────────────────────────────────────────────────────────
    } else if (isSalesExecutive(req)) {

      const [distributor_id, _myRetailerIds] = await Promise.all([
        getUserColumnValue(req.userId, "parent_id"),
        getMyRetailerIds(req.userId),
      ]);

      const distributorRole = await getUserColumnValue(distributor_id, "role_id");
      const admin_id = distributorRole == adminRoleId
        ? distributor_id
        : await getUserColumnValue(distributor_id, "parent_id");

      const [
        _totalStock, _totalStockPrice,
        _returnStock, _returnStockPrice,
        _purchaseDueAmount, _walletBalance,
        _ownDistributors,
        _avlStockIds, _superAvlIds,
        _transferStockData,
      ] = await Promise.all([
        getTotalStockByUser(userID),
        getTotalStockPriceByUser(null, userID),
        getTotalStockByUser(userID, "return"),
        getTotalStockPriceByUser(null, userID, "return"),
        PurchaseModel.sum("due_amount", { where: { user_id: userID, is_approved: { [Op.ne]: 2 }, is_assigned: false, is_approval: false } }),
        getWalletBalance(userID),
        UserModel.findAll({ attributes: ["id"], where: { role_id: distributorRoleId, own: true, parent_id: admin_id } }),
        avlMemo({ userId: admin_id, role: adminRoleId }, adminRoleId),
        avlMemo(null, superAdminRoleId),
        getTransferSale(userID),
      ]);

      totalStock       = _totalStock;
      totalStockPrice  = _totalStockPrice;
      returnStock      = _returnStock;
      returnStockPrice = _returnStockPrice;
      purchaseDueAmount = _purchaseDueAmount || 0;
      walletBalance     = _walletBalance;
      avl_stockUser_ids       = _avlStockIds;
      total_avl_stockUser_ids = _superAvlIds;
      totalAvlTransferStock      = superAdminTotalTransferStock       = _transferStockData.totalStock;
      totalAvlTransferStockPrice = superAdminTotalTransferStockPrice  = _transferStockData.totalPrice;
      totalSupplier = 1;

      myRetailer = await UserModel.count({ where: { role_id: retailerRoleId, id: { [Op.in]: _myRetailerIds } } });

      const distributorsIds = arrayColumn(_ownDistributors, "id");
      const uIdsArr_SE      = [...distributorsIds, admin_id];
      const _condSE         = await getAdminSEWhereCondition(uIdsArr_SE, null, true);

      const [
        _retailerFromAdmin,
        _retailerFromDistrs,
        _allSE,
        _totalAvlStock, _totalAvlStockPrice,
        _superAvlStock, _superAvlStockPrice,
      ] = await Promise.all([
        UserModel.count({ where: { role_id: retailerRoleId, parent_id: admin_id } }),
        distributorsIds.length
          ? UserModel.count({ where: { role_id: retailerRoleId, parent_id: { [Op.in]: distributorsIds } } })
          : Promise.resolve(0),
        UserModel.findAll({ attributes: ["id"], where: _condSE }),
        avl_stockUser_ids.length       ? getTotalStockByUser(avl_stockUser_ids)              : Promise.resolve(0),
        avl_stockUser_ids.length       ? getTotalStockPriceByUser(null, avl_stockUser_ids)   : Promise.resolve(0),
        total_avl_stockUser_ids.length ? getTotalStockByUser(total_avl_stockUser_ids)        : Promise.resolve(0),
        total_avl_stockUser_ids.length ? getTotalStockPriceByUser(null, total_avl_stockUser_ids) : Promise.resolve(0),
      ]);

      const allSEIds = arrayColumn(_allSE, "id");

      const _retailerFromSE = allSEIds.length
        ? await UserModel.count({ where: { role_id: retailerRoleId, parent_id: { [Op.in]: allSEIds } } })
        : 0;

      totalRetailer  = _retailerFromAdmin + _retailerFromDistrs + _retailerFromSE;
      totalAvlStock        = _totalAvlStock;
      totalAvlStockPrice   = _totalAvlStockPrice;
      superAdminTotalAvlStock      = _superAvlStock;
      superAdminTotalAvlStockPrice = _superAvlStockPrice;

      // FIX: saleDueAmount — was using saleModel.sum+group returning array, not number
      saleDueAmount = await dbSequelize.query(
        `SELECT COALESCE(SUM(s.due_amount), 0) AS total FROM sales s
          JOIN users u ON u.id = s.user_id AND u.role_id = :rid
         WHERE s.sale_by = :uid AND s.is_approved <> 2
           AND s.is_assigned = 0 AND s.is_approval = 0`,
        { replacements: { rid: retailerRoleId, uid: userID }, type: QueryTypes.SELECT }
      ).then(rows => parseFloat(rows[0]?.total || 0));

      myRetailerDueAmunt = await saleModel.sum("due_amount", {
        where: { sale_by: userID, is_approved: { [Op.ne]: 2 }, is_assigned: false, is_approval: false },
      }) || 0;
    }

    // ─────────────────────────────────────────────────────────────
    // COMMON (non-superadmin roles — superadmin already computed above)
    // ─────────────────────────────────────────────────────────────
    if (!isSuperAdmin(req)) {
      [purchaseDueAmount, walletBalance] = await Promise.all([
        purchaseDueAmount ? Promise.resolve(purchaseDueAmount) : PurchaseModel.sum("due_amount", { where: { user_id: userID, is_approved: { [Op.ne]: 2 }, is_assigned: false, is_approval: false } }),
        walletBalance     ? Promise.resolve(walletBalance)     : getWalletBalance(userID),
      ]);
      purchaseDueAmount = purchaseDueAmount || 0;
    }

    // ─────────────────────────────────────────────────────────────
    // MONTH CHART — 3 GROUP BY queries in parallel (was 36 sequential)
    // ─────────────────────────────────────────────────────────────
    const months_name = ["January","February","March","April","May","June","July","August","September","October","Novenber","December"];
    let customerMonthwise = [], retailerMonthwise = [], orderMonthwise = [], salesMonthwise = [];
    let BestAdmins = [], PoorAdmins = [];

    const toSeries = (rows, col = 'v') => {
      const out = Array(12).fill(0);
      rows.forEach(r => { out[Number(r.m) - 1] = Number(r[col]) || 0; });
      return out;
    };
    const year      = moment().format('YYYY');
    const yearStart = `${year}-01-01 00:00:00`;
    const yearEnd   = `${year}-12-31 23:59:59`;

    if (isSuperAdmin(req)) {
      const ids = avl_stockUser_ids;
      const [mCustomers, mOrders, mSales] = await Promise.all([
        dbSequelize.query(`SELECT MONTH(created_at) AS m, COUNT(*) AS v FROM users WHERE role_id = :r AND created_at >= :s AND created_at <= :e GROUP BY MONTH(created_at)`, { replacements: { r: customerRoleId, s: yearStart, e: yearEnd }, type: QueryTypes.SELECT }),
        dbSequelize.query(`SELECT MONTH(created_at) AS m, COALESCE(SUM(total_amount),0) AS v FROM orders WHERE order_from = 'front_website' AND created_at >= :s AND created_at <= :e GROUP BY MONTH(created_at)`, { replacements: { s: yearStart, e: yearEnd }, type: QueryTypes.SELECT }),
        ids.length ? dbSequelize.query(`SELECT MONTH(invoice_date) AS m, COALESCE(SUM(total_payable),0) AS v FROM sales WHERE sale_by IN (:ids) AND is_approved <> 2 AND is_assigned = 0 AND is_approval = 0 AND invoice_date >= :s AND invoice_date <= :e GROUP BY MONTH(invoice_date)`, { replacements: { ids, s: yearStart, e: yearEnd }, type: QueryTypes.SELECT }) : Promise.resolve([]),
      ]);
      customerMonthwise = toSeries(mCustomers);
      orderMonthwise    = toSeries(mOrders);
      salesMonthwise    = toSeries(mSales);
    } else if (isAdmin(req)) {
      const adminDisIds   = arrayColumn(await UserModel.findAll({ attributes: ["id"], where: { role_id: distributorRoleId, state_id: state_id } }), "id");
      const adminSaleByIds = [...avl_stockUser_ids];
      const [mCustomers, mOrders, mSales] = await Promise.all([
        dbSequelize.query(`SELECT MONTH(created_at) AS m, COUNT(*) AS v FROM users WHERE role_id = :r AND state_id = :sid AND created_at >= :s AND created_at <= :e GROUP BY MONTH(created_at)`, { replacements: { r: customerRoleId, sid: state_id, s: yearStart, e: yearEnd }, type: QueryTypes.SELECT }),
        adminDisIds.length ? dbSequelize.query(`SELECT MONTH(created_at) AS m, COALESCE(SUM(total_amount),0) AS v FROM orders WHERE order_from = 'front_website' AND to_user_id IN (:ids) AND created_at >= :s AND created_at <= :e GROUP BY MONTH(created_at)`, { replacements: { ids: adminDisIds, s: yearStart, e: yearEnd }, type: QueryTypes.SELECT }) : Promise.resolve([]),
        adminSaleByIds.length ? dbSequelize.query(`SELECT MONTH(invoice_date) AS m, COALESCE(SUM(total_payable),0) AS v FROM sales WHERE sale_by IN (:ids) AND is_approved <> 2 AND is_assigned = 0 AND is_approval = 0 AND invoice_date >= :s AND invoice_date <= :e GROUP BY MONTH(invoice_date)`, { replacements: { ids: adminSaleByIds, s: yearStart, e: yearEnd }, type: QueryTypes.SELECT }) : Promise.resolve([]),
      ]);
      customerMonthwise = toSeries(mCustomers);
      orderMonthwise    = toSeries(mOrders);
      salesMonthwise    = toSeries(mSales);
    } else if (isDistributor(req)) {
      const distrSaleByIds = [...avl_stockUser_ids];
      const [mCustomers, mOrders, mSales] = await Promise.all([
        dbSequelize.query(`SELECT MONTH(created_at) AS m, COUNT(*) AS v FROM users WHERE role_id = :r AND district_id = :did AND created_at >= :s AND created_at <= :e GROUP BY MONTH(created_at)`, { replacements: { r: customerRoleId, did: user.district_id, s: yearStart, e: yearEnd }, type: QueryTypes.SELECT }),
        dbSequelize.query(`SELECT MONTH(created_at) AS m, COALESCE(SUM(total_amount),0) AS v FROM orders WHERE order_from = 'front_website' AND to_user_id = :uid AND created_at >= :s AND created_at <= :e GROUP BY MONTH(created_at)`, { replacements: { uid: req.userId, s: yearStart, e: yearEnd }, type: QueryTypes.SELECT }),
        distrSaleByIds.length ? dbSequelize.query(`SELECT MONTH(invoice_date) AS m, COALESCE(SUM(total_payable),0) AS v FROM sales WHERE sale_by IN (:ids) AND is_approved <> 2 AND is_assigned = 0 AND is_approval = 0 AND invoice_date >= :s AND invoice_date <= :e GROUP BY MONTH(invoice_date)`, { replacements: { ids: distrSaleByIds, s: yearStart, e: yearEnd }, type: QueryTypes.SELECT }) : Promise.resolve([]),
      ]);
      customerMonthwise = toSeries(mCustomers);
      orderMonthwise    = toSeries(mOrders);
      salesMonthwise    = toSeries(mSales);
    } else if (isSalesExecutive(req)) {
      const retailerRoleIdLocal = getRoleId("retailer");
      const [mRetailers, mOrders, mSales] = await Promise.all([
        dbSequelize.query(`SELECT MONTH(created_at) AS m, COUNT(*) AS v FROM user_to_users WHERE to_role_id = :rid AND user_id = :uid AND created_at >= :s AND created_at <= :e GROUP BY MONTH(created_at)`, { replacements: { rid: retailerRoleIdLocal, uid: req.userId, s: yearStart, e: yearEnd }, type: QueryTypes.SELECT }),
        dbSequelize.query(`SELECT MONTH(created_at) AS m, COALESCE(SUM(total_amount),0) AS v FROM orders WHERE order_from = 'front_website' AND sales_executive_id = :uid AND created_at >= :s AND created_at <= :e GROUP BY MONTH(created_at)`, { replacements: { uid: req.userId, s: yearStart, e: yearEnd }, type: QueryTypes.SELECT }),
        dbSequelize.query(`SELECT MONTH(invoice_date) AS m, COALESCE(SUM(total_payable),0) AS v FROM sales WHERE sale_by = :uid AND is_approved <> 2 AND is_assigned = 0 AND is_approval = 0 AND invoice_date >= :s AND invoice_date <= :e GROUP BY MONTH(invoice_date)`, { replacements: { uid: req.userId, s: yearStart, e: yearEnd }, type: QueryTypes.SELECT }),
      ]);
      retailerMonthwise = toSeries(mRetailers);
      orderMonthwise    = toSeries(mOrders);
      salesMonthwise    = toSeries(mSales);
    }

    const result = {
      total_admin: totalAdmin,
      total_other_admin: totalOtherAdmin,
      total_distributor: totalDistributor,
      total_other_admin_buyer: totalOtherAdminBuyer,
      total_other_admin_buyer_due_amount: displayAmount(saleDueAmountOtherAdminBuyer),
      total_other_distributor: totalOtherDistributor,
      total_other_distributor_due_amount: displayAmount(otherDistributorSaleDueAmount),
      total_retailer: totalRetailer,
      total_supplier: totalSupplier,
      total_customer: totalCustomer,
      total_sales_executive: totalsales_executive,
      total_own_sales_executive: total_own_sales_executive,
      total_stock: totalStock,
      material_total_stock: materialTotalStock,
      purchase_due_amount: displayAmount(purchaseDueAmount),
      sale_due_amount: displayAmount(saleDueAmount),
      my_retailer_due_amount: displayAmount(myRetailerDueAmunt),
      total_stock_price: displayAmount(totalStockPrice),
      material_total_stock_price: displayAmount(materialTotalStockPrice),
      wallet_balance: displayAmount(walletBalance),
      all_months: months_name,
      month_wise_customer: customerMonthwise,
      month_wise_retailer: retailerMonthwise,
      month_wise_order: orderMonthwise,
      month_wise_sales: salesMonthwise,
      best_admin: BestAdmins,
      poor_admins: PoorAdmins,
      my_retailer: myRetailer,
      total_se_stock: totalSeStock,
      total_se_stock_price: displayAmount(totalSeStockPrice),
      total_own_se_stock: totalOwnSeStock,
      total_own_se_stock_price: displayAmount(totalOwnSeStockPrice),
      return_stock: returnStock,
      return_stock_price: displayAmount(returnStockPrice),
      total_distributor_stock: totalDistributorStock,
      total_distributor_stock_price: displayAmount(totalDistributorStockPrice),
      total_other_distributor_stock: totalOtherDistributorStock,
      total_other_distributor_stock_price: displayAmount(totalOtherDistributorStockPrice),
      total_admin_stock: totalAdminStock,
      total_admin_stock_price: displayAmount(totalAdminStockPrice),
      total_other_admin_stock: totalOtherAdminStock,
      total_other_admin_stock_price: displayAmount(totalOtherAdminStockPrice),
      total_own_sale: displayAmount(totalOwnUsersSale),
      is_own: user.own,
      total_purchase: displayAmount(totalPurchase),
      total_avl_stock: totalAvlStock,
      total_avl_pending_stock: totalAvlTransferStock || 0,
      total_avl_pending_stock_price: displayAmount(totalAvlTransferStockPrice) || 0,
      total_avl_stock_price: displayAmount(totalAvlStockPrice),
      super_admin_total_avl_stock: superAdminTotalAvlStock,
      super_admin_total_avl_stock_price: displayAmount(superAdminTotalAvlStockPrice),
      total_retailer_due: displayAmount(total_retailer_due),
      total_manager_stock: totalManagerStock,
      total_manager_stock_price: displayAmount(totalManagerStockPrice),
      total_purchase_product: totalPurchaseProduct,
      total_own_sale_products: totalOwnUsersSaleProducts,
      total_return_amount: totalReturn,
      total_return_product: totalReturnProduct,
    };

    _dashCache.set(cacheKey, { value: result, at: Date.now() });
    res.send(formatResponse(result, "Dashboard"));
  } catch (error) {
    return res.status(errorCodes.default).send(formatErrorResponse(error.toString()));
  }
};
exports.nextUserName = async (req, res) => {
  let id = req.query.id || "";
  let name = await getNextUserName(req.query.role, id);

  res.send(formatResponse(name));
};

/**
 * Auto Notification
 *
 * @param req
 * @param res
 */
exports.autoNotifications = async (req, res) => {
  let today = moment().format("YYYY-MM-DD");
  let todayFormat = moment().format("DD/MM/YYYY");
  let sales = await saleModel.findAll({
    where: {
      [Op.or]: [{ due_date: today }, { settlement_date: today }],
      is_approved: 1,
      is_assigned: false,
      is_approval: false,
      due_amount: { [Op.gt]: 0 },
    },
  });
  for (let i = 0; i < sales.length; i++) {
    //due date
    if (moment(sales[i].due_date).isSame(moment(), "day")) {
      // compactLog(sales[i].id);
      let haveSent = await NoticationModel.findOne({
        where: {
          type: "sale_due",
          type_id: sales[i].id,
          ...getDateFromToWhere(today, today),
        },
      });
      if (!haveSent) {
        let message = `${sales[i].invoice_number} sale due date is ${todayFormat}.`;
        let data = {
          user_id: sales[i].sale_by,
          type_id: sales[i].id,
          type: "sale_due",
          params: JSON.stringify({
            sale_id: sales[i].id,
            due_date: moment(sales.due_date).format("YYYY-MM-DD"),
          }),
          message: message,
        };
        let notification = await NoticationModel.create(data);
        notification = NotificationCollection(notification);
        req.pusher.trigger(
          "Prakriti_channel",
          `${sales[i].sale_by}-notification`,
          notification
        );
      }
    }

    //settlement date
    if (moment(sales[i].settlement_date).isSame(moment(), "day")) {
      let haveSent = await NoticationModel.findOne({
        where: { type: "sale_settlement", type_id: sales[i].id },
      });
      if (!haveSent) {
        let message = `${sales[i].invoice_number} sale settlement date is ${todayFormat}.`;
        let data = {
          user_id: sales[i].sale_by,
          type_id: sales[i].id,
          type: "sale_settlement",
          params: JSON.stringify({
            sale_id: sales[i].id,
            settlement_date: moment(sales[i].settlement_date).format(
              "YYYY-MM-DD"
            ),
          }),
          message: message,
        };
        let notification = await NoticationModel.create(data);
        notification = NotificationCollection(notification);
        req.pusher.trigger(
          "Prakriti_channel",
          `${sales[i].sale_by}-notification`,
          notification
        );
      }
    }
  }

  let purchases = await PurchaseModel.findAll({
    where: {
      due_date: today,
      is_approved: 1,
      is_approval: false,
      sale_id: { [Op.is]: null },
      due_amount: { [Op.gt]: 0 },
    },
  });
  for (let i = 0; i < purchases.length; i++) {
    if (!purchases[i].sale_id) {
      continue;
    }

    //due date
    if (moment(purchases[i].due_date).isSame(moment(), "day")) {
      let haveSent = await NoticationModel.findOne({
        where: {
          type: "purchase_due",
          type_id: purchases[i].id,
          ...getDateFromToWhere(today, today),
        },
      });
      if (!haveSent) {
        let message = `${purchases[i].invoice_number} purchase due date is ${todayFormat}.`;
        let data = {
          user_id: purchases[i].user_id,
          type_id: purchases[i].id,
          type: "purchase_due",
          params: JSON.stringify({
            purchase_id: purchases[i].id,
            due_date: moment(purchases[i].due_date).format("YYYY-MM-DD"),
          }),
          message: message,
        };
        let notification = await NoticationModel.create(data);
        notification = NotificationCollection(notification);
        req.pusher.trigger(
          "Prakriti_channel",
          `${purchases[i].user_id}-notification`,
          notification
        );
      }
    }
  }

  //visit notification
  let visits = await RetailerVisitModel.findAll({
    where: { [Op.and]: [{ date: { [Op.not]: null } }, { date: today }] },
  });
  for (let i = 0; i < visits.length; i++) {
    let haveSent = await NoticationModel.findOne({
      where: {
        type: "retailer_visit",
        type_id: visits[i].id,
        ...getDateFromToWhere(today, today),
      },
    });
    if (!haveSent) {
      let message = visits[i].notes;
      let data = {
        user_id: visits[i].user_id,
        type_id: visits[i].id,
        type: "retailer_visit",
        params: JSON.stringify({
          visit_id: visits[i].id,
          date: moment(visits[i].date).format("YYYY-MM-DD"),
          retailer_id: visits[i].visit_user_id,
        }),
        message: message,
      };
      let notification = await NoticationModel.create(data);
      notification = NotificationCollection(notification);
      req.pusher.trigger(
        "Prakriti_channel",
        `${visits[i].user_id}-notification`,
        notification
      );
    }
  }

  res.send(formatResponse());
};
