require("dotenv").config();

/**
 * Mandatory variables
 */
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN;
const OAUTH2_TOKEN_URI = process.env.OAUTH2_TOKEN_URI;
const OAUTH2_CLIENT_ID = process.env.OAUTH2_CLIENT_ID;
const OAUTH2_PUBLIC_KEY = process.env.OAUTH2_PUBLIC_KEY;

if (!ALLOW_ORIGIN || !OAUTH2_TOKEN_URI || !OAUTH2_CLIENT_ID || !OAUTH2_PUBLIC_KEY) {
  throw new Error("Some mandatory environment variables have not been set\n", {
    ALLOW_ORIGIN,
    OAUTH2_TOKEN_URI,
    OAUTH2_CLIENT_ID,
    OAUTH2_PUBLIC_KEY 
  });
}

/**
 * Optional variables with no defaults
 */

const MAIL_ACCOUNT = process.env.MAIL_ACCOUNT;
const MAIL_HOST = process.env.MAIL_HOST;
const MAIL_PASSWORD = process.env.MAIL_PASSWORD;
const MAIL_SERVICE = process.env.MAIL_SERVICE;

if (!MAIL_ACCOUNT || !MAIL_HOST || !MAIL_PASSWORD || !MAIL_SERVICE) {
  console.warn(
    "WARNING: BulkAdd email service has not been properly configured",
    {
      MAIL_ACCOUNT,
      MAIL_HOST,
      MAIL_PASSWORD,
      MAIL_SERVICE,
    }
  );
}

/**
 * Optional variables with sensible defaults
 */

// Listening port
const PORT = parseInt(process.env.PORT || 3000);

// Logging
const ERROR_LOG = process.env.ERROR_LOG || "compact";

// Request Limits
const LIMIT_RECORDS = parseInt(process.env.LIMIT_RECORDS || 10000);
const POST_REQUEST_MAX_BODY_SIZE =
  process.env.POST_REQUEST_MAX_BODY_SIZE || "1mb";

// Security
const REQUIRE_SIGN_IN = process.env.REQUIRE_SIGN_IN === "false" ? false : true;
const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS || 10);
const WHITELIST_ROLES = process.env.WHITELIST_ROLES
  ? process.env.WHITELIST_ROLES.split(",")
  : [];
// Timeouts
const MAX_TIME_OUT = parseInt(process.env.MAX_TIME_OUT || 2000);
const EXPORT_TIME_OUT = parseInt(process.env.EXPORT_TIME_OUT || 3600);

const config = {
  LIMIT_RECORDS,
  PORT,
  ALLOW_ORIGIN,
  SALT_ROUNDS,
  REQUIRE_SIGN_IN,
  MAX_TIME_OUT,
  POST_REQUEST_MAX_BODY_SIZE,
  ERROR_LOG,
  MAIL_SERVICE,
  MAIL_HOST,
  MAIL_ACCOUNT,
  MAIL_PASSWORD,
  EXPORT_TIME_OUT,
  WHITELIST_ROLES,
  OAUTH2_TOKEN_URI,
  OAUTH2_CLIENT_ID,
  OAUTH2_PUBLIC_KEY 
};

module.exports = config;
