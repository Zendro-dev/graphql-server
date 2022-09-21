const axios = require("axios");
/** ENV */
const {
  GRAPHIQL_REDIRECT_URI,
  SPA_REDIRECT_URI,
  OAUTH2_TOKEN_URI,
} = require("../config/globals");

/** CONSTANTS */
const KEYCLOAK_GQL_CLIENT = "zendro_graphql-server";
const KEYCLOAK_GIQL_CLIENT = "zendro_graphiql";
const KEYCLOAK_SPA_CLIENT = "zendro_spa";

const KEYCLOAK_REALM = "zendro";
const KEYCLOAK_USER = "admin";
const KEYCLOAK_PASSWORD = "admin";

const auth = OAUTH2_TOKEN_URI.includes("auth") ? "/auth" : "";
const KEYCLOAK_BASEURL =
  `${new URL(OAUTH2_TOKEN_URI).protocol}//${new URL(OAUTH2_TOKEN_URI).host}` +
  auth;

/**
 * keyCloakPostRequest - helper function for sending POST requests to the keycloak server
 *
 * @param {string} token API access token
 * @param {string} url keycloak restful endpoint url
 * @param {object} data axios request body
 * @returns axios response
 */
async function keycloakPostRequest(token, url, data) {
  return await axios({
    method: "post",
    url: `${KEYCLOAK_BASEURL}/${url}`,
    data: data,
    headers: {
      "content-type": "application/json",
      Authorization: "Bearer " + token,
    },
  });
}

/**
 * keycloakGetRequest - helper function for sending GET requests to the keycloak server
 *
 * @param {string} token API access token
 * @param {string} url keycloak restful endpoint url
 * @returns axios response
 */
async function keycloakGetRequest(token, url) {
  return await axios({
    method: "get",
    url: `${KEYCLOAK_BASEURL}/${url}`,
    headers: {
      Authorization: "Bearer " + token,
    },
  });
}

/**
 * keycloakDeleteRequest - helper function for sending DELETE requests to the keycloak server
 *
 * @param {string} token API access token
 * @param {string} url keycloak restful endpoint url
 * @returns axios response
 */
async function keycloakDeleteRequest(token, url) {
  return await axios({
    method: "delete",
    url: `${KEYCLOAK_BASEURL}/${url}`,
    headers: {
      Authorization: "Bearer " + token,
    },
  });
}

/**
 * sleep helper function
 * 
 * @param {number} ms time to wait in ms 
 */
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}


/**
 * getMasterToken - get Accesstoken for keycloak rest API
 */
async function getMasterToken() {
    try {
      const retries = 5;
      for (let i = 0; i < retries; i++) {
        try {
          const res = await axios({
            method: "post",
            url: `${KEYCLOAK_BASEURL}/realms/master/protocol/openid-connect/token`,
            data: `username=${KEYCLOAK_USER}&password=${KEYCLOAK_PASSWORD}&grant_type=password&client_id=admin-cli`,
            headers: {
              "content-type": "application/x-www-form-urlencoded;charset=utf-8",
            },
          });
          if (res && res.data) {
            return res.data.access_token;
          } else {
            console.error("Failed requesting an API token, ...retrying");
          }
        } catch (error) {
          console.error("Failed requesting an API token, ...retrying"); 
        }
        await sleep(1000);
      }
    } catch (error) {
      throw new Error("Failed requesting an API token")
    }
}

/**
 * createDefaultRealm - create the default zendro realm in the keycloak server
 */
async function createDefaultRealm(token) {
  const res = await keycloakPostRequest(token, `admin/realms`, {
    id: KEYCLOAK_REALM,
    realm: KEYCLOAK_REALM,
    accessTokenLifespan: 1800,
    enabled: true,
  });
  if (res && res.status === 201) {
    console.log(`Keycloak realm ${KEYCLOAK_REALM} created`);
  }
}

/**
 * registerDefaultClient - create a client in the zendro realm
 */
async function registerClient(token, client) {
  const res = await keycloakPostRequest(
    token,
    `admin/realms/${KEYCLOAK_REALM}/clients`,
    client
  );
  // generate client secret
  const clientUUID = await getClientUUID(token, client.clientId);

  const resSecret = await keycloakPostRequest(
    token,
    `admin/realms/${KEYCLOAK_REALM}/clients/${clientUUID}/client-secret`
  );
  if (res && res.status === 201 && resSecret.status == 200) {
    console.log(`Keycloak client ${JSON.stringify(client)} created`);
  }

  return resSecret.data.value;
}

/**
 * createDefaultRoles - create default zendro roles "administrator", "editor", and "reader" for the realm and the registered clients
 */
async function createDefaultRealmRoles(token) {
  await keycloakPostRequest(token, `admin/realms/${KEYCLOAK_REALM}/roles`, {
    name: "realm-administrator",
  });

  await keycloakPostRequest(token, `admin/realms/${KEYCLOAK_REALM}/roles`, {
    name: "realm-editor",
  });

  await keycloakPostRequest(token, `admin/realms/${KEYCLOAK_REALM}/roles`, {
    name: "realm-reader",
  });

  console.log(`Keycloak default realm roles created`);
}

/**
 * getClientUUID - gets the keycloak UUID for a specified client
 */
async function getClientUUID(token, clientId) {
  const clients = await keycloakGetRequest(
    token,
    `admin/realms/${KEYCLOAK_REALM}/clients`
  );

  return clients.data.find((client) => client.clientId === clientId).id;
}

/**
 * createDefaultClientRoles - create the default administrator, editor and reader roles
 * for a specified Client
 */
async function createDefaultClientRoles(token, clientId) {
  const clientUUID = await getClientUUID(token, clientId);

  await keycloakPostRequest(
    token,
    `admin/realms/${KEYCLOAK_REALM}/clients/${clientUUID}/roles`,
    {
      name: "administrator",
    }
  );

  await keycloakPostRequest(
    token,
    `admin/realms/${KEYCLOAK_REALM}/clients/${clientUUID}/roles`,
    {
      name: "editor",
    }
  );

  await keycloakPostRequest(
    token,
    `admin/realms/${KEYCLOAK_REALM}/clients/${clientUUID}/roles`,
    {
      name: "reader",
    }
  );

  console.log(`Keycloak default client roles for client ${clientId} created`);
}

/**
 * associateCompositeRoles - associates the default realm roles with the default roles
 * of a specified client
 */
async function associateCompositeRoles(token, clientId) {
  // get client UUID
  const clientUUID = await getClientUUID(token, clientId);

  for await (role of ["administrator", "editor", "reader"]) {
    // realm-roles
    const realmRoleId = (
      await keycloakGetRequest(
        token,
        `admin/realms/${KEYCLOAK_REALM}/roles/realm-${role}`
      )
    ).data.id;

    // client roles
    const clientRoleId = (
      await keycloakGetRequest(
        token,
        `admin/realms/${KEYCLOAK_REALM}/clients/${clientUUID}/roles/${role}`
      )
    ).data.id;

    // make the role composite by associating the respective client role
    await keycloakPostRequest(
      token,
      `admin/realms/${KEYCLOAK_REALM}/roles-by-id/${realmRoleId}/composites`,
      [
        {
          id: clientRoleId,
        },
      ]
    );
  }
  console.log(`Keycloak default roles associated to client ${clientId}`);
}

async function associateCompositeAdminRoles(token) {
  const realmManagementClientUUID = await getClientUUID(
    token,
    "realm-management"
  );

  const realmRoleId = (
    await keycloakGetRequest(
      token,
      `admin/realms/${KEYCLOAK_REALM}/roles/realm-administrator`
    )
  ).data.id;

  const realmManagementRoles = await keycloakGetRequest(
    token,
    `admin/realms/${KEYCLOAK_REALM}/clients/${realmManagementClientUUID}/roles`
  );

  const realmManagementRoleUUIDs = realmManagementRoles.data.map((role) => {
    return { id: role.id };
  });
  // make the role composite by associating the respective client role
  await keycloakPostRequest(
    token,
    `admin/realms/${KEYCLOAK_REALM}/roles-by-id/${realmRoleId}/composites`,
    realmManagementRoleUUIDs
  );

  console.log(
    `Keycloak realm management roles associated to realm-administrator`
  );
}

/**
 * createDefaultUser - creates a default admin user for the zendro realm
 */
async function createDefaultUser(token) {
  // create the user
  await keycloakPostRequest(token, `admin/realms/${KEYCLOAK_REALM}/users`, {
    username: "zendro-admin",
    credentials: [
      {
        temporary: false,
        value: "admin",
      },
    ],
    enabled: "true",
  });

  // get user
  const userId = (
    await keycloakGetRequest(token, `admin/realms/${KEYCLOAK_REALM}/users`)
  ).data.find((user) => user.username === "zendro-admin").id;

  // associate user to roles
  for await (role of ["administrator", "editor", "reader"]) {
    // get roleId
    const realmRoleId = (
      await keycloakGetRequest(
        token,
        `admin/realms/${KEYCLOAK_REALM}/roles/realm-${role}`
      )
    ).data.id;

    await keycloakPostRequest(
      token,
      `admin/realms/${KEYCLOAK_REALM}/users/${userId}/role-mappings/realm`,
      [{ id: realmRoleId, name: `realm-${role}` }]
    );
  }

  console.log("Keycloak default user created");
}

/**
 * setupKeyCloak - run the keyCloak setup
 */
async function setupKeyCloak() {
  console.log("Setting up keycloak...");
  const token = await getMasterToken();
  await createDefaultRealm(token);
  await registerClient(token, {
    clientId: KEYCLOAK_GQL_CLIENT,
    publicClient: true,
    directAccessGrantsEnabled: true,
    standardFlowEnabled: false,
  });
  const KEYCLOAK_GIQL_CLIENT_SECRET = await registerClient(token, {
    clientId: KEYCLOAK_GIQL_CLIENT,
    redirectUris: GRAPHIQL_REDIRECT_URI,
    attributes: {"post.logout.redirect.uris": GRAPHIQL_REDIRECT_URI[0]},
    publicClient: false,
  });
  const KEYCLOAK_SPA_CLIENT_SECRET = await registerClient(token, {
    clientId: KEYCLOAK_SPA_CLIENT,
    redirectUris: SPA_REDIRECT_URI,
    attributes: {"post.logout.redirect.uris": SPA_REDIRECT_URI[0]},
    publicClient: false,
  });
  await createDefaultRealmRoles(token);
  await createDefaultClientRoles(token, KEYCLOAK_GQL_CLIENT);
  await associateCompositeRoles(token, KEYCLOAK_GQL_CLIENT);
  await associateCompositeAdminRoles(token);
  await createDefaultUser(token);

  let KEYCLOAK_PUBLIC_KEY = await keycloakGetRequest(token, "realms/zendro");

  KEYCLOAK_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----\\n${KEYCLOAK_PUBLIC_KEY.data.public_key}\\n-----END PUBLIC KEY-----`;

  return {
    KEYCLOAK_PUBLIC_KEY,
    KEYCLOAK_GIQL_CLIENT_SECRET,
    KEYCLOAK_SPA_CLIENT_SECRET,
  };
}

async function cleanupKeyCloak() {
  // Delete the realm
  const token = await getMasterToken();
  await keycloakDeleteRequest(token, `realms/${KEYCLOAK_REALM}`);
}

module.exports = {
  setupKeyCloak,
  cleanupKeyCloak,
  KEYCLOAK_BASEURL,
  KEYCLOAK_GQL_CLIENT,
  KEYCLOAK_GIQL_CLIENT,
  KEYCLOAK_SPA_CLIENT,
};
