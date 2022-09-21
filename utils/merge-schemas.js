
const {mergeTypeDefs} = require('@graphql-tools/merge');
const {loadFilesSync} = require('@graphql-tools/load-files')
const { print } = require('graphql')

/**
 * @function - Merge graphql schemas stored in a same directory
 *
 * @param  {string} schemas_folder path to directory where all graphql schemas are stored.
 * @return {string}                Merged graphql schema.
 */
module.exports = function( schemas_folder ) {
  const typesArray = loadFilesSync( schemas_folder);
  let merged = mergeTypeDefs(typesArray);
  let printedTypeDefs = print(merged);
  return printedTypeDefs;
}
