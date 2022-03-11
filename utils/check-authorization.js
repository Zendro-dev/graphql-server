const jwt = require("jsonwebtoken");
const { WHITELIST_ROLES, OAUTH2_PUBLIC_KEY } = require("../config/globals");
const getRoles = require("./roles");

/**
 * @function - Given a context this function check if the user(implicit in context)
 * is allowed to perform 'permission' action to the 'resource' model.
 *
 * @param  {object} context    context object contains the request info and the acl rules.
 * @param  {string} resource   resource to which the user wants to perform an action (i.e. a model).
 * @param  {string} permission action that the user wants to perform to resourse (i.e. read, edit, create).
 * @return {promise}            it will resolve true if within the context the user is allowed to perform 'permission' action to the 'resource' model.
 */
module.exports = async function (context, resource, permission) {
  //if there's not authorization rules set
  if (context.acl == null) {
    //return true;
    return Promise.resolve(true);
  }

  try {
    if (Array.isArray(WHITELIST_ROLES) && WHITELIST_ROLES.length > 0) {
      // check if the whitelist roles give permission to the argument resource
      const res = await context.acl.areAnyRolesAllowed(
        WHITELIST_ROLES,
        resource,
        permission
      );
      if (res) {
        return true;
      }
    }
    let token_bearer = context.request.headers["authorization"];
    const token =
      token_bearer && typeof token_bearer === "string"
        ? token_bearer.replace("Bearer ", "")
        : undefined;
    console.log("TOKEN", typeof token, token);
    //Identify user from context
    jwt.verify(token, OAUTH2_PUBLIC_KEY);
    // get Roles from the token
    const roles = getRoles(token);
    //check for permissions from specific roles
    return context.acl.areAnyRolesAllowed(roles, resource, permission);
  } catch (err) {
    //invalid token
    console.log("invalid token...");
    console.log(err);
    throw new Error(err);
    //return false;
  }
};
