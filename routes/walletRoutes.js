const express = require("express");
const axios = require("axios");
const paymentModel = require("../models/paymentModel");
const userModel = require("../models/userModel");
const walletHistoryModel = require("../models/walletHistoryModel");
const authMiddleware = require("../middlewares/authMiddleware");
// Create an Express Router
const router = express.Router();
const qs = require("qs");

// add money to wallet
router.post("/create", authMiddleware, async (req, res) => {
  try {
    const {
      order_id,
      txn_amount,
      txn_note,
      product_name,
      customer_name,
      customer_email,
      customer_mobile,
      callback_url,
    } = req.body;

    const existingPayment = await paymentModel.findOne({
      orderId: order_id,
    });
    if (existingPayment) {
      return res.redirect("https://zelanstore.com/user-dashboard");
    }

    const response = await axios.post("https://pgateway.in/order/create", {
      token: process.env.API_TOKEN,
      order_id,
      txn_amount,
      txn_note,
      product_name,
      customer_name,
      customer_email,
      customer_mobile,
      callback_url,
    });

    if (response.data && response.data.status === false) {
      console.log(response.data);
      return res
        .status(201)
        .send({ success: false, message: response.data.message });
    }
    return res.status(200).send({ success: true, data: response.data });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
router.get("/status", async (req, res) => {
  try {
    const { orderId } = req.query;
    const existingPayment = await paymentModel.findOne({
      orderId: orderId,
    });
    if (existingPayment) {
      return res.redirect("https://zelanstore.com/user-dashboard");
    }
    const orderStatusResponse = await axios.post(
      "https://pgateway.in/order/status",
      {
        token: process.env.API_TOKEN,
        order_id: orderId,
      }
    );
    if (orderStatusResponse.data.status) {
      const transactionDetails = orderStatusResponse.data.results;
      if (transactionDetails.status === "Success") {
        const {
          order_id,
          txn_note,
          customer_email,
          customer_mobile,
          txn_amount,
          product_name,
          utr_number,
          customer_name,
        } = transactionDetails;

        // saving payment
        const paymentObject = {
          name: customer_name,
          email: customer_email,
          mobile: customer_mobile,
          amount: txn_amount,
          orderId: order_id,
          status: transactionDetails.status,
          upi_txn_id: utr_number,
          type: "addmoney",
        };
        const newPayment = new paymentModel(paymentObject);
        await newPayment.save();

        const user = await userModel.findOne({
          email: customer_email,
        });

        if (user) {
          // Calculate bonus (1% of txn_amount if txn_amount >= 100)
          const txnAmount = parseFloat(txn_amount) || 0;
          const currentBalance = parseFloat(user?.balance) || 0;

          const newBalance = currentBalance + txnAmount;

          const updatedUser = await userModel.findOneAndUpdate(
            { email: customer_email },
            {
              $set: {
                balance:  parseFloat(user.balance) + txnAmount,  // without bonus add ho raha hai 
              },
            },
            { new: true }
          );

          // Prepare wallet history data
          const historyData = {
            orderId: order_id,
            email: customer_email,
            balanceBefore: user?.balance,
            balanceAfter: newBalance,
            price: `+${txn_amount}`,
            p_info: product_name,
            type: "addmoney",
          };

          // Add bonus only if it's greater than 0
          // if (bonusAmount > 0) {
          //   historyData.bonus = `+${bonusAmount.toFixed(2)}`;
          // }

          // Save history
          const history = new walletHistoryModel(historyData);
          await history.save();

          if (updatedUser) {
            return res.redirect(`https://zelanstore.com/wallet`);
          }
        }
      }
    } else {
      console.error("OrderID Not Found");
      return res.status(404).json({ error: "OrderID Not Found" });
    }
  } catch (error) {
    console.error("Internal Server Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// add money to wallet, UPIGATEWAY
router.post("/create-payment", authMiddleware, async (req, res) => {
  try {
    const {
      orderId,
      amount,
      paymentNote,
      customerName,
      customerEmail,
      customerNumber,
    } = req.body;


    const redirectUrl = `https://zelanstore.com/api/wallet/check-payment-status`;
        
    // Proceeding with the payment initiation
    const response = await axios.post(
      "https://api.ekqr.in/api/create_order",
      {
        key: process.env.UPIGATEWAY_API_KEY,
        client_txn_id: orderId.toString(),
        amount: amount,
        p_info : "Wallet Topup",
        customer_name: customerName,
        customer_email: customerEmail,
        customer_mobile : customerNumber,
        redirect_url: redirectUrl,
        udf1: paymentNote
      }
    );
    console.log(response.data)
    
    if (response.data && response.data.status) {
      return res.status(200).send({ success: true, data: response.data.data });
    } else {
      return res
        .status(201)
        .send({ success: false, data: "Error in initiating payment" });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
router.get("/check-payment-status", async (req, res) => {
  try {
    const {
      client_txn_id,
      txn_id
    } = req.query;

    const existingPayment = await paymentModel.findOne({
      orderId: client_txn_id
    });

    if (existingPayment) {
      return res.redirect(`${process.env.BASE_URL}/failure`);
    }

    const date = new Date();
    const formattedDate = date
      .toLocaleDateString("en-GB")
      .split("/")
      .join("-"); // Convert "27/02/2022" to "27-02-2022"

    const paymentResponse = await axios.post(
      "https://api.ekqr.in/api/check_order_status",
      {
        key: process.env.UPIGATEWAY_API_KEY,
        client_txn_id: client_txn_id,
        txn_date: formattedDate // "27-02-2022"
      }
    );

    if (paymentResponse.data.status) {
      const data = paymentResponse.data.data;
      const {
        amount,
        client_txn_id,
        customer_name,
        customer_email,
        customer_mobile,
        p_info,
        upi_txn_id,
        customer_vpa,
        remark
      } = data;

      if (data.status === "success") {
         // saving payment
        const paymentObject = {
          orderId: client_txn_id,
          name: customer_name,
          email: customer_email,
          mobile: customer_mobile,
          amount: amount,
          status: "success",
          type: "wallet",
          pname: p_info,
          upi_txn_id : upi_txn_id || "none",
          payerUpi : customer_vpa || "none"
        };
        const newPayment = new paymentModel(paymentObject);
        await newPayment.save();
        console.log("payment history saved")

        const user = await userModel.findOne({
          email: customer_email,
        });
        if (!user) {
          return res.redirect(`https://zelanstore.com/wallet`);
        }
        // udpating user balance

        const newBalance = Math.max(
          0,
          (parseFloat(user?.balance) || 0) + (parseFloat(amount) || 0)
        );
        const updatedUser = await userModel.findOneAndUpdate(
          { email: customer_email },
          {
            $set: {
              balance: newBalance,
            },
          },
          { new: true }
        );
        if (updatedUser) {
          console.log("balance updated");
          // saving wallet history
          const newHistory = new walletHistoryModel({
            orderId: client_txn_id,
            email: customer_email,
            balanceBefore: user?.balance,
            balanceAfter: newBalance,
            price: `+${amount}`,
            p_info: "Wallet",
            type: "addmoney",
          });
          await newHistory.save();

          console.log("wallet history saved");

          return res.redirect(`https://zelanstore.com/wallet`);
        }
      }
    } else {
      console.error("OrderID Not Found");
      return res.status(404).json({ error: "OrderID Not Found" });
    }
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: error.message });
  }
});


module.exports = router;