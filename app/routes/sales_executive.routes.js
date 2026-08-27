const { authJwt } = require("@middlewares");
const { signIn, editProfile, changePassword,updateWishlist } = require('@utils/validators/sales_executive');
const authController = require("@controllers/sales_executive/auth.controller");
const dashboardController = require("@controllers/sales_executive/dashboard.controller");
const profileController = require("@controllers/sales_executive/profile.controller");
const changePasswordController = require("@controllers/sales_executive/changePassword.controller");
const CategoryController = require("@controllers/sales_executive/category.controller");
const productController = require("@controllers/sales_executive/product.controller");
const cartController = require("@controllers/sales_executive/cart.controller");
const orderController = require("@controllers/sales_executive/order.controller");
const addressController = require("@controllers/sales_executive/address.controller");
const userController = require("@controllers/sales_executive/user.controller");
const wishlistController = require("@controllers/sales_executive/wishlist.controller");
const leaveController = require("@controllers/sales_executive/leave.controller");

module.exports = (app, express, io) => {
    var router = express.Router();

    //auth
    router.post("/auth/signin", signIn, authController.signin);
    router.post("/logout", [authJwt.verifyToken, authJwt.isSalesExecutive], authController.logout);

    //dashboard
    router.get("/dashboard", [], dashboardController.index);

    //profile
    router.post("/edit-profile", [authJwt.verifyToken], profileController.editProfile);
    router.post("/change-password", [authJwt.verifyToken], profileController.changePassword);
    router.get("/attendence", [authJwt.verifyToken, authJwt.isRetailer], profileController.attendance);
    router.post("/attendence-update", [authJwt.verifyToken, authJwt.isRetailer], profileController.attendanceUpdate);

    //change password
    router.post("/change-password", [authJwt.verifyToken, authJwt.isRetailer, changePassword], changePasswordController.changePassword);
    //address
    router.get("/address", [authJwt.verifyToken, authJwt.isCustomer], addressController.index);
    router.post("/address/store", [authJwt.verifyToken, authJwt.isCustomer], addressController.store);
    router.get("/address/fetch/:id", [authJwt.verifyToken, authJwt.isCustomer], addressController.fetch);
    router.post("/address/update/:id", [authJwt.verifyToken, authJwt.isCustomer], addressController.update);
    router.delete("/address/delete/:id", [authJwt.verifyToken, authJwt.isCustomer], addressController.delete);
    router.get("/address/countries", [authJwt.verifyToken, authJwt.isCustomer], addressController.getCountries);
    router.get("/address/states", [authJwt.verifyToken, authJwt.isCustomer], addressController.getStates);
    router.get("/address/districts", [authJwt.verifyToken, authJwt.isCustomer], addressController.getDistricts);

    //retailer list 
    router.get("/user", [authJwt.verifyToken, authJwt.isCustomer], userController.getRetailer);

    //categories
    router.get("/categories", [], CategoryController.index);

    //product
    router.get("/product", [], productController.index);
    router.get("/product/view/", [], productController.view);

    //carts
    router.get("/carts", [authJwt.verifyToken], cartController.index);
    router.post("/carts/store", [authJwt.verifyToken], cartController.store);
    router.delete("/carts/delete/:id", [authJwt.verifyToken], cartController.delete);

    //orders
    
    router.get("/orders", [authJwt.verifyToken], orderController.index);
    router.get("/orders/fetch/:id", [authJwt.verifyToken], orderController.fetch);
    router.post("/place-order", [authJwt.verifyToken], orderController.placeOrder);
    router.post("/orders/cancel-order/:id", [authJwt.verifyToken], orderController.cancelOrder);
    router.post("/orders/confirm-order", [authJwt.verifyToken], orderController.confirmOrder);
    //wishlist
    router.get("/wishlists", [authJwt.verifyToken, authJwt.isCustomer], wishlistController.index);
    router.post("/update-wishlist", [authJwt.verifyToken, authJwt.isCustomer], wishlistController.updateWishlist);
    router.post("/check-wishlist", [authJwt.verifyToken, authJwt.isCustomer], wishlistController.checkWishlist);

    //leaves
    router.get("/leaves", [authJwt.verifyToken, authJwt.isCustomer], leaveController.index);
    router.post("/leaves/create", [authJwt.verifyToken, authJwt.isCustomer], leaveController.store);
    router.post("/leaves/delete", [authJwt.verifyToken, authJwt.isCustomer], leaveController.delete);
    
    app.use('/api/sales-executive', router);
};