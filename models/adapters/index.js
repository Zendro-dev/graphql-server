const { existsSync }     = require('fs');
const { join }           = require('path');
const { Sequelize }      = require('sequelize');
const { getModulesSync } = require('../../utils/module-helpers');
const { getConnection }  = require('../../connection');

let adapters = {};
module.exports = adapters;

getModulesSync(__dirname).forEach(file => {

  let adapter = require(join(__dirname, file));

  if( adapters[adapter.adapterName] ){
    throw new Error(`Duplicated adapter name ${adapter.adapterName}`);
  }

  switch(adapter.adapterType) {
    case 'ddm-adapter':
    case 'zendro-webservice-adapter':
    case 'generic-adapter':
      adapters[adapter.adapterName] = adapter;
      break;

    case 'sql-adapter':
      const { database } = adapter.definition;
      const connection = getConnection(database || 'sql');
      if (!connection) throw new ConnectionError(adapter.definition);
      adapters[adapter.adapterName] = adapter.init(connection, Sequelize);
      break;

    case 'default':
      throw new Error(`
        Adapter storageType '${adapter.storageType}' is not supported`
      );
  }

  let patches_patch = join(__dirname,'..','..','patches', file);

  if(existsSync(patches_patch)) {
    adapter = require(`${patches_patch}`).logic_patch(adapter);
  }

});
