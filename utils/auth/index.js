const express = require("express");
const createAuthRouter = require("./router");
const { attachAuthFromSession } = require("./session");

const REQUIRED_AUTH_FIELDS = [
  "clientId",
  "clientSecret",
  "issuerUri",
  "redirectUri",
  "sessionSecret",
];

function assertAuthConfigured(authConfig) {
  const missing = REQUIRED_AUTH_FIELDS.filter((field) => !authConfig[field]);
  if (missing.length > 0) {
    throw new Error(`utils/auth: AUTH_ENABLED is true but missing: ${missing.join(", ")}`);
  }
}

/**
 * authRouter(authConfig) -> Express Router, mountable at a fixed top-level
 * path (conventionally "/auth"), independent of wherever - or whether -
 * the GraphiQL SPA (see zendro-graphiql) itself is mounted:
 *
 *   app.use("/auth", authRouter(authConfig));
 *
 * Always safe to mount unconditionally - returns an empty (404-everything)
 * router when authConfig.enabled is false, mirroring how GraphiQL() itself
 * is always unconditionally mounted. When enabled, validates the required
 * fields up front (fail fast at startup, not on the first login attempt).
 */
function authRouter(authConfig = {}) {
  if (!authConfig.enabled) return express.Router();
  assertAuthConfigured(authConfig);
  return createAuthRouter(authConfig);
}

module.exports = { authRouter, attachAuthFromSession };
