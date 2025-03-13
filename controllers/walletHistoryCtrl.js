const walletHistoryModel = require("../models/walletHistoryModel");

const addWalletHistoryController = async (req, res) => {
  try {
    const history = await walletHistoryModel.findOne({
      orderId: req.body.orderId,
    });
    if (history) {
      return res.status(201).send({
        success: false,
        message: "History already present",
      });
    }
    const newHistory = new walletHistoryModel(req.body);
    await newHistory.save();
    return res.status(200).send({
      success: true,
      message: "History Save Success",
    });
  } catch (error) {
    return res.status(500).send({
      message: error.message,
      success: false,
    });
  }
};

const getWalletHistoryController = async (req, res) => {
  try {
    const history = await walletHistoryModel.find({
      email: req.body.email,
    });
    if (history.length === 0) {
      return res.status(201).send({
        success: false,
        message: "No wallet history found",
      });
    }
    return res.status(200).send({
      success: true,
      data: history,
    });
  } catch (error) {
    return res.status(500).send({
      message: error.message,
      success: false,
    });
  }
};

const adminWalletHistoryController = async (req, res) => {
  try {
    const { email, orderId, startDate, endDate } = req.body;

    let query = {};

    if (email) {
      query.email = { $regex: email, $options: "i" }; // Case-insensitive email search
    }

    if (orderId) {
      query.orderId = { $regex: orderId, $options: "i" }; // Case-insensitive order ID search
    }


    // Use provided date range if available
    if (startDate && endDate) {
      query.created = {
        $gte: new Date(new Date(startDate).setHours(0, 0, 0)),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59)),
      };
    }

    const histories = await walletHistoryModel.find(query);

    res.status(200).json({
      success: true,
      message: "Histories fetched successfully",
      data: histories,
    });
  } catch (error) {
    console.error("Error fetching wallet histories:", error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};




module.exports = {
  addWalletHistoryController,
  getWalletHistoryController,
  adminWalletHistoryController,
};
