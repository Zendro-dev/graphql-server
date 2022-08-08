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

const execute_graphql = async (query, variables, token) => {
  try {
    let benign_errors_arr = new BenignErrorArray();
    let errors_sink = [];
    let errors_collector = (err) => {
      errors_sink.push(err);
    };
    benign_errors_arr.on("push", errors_collector);
    let headers = token ? { headers: { authorization: token } } : null;
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
        graphQlResponse.errors = graphQlResponse.errors
          ? graphQlResponse.errors.concat(err)
          : [err];
      }
    }
    return { data: graphQlResponse.data, errors: graphQlResponse.errors };
  } catch (error) {
    return { data: null, errors: [formatError(error)] };
  }
};
