const express = require("express");
const axios = require("axios");
const paymentModel = require("../models/paymentModel");
const productModel = require("../models/productModel");
const orderModel = require("../models/orderModel");
const authMiddleware = require("../middlewares/authMiddleware");
const md5 = require("md5");
const querystring = require("querystring");
const fs = require("fs");
const nodemailer = require("nodemailer");
const generalRateLimiter = require("../middlewares/generalRateLimiter");
const walletHistoryModel = require("../models/walletHistoryModel");
const userModel = require("../models/userModel");
const router = express.Router();

// PGATEWAY
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
    // Check if the order ID is found
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

        const [userid, zoneid, productids, pname, amount, ogPrice] =
          txn_note.split("@");
        const productid = productids.split("&");
        const region = product_name;

        // saving payment
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
            message: "Amount does not match.",
          });
        }

        const uid = process.env.UID;
        const email = process.env.EMAIL;
        const product = "mobilelegends";
        const time = Math.floor(Date.now() / 1000);
        const mKey = process.env.KEY;

        let orderResponse;
        for (let i = 0; i < productid.length; i++) {
          const signArr = {
            uid,
            email,
            product,
            time,
            userid,
            zoneid,
            productid: productid[i],
          };
          const sortedSignArr = Object.fromEntries(
            Object.entries(signArr).sort()
          );
          const str =
            Object.keys(sortedSignArr)
              .map((key) => `${key}=${sortedSignArr[key]}`)
              .join("&") +
            "&" +
            mKey;
          const sign = md5(md5(str));
          const formData = querystring.stringify({
            email,
            uid,
            userid,
            zoneid,
            product,
            productid: productid[i],
            time,
            sign,
          });
          const apiUrl =
            region === "brazil"
              ? "https://www.smile.one/br/smilecoin/api/createorder"
              : "https://www.smile.one/ph/smilecoin/api/createorder";
          orderResponse = await axios.post(apiUrl, formData, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
          });
        }

        if (orderResponse?.data?.status === 200) {
          const order = new orderModel({
            api: "yes",
            amount: amount,
            orderId: order_id,
            p_info: pname,
            price: txn_amount,
            customer_email,
            customer_mobile,
            userId: userid,
            zoneId: zoneid,
            status: "success",
          });
          await order.save();

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
          const order = new orderModel({
            api: "yes",
            amount: amount,
            orderId: order_id,
            p_info: pname,
            price: txn_amount,
            customer_email,
            customer_mobile,
            userId: userid,
            zoneId: zoneid,
            status: "failed",
          });
          await order.save();

          console.error("Error placing order:", orderResponse?.data?.message);
          return res.status(500).json({ error: "Error placing order" });
        }
      } else {
        console.error("OrderID Not Found");
        return res.status(404).json({ error: "OrderID Not Found" });
      }
    }
  } catch (error) {
    console.error("Internal Server Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// UPI_GATEWAY
router.post("/create-order", generalRateLimiter, authMiddleware, async (req, res) => {
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

    const redirectUrl = `https://zelanstore.com/api/smile/check-status`;
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
router.get("/check-status", async (req, res) => {
  
  try {
    const { client_txn_id } = req.query;

    const existingOrder = await orderModel.findOne({
      orderId: client_txn_id,
    });
    if (existingOrder) {
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

    // Check if the order ID is found
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

        const [userid, zoneid, productids, pname, amount, ogPrice] = udf1.split("@");
        const productid = productids.split("&");
        const region = product_name;

        // saving payment
        const paymentObject = {
          name: customer_name,
          email: customer_email,
          mobile: customer_mobile,
          amount: txn_amount,
          orderId: order_id,
          status: data.status,
          type: "order",
          pname: product_name,
          upi_txn_id: utr_number || "none",
          payerUpi : customer_vpa || "none"
        };
        const newPayment = new paymentModel(paymentObject);
        await newPayment.save();

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
        //     message: "Amount does not match.",
        //   });
        // }

        
        const priceExists = pp.cost.some(
          (item) =>
            item.amount === amount &&
            (parseFloat(item.price) === parseFloat(ogPrice) ||
              (parseFloat(item.resPrice) === parseFloat(ogPrice) &&
                item.id === productids))
        );

        if (!priceExists) {
          return res.status(400).json({
            message: "Amount does not match.",
          });
        }



        const uid = process.env.UID;
        const email = process.env.EMAIL;
        const product = "mobilelegends";
        const time = Math.floor(Date.now() / 1000);
        const mKey = process.env.KEY;

        let orderResponse;
        for (let i = 0; i < productid.length; i++) {
          const signArr = {
            uid,
            email,
            product,
            time,
            userid,
            zoneid,
            productid: productid[i],
          };
          const sortedSignArr = Object.fromEntries(
            Object.entries(signArr).sort()
          );
          const str =
            Object.keys(sortedSignArr)
              .map((key) => `${key}=${sortedSignArr[key]}`)
              .join("&") +
            "&" +
            mKey;
          const sign = md5(md5(str));
          const formData = querystring.stringify({
            email,
            uid,
            userid,
            zoneid,
            product,
            productid: productid[i],
            time,
            sign,
          });
          const apiUrl =
            region === "brazil"
              ? "https://www.smile.one/br/smilecoin/api/createorder"
              : "https://www.smile.one/ph/smilecoin/api/createorder";
          orderResponse = await axios.post(apiUrl, formData, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
          });
        }

        if (orderResponse?.data?.status === 200) {
          const order = new orderModel({
            api: "yes",
            amount: amount,
            orderId: order_id,
            p_info: pname,
            price: txn_amount,
            customer_email,
            customer_mobile,
            userId: userid,
            zoneId: zoneid,
            status: "success",
          });
          await order.save();

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
          const order = new orderModel({
            api: "yes",
            amount: amount,
            orderId: order_id,
            p_info: pname,
            price: txn_amount,
            customer_email,
            customer_mobile,
            userId: userid,
            zoneId: zoneid,
            status: "failed",
          });
          await order.save();

          console.error("Error placing order:", orderResponse?.data?.message);
          return res.status(500).json({ error: "Error placing order" });
        }
      } else {
        console.error("OrderID Not Found");
        return res.status(404).json({ error: "OrderID Not Found" });
      }
    }
  } catch (error) {
    console.error("Internal Server Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


// wallet
router.post("/wallet", generalRateLimiter, authMiddleware, async (req, res) => {
  try {
    const {
      orderId,
      userid,
      zoneid,
      region,
      productid,
      customer_email,
      customer_mobile,
      amount,
      price,
      pname,
      ogPrice,
    } = req.body;

    if (!orderId || !userid || !zoneid || !region || !productid || !customer_email || !customer_mobile || !amount || !price || !pname) {
      return res.status(404).json({ message: "Invalid details" });
    }

    const checkProduct = await productModel.findOne({ name: pname });
    if (!checkProduct) {
      return res.status(404).json({ message: "Product not found" });
    }

    // const priceExistss = checkProduct.cost.some(
    //   (item) =>
    //     item.amount === amount &&
    //     (parseFloat(item.price) === parseFloat(ogPrice) || parseFloat(item.resPrice) === parseFloat(ogPrice))
    // );
    // if (!priceExistss) {
    //   return res.status(400).json({ message: "Amount does not match" });
    // }

    const priceExists = checkProduct.cost.some(
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

    const checkUser = await userModel.findOne({ email: customer_email });

    if (!checkUser) {
      return res.status(400).send({ success: false, message: "Please Enter Valid Email" });
    }
    if (checkUser?.balance < parseFloat(price) || checkUser?.balance === 0) {
      return res.status(201).send({ success: false, message: "Balance is less for this order" });
    }

    const uid = process.env.UID;
    const email = process.env.EMAIL;
    const product = "mobilelegends";
    const time = Math.floor(Date.now() / 1000);
    const mKey = process.env.KEY;
    const productId = productid.split("&");

    let orderResponse;
    for (let index = 0; index < productId.length; index++) {
      const signArr = {
        uid,
        email,
        product,
        time,
        userid,
        zoneid,
        productid: productId[index],
      };
      const sortedSignArr = Object.fromEntries(Object.entries(signArr).sort());
      const str = Object.keys(sortedSignArr).map((key) => `${key}=${sortedSignArr[key]}`).join("&") + "&" + mKey;
      const sign = md5(md5(str));

      const formData = querystring.stringify({
        email,
        uid,
        userid,
        zoneid,
        product,
        productid: productId[index],
        time,
        sign,
      });

      let apiUrl = region === "brazil" ? "https://www.smile.one/br/smilecoin/api/createorder" : "https://www.smile.one/ph/smilecoin/api/createorder";
      orderResponse = await axios.post(apiUrl, formData, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
    }

    if (orderResponse.data.status === 200) {
      const order = new orderModel({
        api: "yes",
        orderId: orderId,
        p_info: pname,
        price: price,
        amount: amount,
        customer_email: customer_email,
        customer_mobile: customer_mobile,
        playerId: userid,
        userId: userid,
        zoneId: zoneid,
        status: "success",
      });
      await order.save();

      try {
        const dynamicData = { orderId, amount, price, p_info: pname, userId: userid, zoneId: zoneid };
        let htmlContent = fs.readFileSync("order.html", "utf8");
        Object.keys(dynamicData).forEach((key) => {
          const placeholder = new RegExp(`{${key}}`, "g");
          htmlContent = htmlContent.replace(placeholder, dynamicData[key]);
        });

        let mailTransporter = nodemailer.createTransport({
          service: "gmail",
          auth: { user: process.env.MAIL, pass: process.env.APP_PASSWORD },
        });

        let mailDetails = {
          from: process.env.MAIL,
          to: customer_email,
          subject: "Order Successful!",
          html: htmlContent,
        };
        mailTransporter.sendMail(mailDetails, function (err) {
          if (err) console.log(err);
        });
      } catch (error) {
        console.error("Error sending email:", error);
      }

      const user = await userModel.findOne({ email: customer_email });
      const balance = (Math.max(0, (parseFloat(user?.balance) || 0) - (parseFloat(price) || 0)));
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
          price: `-${price}`,
          p_info: pname,
          type: "order",
        });
        await history.save();

        return res.status(200).send({ success: true, message: "Order Placed Successfully" });

      }
    } else {
      const order = new orderModel({
        api: "yes",
        orderId: orderId,
        p_info: pname,
        price: price,
        amount: amount,
        customer_email: customer_email,
        customer_mobile: customer_mobile,
        playerId: userid,
        userId: userid,
        zoneId: zoneid,
        status: "failed",
      });
      await order.save();
      return res.status(400).send({ success: false, message: "Order Failed" });
    }
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: error.message });
  }
});


module.exports = router;
