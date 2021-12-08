const models = require("../models/index.js");
const resolvers = require("../resolvers/index.js");
const adapters = require("../models/adapters/index.js");
const { initializeStorageHandlers } = require("./helper.js");

module.exports.initializeZendro = async () => {
  await initializeStorageHandlers(models);
  await initializeStorageHandlers(adapters, "adapter");
  return {
    models,
    resolvers,
    adapters,
  };
};
