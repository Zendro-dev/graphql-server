const jsonwebtoken = require("jsonwebtoken");
const { OAUTH2_CLIENT_ID, OAUTH2_PUBLIC_KEY } = require("../config/globals");

// publicKey/clientId default to the resource-server client's own globals
// (this function's original callers: server.js's /getRolesForOAuth2Token
// and utils/check-authorization.js). Overridable so other callers (see
// utils/auth/permissions.js) can decode a token against a
// differently-configured client without going through the process-wide
// config/globals singleton - e.g. in tests, where each fake identity
// provider mints its own key pair.
module.exports = function (
  token,
  { publicKey = OAUTH2_PUBLIC_KEY, clientId = OAUTH2_CLIENT_ID } = {}
) {
  const decoded_token = jsonwebtoken.verify(token, publicKey);
  // dear zendro programmer, if you don't want to use keycloak, please match
  // the incoming token to your user-roles HERE
  const { roles } = decoded_token.resource_access[clientId];
  return roles;
};
