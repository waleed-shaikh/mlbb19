const express = require("express");
const {
  getAllOrdersController,
  getOrderByIdController,
} = require("../controllers/orderCtrl");
const authMiddleware = require("../middlewares/authMiddleware");

// router object
const router = express.Router();

// routes
router.post("/get-user-orders", authMiddleware, getAllOrdersController);
router.post("/get-order-by-id", authMiddleware, getOrderByIdController);

module.exports = router;
