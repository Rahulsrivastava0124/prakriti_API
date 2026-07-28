const { authJwt } = require("@middlewares");
const {
  signIn,
  CategoryCreate,
  CategoryUpdate,
  SubcategoryCreate,
  SubcategoryUpdate,
  MaterialCreate,
  MaterialUpdate,
  UnitCreate,
  UnitUpdate,
  TaxCreate,
  TaxUpdate,
  CertificateCreate,
  CertificateUpdate,
  CountryCreate,
  CountryUpdate,
  StateCreate,
  StateUpdate,
  DistrictCreate,
  DistrictUpdate,
  PermissionCreate,
  InvestorCreate,
  InvestorUpdate,
  EmployeeCreate,
  EmployeeUpdate,
  AdminCreate,
  AdminUpdate,
  DistributorCreate,
  DistributorUpdate,
  RetailerCreate,
  RetailerUpdate,
  SupplierCreate,
  SupplierUpdate,
  ManagerCreate,
  ManagerUpdate,
  WorkerCreate,
  WorkerUpdate,
  SizeCreate,
  SizeUpdate,
  PurityCreate,
  PurityUpdate,
  ReportChargeUpdate,
  LeaveApplicationCreate,
  SalaryCreate,
  SalaryUpdate,
  ExpenseCreate,
  ExpenseUpdate,
} = require("@utils/validators/superadmin");
const authController = require("@controllers/superadmin/auth.controller");
const dashboardController = require("@controllers/superadmin/dashboard.controller");
const countryController = require("@controllers/superadmin/country.controller");
const stateController = require("@controllers/superadmin/state.controller");
const districtController = require("@controllers/superadmin/district.controller");
const CategoryController = require("@controllers/superadmin/category.controller");
const subcategoryController = require("@controllers/superadmin/subcategory.controller");
const MaterialController = require("@controllers/superadmin/material.controller");
const CertificateController = require("@controllers/superadmin/certificate.controller");
const taxController = require("@controllers/superadmin/tax.controller");
const unitController = require("@controllers/superadmin/unit.controller");
const productController = require("@controllers/superadmin/product.controller");
const permissionController = require("@controllers/superadmin/permission.controller");
const investorController = require("@controllers/superadmin/investor.controller");
const employeeController = require("@controllers/superadmin/employee.controller");
const adminController = require("@controllers/superadmin/admin.controller");
const distributorController = require("@controllers/superadmin/distributor.controller");
const retailerController = require("@controllers/superadmin/retailer.controller");
const supplierController = require("@controllers/superadmin/supplier.controller");
const workerController = require("@controllers/superadmin/worker.controller");
const sizeController = require("@controllers/superadmin/size.controller");
const purityController = require("@controllers/superadmin/purity.controller");
const reportChargeController = require("@controllers/superadmin/reportCharge.controller");
const materialPriceController = require("@controllers/superadmin/materialPrice.controller");
const leaveApplicationController = require("@controllers/superadmin/leaveApplication.controller");
const purchaseController = require("@controllers/superadmin/purchase.controller");
const stocksController = require("@controllers/superadmin/stocks.controller");
const loanController = require("@controllers/superadmin/loan.controller");
const saleController = require("@controllers/superadmin/sale.controller");
const profileController = require("@controllers/superadmin/profile.controller");
const roleController = require("@controllers/superadmin/role.controller");
const orderController = require("@controllers/superadmin/order.controller");
const customerController = require("@controllers/superadmin/customer.controller");
const paymentController = require("@controllers/superadmin/payment.controller");
const databaseSyncController = require("@controllers/superadmin/databaseSync.controller");
const walletController = require("@controllers/superadmin/wallet.controller");
const cartController = require("@controllers/superadmin/cart.controller");
const expenseController = require("@controllers/superadmin/expense.controller");
const reasonController = require("@controllers/superadmin/reason.controller");
const returnPolicyController = require("@controllers/superadmin/returnPolicy.controller");
const returnPurchaseController = require("@controllers/superadmin/returnPurchase.controller");
const returnSaleController = require("@controllers/superadmin/returnSale.controller");
const notificationController = require("@controllers/superadmin/notification.controller");
const retailerVisitController = require("@controllers/superadmin/retailerVisit.controller");
const bannerController = require("@controllers/superadmin/banner.controller");
const promocodeController = require("@controllers/superadmin/promocode.controller");
const newArrivalController = require("@controllers/superadmin/new-arrival.controller");
const festiveOffersController = require("@controllers/superadmin/festiveOffer.controller");
const stockProductSliderController = require("@controllers/superadmin/stockProductSlider.controller");
const myPerformanceController = require("@controllers/superadmin/myPerformance.controller");
const searchController = require("@controllers/superadmin/search.controller");
const returnOrderController = require("@controllers/superadmin/returnOrder.controller");
const holidayController = require("@controllers/superadmin/holiday.controller");
const stockMaterialHistoryController = require("@controllers/superadmin/stockMaterialHistory.controller");
const salaryController = require("@controllers/superadmin/salary.controller");
const subscriberController = require("@controllers/superadmin/subscriber.controller");
const homepageSettingController = require("@controllers/superadmin/homepage-setting.controller");
const companyDetailsController = require("@controllers/superadmin/company-details.controller");
const productStockController = require("@controllers/superadmin/stockProduct.controller");

module.exports = (app, express, io) => {
  var router = express.Router();

  //auth
  router.post("/auth/signin", signIn, authController.signin);
  router.post(
    "/logout",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
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
  router.get(
    "/profile",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    profileController.index,
  );
  router.post(
    "/edit-profile",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    profileController.editProfile,
  );
  router.post(
    "/change-password",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    profileController.changePassword,
  );

  //dashboard
  router.get(
    "/dashboard",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    dashboardController.index,
  );
  router.get(
    "/next-user-name",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    dashboardController.nextUserName,
  );
  router.get(
    "/auto-notifications",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    dashboardController.autoNotifications,
  );

  //countries
  router.get(
    "/countries",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    countryController.index,
  );
  router.post(
    "/countries/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin, CountryCreate],
    countryController.store,
  );
  router.post(
    "/countries/update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin, CountryUpdate],
    countryController.update,
  );
  router.get(
    "/countries/fetch/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    countryController.fetch,
  );
  router.delete(
    "/countries/delete/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    countryController.delete,
  );

  //states
  router.get(
    "/states",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    stateController.index,
  );
  router.post(
    "/states/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin, StateCreate],
    stateController.store,
  );
  router.post(
    "/states/update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin, StateUpdate],
    stateController.update,
  );
  router.get(
    "/states/fetch/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    stateController.fetch,
  );
  router.delete(
    "/states/delete/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    stateController.delete,
  );

  //districts
  router.get(
    "/districts",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    districtController.index,
  );
  router.post(
    "/districts/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin, DistrictCreate],
    districtController.store,
  );
  router.post(
    "/districts/update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin, DistrictUpdate],
    districtController.update,
  );
  router.get(
    "/districts/fetch/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    districtController.fetch,
  );
  router.delete(
    "/districts/delete/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    districtController.delete,
  );
  router.post(
    "/districts/generate-default-districts",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    districtController.generateDefaultDistricts,
  );

  //permissions
  router.get(
    "/permissions",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    permissionController.index,
  );
  router.post(
    "/permissions/update",
    [authJwt.verifyToken, authJwt.isSuperAdmin, PermissionCreate],
    permissionController.update,
  );

  //investors
  router.get(
    "/investors",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    investorController.index,
  );
  router.post(
    "/investors/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin, InvestorCreate],
    investorController.store,
  );
  router.post(
    "/investors/update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin, InvestorUpdate],
    investorController.update,
  );
  router.get(
    "/investors/fetch/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    investorController.fetch,
  );
  router.delete(
    "/investors/delete/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    investorController.delete,
  );

  //employees
  router.get(
    "/employees",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    employeeController.index,
  );
  router.post(
    "/employees/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin, EmployeeCreate],
    employeeController.store,
  );
  router.post(
    "/employees/update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin, EmployeeUpdate],
    employeeController.update,
  );
  router.get(
    "/employees/fetch/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    employeeController.fetch,
  );
  router.delete(
    "/employees/delete/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    employeeController.delete,
  );

  //employee salary
  router.get(
    "/employees/salary/list",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    employeeController.fetchSalaryList,
  );
  router.get(
    "/employees/salary/fetch/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    employeeController.fetchSalary,
  );
  router.post(
    "/employees/salary/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin, SalaryCreate],
    employeeController.salaryCreate,
  );
  router.post(
    "/employees/salary/update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin, SalaryUpdate],
    employeeController.updateSalary,
  );

  //admins
  router.get(
    "/admin",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    adminController.index,
  );
  router.post(
    "/admin/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin, AdminCreate],
    adminController.store,
  );
  router.post(
    "/admin/update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin, AdminUpdate],
    adminController.update,
  );
  router.get(
    "/admin/fetch/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    adminController.fetch,
  );
  router.delete(
    "/admin/delete/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    adminController.delete,
  );

  //distributors
  router.get(
    "/distributors",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    distributorController.index,
  );
  router.post(
    "/distributors/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin, DistributorCreate],
    distributorController.store,
  );
  router.post(
    "/distributors/update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin, DistributorUpdate],
    distributorController.update,
  );
  router.get(
    "/distributors/fetch/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    distributorController.fetch,
  );
  router.delete(
    "/distributors/delete/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    distributorController.delete,
  );

  //retailers
  router.get(
    "/retailers",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    retailerController.index,
  );
  router.post(
    "/retailers/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin, RetailerCreate],
    retailerController.store,
  );
  router.post(
    "/retailers/update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin, RetailerUpdate],
    retailerController.update,
  );
  router.get(
    "/retailers/fetch/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    retailerController.fetch,
  );
  router.delete(
    "/retailers/delete/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    retailerController.delete,
  );
  router.get(
    "/retailers/reviews",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    retailerController.reviews,
  );
  router.post(
    "/retailers/reviews/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    retailerController.reviewStore,
  );
  router.post(
    "/retailers/review/update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    retailerController.reviewUpdate,
  );
  router.get(
    "/retailers/my-review/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    retailerController.myReview,
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

  //managers
  /*router.get("/managers", [authJwt.verifyToken, authJwt.isSuperAdmin], employeeController.index);
    router.post("/managers/store", [authJwt.verifyToken, authJwt.isSuperAdmin, ManagerCreate], employeeController.store);
    router.post("/managers/update/:id", [authJwt.verifyToken, authJwt.isSuperAdmin, ManagerUpdate], employeeController.update);
    router.get("/managers/fetch/:id", [authJwt.verifyToken, authJwt.isSuperAdmin], employeeController.fetch);
    router.delete("/managers/delete/:id", [authJwt.verifyToken, authJwt.isSuperAdmin], employeeController.delete);*/

  //workers
  router.get(
    "/workers",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    workerController.index,
  );
  router.post(
    "/workers/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin, WorkerCreate],
    workerController.store,
  );
  router.post(
    "/workers/update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin, WorkerUpdate],
    workerController.update,
  );
  router.get(
    "/workers/fetch/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    workerController.fetch,
  );
  router.delete(
    "/workers/delete/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    workerController.delete,
  );

  //categories
  router.get(
    "/categories",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    CategoryController.index,
  );
  router.post(
    "/categories/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin, CategoryCreate],
    CategoryController.store,
  );
  router.get(
    "/categories/fetch/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    CategoryController.fetch,
  );
  router.post(
    "/categories/update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin, CategoryUpdate],
    CategoryController.update,
  );
  router.delete(
    "/categories/delete/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    CategoryController.delete,
  );

  //sub-categories
  router.get(
    "/sub-categories",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    subcategoryController.index,
  );
  router.post(
    "/sub-categories/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin, SubcategoryCreate],
    subcategoryController.store,
  );
  router.get(
    "/sub-categories/fetch/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    subcategoryController.fetch,
  );
  router.post(
    "/sub-categories/update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin, SubcategoryUpdate],
    subcategoryController.update,
  );
  router.delete(
    "/sub-categories/delete/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    subcategoryController.delete,
  );

  //materials
  router.get(
    "/materials",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    MaterialController.index,
  );
  router.post(
    "/materials/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin, MaterialCreate],
    MaterialController.store,
  );
  router.get(
    "/materials/fetch/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    MaterialController.fetch,
  );
  router.post(
    "/materials/update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin, MaterialUpdate],
    MaterialController.update,
  );
  router.delete(
    "/materials/delete/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    MaterialController.delete,
  );

  //certificates
  router.get(
    "/certificates",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    CertificateController.index,
  );
  router.post(
    "/certificates/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin, CertificateCreate],
    CertificateController.store,
  );
  router.get(
    "/certificates/fetch/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    CertificateController.fetch,
  );
  router.post(
    "/certificates/update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin, CertificateUpdate],
    CertificateController.update,
  );
  router.delete(
    "/certificates/delete/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    CertificateController.delete,
  );

  //tax
  router.get(
    "/tax",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    taxController.index,
  );
  router.post(
    "/tax/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin, TaxCreate],
    taxController.store,
  );
  router.get(
    "/tax/fetch/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    taxController.fetch,
  );
  router.post(
    "/tax/update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin, TaxUpdate],
    taxController.update,
  );
  router.delete(
    "/tax/delete/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    taxController.delete,
  );

  //units
  router.get(
    "/units",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    unitController.index,
  );
  router.post(
    "/units/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin, UnitCreate],
    unitController.store,
  );
  router.get(
    "/units/fetch/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    unitController.fetch,
  );
  router.post(
    "/units/update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin, UnitUpdate],
    unitController.update,
  );
  router.delete(
    "/units/delete/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    unitController.delete,
  );

  //product
  router.get(
    "/product",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    productController.index,
  );
  router.get(
    "/product/create",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    productController.create,
  );
  router.post(
    "/product/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    productController.store,
  );
  router.get(
    "/product/view/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    productController.view,
  );
  router.post(
    "/product/update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    productController.update,
  );
  router.delete(
    "/product/delete/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    productController.delete,
  );

  router.get(
    "/stock-product",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    productStockController.index,
  );

  //sizes
  router.get(
    "/sizes",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    sizeController.index,
  );
  router.post(
    "/sizes/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin, SizeCreate],
    sizeController.store,
  );
  router.post(
    "/sizes/update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin, SizeUpdate],
    sizeController.update,
  );
  router.get(
    "/sizes/fetch/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    sizeController.fetch,
  );
  router.delete(
    "/sizes/delete/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    sizeController.delete,
  );

  //purities
  router.get(
    "/purities",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    purityController.index,
  );
  router.post(
    "/purities/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin, PurityCreate],
    purityController.store,
  );
  router.post(
    "/purities/update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin, PurityUpdate],
    purityController.update,
  );
  router.get(
    "/purities/fetch/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    purityController.fetch,
  );
  router.delete(
    "/purities/delete/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    purityController.delete,
  );

  // report charge
  router.get(
    "/report-charge",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    reportChargeController.index,
  );
  router.post(
    "/report-charge/update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin, ReportChargeUpdate],
    reportChargeController.update,
  );

  //material price
  router.get(
    "/material-prices",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    materialPriceController.index,
  );
  router.post(
    "/material-prices/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    materialPriceController.store,
  );
  router.post(
    "/material-prices/update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    materialPriceController.update,
  );
  router.get(
    "/material-prices/view/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    materialPriceController.view,
  );
  router.delete(
    "/material-prices/delete/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    materialPriceController.delete,
  );
  router.get(
    "/material-prices/product-price-details/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    materialPriceController.productPriceInfo,
  );

  //Leave Application
  router.get(
    "/leave-application",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    leaveApplicationController.index,
  );
  router.post(
    "/leave-application/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin, LeaveApplicationCreate],
    leaveApplicationController.store,
  );
  router.get(
    "/leave-application/fetch/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    leaveApplicationController.fetch,
  );
  router.post(
    "/leave-application/update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    leaveApplicationController.update,
  );
  router.delete(
    "/leave-application/delete/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    leaveApplicationController.delete,
  );

  //expenses
  router.get(
    "/expenses",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    expenseController.index,
  );
  router.post(
    "/expenses/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin, ExpenseCreate],
    expenseController.store,
  );
  router.get(
    "/expenses/fetch/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    expenseController.fetch,
  );
  router.post(
    "/expenses/update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin, ExpenseUpdate],
    expenseController.update,
  );
  router.post(
    "/expenses/update-status/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    expenseController.statusUpdate,
  );
  router.delete(
    "/expenses/delete/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    expenseController.delete,
  );

  //attendances
  router.get(
    "/attendances",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    expenseController.attendanceList,
  );
  router.get(
    "/attendance/fetch",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    expenseController.attendanceFetch,
  );
  router.post(
    "/attendance/update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    expenseController.attendanceUpdate,
  );
  router.get(
    "/attendance-list",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    expenseController.attendanceDataList,
  );

  //reasons
  router.get(
    "/reasons",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    reasonController.index,
  );

  //purchase
  router.get(
    "/purchases",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    purchaseController.index,
  );
  router.get(
    "/purchases/txn-ledger",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    purchaseController.txnLedger,
  );
  router.get(
    "/purchases/txn-ledger-download",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    purchaseController.downloadTxnLedger,
  );
  router.post(
    "/purchases/pre-store",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    purchaseController.pre_store,
  );
  router.get(
    "/purchases/pre-store-list",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    purchaseController.pre_purchase_list,
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
  router.delete(
    "/purchases/pre-purchase-delete/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    purchaseController.pre_purchase_delete,
  );
  router.delete(
    "/purchases/:purchaseId/products/:productId",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    purchaseController.deleteProduct,
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
  router.get(
    "/purchases-products",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    purchaseController.purchaseProducts,
  );
  router.post(
    "/purchases/download-invoice-info/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    purchaseController.downloadInvoiceInfo,
  );
  router.post(
    "/purchases/download-invoice-item-list/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    purchaseController.downloadInvoiceItemList,
  );
  router.post(
    "/purchases/download-invoice-item-details/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    purchaseController.downloadInvoiceItemDetails,
  );

  // purchase on approval
  router.post(
    "/purchases-on-approve/download-invoice-info/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    purchaseController.downloadInvoiceInfo,
  );
  router.post(
    "/purchases-on-approve/download-invoice-item-list/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    purchaseController.downloadInvoiceItemList,
  );
  router.post(
    "/purchases-on-approve/download-invoice-item-details/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    purchaseController.downloadInvoiceItemDetails,
  );

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

  //sale
  router.get(
    "/sales",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    saleController.index,
  );
  router.get(
    "/sales/txn-ledger",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    saleController.txnLedger,
  );
  router.get(
    "/sales/txn-ledger-download",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    saleController.downloadTxnLedger,
  );
  router.post(
    "/sales/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    saleController.store,
  );
  router.get(
    "/sales/view/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    saleController.view,
  );
  router.get(
    "/sales/edit/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    saleController.edit,
  );
  router.post(
    "/sales/return/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    saleController.returnSaleNew,
  );
  router.delete(
    "/sales/delete/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    saleController.delete,
  );
  router.post(
    "/sales/download-invoice/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    saleController.downloadInvoice,
  );
  router.post(
    "/sales/download-invoice-info/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    saleController.downloadInvoiceInfo,
  );
  router.post(
    "/sales/download-invoice-item-list/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    saleController.downloadInvoiceItemList,
  );
  router.post(
    "/sales/download-invoice-item-details/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    saleController.downloadInvoiceItemDetails,
  );
  router.post(
    "/sales-on-approve/download-invoice-info/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    saleController.downloadInvoiceInfo,
  );
  router.post(
    "/sales-on-approve/download-invoice-item-list/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    saleController.downloadInvoiceItemList,
  );
  router.post(
    "/sales-on-approve/download-invoice-item-details/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    saleController.downloadInvoiceItemDetails,
  );
  router.get(
    "/sales-on-approve/view/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    saleController.view,
  );
  router.post(
    "/sales-on-approve/status/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    saleController.statuschange,
  );
  router.post(
    "/sales/return-stock-transfer",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    saleController.returnStockTransfer,
  );
  router.get(
    "/sales-products",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    saleController.saleProducts,
  );

  //stocks
  router.get("/stocks1", stocksController.index);
  router.get(
    "/stocks",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    stocksController.index,
  );
  router.get(
    "/stocks/view/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    stocksController.view,
  );
  router.get(
    "/stocks/products",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    stocksController.stockProducts,
  );
  router.get(
    "/stocks/product-details",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    stocksController.stockProductDetails,
  );
  router.post(
    "/stocks/check-certificate-exist",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    stocksController.checkDuplicateCertificateNo,
  );
  router.get(
    "/stocks/stock-price-by-category",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    stocksController.getStockPriceByCategory,
  );
  router.get(
    "/stocks/current-stock-report",
    [authJwt.verifyToken],
    stocksController.currentStockReportPdf,
  );
  router.post(
    "/stocks/return-stock/move-to-stock",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    stocksController.moveToStock,
  );
  router.post(
    "/stocks/update-image",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    stocksController.updateImage,
  );
  router.post(
    "/stocks/update-image/:certificate_no",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    stocksController.updateImageByCertificateNo,
  );
  router.post(
    "/stocks/update-image/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    stocksController.updateImageById,
  );

  //loan
  router.get(
    "/loans",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    loanController.index,
  );
  router.post(
    "/loans/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    loanController.store,
  );
  router.get(
    "/loans/view/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    loanController.view,
  );
  router.delete(
    "/loans/delete/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    loanController.delete,
  );
  router.post(
    "/loans/make-payment/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    loanController.payment,
  );

  //roles
  router.get(
    "/roles",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    roleController.index,
  );
  router.post(
    "/roles/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    roleController.store,
  );
  router.post(
    "/roles/update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    roleController.update,
  );
  router.get(
    "/roles/fetch/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    roleController.fetch,
  );
  router.delete(
    "/roles/delete/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    roleController.delete,
  );

  //orders
  router.get(
    "/orders",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    orderController.index,
  );
  router.get(
    "/orders/fetch/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    orderController.fetch,
  );
  router.get(
    "/user-list",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    orderController.userList,
  );
  router.post(
    "/orders/update-status/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    orderController.updateOrderStatus,
  );
  router.post(
    "/orders/sale-proceed/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    orderController.orderSaleProceed,
  );
  router.post(
    "/orders/update-products",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    orderController.updateProducts,
  );

  //customers
  router.get(
    "/customers",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    customerController.index,
  );
  router.get(
    "/customer/view/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    customerController.fetch,
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
    "/payments/recalculate-remaining-balance",
    paymentController.recalculateRemainingBalance,
  );
  router.post(
    "/payments/sync-prod-to-dev-test",
    databaseSyncController.syncProdToDevAndTest,
  );
  router.get(
    "/wallet-history",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    walletController.index,
  );

  //carts
  router.get(
    "/carts",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    cartController.index,
  );
  router.post(
    "/carts/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    cartController.store,
  );
  router.delete(
    "/carts/delete/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    cartController.delete,
  );
  router.get(
    "/cart/checkdetail",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    cartController.getCartItem,
  );

  //return policy
  router.get(
    "/return-policy",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    returnPolicyController.index,
  );
  router.post(
    "/return-policy/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    returnPolicyController.store,
  );
  router.post(
    "/return-policy/update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    returnPolicyController.update,
  );
  router.get(
    "/return-policy/fetch/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    returnPolicyController.fetch,
  );
  router.delete(
    "/return-policy/delete/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    returnPolicyController.delete,
  );

  //return purchases
  router.get(
    "/return-purchases",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    returnPurchaseController.index,
  );
  router.get(
    "/return-purchases/view/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    returnPurchaseController.view,
  );

  //return sales
  router.get(
    "/return-sales",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    returnSaleController.index,
  );
  router.get(
    "/return-sales/view/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    returnSaleController.view,
  );
  router.post(
    "/return-sales/update-status/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    returnSaleController.updateStatus,
  );

  //notifications
  router.get(
    "/notifications",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    notificationController.index,
  );
  router.post(
    "/notifications/read/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    notificationController.updateRead,
  );

  //retailer visit
  router.get(
    "/visit",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    retailerVisitController.index,
  );
  router.post(
    "/visit/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    retailerVisitController.store,
  );

  //banners
  router.get(
    "/banners",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    bannerController.index,
  );
  router.post(
    "/banners/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    bannerController.store,
  );
  router.post(
    "/banners/update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    bannerController.update,
  );
  router.get(
    "/banners/fetch/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    bannerController.fetch,
  );
  router.delete(
    "/banners/delete/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    bannerController.delete,
  );

  //promocodes
  router.get(
    "/promocodes",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    promocodeController.index,
  );
  router.post(
    "/promocodes/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    promocodeController.store,
  );
  router.post(
    "/promocodes/update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    promocodeController.update,
  );
  router.get(
    "/promocodes/view/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    promocodeController.fetch,
  );
  router.delete(
    "/promocodes/delete/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    promocodeController.delete,
  );

  //new arrival
  router.get(
    "/new-arrivals",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    newArrivalController.index,
  );
  router.post(
    "/new-arrivals/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    newArrivalController.store,
  );
  router.post(
    "/new-arrivals/update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    newArrivalController.update,
  );
  router.get(
    "/new-arrivals/fetch/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    newArrivalController.fetch,
  );
  router.delete(
    "/new-arrivals/delete/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    newArrivalController.delete,
  );

  //festive offers
  router.get(
    "/festiveoffers",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    festiveOffersController.index,
  );
  router.post(
    "/festiveoffers/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    festiveOffersController.store,
  );
  router.post(
    "/festiveoffers/update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    festiveOffersController.update,
  );
  router.get(
    "/festiveoffers/fetch/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    festiveOffersController.fetch,
  );
  router.delete(
    "/festiveoffers/delete/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    festiveOffersController.delete,
  );

  //stock products
  router.get(
    "/stockproducts",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    stockProductSliderController.index,
  );
  router.post(
    "/stockproducts/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    stockProductSliderController.store,
  );
  router.post(
    "/stockproducts/update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    stockProductSliderController.update,
  );
  router.get(
    "/stockproducts/fetch/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    stockProductSliderController.fetch,
  );
  router.delete(
    "/stockproducts/delete/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    stockProductSliderController.delete,
  );

  // homepage settings
  router.get(
    "/homepagesettings",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    homepageSettingController.index,
  );
  router.post(
    "/homepagesettings/update",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    homepageSettingController.update,
  );

  // company details
  router.get(
    "/company-details",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    companyDetailsController.index,
  );
  router.post(
    "/company-details/update",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    companyDetailsController.update,
  );

  //my performance
  router.get(
    "/my-performance",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    myPerformanceController.index,
  );

  //search
  router.get(
    "/search",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    searchController.index,
  );

  //return orders
  router.get(
    "/return-orders",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    returnOrderController.index,
  );
  router.get(
    "/return-orders/view/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    returnOrderController.view,
  );
  router.post(
    "/return-orders/assign/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    returnOrderController.orderAssign,
  );
  router.post(
    "/return-orders/update-status/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    returnOrderController.updateOrderStatus,
  );

  //holidays
  router.get(
    "/holidays",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    holidayController.index,
  );
  router.post(
    "/holidays/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    holidayController.store,
  );
  router.post(
    "/holidays/update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    holidayController.update,
  );
  router.get(
    "/holidays/view/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    holidayController.fetch,
  );
  router.delete(
    "/holidays/delete/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    holidayController.delete,
  );

  //stock material history
  router.get(
    "/stock-material-history",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    stockMaterialHistoryController.index,
  );
  router.post(
    "/stock-material-history/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    stockMaterialHistoryController.store,
  );
  router.post(
    "/stock-material-history/store-by-product",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    stockMaterialHistoryController.storeByProduct,
  );
  router.post(
    "/stock-material-history/status-update/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    stockMaterialHistoryController.updateStatus,
  );
  router.post(
    "/stock-material-history/transfer",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    stockMaterialHistoryController.transferStockMaterial,
  );

  //salary
  router.get(
    "/salary",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    salaryController.index,
  );
  router.get(
    "/salary-employees",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    salaryController.employees,
  );
  router.post(
    "/salary/store",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    salaryController.store,
  );
  router.post(
    "/salary/pay",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    salaryController.pay,
  );
  router.post(
    "/salary/download/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    salaryController.download,
  );
  router.post(
    "/salary/advance-store",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    salaryController.advanceStore,
  );
  router.get(
    "/salary/history/:id",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    salaryController.history,
  );

  //salary
  router.get(
    "/subscribers",
    [authJwt.verifyToken, authJwt.isSuperAdmin],
    subscriberController.index,
  );

  app.use("/api/superadmin", router);
};
