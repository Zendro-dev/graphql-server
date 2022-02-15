const jsonwebtoken = require("jsonwebtoken");
const { OAUTH2_CLIENT_ID, OAUTH2_PUBLIC_KEY } = require("../config/globals");

module.exports = function (token) {
  const decoded_token = jsonwebtoken.verify(token, OAUTH2_PUBLIC_KEY);
  // dear zendro programmer, if you don't want to use keycloak, please match
  // the incoming token to your user-roles HERE
  const { roles } = decoded_token.resource_access[OAUTH2_CLIENT_ID];
  return roles;
};
