const express = require("express");
const adminAuthMiddleware = require("../middlewares/adminAuthMiddleware");

const {
  getAllUserController,
  getUserController,
  editUserController,
  adminGetAllOrdersController,
  adminUpdateOrderController,
  getAllQueries,
  seenQueryController,
  getAllCoupons,
  addCouponController,
  deleteCouponController,
  smileBalanceController
} = require("../controllers/AdminCtrl");

const router = express.Router();

router.get("/get-all-users", adminAuthMiddleware, getAllUserController);
router.get("/smile-balance", adminAuthMiddleware, smileBalanceController);
router.post("/get-user", adminAuthMiddleware, getUserController);
router.post("/admin-edit-user", adminAuthMiddleware, editUserController);
router.get(
  "/admin-get-all-orders",
  adminAuthMiddleware,
  adminGetAllOrdersController
);
router.post("/update-order", adminAuthMiddleware, adminUpdateOrderController);
router.get("/get-all-queries", adminAuthMiddleware, getAllQueries);
router.post("/query-seen", adminAuthMiddleware, seenQueryController);
router.get("/get-coupons", getAllCoupons);
router.post("/add-coupon", adminAuthMiddleware, addCouponController);
router.post("/delete-coupon", adminAuthMiddleware, deleteCouponController);

module.exports = router;
