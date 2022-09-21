const models = require("../models/index.js");
const resolvers = require("../resolvers/index.js");
const adapters = require("../models/adapters/index.js");
const {
  initializeStorageHandlers,
  mergeSchemaSetScalarTypes,
} = require("./helper.js");
const { formatError, graphql } = require("graphql");
const globals = require("../config/globals");
let path = require("path");
const { BenignErrorArray } = require("./errors");

/**
 * initializeZendro - initialize zendro object which provides the access to different APIs
 * in zendro layers (resolvers, models, adapters) and enables graphql queries.
 * @returns {object} zendro object
 */
module.exports.initializeZendro = async () => {
  await initializeStorageHandlers(models);
  await initializeStorageHandlers(adapters, "adapter");
  return {
    models,
    resolvers,
    adapters,
    execute_graphql,
  };
};

/**
 * getToken - fetch token from Keycloak
 * @returns {string} token
 */
const getToken = async () => {
  const OAUTH2_TOKEN_URI = globals.OAUTH2_TOKEN_URI;
  const MIGRATION_USERNAME = globals.MIGRATION_USERNAME;
  const MIGRATION_PASSWORD = globals.MIGRATION_PASSWORD;
  const OAUTH2_CLIENT_ID = globals.OAUTH2_CLIENT_ID;
  const axios = require("axios");
  const res = await axios({
    method: "post",
    url: `${OAUTH2_TOKEN_URI}`,
    data: `username=${MIGRATION_USERNAME}&password=${MIGRATION_PASSWORD}&grant_type=password&client_id=${OAUTH2_CLIENT_ID}`,
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=utf-8",
    },
  });
  if (res && res.data) {
    return res.data.access_token;
  } else {
    throw new Error("Failed requesting an API token");
  }
};

/**
 * execute_graphql - execute graphql query or mutation
 * @param {string} query query string
 * @param {object} variables dynamic values for the query
 * @returns {object} graphql response
 */
const execute_graphql = async (query, variables) => {
  try {
    let benign_errors_arr = new BenignErrorArray();
    let errors_sink = [];
    let errors_collector = (err) => {
      errors_sink.push(err);
    };
    benign_errors_arr.on("push", errors_collector);
    let token = null;
    // fetch token when MIGRATION_USERNAME and MIGRATION_PASSWORD are defined
    if (globals.MIGRATION_USERNAME && globals.MIGRATION_PASSWORD) {
      token = await getToken();
    }
    // set token for queries related to a distributed setup
    let headers = token
      ? { headers: { authorization: "Bearer " + token } }
      : null;
    let context = {
      request: headers,
      acl: null,
      benignErrors: benign_errors_arr,
      recordsLimit: globals.LIMIT_RECORDS,
    };
    let Schema = mergeSchemaSetScalarTypes(path.join(__dirname, "../schemas"));
    let graphQlResponse = await graphql(
      Schema,
      query,
      resolvers,
      context,
      variables
    );
    if (errors_sink.length > 0) {
      for (let err of errors_sink) {
        if (
          err &&
          err.errno == -3001 &&
          err.code == "EAI_AGAIN" &&
          err.syscall == "getaddrinfo"
        ) {
          err = new Error(
            `You are using Docker and a distributed setup. Did you run this migration from the host?\n` +
              `If so, some host-names might not be reachable, but they are from within the GraphQL-server's Docker container.\n` +
              `Suggest to run the migration from within the GraphQL-server's containter directly. `
          );
        }
        graphQlResponse.errors = graphQlResponse.errors
          ? graphQlResponse.errors.concat(err)
          : [err];
      }
    }
    let result = {
      data: graphQlResponse.data,
      ...(graphQlResponse.errors && { errors: graphQlResponse.errors }),
    };
    return result;
  } catch (error) {
    return { data: null, errors: [formatError(error)] };
  }
};
