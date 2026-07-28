const { authJwt } = require("@middlewares");
const authController = require("@controllers/team/auth.controller");;


module.exports = (app, express, io) => {
    var router = express.Router();

    //auth
    router.post("/auth/signin", [], authController.signin);
    router.post("/logout", [authJwt.verifyToken], authController.logout);
    router.post("/auth/forgot-password-send-otp", [], authController.forgotPasswordSendOtp);
    router.post("/auth/forgot-password-verify-otp", [], authController.forgotPasswordVerifyOtp);
    router.post("/auth/forgot-password", [], authController.forgotPassword);
    router.post("/auth/forgot-password-send-link", [], authController.forgotPasswordSendLink);
    router.post("/auth/reset-password", [], authController.resetPassword);
    router.get("/roles", [], authController.roles);
    
    app.use('/api/team', router);
};