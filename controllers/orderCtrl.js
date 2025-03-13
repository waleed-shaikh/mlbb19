const orderModel = require("../models/orderModel");

const getAllOrdersController = async (req, res) => {
  try {
    const orders = await orderModel.find({ customer_email: req.body.email });
    if (orders.length === 0) {
      return res.status(200).send({
        success: false,
        message: "No Order Found",
      });
    }
    return res.status(201).send({
      success: true,
      message: "All Orders Fetched Success",
      data: orders,
    });
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: `Get All Orders Ctrl ${error.message}`,
    });
  }
};

const getOrderByIdController = async (req, res) => {
  try {
    const order = await orderModel.findOne({
      orderId: req.body.orderId,
    });
    if (!order) {
      return res.status(200).send({
        success: false,
        message: "No Order Found",
      });
    }
    return res.status(201).send({
      success: true,
      message: "Order Fetched Success",
      data: order,
    });
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: `Get Order By Id Ctrl ${error.message}`,
    });
  }
};

module.exports = {
  getAllOrdersController,
  getOrderByIdController,
};
