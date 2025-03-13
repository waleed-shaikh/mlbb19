const userModel = require("../models/userModel");
const orderModel = require("../models/orderModel");
const paymentModel = require("../models/paymentModel");
const couponModel = require("../models/couponModel");
const md5 = require("md5");
const querystring = require("querystring");
const axios = require("axios");
const contactModel = require("../models/contactModel");

const getAllUserController = async (req, res) => {
  try {
    const allUser = await userModel.find({
      email: {
        $nin: ["mszapachuau@gmail.com", "aashirdigital@gmail.com"],
      },
    });
    if (!allUser) {
      return res.status(200).send({ success: false, message: "No User Found" });
    }
    return res.status(200).send({
      success: true,
      message: "All Users Fetched Sucesss",
      data: allUser,
    });
  } catch (error) {
    return res
      .status(500)
      .send({ success: false, message: `Get All User Ctrl ${error.message}` });
  }
};

const getUserController = async (req, res) => {
  try {
    const user = await userModel.findOne({ _id: req.body.id });
    if (!user) {
      return res.status(200).send({ success: false, message: "No User Found" });
    }
    return res.status(200).send({
      success: true,
      message: "User Fetched Sucesss",
      data: user,
    });
  } catch (error) {
    return res
      .status(500)
      .send({ success: false, message: `Get User Ctrl ${error.message}` });
  }
};

const editUserController = async (req, res) => {
  try {
    const { _id } = req.body;
    if (!_id) {
      return res.status(400).send({
        success: false,
        message: "Id is required in the request body",
      });
    }
    //updating user
    const user = await userModel.findOne({ _id: req.body._id });
    if (!user) {
      return res.status(200).send({ success: false, message: "No user found" });
    }
    if (req.body.addBalance) {
      const updateUser = await userModel.findOneAndUpdate(
        { _id },
        {
          $set: {
            ...req.body,
            balance: parseInt(user?.balance) + parseInt(req.body.addBalance),
          },
        },
        { new: true }
      );
      if (!updateUser) {
        return res.status(200).send({
          success: false,
          message: "Failed to Update User",
        });
      }

      const generateOrderId = (length) => {
        const numbers = "01234567"; // 10 numbers
        const randomNumbers = Array.from({ length: length }, () =>
          numbers.charAt(Math.floor(Math.random() * numbers.length))
        );
        const orderId = randomNumbers.join("");
        return orderId;
      };
      const obj = {
        name: updateUser?.fname,
        email: updateUser?.email,
        amount: req.body.addBalance,
        mobile: updateUser?.mobile,
        status: "success",
        upi_txn_id: generateOrderId(7),
        orderId: generateOrderId(12),
      };
      const newPayment = new paymentModel(obj);
      await newPayment.save();

      return res
        .status(201)
        .send({ success: true, message: "User Updated Successfully" });
    } else {
      const updateUser = await userModel.findOneAndUpdate(
        { _id },
        { $set: req.body },
        { new: true }
      );
      if (!updateUser) {
        return res.status(200).send({
          success: false,
          message: "Failed to Update User",
        });
      }
      return res
        .status(201)
        .send({ success: true, message: "User Updated Successfully" });
    }
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: `Admin Edit User Ctrl ${error.message}`,
    });
  }
};

const adminGetAllOrdersController = async (req, res) => {
  try {
    const orders = await orderModel.find({});
    if (!orders || orders.length === 0) {
      return res
        .status(200)
        .send({ success: false, message: "No Orders Found" });
    }

    const totalAmount = await orderModel.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: { $toDouble: "$price" } },
        },
      },
      {
        $project: {
          _id: 0,
          total: 1,
        },
      },
    ]);
    return res.status(201).send({
      success: true,
      message: "All Orders Fetched Success",
      data: orders,
      total: totalAmount.length > 0 ? totalAmount[0].total : 0,
    });
  } catch (error) {
    console.error("Error in adminGetAllOrdersController:", error);
    res.status(500).send({
      success: false,
      message: `Admin Get All Order Ctrl ${error.message}`,
    });
  }
};

const adminUpdateOrderController = async (req, res) => {
  try {
    const order = await orderModel.findOne({
      orderId: req.body.orderId,
    });
    if (!order) {
      return res
        .status(200)
        .send({ success: false, message: "No Order Found" });
    }
    const updateOrder = await orderModel.findOneAndUpdate(
      {
        orderId: req.body.orderId,
      },
      { $set: { status: req.body.status } },
      { new: true }
    );
    if (!updateOrder) {
      return res.status(201).send({
        success: false,
        message: "Failed to update the order",
      });
    }
    return res.status(202).send({
      success: true,
      message: "Order updated successfullt",
      data: updateOrder,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: `Admin Get All Order Ctrl ${error.message}`,
    });
  }
};

const getAllQueries = async (req, res) => {
  try {
    const queries = await contactModel.find({});
    if (queries.length === 0) {
      return res.status(200).send({
        success: false,
        message: "No Queries Found",
      });
    }
    return res.status(201).send({
      success: true,
      message: "Queries fetched success",
      data: queries,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: `Get All Queries Ctrl ${error.message}`,
    });
  }
};

const seenQueryController = async (req, res) => {
  try {
    const queries = await contactModel.findOne({ _id: req.body.id });
    if (!queries) {
      return res.status(200).send({
        success: false,
        message: "No Queries Found",
      });
    }
    const updateQuery = await contactModel.findOneAndUpdate(
      {
        _id: req.body.id,
      },
      { $set: { status: "seen" } },
      { new: true }
    );
    return res.status(201).send({
      success: true,
      message: "Query updated success",
      data: updateQuery,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: `Get All Queries Ctrl ${error.message}`,
    });
  }
};

const getAllCoupons = async (req, res) => {
  try {
    const coupons = await couponModel.find({});
    if (coupons.length === 0) {
      return res.status(201).send({
        success: false,
        message: "No Coupons Found",
      });
    }
    return res.status(200).send({
      success: true,
      message: "Coupons Fetched Success",
      data: coupons,
    });
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: error.message,
    });
  }
};

const addCouponController = async (req, res) => {
  try {
    const { name, discount } = req.body;
    const existingCoupon = await couponModel.findOne({ name: req.body.name });
    if (existingCoupon) {
      return res.status(201).send({
        success: false,
        message: "Coupon with this name already exists",
      });
    }
    const coupon = new couponModel(req.body);
    await coupon.save();
    return res.status(200).send({
      success: true,
      message: "Coupon Added Successfully",
    });
  } catch (error) {
    return res.status(500).send({ success: false, message: error.message });
  }
};

const deleteCouponController = async (req, res) => {
  try {
    const { id } = req.body;

    const existingCoupon = await couponModel.findOne({ _id: id });
    if (!existingCoupon) {
      return res.status(201).send({
        success: false,
        message: "Coupon not found",
      });
    }

    const result = await couponModel.findOneAndDelete({ _id: id });
    if (!result) {
      return res
        .status(201)
        .send({ success: false, message: "Failed to delete" });
    }
    return res
      .status(200)
      .send({ success: true, message: "Coupon deleted Successfully" });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: `Delete Coupon Ctrl ${error.message}`,
    });
  }
};

// smile
const smileBalanceController = async (req, res) => {
  try {
    const uid = process.env.UID;
    const email = process.env.EMAIL;
    const product = "mobilelegends";
    const time = Math.floor(Date.now() / 1000);
    const mKey = process.env.KEY;

    const signArr = {
      uid,
      email,
      product,
      time,
    };

    const sortedSignArr = Object.fromEntries(Object.entries(signArr).sort());
    const str =
      Object.keys(sortedSignArr)
        .map((key) => `${key}=${sortedSignArr[key]}`)
        .join("&") +
      "&" +
      mKey;
    const sign = md5(md5(str));
    const formData = querystring.stringify({
      uid,
      email,
      product,
      time,
      sign,
    });
    let apiUrl = "https://www.smile.one/br/smilecoin/api/querypoints";
    const response = await axios.post(apiUrl, formData, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    
    return res
      .status(200)
      .send({ success: true, data: response.data.smile_points });
  } catch (error) {
    console.error(
      "Error:",
      error.response ? error.response.data : error.message
    );
    return res.status(500).send({ success: false, message: error.message });
  }
};

module.exports = {
  getAllUserController,
  getUserController,
  editUserController,
  adminGetAllOrdersController,
  adminUpdateOrderController,
  addCouponController,
  deleteCouponController,
  getAllQueries,
  seenQueryController,
  addCouponController,
  getAllCoupons,
  smileBalanceController
};
