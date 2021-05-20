const { existsSync } = require("fs");
const { join } = require("path");
const { getModulesSync } = require("../utils/module-helpers");

let models = {
  sql: {},
  mongodb: {},
  cassandra: {},
  amazonS3: {},
  trino: {},
  presto: {},
  neo4j: {},
};
const storageTypes = Object.keys(models);
module.exports = models;

// ****************************************************************************
// IMPORT GENERIC MODELS / ZENDRO SERVICES / DISTRIBUTED MODELS
let folders = ["/generic", "/zendro-server", "/distributed"];
for (let folder of folders) {
  getModulesSync(__dirname + folder).forEach((file) => {
    console.log("loaded model: " + file);
    let model = require(`./${join(folder, file)}`);

    let validator_patch = join("./validations", file);
    if (existsSync(validator_patch)) {
      model = require(`../${validator_patch}`).validator_patch(model);
    }

    let patches_patch = join("./patches", file);
    if (existsSync(patches_patch)) {
      model = require(`../${patches_patch}`).logic_patch(model);
    }

    if (model.name in models)
      throw Error(`Duplicated model name ${model.name}`);

    models[model.name] = model;
  });
}

// ****************************************************************************
// IMPORT SEQUELIZE / MONGODB / CASSANDRA / MINIO MODELS

/**
 * Grabs all the models in your models folder, adds them to the models object
 */
for (let storageType of storageTypes) {
  getModulesSync(__dirname + "/" + storageType).forEach((file) => {
    console.log("loaded model: " + file);
    let model = require(join(__dirname, storageType, file));

    models[storageType][model.name] = model.definition;

    let validator_patch = join("./validations", file);
    if (existsSync(validator_patch)) {
      model = require(`../${validator_patch}`).validator_patch(model);
    }

    let patches_patch = join("./patches", file);
    if (existsSync(patches_patch)) {
      model = require(`../${patches_patch}`).logic_patch(model);
    }

    if (model.name in models)
      throw Error(`Duplicated model name ${model.name}`);

    models[model.name] = model;
  });
}
