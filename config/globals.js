require('dotenv').config();

module.exports = {
  LIMIT_RECORDS : process.env.LIMIT_RECORDS || 10000,
  PORT : process.env.PORT || 3000,
  ALLOW_ORIGIN: process.env.ALLOW_ORIGIN || "http://localhost:8080",
  JWT_SECRET: process.env.JWT_SECRET,
  SALT_ROUNDS: process.env.SALT_ROUNDS || 10,
  REQUIRE_SIGN_IN: process.env.REQUIRE_SIGN_IN === "false" ? false : true,
  MAX_TIME_OUT: process.env.MAX_TIME_OUT || 2000,
  POST_REQUEST_MAX_BODY_SIZE: process.env.POST_REQUEST_MAX_BODY_SIZE || '1mb',
  ERROR_LOG: process.env.ERROR_LOG || 'compact',
  MAIL_SERVICE: process.env.MAIL_SERVICE || "gmail",
  MAIL_HOST: process.env.MAIL_HOST || "smtp.gmail.com",
  MAIL_ACCOUNT: process.env.MAIL_ACCOUNT || "sci.db.service@gmail.com",
  MAIL_PASSWORD: process.env.MAIL_PASSWORD || "SciDbServiceQAZ",
  EXPORT_TIME_OUT: process.env.EXPORT_TIME_OUT || 3600
}
