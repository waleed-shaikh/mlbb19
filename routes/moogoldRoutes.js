const express = require("express");
const axios = require("axios");
const base64 = require("base-64");
const paymentModel = require("../models/paymentModel");
const productModel = require("../models/productModel");
const orderModel = require("../models/orderModel");
const fs = require("fs");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const authMiddleware = require("../middlewares/authMiddleware");
const walletHistoryModel = require("../models/walletHistoryModel");
const router = express.Router();

const generateBasicAuthHeader = () => {
  const credentials = `${process.env.MOOGOLD_PARTNER_ID}:${process.env.MOOGOLD_SECRET}`;
  return `Basic ${base64.encode(credentials)}`;
};

const generateAuthSignature = (payload, timestamp, path) => {
  const stringToSign = `${JSON.stringify(payload)}${timestamp}${path}`;
  return crypto
    .createHmac("sha256", process.env.MOOGOLD_SECRET)
    .update(stringToSign)
    .digest("hex");
};

// Get product
router.post("/moogold-product", async (req, res) => {
  const productID = req.body.product_id;

  if (!productID) {
    return res.status(400).send({ error: "Product ID is required" });
  }

  const payload = {
    path: "product/product_detail",
    product_id: productID,
  };

  const timestamp = Math.floor(Date.now() / 1000); // Current UNIX timestamp
  const path = "product/product_detail";
  const stringToSign = `${JSON.stringify(payload)}${timestamp}${path}`;
  const authSignature = require("crypto")
    .createHmac("sha256", process.env.MOOGOLD_SECRET)
    .update(stringToSign)
    .digest("hex");

  try {
    const response = await axios.post(
      "https://moogold.com/wp-json/v1/api/product/product_detail",
      payload,
      {
        headers: {
          Authorization: generateBasicAuthHeader(),
          auth: authSignature,
          timestamp: timestamp,
        },
      }
    );
    return res
      .status(200)
      .send({ success: true, message: "Product Fetched", data: response.data });
  } catch (error) {
    if (error.response) {
      res.status(error.response.status).send(error.response.data);
    } else {
      res
        .status(500)
        .send({ error: "An error occurred while fetching the product list" });
    }
  }
});
// Get servers
router.post("/moogold-servers", async (req, res) => {
  const productID = req.body.product_id;

  if (!productID) {
    return res.status(400).send({ error: "Product ID is required" });
  }

  const payload = {
    path: "product/server_list",
    product_id: productID,
  };

  const timestamp = Math.floor(Date.now() / 1000); // Current UNIX timestamp
  const path = "product/server_list";
  const stringToSign = `${JSON.stringify(payload)}${timestamp}${path}`;
  const authSignature = require("crypto")
    .createHmac("sha256", process.env.MOOGOLD_SECRET)
    .update(stringToSign)
    .digest("hex");

  try {
    const response = await axios.post(
      "https://moogold.com/wp-json/v1/api/product/server_list",
      payload,
      {
        headers: {
          Authorization: generateBasicAuthHeader(),
          auth: authSignature,
          timestamp: timestamp,
        },
      }
    );
    return res
      .status(200)
      .send({ success: true, message: "Product Fetched", data: response.data });
  } catch (error) {
    if (error.response) {
      res.status(error.response.status).send(error.response.data);
    } else {
      res
        .status(500)
        .send({ error: "An error occurred while fetching the product list" });
    }
  }
});

// P_GATEWAY
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

    const pname = txn_note.split("@")[3];
    const amount = txn_note.split("@")[4];
    const ogPrice = txn_note.split("@")[5];
    const product = await productModel.findOne({ name: pname });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    const priceExists = product.cost.some(
      (item) =>
        item.amount === amount &&
        (parseFloat(item.price) === parseFloat(ogPrice) ||
          parseFloat(item.resPrice) === parseFloat(ogPrice))
    );
    if (!priceExists) {
      return res.status(400).json({
        message: "Amount does not match",
      });
    }

    const existingOrder = await orderModel.findOne({
      orderId: order_id,
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
    res.status(500).json({ error: error });
  }
});
router.post("/status", async (req, res) => {
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

        //! SAVING PAYMENT DETAILS
        const paymentObject = {
          name: customer_name,
          email: customer_email,
          mobile: customer_mobile,
          amount: txn_amount,
          orderId: order_id,
          status: transactionDetails.status,
          upi_txn_id: utr_number,
        };
        const newPayment = new paymentModel(paymentObject);
        await newPayment.save();

        let userid, zoneid, productid, pname, amount, ogPrice;
        const txnParts = txn_note.split("@");
        if (txnParts.length === 5) {
          [userid, productid, pname, amount, ogPrice] = txnParts;
          zoneid = null;
        } else {
          [userid, zoneid, productid, pname, amount, ogPrice] = txnParts;
        }
        const gameName = product_name;

        const pp = await productModel.findOne({ name: pname });
        if (!pp) {
          return res.status(404).json({ message: "Product not found" });
        }
        const priceExists = pp.cost.some(
          (item) =>
            item.amount === amount &&
            (parseFloat(item.price) === parseFloat(ogPrice) ||
              parseFloat(item.resPrice) === parseFloat(ogPrice))
        );
        if (!priceExists) {
          return res.status(400).json({
            message: "Amount does not match",
          });
        }

        let payload;
        //genshin
        if (gameName === "428075") {
          payload = {
            path: "order/create_order",
            data: {
              category: 1,
              "product-id": productid,
              quantity: 1,
              "User ID": userid,
              Server: zoneid,
              fields: [userid, zoneid],
            },
          };
          // honkai star rail
        } else if (gameName === "4233885") {
          payload = {
            path: "order/create_order",
            data: {
              category: 1,
              "product-id": productid,
              quantity: 1,
              "User ID": userid,
              Server: zoneid,
              fields: [userid, zoneid],
            },
          };
          // honor of kings
        } else if (gameName === "5177311") {
          payload = {
            path: "order/create_order",
            data: {
              category: 1,
              "product-id": productid,
              quantity: 1,
              "Player ID": userid,
              "Role Name": zoneid,
              fields: [userid, zoneid],
            },
          };
          // mlbb
        } else {
          payload = {
            path: "order/create_order",
            data: {
              category: 1,
              "product-id": productid,
              quantity: 1,
              "User ID": userid,
              "Server ID": zoneid,
              fields: [userid, zoneid],
            },
          };
        }

        const timestamp = Math.floor(Date.now() / 1000);
        const path = "order/create_order";
        const authSignature = generateAuthSignature(payload, timestamp, path);

        const response = await axios.post(
          "https://moogold.com/wp-json/v1/api/order/create_order",
          payload,
          {
            headers: {
              Authorization: generateBasicAuthHeader(),
              auth: authSignature,
              timestamp: timestamp,
            },
          }
        );

        if (response.data.err_code) {
          const order = new orderModel({
            api: "yes",
            amount: amount,
            orderId: order_id,
            p_info: pname,
            price: txn_amount,
            customer_email,
            customer_mobile,
            playerId: userid,
            userId: userid,
            zoneId: zoneid,
            status: "failed",
          });
          await order.save();
          return res.redirect("https://zelanstore.com/");
        }

        if (response.status) {
          const order = new orderModel({
            api: "yes",
            amount: amount,
            orderId: order_id,
            p_info: pname,
            price: txn_amount,
            customer_email,
            customer_mobile,
            playerId: userid,
            userId: userid,
            zoneId: zoneid,
            status: "success",
          });
          await order.save();
        }

        try {
          const dynamicData = {
            orderId: `${order_id}`,
            amount: `${amount}`,
            price: `${txn_amount}`,
            p_info: `${pname}`,
            userId: `${userid}`,
            zoneId: `${zoneid}`,
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
              user: process.env.MAIL,
              pass: process.env.APP_PASSWORD,
            },
          });
          let mailDetails = {
            from: process.env.MAIL,
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
        return res.redirect("https://zelanstore.com/user-dashboard");
      } else {
        console.error("OrderID Not Found");
        return res.status(404).json({ error: "OrderID Not Found" });
      }
    }
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// UPI_GATEWAY
router.post("/create-order", authMiddleware, async (req, res) => {
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

    const productid = txn_note.split("@")[2];
    const pname = txn_note.split("@")[3];
    const amount = txn_note.split("@")[4];
    const ogPrice = txn_note.split("@")[5];

    const product = await productModel.findOne({ name: pname });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    // const priceExists = product.cost.some(
    //   (item) =>
    //     item.amount === amount &&
    //     (parseFloat(item.price) === parseFloat(ogPrice) ||
    //       parseFloat(item.resPrice) === parseFloat(ogPrice))
    // );
    // if (!priceExists) {
    //   return res.status(400).json({
    //     message: "Amount does not match",
    //   });
    // }

    const priceExists = product.cost.some(
      (item) =>
        item.amount === amount &&
        (parseFloat(item.price) === parseFloat(ogPrice) ||
          (parseFloat(item.resPrice) === parseFloat(ogPrice) &&
            item.id === productid))
    );

    if (!priceExists) {
      return res.status(400).json({
        message: "Amount does not match.",
      });
    }

    const existingOrder = await orderModel.findOne({
      orderId: order_id,
    });
    if (existingOrder) {
      return res.redirect("https://zelanstore.com/user-dashboard");
    }

    const redirectUrl = `https://zelanstore.com/api/moogold/check-status`;
    // const redirectUrl = `http://localhost:8080/api/smile/check-status`;
    
    const response = await axios.post(
      "https://api.ekqr.in/api/create_order",
      {
        key: process.env.UPIGATEWAY_API_KEY,
        client_txn_id: order_id.toString(),
        amount: txn_amount,
        p_info : product_name,
        customer_name: customer_name,
        customer_email: customer_email,
        customer_mobile : customer_mobile,
        redirect_url: redirectUrl,
        udf1: txn_note,
        udf2: "",
        udf3: "",
      }
    );
    
    // return console.log(response.data)
    if (response.data && response.data.status) {
      return res.status(200).send({ success: true, data: response.data.data });
    } else {
      return res
        .status(201)
        .send({ success: false, data: "Error in initiating payment" });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error });
  }
});
router.post("/check-status", async (req, res) => {
  try {
    const { client_txn_id } = req.query;

    const existingPayment = await paymentModel.findOne({
      orderId: orderId,
    });
    if (existingPayment) {
      return res.redirect("https://zelanstore.com/user-dashboard");
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
        amount: txn_amount,
        client_txn_id: order_id,
        customer_name,
        customer_email,
        customer_mobile,
        p_info: product_name,
        upi_txn_id: utr_number,
        customer_vpa,
        remark,
        udf1,
      } = data;

      if (data.status === "success") {

        //! SAVING PAYMENT DETAILS
        const paymentObject = {
          name: customer_name,
          email: customer_email,
          mobile: customer_mobile,
          amount: txn_amount,
          orderId: order_id,
          status: data.status,
          upi_txn_id: utr_number,
        };
        const newPayment = new paymentModel(paymentObject);
        await newPayment.save();

        let userid, zoneid, productid, pname, amount, ogPrice;
        const txnParts = udf1.split("@");
        if (txnParts.length === 5) {
          [userid, productid, pname, amount, ogPrice] = txnParts;
          zoneid = null;
        } else {
          [userid, zoneid, productid, pname, amount, ogPrice] = txnParts;
        }
        const gameName = product_name;

        const pp = await productModel.findOne({ name: pname });
        if (!pp) {
          return res.status(404).json({ message: "Product not found" });
        }

        // const priceExists = pp.cost.some(
        //   (item) =>
        //     item.amount === amount &&
        //     (parseFloat(item.price) === parseFloat(ogPrice) ||
        //       parseFloat(item.resPrice) === parseFloat(ogPrice))
        // );
        // if (!priceExists) {
        //   return res.status(400).json({
        //     message: "Amount does not match",
        //   });
        // }

        const priceExists = pp.cost.some(
          (item) =>
            item.amount === amount &&
            (parseFloat(item.price) === parseFloat(ogPrice) ||
              (parseFloat(item.resPrice) === parseFloat(ogPrice) &&
                item.id === productid))
        );
    
        if (!priceExists) {
          return res.status(400).json({
            message: "Amount does not match.",
          });
        }

        let payload;
        //genshin
        if (gameName === "428075") {
          payload = {
            path: "order/create_order",
            data: {
              category: 1,
              "product-id": productid,
              quantity: 1,
              "User ID": userid,
              Server: zoneid,
              fields: [userid, zoneid],
            },
          };
          // honkai star rail
        } else if (gameName === "4233885") {
          payload = {
            path: "order/create_order",
            data: {
              category: 1,
              "product-id": productid,
              quantity: 1,
              "User ID": userid,
              Server: zoneid,
              fields: [userid, zoneid],
            },
          };
          // honor of kings
        } else if (gameName === "5177311") {
          payload = {
            path: "order/create_order",
            data: {
              category: 1,
              "product-id": productid,
              quantity: 1,
              "Player ID": userid,
              "Role Name": zoneid,
              fields: [userid, zoneid],
            },
          };
          // mlbb
        } else {
          payload = {
            path: "order/create_order",
            data: {
              category: 1,
              "product-id": productid,
              quantity: 1,
              "User ID": userid,
              "Server ID": zoneid,
              fields: [userid, zoneid],
            },
          };
        }

        const timestamp = Math.floor(Date.now() / 1000);
        const path = "order/create_order";
        const authSignature = generateAuthSignature(payload, timestamp, path);

        const response = await axios.post(
          "https://moogold.com/wp-json/v1/api/order/create_order",
          payload,
          {
            headers: {
              Authorization: generateBasicAuthHeader(),
              auth: authSignature,
              timestamp: timestamp,
            },
          }
        );

        if (response.data.err_code) {
          const order = new orderModel({
            api: "yes",
            amount: amount,
            orderId: order_id,
            p_info: pname,
            price: txn_amount,
            customer_email,
            customer_mobile,
            playerId: userid,
            userId: userid,
            zoneId: zoneid,
            status: "failed",
          });
          await order.save();
          return res.redirect("https://zelanstore.com/");
        }

        if (response.status) {
          const order = new orderModel({
            api: "yes",
            amount: amount,
            orderId: order_id,
            p_info: pname,
            price: txn_amount,
            customer_email,
            customer_mobile,
            playerId: userid,
            userId: userid,
            zoneId: zoneid,
            status: "success",
          });
          await order.save();
        }

        try {
          const dynamicData = {
            orderId: `${order_id}`,
            amount: `${amount}`,
            price: `${txn_amount}`,
            p_info: `${pname}`,
            userId: `${userid}`,
            zoneId: `${zoneid}`,
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
              user: process.env.MAIL,
              pass: process.env.APP_PASSWORD,
            },
          });
          let mailDetails = {
            from: process.env.MAIL,
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
        return res.redirect("https://zelanstore.com/user-dashboard");
      } else {
        console.error("OrderID Not Found");
        return res.status(404).json({ error: "OrderID Not Found" });
      }
    }
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// wallet
router.post("/wallet", authMiddleware, async (req, res) => {
  try {
    const {
      api,
      orderId,
      txn_note,
      customer_email,
      customer_mobile,
      txn_amount,
      product_name,
    } = req.body;

    if (!api || !orderId || !txn_note || !customer_email || !customer_mobile || !txn_amount || !product_name) {
      return res.status(400).send({ success: false, message: "Invalid Details" });
    }

    const existingPayment = await paymentModel.findOne({ orderId: orderId });
    if (existingPayment) {
      return res.redirect("https://zelanstore.com/user-dashboard");
    }

    let userid, zoneid, productid, pname, amount, ogPrice;
    const txnParts = txn_note.split("@");
    if (txnParts.length === 4) {
      [userid, productid, pname, amount, ogPrice] = txnParts;
      zoneid = null;
    } else {
      [userid, zoneid, productid, pname, amount, ogPrice] = txnParts;
    }
    const gameName = product_name;

    const pp = await productModel.findOne({ name: pname });
    if (!pp) {
      return res.status(404).json({ message: "Product not found" });
    }

    // const priceExists = pp.cost.some(
    //   (item) =>
    //     item.amount === amount &&
    //     (parseFloat(item.price) === parseFloat(ogPrice) || parseFloat(item.resPrice) === parseFloat(ogPrice))
    // );

    // if (!priceExists) {
    //   return res.status(400).json({ message: "Amount does not match" });
    // }

    const priceExists = pp.cost.some(
      (item) =>
        item.amount === amount &&
        (parseFloat(item.price) === parseFloat(ogPrice) ||
          (parseFloat(item.resPrice) === parseFloat(ogPrice) &&
            item.id === productid))
    );

    if (!priceExists) {
      return res.status(400).json({
        message: "Amount does not match.",
      });
    }

    let payload;
    if (gameName === "428075" || gameName === "4233885") {
      payload = {
        path: "order/create_order",
        data: {
          category: 1,
          "product-id": productid,
          quantity: 1,
          "User ID": userid,
          Server: zoneid,
          fields: [userid, zoneid],
        },
      };
    } else if (gameName === "5177311") {
      payload = {
        path: "order/create_order",
        data: {
          category: 1,
          "product-id": productid,
          quantity: 1,
          "Player ID": userid,
          "Role Name": zoneid,
          fields: [userid, zoneid],
        },
      };
    } else {
      payload = {
        path: "order/create_order",
        data: {
          category: 1,
          "product-id": productid,
          quantity: 1,
          "User ID": userid,
          "Server ID": zoneid,
          fields: [userid, zoneid],
        },
      };
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const path = "order/create_order";
    const authSignature = generateAuthSignature(payload, timestamp, path);

    const response = await axios.post("https://moogold.com/wp-json/v1/api/order/create_order", payload, {
      headers: {
        Authorization: generateBasicAuthHeader(),
        auth: authSignature,
        timestamp: timestamp,
      },
    });

    if (response.data.err_code) {
      const order = new orderModel({
        api: api,
        amount: amount,
        orderId: orderId,
        p_info: pname,
        price: txn_amount,
        customer_email,
        customer_mobile,
        playerId: userid,
        userId: userid,
        zoneId: zoneid,
        status: "failed",
      });
      await order.save();
      return res.status(400).send({ success: false, message: "Order Failed" });
    }

    if (response.status) {
      const order = new orderModel({
        api: api,
        amount: amount,
        orderId: orderId,
        p_info: pname,
        price: txn_amount,
        customer_email,
        customer_mobile,
        playerId: userid,
        userId: userid,
        zoneId: zoneid,
        status: "success",
      });
      await order.save();
    }

    try {
      const dynamicData = {
        orderId: `${orderId}`,
        amount: `${amount}`,
        price: `${txn_amount}`,
        p_info: `${pname}`,
        userId: `${userid}`,
        zoneId: `${zoneid}`,
      };
      let htmlContent = fs.readFileSync("order.html", "utf8");
      Object.keys(dynamicData).forEach((key) => {
        const placeholder = new RegExp(`{${key}}`, "g");
        htmlContent = htmlContent.replace(placeholder, dynamicData[key]);
      });
      let mailTransporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: process.env.MAIL, pass: process.env.APP_PASSWORD },
      });
      let mailDetails = { from: process.env.MAIL, to: `${customer_email}`, subject: "Order Successful!", html: htmlContent };
      mailTransporter.sendMail(mailDetails, function (err, data) {
        if (err) {
          console.log(err);
        }
      });
    } catch (error) {
      console.error("Error sending email:", error);
    }

    const user = await userModel.findOne({ email: customer_email });
    const balance = user?.balance - txn_amount < 0 ? 0 : user?.balance - txn_amount;
    if (user) {
      const updateBalance = await userModel.findOneAndUpdate(
        { email: customer_email },
        { $set: { balance: balance } },
        { new: true }
      );

      if (!updateBalance) {
        return res
          .status(201)
          .send({ success: false, message: "Err updating balance" });
      }

      // saving wallet history
      const history = new walletHistoryModel({
        orderId: orderId,
        email: customer_email,
        balanceBefore: user?.balance,
        balanceAfter: balance,
        price: `-${txn_amount}`,
        p_info: pname,
        type: "order",
      });
      await history.save();

      return res.status(200).send({ success: true, message: "Order Placed Successfully" });
    }
  } catch (error) {
    console.log(error.message);
    return res.status(500).send({ error: error.message });
  }
});

module.exports = router;
