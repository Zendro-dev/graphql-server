const { Sequelize } = require('sequelize');
const config = require('./config/data_models_storage_config.json');


const Op = Sequelize.Op;
config.operatorsAliases = {
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
 * Stored sequelize instances.
 */
const currentInstances = new Map()

/**
 * Get a new or existing sequelize instance using the specified database.
 * @param {string|undefined} database database config for the sequelize instance
 * @returns A configured `new Sequelize` instance
 */
module.exports.getConnection = (database) => {

  // Verify that database is not "falsy"
  if (!database) throw Error(
    'Neither "database" nor "storageType" properties are defined.' +
    'Verify that "config/data_models_storage_config.json" is correctly set.'
  )

  // Perform a case-insensitive match
  const _database = database.toLowerCase();
  if (!config.hasOwnProperty(_database)) throw Error(
    `Database config "${_database}" does not exist.` +
    'Verify that "config/data_models_storage_config.json" is correctly set.'
  )

  // Get and return the connection if it exists
  if (currentInstances.has(_database)) {
    return currentInstances.get(_database);
  }

  // Or create and return a new connection
  currentInstances.set(_database, new Sequelize(config[_database]))
  return currentInstances.get(_database);
}
