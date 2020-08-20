const { existsSync } = require('fs');
const { join }       = require('path');
const { Sequelize }  = require('sequelize');
//
const { getConnection, ConnectionError } = require('../connection');
const { getModulesSync } = require('../utils/module-helpers');


var models = {};
module.exports = models;

// ****************************************************************************
// IMPORT SEQUELIZE MODELS

/**
 * Grabs all the models in your models folder, adds them to the models object
 */
getModulesSync(__dirname + "/sql").forEach(file => {

  console.log("loaded model: " + file);
  let modelFile = require(join(__dirname,'sql', file));

  const { database } = modelFile.definition;
  const connection = getConnection(database || 'sql');
  if (!connection) throw new ConnectionError(modelFile.definition);
  let model = modelFile.init(connection, Sequelize);

  let validator_patch = join('./validations', file);
  if(existsSync(validator_patch)){
    model = require(`../${validator_patch}`).validator_patch(model);
  }

  let patches_patch = join('./patches', file);
  if(existsSync(patches_patch)){
    model = require(`../${patches_patch}`).logic_patch(model);
  }

  if(model.name in models) throw Error(`Duplicated model name ${model.name}`);

  models[model.name] = model;
});

/**
 * Important: creates associations based on associations defined in associate
 * function of the model files
 */
Object.keys(models).forEach(function(modelName) {
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});

/**
 * Update tables with association (temporary, just for testing purposes)
 * This part is supposed to be done in the migration file
 */
// sequelize.sync({force: true});


// ****************************************************************************
// IMPORT GENERIC MODELS

getModulesSync(__dirname + "/generic").forEach(file => {

  console.log("loaded model: " + file);
  let model = require(`./${join("./generic", file)}`);

  let validator_patch = join('./validations', file);
  if(existsSync(validator_patch)){
    model = require(`../${validator_patch}`).validator_patch(model);
  }

  let patches_patch = join('./patches',file);
  if(existsSync(patches_patch)){
    model = require(`../${patches_patch}`).logic_patch(model);
  }

  if(model.name in models) throw Error(`Duplicated model name ${model.name}`);

  models[model.name] = model;

});

// ****************************************************************************
// IMPORT ZENDRO SERVICES

getModulesSync(__dirname + "/zendro-server").forEach(file => {

  console.log("loaded model: " + file);
  let model = require(`./${join("./zendro-server", file)}`);

  let validator_patch = join('./validations', file);
  if(existsSync(validator_patch)){
    model = require(`../${validator_patch}`).validator_patch(model);
  }

  let patches_patch = join('./patches',file);
  if(existsSync(patches_patch)){
    model = require(`../${patches_patch}`).logic_patch(model);
  }

  if(model.name in models) throw Error(`Duplicated model name ${model.name}`);

  models[model.name] = model;

});

// ****************************************************************************
// IMPORT DISTRIBUTED MODELS

getModulesSync(__dirname + "/distributed").forEach(file => {

  console.log("loaded model: " + file);
  let model = require(`./${join("./distributed", file)}`);

  let validator_patch = join('./validations', file);
  if(existsSync(validator_patch)){
    model = require(`../${validator_patch}`).validator_patch(model);
  }

  if(model.name in models) throw Error(`Duplicated model name ${model.name}`);

  models[model.name] = model;

});
