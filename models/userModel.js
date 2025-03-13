const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  isAdmin: {
    type: Boolean,
    default: false,
  },
  email: {
    type: String,
    required: [true, "email is required"],
  },
  fname: {
    type: String,
  },
  mobile: {
    type: String,
    unique: true,
  },
  balance: {
    type: Number,
    default: 0,
  },
  password: {
    type: String,
    required: [true, "password is required"],
  },
  emailOtp: {
    type: String,
  },
  reseller: {
    type: String,
    default: "no",
  },
  mobileVerified: {
    type: Boolean,
    default: false,
  },
  emailVerified: {
    type: Boolean,
    default: false,
  },
  block: {
    type: String,
    default: "no",
  },
  created: {
    type: Date,
    default: Date.now(),
  },
});

const userModel = mongoose.model("users", userSchema);
module.exports = userModel;
