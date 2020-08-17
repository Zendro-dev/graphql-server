const { Sequelize } = require('sequelize');
const config = require('./config/data_models_storage_config.json');

const env = process.env.NODE_ENV || 'development';
const envConfig = config[env];

const Op = Sequelize.Op;
envConfig.operatorsAliases = {
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
 * Stored sequelize instances. Consider using a WeakMap instead
 * so that Sequelize instances are garbage collected when there are no more
 * references to their key object. Not that it would require object keys.
 */
const currentInstances = new Map()

/**
 * Get a new or existing sequelize instance using the specified database.
 * Three possibilities exist depending on whether the "database" argument
 * is defined and has a matching value.
 *
 * - __UNDEFINED__: neither "database" nor "storageType" properties
 * are set in the data model config. An error is thrown.
 *
 * - __NO-MATCH__: the database does not match any known instance. One is
 * created and returned.
 *
 * - __MATCH__: the "database" matches a known instance, which is returned.
 *
 * @param {string|undefined} database database config for the sequelize instance
 * @returns A configured `new Sequelize` instance
 */
module.exports.getConnection = (database) => {

  // Verify that database is not "falsy"
  if (!database) throw Error(
    'Neither "database" nor "storageType" properties are defined.' +
    'Verify that "config/data_models_storage_config.json" is correctly set.'
  )

  // Perform a case-insensitive match (this might not be ideal)
  const _database = database.toLowerCase();
  if (!envConfig.hasOwnProperty(_database)) throw Error(
    `Database config "${_database}" does not exist.` +
    'Verify that "config/data_models_storage_config.json" is correctly set.'
  )


  // Get and return the connection if it exists
  if (currentInstances.has(_database)) {
    return currentInstances.get(_database);
  }

  // Or create and return a new connection
  currentInstances.set(_database, new Sequelize(envConfig[_database]))
  return currentInstances.get(_database);
}
