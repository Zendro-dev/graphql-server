const getRoles = require("../roles");

// Default role -> permission mapping, mirroring single-page-app's own
// build-time ACL preval step (src/build/acl-models.preval.ts) so this
// endpoint's default behavior matches what that app already computed
// client-side before auth moved server-side. Not yet configurable
// per-model or per-role - see docs/proposals/top-level-auth-endpoint.md for
// context; that's a deliberate follow-up, not this spike's job.
const DEFAULT_ROLE_PERMISSIONS = {
  administrator: ["*"],
  editor: ["create", "update", "delete"],
  reader: ["read"],
};

// models/index.js's export mixes real model entries in with these fixed
// storage-type bucket keys, always present (even empty) per its own
// `let models = { sql: {}, mongodb: {}, ... }` initializer.
const STORAGE_TYPE_BUCKET_KEYS = new Set([
  "sql",
  "mongodb",
  "cassandra",
  "amazonS3",
  "trino",
  "presto",
  "neo4j",
]);

function listModelNames(models) {
  return Object.keys(models).filter((key) => !STORAGE_TYPE_BUCKET_KEYS.has(key));
}

// roles -> { [modelName]: AclPermission[] }, matching single-page-app's
// AuthPermissions type (src/types/auth.ts) so a frontend consuming this
// endpoint doesn't need a different response shape than what it already
// expects.
function resolvePermissions(roles, modelNames) {
  const granted = new Set();
  for (const role of roles) {
    for (const permission of DEFAULT_ROLE_PERMISSIONS[role] || []) {
      granted.add(permission);
    }
  }
  if (granted.size === 0) return {};
  const permissions = [...granted];
  return Object.fromEntries(modelNames.map((modelName) => [modelName, permissions]));
}

// Resolves a session's Bearer token into { [modelName]: AclPermission[] },
// reusing the same role-decoding logic as /getRolesForOAuth2Token
// (utils/roles.js) - the token is signed with the realm's own key, valid
// for any client's access token issued by that realm, not something
// specific to the OAuth2 client this session was created through.
function permissionsForToken(token, authConfig, models) {
  const roles = getRoles(token, {
    publicKey: authConfig.oauth2PublicKey,
    clientId: authConfig.oauth2ClientId,
  });
  return resolvePermissions(roles, listModelNames(models));
}

module.exports = {
  DEFAULT_ROLE_PERMISSIONS,
  listModelNames,
  resolvePermissions,
  permissionsForToken,
};
