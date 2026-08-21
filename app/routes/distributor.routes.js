const { authJwt } = require("@middlewares");
const { signIn, CartCreate, CartUpdate, OrderPlace, OrderCancel, updateWishlist } = require('@utils/validators/distributor');
const authController = require("@controllers/distributor/auth.controller");
const dashboardController = require("@controllers/distributor/dashboard.controller");
const leaveApplicationController =require('@controllers/distributor/leaveApplication.controller');
const stocksController = require('@controllers/distributor/stocks.controller');
const CategoryController = require("@controllers/distributor/category.controller");
const subcategoryController = require("@controllers/distributor/subcategory.controller");
const materialPriceController = require("@controllers/distributor/materialPrice.controller");
const retailerController = require("@controllers/distributor/retailer.controller");
const saleController = require('@controllers/distributor/sale.controller');
const cartController = require("@controllers/distributor/cart.controller");
const myOrderController = require("@controllers/distributor/myorder.controller");
const checkoutController = require("@controllers/distributor/checkout.controller");
const wishlistController = require("@controllers/distributor/wishlist.controller");
const productController = require('@controllers/distributor/product.controller');
const customerController = require('@controllers/distributor/customer.controller');
const employeeController = require('@controllers/distributor/employee.controller');
const paymentController = require("@controllers/distributor/payment.controller");
const profileController = require('@controllers/distributor/profile.controller');
const saleCartController = require("@controllers/distributor/saleCart.controller");
const sale_executiveController = require("@controllers/distributor/sale_executive.controller");

module.exports = (app, express, io) => {
    var router = express.Router();

    //auth
    router.post("/auth/signin", signIn, authController.signin);
    router.post("/logout", [authJwt.verifyToken, authJwt.isDistributor], authController.logout);

    //profile
    router.post("/edit-profile", [authJwt.verifyToken, authJwt.isDistributor], profileController.editProfile);
    router.post("/change-password", [authJwt.verifyToken, authJwt.isDistributor], profileController.changePassword);

    //dashboard
    router.get("/dashboard", [authJwt.verifyToken, authJwt.isDistributor], dashboardController.index);
    
    //Leave application
    router.get("/leave-application/fetch/:id", [authJwt.verifyToken, authJwt.isDistributor], leaveApplicationController.fetch);

    //stocks
    router.get("/stocks", [authJwt.verifyToken, authJwt.isDistributor], stocksController.index);
    router.get("/stocks/view/:id", [authJwt.verifyToken, authJwt.isDistributor], stocksController.view);
    router.get("/stocks/products", [authJwt.verifyToken, authJwt.isDistributor], stocksController.stockProducts);
    router.get("/stocks/product-details", [authJwt.verifyToken, authJwt.isDistributor], stocksController.stockProductDetails);
    router.get("/stocks/stock-price-by-category", [authJwt.verifyToken, authJwt.isDistributor], stocksController.getStockPriceByCategory);

    //
    router.get("/material-prices/product-price-details/:id", [authJwt.verifyToken, authJwt.isDistributor], materialPriceController.productPriceInfo);

    //categories
    router.get("/categories", [authJwt.verifyToken, authJwt.isDistributor], CategoryController.index);

    //sub-categories
    router.get("/sub-categories", [authJwt.verifyToken, authJwt.isDistributor], subcategoryController.index);

    //retailers
    router.get("/retailers", [authJwt.verifyToken, authJwt.isDistributor], retailerController.index);

    //sale-executive
    router.get("/sale-executive", [authJwt.verifyToken, authJwt.isDistributor], sale_executiveController.index);

    //sale
    router.get("/sales", [authJwt.verifyToken, authJwt.isDistributor], saleController.index);
    router.post("/sales/store", [authJwt.verifyToken, authJwt.isDistributor], saleController.store);
    router.get("/sales/view/:id", [authJwt.verifyToken, authJwt.isDistributor], saleController.view);
    router.delete("/sales/delete/:id", [authJwt.verifyToken, authJwt.isDistributor], saleController.delete);
    router.post("/sales/download-invoice/:id", [authJwt.verifyToken, authJwt.isDistributor], saleController.downloadInvoice);
    router.post(
        "/sales/download-invoice-info/:id",
        [authJwt.verifyToken, authJwt.isDistributor],
        saleController.downloadInvoiceInfo
    );
    router.post(
        "/sales/download-invoice-items/:id",
        [authJwt.verifyToken, authJwt.isDistributor],
        saleController.downloadInvoiceItems
    );

    //carts
    router.get("/carts", [authJwt.verifyToken, authJwt.isDistributor], cartController.index);
    router.post("/carts/store", [authJwt.verifyToken, authJwt.isDistributor], cartController.store);
    router.delete("/carts/delete/:id", [authJwt.verifyToken, authJwt.isDistributor], cartController.delete);

    //orders
    router.get("/my-orders", [authJwt.verifyToken, authJwt.isDistributor], myOrderController.index);
    router.get("/my-orders/fetch/:id", [authJwt.verifyToken, authJwt.isDistributor], myOrderController.fetch);
    router.post("/my-orders/place-order", [authJwt.verifyToken, authJwt.isDistributor], myOrderController.placeOrder);
    router.post("/my-orders/cancel-order/:id", [authJwt.verifyToken, authJwt.isDistributor], myOrderController.cancelOrder);
    router.post("/my-orders/assign/:id", [authJwt.verifyToken, authJwt.isDistributor], myOrderController.orderAssign);
  
    //products
    router.get("/products", [authJwt.verifyToken, authJwt.isDistributor], productController.index);

    //customers
    router.get("/customers", [authJwt.verifyToken, authJwt.isDistributor], customerController.index);

    //employees
    router.get("/employees", [authJwt.verifyToken, authJwt.isDistributor], employeeController.index);

    //payments
    router.get("/payments", [authJwt.verifyToken, authJwt.isDistributor], paymentController.index);
    router.post("/payments/store", [authJwt.verifyToken, authJwt.isDistributor], paymentController.store);

    //sale carts
    router.get("/sale-carts", [authJwt.verifyToken, authJwt.isAdmin], saleCartController.index);
    router.post("/sale-carts/store", [authJwt.verifyToken, authJwt.isAdmin], saleCartController.store);
    router.delete("/sale-carts/delete/:id", [authJwt.verifyToken, authJwt.isAdmin], saleCartController.delete);

    app.use('/api/distributor', router);
};