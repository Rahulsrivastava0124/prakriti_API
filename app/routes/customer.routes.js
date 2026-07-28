const { authJwt } = require("@middlewares");
const { signIn, signup, editProfile, changePassword, AddressCreate, AddressUpdate, CartCreate, CartUpdate, OrderPlace, OrderCancel, updateWishlist, priceInfo } = require('@utils/validators/customer');
const authController = require("@controllers/customer/auth.controller");
const dashboardController = require("@controllers/customer/dashboard.controller");
const signupController = require("@controllers/customer/signup.controller");
const editProfileController = require("@controllers/customer/editProfile.controller");
const changePasswordController = require("@controllers/customer/changePassword.controller");
const CategoryController = require("@controllers/customer/category.controller");
const productController = require("@controllers/customer/product.controller");
const stockProductController = require("@controllers/customer/stockProduct.controller");
const addressController = require("@controllers/customer/address.controller");
const cartController = require("@controllers/customer/cart.controller");
const orderController = require("@controllers/customer/order.controller");
const checkoutController = require("@controllers/customer/checkout.controller");
const wishlistController = require("@controllers/customer/wishlist.controller");
const salesExecutiveController = require("@controllers/customer/salesExecutive.controller");
const retailerController = require("@controllers/customer/retailer.controller");
const reviewController = require("@controllers/customer/review.controller");

module.exports = (app, express, io) => {
    var router = express.Router();

    //auth
    router.post("/auth/signin", signIn, authController.signin);
    router.post("/auth/existing-user", [], authController.existingUser);
    router.post("/logout", [authJwt.verifyToken, authJwt.isCustomer], authController.logout);
    router.post("/auth/forgot-password-send-otp", [], authController.forgotPasswordSendOtp);
    router.post("/auth/forgot-password-verify-otp", [], authController.forgotPasswordVerifyOtp);
    router.post("/auth/forgot-password", [], authController.forgotPassword);
    router.post("/auth/forgot-password-send-link", [], authController.forgotPasswordSendLink);
    router.post("/auth/reset-password", [], authController.resetPassword);

    //dashboard
    router.get("/dashboard", [], dashboardController.index);
    // homepage settings
    router.get("/homepagesettings", [], dashboardController.homepagesettings);
    router.get("/banners", [], dashboardController.banners);
    router.get("/promocodes", [], dashboardController.promocodes);
    router.get("/new-arrivals", [], dashboardController.new_arrivals);
    router.get("/festive-offers", [], dashboardController.festive_offers);
    router.get("/stock-products-slider", [], dashboardController.stock_products_slider);
    router.get("/best-retailers", [], dashboardController.bestRetailers);
    router.get("/best-retailers/states", [], dashboardController.bestRetailerStates);
    router.get("/best-retailers/cities", [], dashboardController.bestRetailerCities);
    router.get("/best-retailers/view", [], dashboardController.bestRetailerView);
    router.get("/counts", [], dashboardController.counts);
    router.get("/next-user-name", [], dashboardController.nextUserName);
    router.get("/events", [], dashboardController.events);
    router.post("/subscribers/store", [], dashboardController.subscribersStore);
    router.post("/retailer-request", [], dashboardController.retailerRequest);

     //signup
     router.post("/signup", signup, signupController.signup);

     //forgot password 
     router.post("/sendpassword", [], authController.sendpassword); 

    //edit profile
    router.post("/edit-profile", [authJwt.verifyToken, authJwt.isCustomer, editProfile], editProfileController.editProfile);

    //change password
    router.post("/change-password", [authJwt.verifyToken, authJwt.isCustomer, changePassword], changePasswordController.changePassword);
    
    //categories
    router.get("/categories", [], CategoryController.index);

    //product
    router.get("/product", [authJwt.verifyTokenForGuest], productController.index);
    router.get("/product/view", [authJwt.verifyTokenForGuest], productController.view);
    router.post("/product/price-details", [authJwt.verifyToken, authJwt.isCustomer, priceInfo], productController.productPriceInfo);
    router.get("/product/recently-view-categories", [authJwt.verifyToken, authJwt.isCustomer, priceInfo], productController.recentlyViewCategories);

    // stock product
    router.get("/stock-product", [authJwt.verifyTokenForGuest], stockProductController.index);
    router.get("/stock-product/view", [authJwt.verifyTokenForGuest], stockProductController.viewNew); 

    //address
    router.get("/address", [authJwt.verifyToken, authJwt.isCustomer], addressController.index);
    router.post("/address/store", [authJwt.verifyToken, authJwt.isCustomer, AddressCreate], addressController.store);
    router.get("/address/fetch/:id", [authJwt.verifyToken, authJwt.isCustomer], addressController.fetch);
    router.post("/address/update/:id", [authJwt.verifyToken, authJwt.isCustomer, AddressUpdate], addressController.update);
    router.delete("/address/delete/:id", [authJwt.verifyToken, authJwt.isCustomer], addressController.delete);
    router.get("/address/countries", [authJwt.verifyToken, authJwt.isCustomer], addressController.getCountries);
    router.get("/address/states", [authJwt.verifyToken, authJwt.isCustomer], addressController.getStates);
    router.get("/address/districts", [authJwt.verifyToken, authJwt.isCustomer], addressController.getDistricts);

    //carts
    router.get("/carts", [authJwt.verifyTokenForGuest, authJwt.isCustomer], cartController.index);
    router.post("/carts/store", [authJwt.verifyTokenForGuest, authJwt.isCustomer, CartCreate], cartController.store);
    router.get("/stock-carts", [authJwt.verifyTokenForGuest, authJwt.isCustomer], cartController.stockIndex);
    router.post("/carts/store-stock", [authJwt.verifyTokenForGuest, authJwt.isCustomer, CartCreate], cartController.storeStock);
    router.post("/carts/update/:id", [authJwt.verifyTokenForGuest, authJwt.isCustomer, CartUpdate], cartController.update);
    router.post("/carts/update-size-material/:id", [authJwt.verifyTokenForGuest, authJwt.isCustomer], cartController.updateSizeMaterial);
    router.delete("/carts/delete/:id", [authJwt.verifyTokenForGuest, authJwt.isCustomer], cartController.delete);
    router.post("/carts/apply-promocode", [authJwt.verifyTokenForGuest, authJwt.isCustomer], cartController.applyPromoCode);

    //orders
    router.get("/orderhistory",orderController.index);
    router.get("/orders", [authJwt.verifyToken, authJwt.isCustomer], orderController.index);
    router.get("/checkout", [authJwt.verifyToken, authJwt.isCustomer], checkoutController.index);
    router.post("/place-order", [authJwt.verifyToken, authJwt.isCustomer, OrderPlace], orderController.placeOrder);
    router.post("/cancel-order", [authJwt.verifyToken, authJwt.isCustomer, OrderCancel], orderController.cancelOrder);
    router.post("/return-request/:id", [authJwt.verifyToken, authJwt.isCustomer], orderController.returnRequest);
    router.get("/wishlists", [authJwt.verifyToken, authJwt.isCustomer], wishlistController.index);
    router.post("/update-wishlist", [authJwt.verifyToken, authJwt.isCustomer, updateWishlist], wishlistController.updateWishlist);
    router.post("/remove-wishlist/:id", [authJwt.verifyToken, authJwt.isCustomer], wishlistController.removeWishlist);
    router.post("/wishlist-buy-now/:id", [authJwt.verifyToken, authJwt.isCustomer], wishlistController.wishlistByNow);

    //sales executive
    router.get("/sales-executive", [authJwt.verifyToken], salesExecutiveController.index);

    //retailer
    router.get("/retailers", [authJwt.verifyToken], retailerController.index);
    router.post("/retailers/store", [authJwt.verifyTokenForGuest, authJwt.isCustomer], retailerController.store);

    //review
    router.get("/reviews", [authJwt.verifyTokenForGuest, authJwt.isCustomer], reviewController.index);
    router.post("/reviews/store", [authJwt.verifyTokenForGuest, authJwt.isCustomer], reviewController.store);

    app.use('/api/customer', router);
};
