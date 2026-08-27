const { authJwt } = require("@middlewares");
const {
  signIn,
  DistributorCreate,
  DistributorUpdate,
  SupplierCreate,
  SupplierUpdate,
} = require("@utils/validators/admin");
const authController = require("@controllers/admin/auth.controller");
const dashboardController = require("@controllers/admin/dashboard.controller");
const adminController = require("@controllers/superadmin/admin.controller");
const distributorController = require("@controllers/admin/distributor.controller");
const stateController = require("@controllers/admin/state.controller");
const districtController = require("@controllers/admin/district.controller");
const countryController = require("@controllers/admin/country.controller");
const leaveApplicationController = require("@controllers/admin/leaveApplication.controller");
const stocksController = require("@controllers/admin/stocks.controller");
const saleController = require("@controllers/admin/sale.controller");
const materialPriceController = require("@controllers/admin/materialPrice.controller");
const productController = require("@controllers/admin/product.controller");
const CategoryController = require("@controllers/admin/category.controller");
const subcategoryController = require("@controllers/admin/subcategory.controller");
const cartController = require("@controllers/admin/cart.controller");
const orderController = require("@controllers/admin/order.controller");
const paymentController = require("@controllers/admin/payment.controller");
const profileController = require("@controllers/admin/profile.controller");
const companyDetailsController = require("@controllers/admin/company-details.controller");
const saleCartController = require("@controllers/admin/saleCart.controller");
const purchaseController = require("@controllers/admin/purchase.controller");
const supplierController = require("@controllers/admin/supplier.controller");
const walletController = require("@controllers/superadmin/wallet.controller");

module.exports = (app, express, io) => {
  var router = express.Router();

  //auth
  router.post("/auth/signin", signIn, authController.signin);
  router.post(
    "/logout",
    [authJwt.verifyToken, authJwt.isAdmin],
    authController.logout,
  );
  router.post(
    "/auth/forgot-password-send-otp",
    [],
    authController.forgotPasswordSendOtp,
  );
  router.post(
    "/auth/forgot-password-verify-otp",
    [],
    authController.forgotPasswordVerifyOtp,
  );
  router.post("/auth/forgot-password", [], authController.forgotPassword);
  router.post(
    "/auth/forgot-password-send-link",
    [],
    authController.forgotPasswordSendLink,
  );
  router.post("/auth/reset-password", [], authController.resetPassword);

  //profile
  router.post(
    "/edit-profile",
    [authJwt.verifyToken, authJwt.isAdmin],
    profileController.editProfile,
  );
  router.post(
    "/change-password",
    [authJwt.verifyToken, authJwt.isAdmin],
    profileController.changePassword,
  );

  // company details
  router.get(
    "/company-details",
    [authJwt.verifyToken, authJwt.isAdmin],
    companyDetailsController.index,
  );
  router.post(
    "/company-details/update",
    [authJwt.verifyToken, authJwt.isAdmin],
    companyDetailsController.update,
  );

  //dashboard
  router.get(
    "/dashboard",
    [authJwt.verifyToken, authJwt.isAdmin],
    dashboardController.index,
  );

  //distributors
  router.get(
    "/distributors",
    [authJwt.verifyToken, authJwt.isAdmin],
    distributorController.index,
  );
  router.post(
    "/distributors/store",
    [authJwt.verifyToken, authJwt.isAdmin, DistributorCreate],
    distributorController.store,
  );
  router.post(
    "/distributors/update/:id",
    [authJwt.verifyToken, authJwt.isAdmin, DistributorUpdate],
    distributorController.update,
  );
  router.get(
    "/distributors/fetch/:id",
    [authJwt.verifyToken, authJwt.isAdmin],
    distributorController.fetch,
  );
  router.delete(
    "/distributors/delete/:id",
    [authJwt.verifyToken, authJwt.isAdmin],
    distributorController.delete,
  );

  //admins
  router.get(
    "/admin",
    [authJwt.verifyToken, authJwt.isAdmin],
    adminController.index,
  );
  router.get(
    "/admin/fetch/:id",
    [authJwt.verifyToken, authJwt.isAdmin],
    adminController.fetch,
  );

  //states
  router.get(
    "/states",
    [authJwt.verifyToken, authJwt.isAdmin],
    stateController.index,
  );

  //districts
  router.get(
    "/districts",
    [authJwt.verifyToken, authJwt.isAdmin],
    districtController.index,
  );

  //countries
  router.get(
    "/countries",
    [authJwt.verifyToken, authJwt.isAdmin],
    countryController.index,
  );

  //Leave application
  router.get(
    "/leave-application/fetch/:id",
    [authJwt.verifyToken, authJwt.isAdmin],
    leaveApplicationController.fetch,
  );

  //stocks
  router.get(
    "/stocks",
    [authJwt.verifyToken, authJwt.isAdmin],
    stocksController.index,
  );
  router.get(
    "/stocks/view/:id",
    [authJwt.verifyToken, authJwt.isAdmin],
    stocksController.view,
  );
  router.get(
    "/stocks/products",
    [authJwt.verifyToken, authJwt.isAdmin],
    stocksController.stockProducts,
  );
  router.get(
    "/stocks/product-details",
    [authJwt.verifyToken, authJwt.isAdmin],
    stocksController.stockProductDetails,
  );
  router.get(
    "/stocks/stock-price-by-category",
    [authJwt.verifyToken, authJwt.isAdmin],
    stocksController.getStockPriceByCategory,
  );

  //sale
  router.get(
    "/sales",
    [authJwt.verifyToken, authJwt.isAdmin],
    saleController.index,
  );
  router.post(
    "/sales/store",
    [authJwt.verifyToken, authJwt.isAdmin],
    saleController.store,
  );
  router.get(
    "/sales/view/:id",
    [authJwt.verifyToken, authJwt.isAdmin],
    saleController.view,
  );
  router.delete(
    "/sales/delete/:id",
    [authJwt.verifyToken, authJwt.isAdmin],
    saleController.delete,
  );
  router.post(
    "/sales/download-invoice/:id",
    [authJwt.verifyToken, authJwt.isAdmin],
    saleController.downloadInvoice,
  );
  router.post(
    "/sales/download-invoice-info/:id",
    [authJwt.verifyToken, authJwt.isAdmin],
    saleController.downloadInvoiceInfo,
  );
  router.post(
    "/sales/download-invoice-items/:id",
    [authJwt.verifyToken, authJwt.isAdmin],
    saleController.downloadInvoiceItems,
  );

  //
  router.get(
    "/material-prices/product-price-details/:id",
    [authJwt.verifyToken, authJwt.isAdmin],
    materialPriceController.productPriceInfo,
  );

  //product
  router.get(
    "/product",
    [authJwt.verifyToken, authJwt.isAdmin],
    productController.index,
  );

  //categories
  router.get(
    "/categories",
    [authJwt.verifyToken, authJwt.isAdmin],
    CategoryController.index,
  );

  //sub-categories
  router.get(
    "/sub-categories",
    [authJwt.verifyToken, authJwt.isAdmin],
    subcategoryController.index,
  );

  //carts
  router.get(
    "/carts",
    [authJwt.verifyToken, authJwt.isAdmin],
    cartController.index,
  );
  router.post(
    "/carts/store",
    [authJwt.verifyToken, authJwt.isAdmin],
    cartController.store,
  );
  router.delete(
    "/carts/delete/:id",
    [authJwt.verifyToken, authJwt.isAdmin],
    cartController.delete,
  );

  //orders
  router.get(
    "/orders",
    [authJwt.verifyToken, authJwt.isAdmin],
    orderController.index,
  );
  router.get(
    "/orders/fetch/:id",
    [authJwt.verifyToken, authJwt.isAdmin],
    orderController.fetch,
  );
  router.post(
    "/orders/place-order",
    [authJwt.verifyToken, authJwt.isAdmin],
    orderController.placeOrder,
  );
  router.post(
    "/orders/cancel-order/:id",
    [authJwt.verifyToken, authJwt.isAdmin],
    orderController.cancelOrder,
  );

  //sale carts
  router.get(
    "/sale-carts",
    [authJwt.verifyToken, authJwt.isAdmin],
    saleCartController.index,
  );
  router.post(
    "/sale-carts/store",
    [authJwt.verifyToken, authJwt.isAdmin],
    saleCartController.store,
  );
  router.delete(
    "/sale-carts/delete/:id",
    [authJwt.verifyToken, authJwt.isAdmin],
    saleCartController.delete,
  );
  router.post(
    "/sale-carts/hold",
    [authJwt.verifyToken, authJwt.isAdmin],
    saleCartController.hold,
  );
  router.post(
    "/sale-carts/unhold/:id",
    [authJwt.verifyToken, authJwt.isAdmin],
    saleCartController.unhold,
  );

  //suppliers
  router.get(
    "/suppliers",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    supplierController.index,
  );
  router.post(
    "/suppliers/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin, SupplierCreate],
    supplierController.store,
  );
  router.post(
    "/suppliers/update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin, SupplierUpdate],
    supplierController.update,
  );
  router.get(
    "/suppliers/fetch/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    supplierController.fetch,
  );
  router.delete(
    "/suppliers/delete/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    supplierController.delete,
  );

  //purchase
  router.get(
    "/purchases",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    purchaseController.index,
  );
  router.post(
    "/purchases/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    purchaseController.store,
  );
  router.get(
    "/purchases/edit/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    purchaseController.edit,
  );
  router.get(
    "/purchases/view/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    purchaseController.view,
  );
  router.post(
    "/purchases/update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    purchaseController.update,
  );
  router.delete(
    "/purchases/delete/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    purchaseController.delete,
  );
  router.get(
    "/purchases/new-invoice-number",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    purchaseController.newInvoiceNumber,
  );
  router.post(
    "/purchases/return/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    purchaseController.returnProducts,
  );

  router.post(
    "/purchases/download-invoice-info/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    purchaseController.downloadInvoiceInfo,
  );
  router.post(
    "/purchases/download-invoice-items/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    purchaseController.downloadInvoiceItems,
  );

  // purchase on approval
  router.get(
    "/purchases-on-approve",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    purchaseController.onapprove_index,
  );
  router.get(
    "/purchases-on-approve/view/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    purchaseController.onapprove_view,
  );
  router.post(
    "/purchases-on-approve/status/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    purchaseController.statuschange,
  );

  //payments
  router.get(
    "/payments",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    paymentController.index,
  );
  router.post(
    "/payments/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    paymentController.store,
  );
  router.get(
    "/payments/due-amount",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    paymentController.totalDue,
  );
  router.get(
    "/payments/wallet-balance",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    paymentController.walletBalance,
  );
  router.post(
    "/payments/update-status/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    paymentController.updateStatus,
  );
  router.get(
    "/wallet-history",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    walletController.index,
  );

  app.use("/api/admin", router);
};
