const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    unique: true,
  },
  api: {
    type: String,
  },
  amount: {
    type: String,
  },
  price: {
    type: String,
  },
  customer_email: {
    type: String,
  },
  customer_mobile: {
    type: String,
  },
  p_info: {
    type: String,
  },
  playerId: {
    type: String,
    default: null,
  },
  userId: {
    type: String,
    default: null,
  },
  zoneId: {
    type: String,
    default: null,
  },
  resId: {
    type: String,
    default: null,
  },
  status: {
    type: String,
    default: "pending",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const orderModel = mongoose.model("order", orderSchema);
module.exports = orderModel;
