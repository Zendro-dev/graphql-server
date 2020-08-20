const { Sequelize } = require('sequelize');
const storageConfig = require('./config/data_models_storage_config.json');


const Op = Sequelize.Op;
storageConfig.operatorsAliases = {
  $eq: Op.eq,
  $and: Op.and,
  $or: Op.or,
  $like: Op.like,
  $notLike: Op.notLike,
  $between: Op.between,
  $notBetween: Op.notBetween,
  $in: Op.in,
  $notIn: Op.notIn,
  $gt: Op.gt,
  $gte: Op.gte,
  $lt: Op.lt,
  $lte: Op.lte,
  $ne: Op.ne,
  $regexp: Op.regexp,
  $notRegexp: Op.notRegexp
};

/**
 * Stored connection instances. Only sequelize for now.
 */
const connectionInstances = Object.keys(storageConfig).reduce(

  // Reducer function to add only "sql"-type of connections
  (acc, key) => {

    if (
      storageConfig.hasOwnProperty(key) &&
      key !== 'operatorsAliases' &&
      storageConfig[key].storageType === 'sql'
    ) {
      acc.set(key, new Sequelize(storageConfig[key]))
    }
    return acc;
  },

  // Object reference
  new Map()

)

/**
 * Async verification of all connections imported from
 * data_models_storage_config.json.
 */
exports.checkConnections = async () => {

  const checks = [];

  for (const { 0: key, 1: connection } of connectionInstances.entries()) {

    try {
      await connection.authenticate();
      checks.push({ key, valid: true });
    }
    catch (exception) {
      checks.push({ key, valid: false });
    }
  }

  return checks;

}

/**
 * Get a new or existing sequelize instance using the specified database.
 * @param {string} key connection key as defined in the model config
 * @returns A configured `new Sequelize` instance
 */
exports.getConnection = (key) => {

  // Get and return the connection if it exists
  if (connectionInstances.has(key)) {
    return connectionInstances.get(key);
  }

  // Or create and return a new connection
  connectionInstances.set(key, new Sequelize(storageConfig[_database]))
  return connectionInstances.get(key);
}

exports.ConnectionError = class ConnectionError extends Error {

  /**
   * Create a new instance of a data model connection error.
   * @param {object} modelDefinition model definition as a JSON object
   */
  constructor ({ database, model, storageType }) {

    const message = (
      `Model "${model}" connection to its database failed. Verify that ` +
      `database "${database}" and storageType "${storageType}" are ` +
      `correctly set and match the config in "data_models_storage_config.json"`
    )
    super(message)
  }
}