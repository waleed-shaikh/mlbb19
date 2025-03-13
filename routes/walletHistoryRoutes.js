const express = require("express");
const {} = require("../controllers/orderCtrl");
const {
  addWalletHistoryController,
  getWalletHistoryController,
  adminWalletHistoryController,
} = require("../controllers/walletHistoryCtrl");
const adminAuthMiddleware = require("../middlewares/adminAuthMiddleware");

const router = express.Router();

// routes
router.post("/add-wallet-history", addWalletHistoryController);
router.post("/get-wallet-history", getWalletHistoryController);
router.post("/gethistories", adminAuthMiddleware, adminWalletHistoryController);

module.exports = router;
