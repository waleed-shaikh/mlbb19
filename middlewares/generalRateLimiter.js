const rateLimit = require('express-rate-limit');

// 1 minute में अधिकतम 5 registration attempts की अनुमति देने वाला limiter
module.exports = rateLimit({
  windowMs: 120 * 1000, // 1 minute in milliseconds
  max: 10, // Maximum 5 requests from an IP
  message: 'Too many request attempts. Please try again after 1 minute.'
});
