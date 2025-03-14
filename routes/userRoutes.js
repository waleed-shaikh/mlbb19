const express = require("express");
const {
  loginController,
  registerController,
  authController,
  sendMailController,
  verifyOtpController,
  userProfileUpdateController,
  leaderboardController,
  sendMobileOtpController,
} = require("../controllers/userCtrl");
const authMiddleware = require("../middlewares/authMiddleware");
const generalRateLimiter = require("../middlewares/generalRateLimiter");

// router object
const router = express.Router();
// routes
router.post("/login", generalRateLimiter, loginController);
router.post("/register", generalRateLimiter, registerController);
router.post(
  "/user-profile-update",
  generalRateLimiter,
  authMiddleware,
  userProfileUpdateController
);
router.post("/getUserData", authMiddleware, authController);
router.get("/leaderboard", leaderboardController);

router.post("/send-otp", generalRateLimiter, sendMailController);
router.post("/verify-otp", generalRateLimiter, verifyOtpController);
module.exports = router;
