const mongoose = require("mongoose");

const walletHistorySchema = new mongoose.Schema({
  orderId: {
    type: String,
  },
  email: {
    type: String,
  },
  balanceBefore: {
    type: String,
  },
  balanceAfter: {
    type: String,
  },
  price: {
    type: String,
  },
  p_info: {
    type: String,
  },
  type: {
    type: String,
  },
  bonus: {
    type: String,
  },
  admin: {
    type: Boolean,
    default: false,
  },
  created: {
    type: Date,
    default: Date.now,
  },
});

const walletHistoryModel = mongoose.model("walletHistory", walletHistorySchema);
module.exports = walletHistoryModel;
