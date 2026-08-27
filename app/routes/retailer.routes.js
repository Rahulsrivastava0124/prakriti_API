const { authJwt } = require("@middlewares");
const { signIn, signup, editProfile, changePassword, AddressCreate, AddressUpdate } = require('@utils/validators/retailer');
const authController = require("@controllers/retailer/auth.controller");
const dashboardController = require("@controllers/retailer/dashboard.controller");
const signupController = require("@controllers/retailer/signup.controller");
const editProfileController = require("@controllers/retailer/editProfile.controller");
const changePasswordController = require("@controllers/retailer/changePassword.controller");
const CategoryController = require("@controllers/retailer/category.controller");
const productController = require("@controllers/retailer/product.controller");
const addressController = require("@controllers/retailer/address.controller");
const cartController = require("@controllers/retailer/cart.controller");
const orderController = require("@controllers/retailer/order.controller");
const wishlistController = require("@controllers/retailer/wishlist.controller");

module.exports = (app, express, io) => {
    var router = express.Router();

    //auth
    router.post("/auth/signin", signIn, authController.signin);
    router.post("/logout", [authJwt.verifyToken, authJwt.isRetailer], authController.logout);
    router.post("/auth/forgot-password-send-link", [], authController.forgotPasswordSendLink);
    router.post("/auth/reset-password", [], authController.resetPassword);

    //dashboard
    router.get("/dashboard", [], dashboardController.index);

    //signup
    router.post("/signup", signup, signupController.signup);

    //edit profile
    router.post("/edit-profile", [authJwt.verifyToken, editProfile], editProfileController.editProfile);

    //change password
    router.post("/change-password", [authJwt.verifyToken, changePassword], changePasswordController.changePassword);

    //categories
    router.get("/categories", [], CategoryController.index);

    //product
    router.get("/product", [], productController.index);
    router.get("/product/view", [], productController.view);

    //address
    router.get("/address", [authJwt.verifyToken, authJwt.isRetailer], addressController.index);
    router.post("/address/store", [authJwt.verifyToken, authJwt.isRetailer, AddressCreate], addressController.store);
    router.get("/address/fetch/:id", [authJwt.verifyToken, authJwt.isRetailer], addressController.fetch);
    router.post("/address/update/:id", [authJwt.verifyToken, authJwt.isRetailer, AddressUpdate], addressController.update);
    router.delete("/address/delete/:id", [authJwt.verifyToken, authJwt.isRetailer], addressController.delete);
    
    // //carts
    router.get("/carts", [authJwt.verifyToken, authJwt.isAdmin], cartController.index);
    router.post("/carts/store", [authJwt.verifyToken, authJwt.isAdmin], cartController.store);
    router.delete("/carts/delete/:id", [authJwt.verifyToken, authJwt.isAdmin], cartController.delete);

    // //orders
    router.get("/orders", [authJwt.verifyToken, authJwt.isAdmin], orderController.index);
    router.post("/place-order", [authJwt.verifyToken, authJwt.isAdmin], orderController.placeOrder);
    router.post("/orders/cancel-order/:id", [authJwt.verifyToken, authJwt.isAdmin], orderController.cancelOrder);
    
   //wishlist
    router.get("/wishlists", [authJwt.verifyToken, authJwt.isRetailer], wishlistController.index);
    router.post("/update-wishlist", [authJwt.verifyToken, authJwt.isRetailer], wishlistController.updateWishlist);
    //router.post("/check-wishlist", [authJwt.verifyToken, authJwt.isRetailer], wishlistController.checkWishlist);

    app.use('/api/retailer', router);
};