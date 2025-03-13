const express = require("express");
const contactModel = require("../models/contactModel");
const authMiddleware = require("../middlewares/authMiddleware");
const generalRateLimiter = require("../middlewares/generalRateLimiter");

// router object
const router = express.Router();

// routes
router.post("/add-contact-form", generalRateLimiter, async (req, res) => {
  try {
    const newContact = new contactModel(req.body);
    await newContact.save();
    return res
      .status(201)
      .send({ success: true, message: "Form Submitted Successful" });
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: `Add Contact ${error.message}`,
    });
  }
});

router.post("/get-user-query", authMiddleware, async (req, res) => {
  try {
    const queries = await contactModel.find({ email: req.body.email });
    if (queries.length === 0) {
      return res.status(201).send({
        success: false,
        message: "No Query Found",
      });
    }
    return res.status(200).send({
      success: true,
      message: "Query Fetched",
      data: queries,
    });
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});

router.post("/update-query", generalRateLimiter, authMiddleware, async (req, res) => {
  try {
    const query = await contactModel.findOne({ _id: req.body.id });
    if (!query) {
      return res.status(201).send({
        success: false,
        message: "No Query Found",
      });
    }

    if (!req.body.msg && req.body.id) {
      query.seen = true;
      await query.save();
      return res.status(200).send({
        success: true,
        message: "Query seen",
      });
    } else {
      query.msg.push({ msg: req.body.msg, person: req.body.person });
      if (req.body.msg) {
        query.seen = false;
      }
      const updateQuery = await query.save();
      if (!updateQuery) {
        return res.status(202).json({
          success: false,
          message: "Failed to update",
        });
      }
      return res.status(200).send({
        success: true,
        message: "Msg Sent Sucess",
      });
    }
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;
