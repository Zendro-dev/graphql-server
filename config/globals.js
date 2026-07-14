require("dotenv").config();

/**
 * Mandatory variables
 */
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN;

if (!ALLOW_ORIGIN) {
  throw new Error("Some mandatory environment variables have not been set\n", {
    ALLOW_ORIGIN,
  });
}

/**
 * Optional variables with no defaults
 */

const MAIL_ACCOUNT = process.env.MAIL_ACCOUNT;
const MAIL_HOST = process.env.MAIL_HOST;
const MAIL_PASSWORD = process.env.MAIL_PASSWORD;
const MAIL_SERVICE = process.env.MAIL_SERVICE;
const OAUTH2_PUBLIC_KEY = process.env.OAUTH2_PUBLIC_KEY;
const OAUTH2_CLIENT_ID = process.env.OAUTH2_CLIENT_ID;
const OAUTH2_TOKEN_URI = process.env.OAUTH2_TOKEN_URI;
const MIGRATION_USERNAME = process.env.MIGRATION_USERNAME;
const MIGRATION_PASSWORD = process.env.MIGRATION_PASSWORD;

// GraphiQL's own OAuth2 login (see zendro-graphiql) - a separate,
// confidential Keycloak client from OAUTH2_CLIENT_ID above (the resource
// server client), only required when AUTH_ENABLED is true.
const OAUTH2_GRAPHIQL_CLIENT_ID =
  process.env.OAUTH2_GRAPHIQL_CLIENT_ID || "zendro_graphiql";
const OAUTH2_GRAPHIQL_CLIENT_SECRET = process.env.OAUTH2_GRAPHIQL_CLIENT_SECRET;
// The realm's OIDC issuer - zendro-graphiql discovers the authorization/
// token/end-session endpoints from "<issuer>/.well-known/openid-configuration".
const OAUTH2_GRAPHIQL_ISSUER_URI = process.env.OAUTH2_GRAPHIQL_ISSUER_URI;
// Only needed when the issuer above isn't reachable from this process (e.g.
// Keycloak in Docker Compose, where the issuer is the host's published port
// but this server must connect via the internal service hostname).
const OAUTH2_GRAPHIQL_ISSUER_INTERNAL_URI = process.env.OAUTH2_GRAPHIQL_ISSUER_INTERNAL_URI;
const SESSION_SECRET = process.env.SESSION_SECRET;

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

if (!OAUTH2_TOKEN_URI || !OAUTH2_CLIENT_ID || !OAUTH2_PUBLIC_KEY) {
  console.warn("WARNING: OAuth has not been properly configured", {
    OAUTH2_CLIENT_ID,
    OAUTH2_PUBLIC_KEY,
    OAUTH2_TOKEN_URI,
  });
}

/**
 * Optional variables with sensible defaults
 */

// Zendro auth backend endpoint (see zendro-graphiql's authRouter()) - the
// first entry is this server's own redirect_uri, the rest (if any) are
// other origins this server is willing to run login/logout on behalf of.
const AUTH_REDIRECT_URI = process.env.AUTH_REDIRECT_URI
  ? process.env.AUTH_REDIRECT_URI.split(",")
  : ["http://localhost:7070/*"];

// SPA enpoint
const SPA_REDIRECT_URI = process.env.SPA_REDIRECT_URI
  ? process.env.SPA_REDIRECT_URI.split(",")
  : ["http://localhost:8080/*"];

// GraphiQL/auth feature flags - both off unless explicitly enabled, see zendro-graphiql
const AUTH_ENABLED = process.env.AUTH_ENABLED === "true";
const GRAPHIQL_FILTER_ENABLED = process.env.GRAPHIQL_FILTER_ENABLED === "true";

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
const DOWN_MIGRATION = process.env.DOWN_MIGRATION === "true" ? true : false;
// Timeouts
const MAX_TIME_OUT = parseInt(process.env.MAX_TIME_OUT || 2000);
const EXPORT_TIME_OUT = parseInt(process.env.EXPORT_TIME_OUT || 3600);

// bulk upload / download
const RECORD_DELIMITER = process.env.RECORD_DELIMITER || "\n";
const FIELD_DELIMITER = process.env.FIELD_DELIMITER || ",";
const ARRAY_DELIMITER = process.env.ARRAY_DELIMITER || ";";
const SHEET_NAME = process.env.SHEET_NAME || "";

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
  OAUTH2_PUBLIC_KEY,
  OAUTH2_CLIENT_ID,
  OAUTH2_GRAPHIQL_CLIENT_ID,
  OAUTH2_GRAPHIQL_CLIENT_SECRET,
  OAUTH2_GRAPHIQL_ISSUER_URI,
  OAUTH2_GRAPHIQL_ISSUER_INTERNAL_URI,
  SESSION_SECRET,
  AUTH_ENABLED,
  GRAPHIQL_FILTER_ENABLED,
  DOWN_MIGRATION,
  AUTH_REDIRECT_URI,
  SPA_REDIRECT_URI,
  MIGRATION_USERNAME,
  MIGRATION_PASSWORD,
  RECORD_DELIMITER,
  FIELD_DELIMITER,
  ARRAY_DELIMITER,
  SHEET_NAME,
};

module.exports = config;
