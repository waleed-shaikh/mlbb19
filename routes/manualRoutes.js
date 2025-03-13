const express = require("express");
const axios = require("axios");
const orderModel = require("../models/orderModel");
const authMiddleware = require("../middlewares/authMiddleware");
const sendMail = require("../controllers/sendMail");
const fs = require("fs");
const nodemailer = require("nodemailer");

// Create an Express Router
const router = express.Router();
process.env.TZ = "Asia/Kolkata"; // Replace with 'Asia/Kolkata' for IST

// barcode
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

    const existingOrder = await orderModel.findOne({
      orderId: order_id,
      status: "success",
    });
    if (existingOrder) {
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
router.post("/status", async (req, res) => {
  try {
    const { orderId } = req.query;
    const existingOrder = await orderModel.findOne({
      orderId: orderId,
    });
    if (existingOrder) {
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
        } = transactionDetails;

        const userid = txn_note.split("@")[0];
        const amount = txn_note.split("@")[1];
        const zoneid = "none";

        // placing order
        const order = new orderModel({
          api: "no",
          orderId: order_id,
          p_info: product_name,
          price: txn_amount,
          amount: amount,
          customer_email: customer_email,
          customer_mobile: customer_mobile,
          playerId: userid,
          userId: userid,
          zoneId: zoneid,
          status: "pending", // NON API ORDER
        });
        await order.save();

        //! SEND MAIL TO USER
        try {
          const dynamicData = {
            orderId: `${order_id}`,
            amount: `${amount}`,
            price: `${txn_amount}`,
            p_info: `${product_name}`,
            userId: `${userid}`,
            zoneId: "none",
          };
          let htmlContent = fs.readFileSync("order.html", "utf8");
          Object.keys(dynamicData).forEach((key) => {
            const placeholder = new RegExp(`{${key}}`, "g");
            htmlContent = htmlContent.replace(placeholder, dynamicData[key]);
          });
          // Send mail
          let mailTransporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
              user: process.env.SENDING_EMAIL,
              pass: process.env.MAIL_PASS,
            },
          });
          let mailDetails = {
            from: process.env.SENDING_EMAIL,
            to: `${customer_email}`,
            subject: "Order Successful!",
            html: htmlContent,
          };
          mailTransporter.sendMail(mailDetails, function (err, data) {
            if (err) {
              console.log(err);
            }
          });
        } catch (error) {
          console.error("Error sending email:", error);
        }

        //! SENDING MAIL TO ADMIN
        const sub = "New Order Recieved";
        const msgg =
          "Hello Admin! You have received a new order. Kindly login to see your order.";
        await sendMail("trymail649@gmail.com", sub, "", msgg);

        return res.redirect(`https://zelanstore.com/user-dashboard/`);
      } else {
        const {
          txn_note,
          customer_email,
          customer_mobile,
          txn_amount,
          product_name,
        } = transactionDetails;

        const userid = txn_note.split("@")[0];
        const amount = txn_note.split("@")[1];
        const zoneid = "none";
        // placing order
        const order = new orderModel({
          api: "no",
          orderId: orderId,
          p_info: product_name,
          price: txn_amount,
          amount: amount,
          customer_email: customer_email,
          customer_mobile: customer_mobile,
          playerId: userid,
          userId: userid,
          zoneId: zoneid,
          status: "failed", // NON API ORDER
        });
        await order.save();
        return res.redirect("https://zelanstore.com/");
      }
    }
  } catch (error) {
    console.error("Internal Server Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// wallet
// router.post("/wallet", authMiddleware, async (req, res) => {
//   try {
//     const {
//       api,
//       orderId,
//       userid,
//       customer_email,
//       customer_mobile,
//       pname,
//       amount,
//       price,
//     } = req.body;

//     if (
//       !api ||
//       !orderId ||
//       !userid ||
//       !customer_email ||
//       !customer_mobile ||
//       !pname ||
//       !amount ||
//       !price
//     ) {
//       return res
//         .status(400)
//         .send({ success: false, message: "Invalid details" });
//     }

//     const existingOrder = await orderModel.findOne({
//       orderId: orderId,
//     });
//     if (existingOrder) {
//       return res.redirect("https://zelanstore.com/user-dashboard");
//     }

//     //HACKER CHECK
//     const checkProduct = await productModel.findOne({ name: pname });
//     if (!checkProduct) {
//       return res.status(404).json({ message: "Product not found" });
//     }

//     const priceExists = checkProduct.cost.some(
//       (item) =>
//         item.amount === amount &&
//         (parseFloat(item.price) === parseFloat(price) ||
//           parseFloat(item.resPrice) === parseFloat(price))
//     );
//     if (!priceExists) {
//       return res.status(400).json({
//         message: "Amount does not match",
//       });
//     }
//     const checkUser = await userModel.findOne({ email: customer_email });
//     if (!checkUser) {
//       return res.status(400).send({
//         success: false,
//         message: "Please Enter Valid Email",
//       });
//     }
//     if (checkUser?.balance < parseFloat(price) || checkUser?.balance === 0) {
//       return res
//         .status(201)
//         .send({ success: false, message: "Balance is less for this order" });
//     }

//     const newOrder = new orderModel({
//       api: api,
//       amount: amount,
//       price: price,
//       customer_email: customer_email,
//       customer_mobile: customer_mobile,
//       p_info: pname,
//       playerId: userid,
//       orderId: orderId,
//       status: "pending",
//     });
//     await newOrder.save();

//     //! SEND MAIL TO USER
//     try {
//       const dynamicData = {
//         orderId: `${orderId}`,
//         amount: `${amount}`,
//         price: `${price}`,
//         p_info: `${pname}`,
//         userId: `${userid}`,
//         zoneId: "none",
//       };
//       let htmlContent = fs.readFileSync("order.html", "utf8");
//       Object.keys(dynamicData).forEach((key) => {
//         const placeholder = new RegExp(`{${key}}`, "g");
//         htmlContent = htmlContent.replace(placeholder, dynamicData[key]);
//       });
//       // Send mail
//       let mailTransporter = nodemailer.createTransport({
//         service: "gmail",
//         auth: {
//           user: process.env.SENDING_EMAIL,
//           pass: process.env.MAIL_PASS,
//         },
//       });
//       let mailDetails = {
//         from: process.env.SENDING_EMAIL,
//         to: `${customer_email}`,
//         subject: "Order Successful!",
//         html: htmlContent,
//       };
//       mailTransporter.sendMail(mailDetails, function (err, data) {
//         if (err) {
//           console.log(err);
//         }
//       });
//     } catch (error) {
//       console.error("Error sending email:", error);
//     }

//     //! SENDING MAIL TO ADMIN
//     const sub = "New Order Recieved";
//     const msgg =
//       "Hello Admin! You have received a new order. Kindly login to see your order.";
//     await sendMail("trymail649@gmail.com", sub, "", msgg);

//     const user = await userModel.findOne({ email: customer_email });
//     if (user) {
//       const updateUser = await userModel.findOneAndUpdate(
//         {
//           email: customer_email,
//         },
//         {
//           $set: {
//             balance: user?.balance - price < 0 ? 0 : user?.balance - price,
//           },
//         },
//         { new: true }
//       );

//       if (updateUser) {
//         //! WALLET HISTORY SAVE
//         const history = new walletHistoryModel({
//           orderId: orderId,
//           email: customer_email,
//           balanceBefore: user?.balance,
//           balanceAfter: user?.balance - price < 0 ? 0 : user?.balance - price,
//           price: price,
//           p_info: pname,
//         });
//         await history.save();

//         return res
//           .status(201)
//           .send({ success: true, message: "Order Placed Success" });
//       }
//     }
//   } catch (error) {
//     return res.status(500).send({ success: false, message: error.message });
//   }
// });

module.exports = router;
