const express = require("express");
const path = require("path");
const colors = require("colors");
const morgan = require("morgan"); // corrected spelling
const dotenv = require("dotenv");
const connectDB = require("./config/db");
var cors = require("cors");
const bodyParser = require("body-parser");
const { createProxyMiddleware } = require("http-proxy-middleware");
const cookieParser = require("cookie-parser");
const session = require("express-session");

// dotenv
dotenv.config();
//mongodb connection
connectDB();
// rest object
const app = express();
app.use(cors());
app.use(cookieParser());

app.use(
  session({
    secret: "SHIKHIGAMI@#$123",
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 3 * 60 * 1000,
    },
  })
);

// middlewares
app.use(
  cors({
    origin: "https://zelanstore.com",
    credentials: true,
  })
);
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(morgan("dev"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static("build"));

// Middleware to check referer
function checkReferer(req, res, next) {
  const referer = req.headers.referer;
  const allowedDomains = [
    "https://zelanstore.com",
    "https://zelanstore.com/",
    "https://www.zelanstore.com",
    "https://www.zelanstore.com/",
    "https://pgateway.in",
    "http://localhost:3000",
    "http://localhost:8080",
  ];
  if (referer && allowedDomains.some((domain) => referer.startsWith(domain))) {
    next();
  } else {
    res.status(403).json({ message: "Forbidden" });
  }
}
// app.use("/api", checkReferer);

// Static file for images
app.use(
  "/productImages",
  express.static(path.join(__dirname, "productImages"))
);
app.set('trust proxy', 1);
app.use("/admin-products", express.static("productImages"));
app.use("/admin-edit-product/:id", express.static("productImages"));
app.use("/admin-view-order/:id", express.static("productImages"));
app.use("/product/", express.static("productImages"));
app.use("/product/:name", express.static("productImages"));
//! GALLERY
app.use("/gallery", express.static(path.join(__dirname, "gallery")));
app.use("/gallery", express.static("gallery"));
app.use("/product/:name", express.static("gallery"));
//! NOTIFICATION
app.use(
  "/notificationImages",
  express.static(path.join(__dirname, "notificationImages"))
);
//! BANNER
app.use("/banners", express.static(path.join(__dirname, "banners")));
app.use("/admin-banners", express.static("banners"));
//! PROMO
app.use("/promoImg", express.static(path.join(__dirname, "promoImg")));
app.use("/admin-promo", express.static("promoImg"));
app.use("/promo/:id", express.static("promoImg"));

// routes
app.use("/api/user/", require("./routes/userRoutes"));
app.use("/api/contact/", require("./routes/contactRoutes"));
app.use("/api/admin/", require("./routes/adminRoutes"));
app.use("/api/product/", require("./routes/productRoutes"));
app.use("/api/order/", require("./routes/orderRoutes"));
app.use("/api/image/", require("./routes/imageRoutes"));
app.use("/api/payment/", require("./routes/paymentRoutes"));
// order end points
app.use("/api/smile/", require("./routes/smileRoutes"));
app.use("/api/moogold/", require("./routes/moogoldRoutes"));
app.use("/api/wallet/", require("./routes/walletRoutes"));
app.use("/api/manual/", require("./routes/manualRoutes"));
app.use("/api/wallet/", require("./routes/walletHistoryRoutes"));

// PORT
const port = process.env.PORT || 8080;

// STATIC FILES RUNNING ON BUILD FOLDER
if (process.env.NODE_MODE === "production") {
  app.use(express.static(path.join(__dirname, "./client/build")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "./client/build/index.html"));
  });
} else {
  app.get("/", (req, res) => {
    res.send("API running..");
  });
}

// Listen
app.listen(port, (req, res) => {
  console.log(
    `Server running in ${process.env.NODE_MODE} Mode on Port ${process.env.PORT}`
      .bgCyan
  );
});
