#!/usr/bin/env bash

# Wait until the relational database-server up and running
waited=0
until node ./scripts/testDatabaseConnectionsAvailable.js 1>/dev/null
do
  if [ $waited == 240 ]; then
    echo -e '\nERROR: Time out reached while waiting for relational database server to be available.\n'
    exit 1
  fi
  sleep 2
  waited=$(expr $waited + 2)
done

node -e 'require("./utils/migration").up()'
# Read config and seed databases
CONFIG="./config/data_models_storage_config.json"
SEQUELIZE="./node_modules/.bin/sequelize"
DB_KEYS=( $(node ./scripts/getStorageTypes.js) )

for object in ${DB_KEYS[@]}; do

  # Split "key:storageType" in each DB_KEYS element
  params=(${object//:/ })

  # Retrieve individual values
  key="${params[0]}"
  storageType="${params[1]}"

  # Execute sequelize CLI
  sequelize_params=(
    "--config $CONFIG"
    "--env $key"
    "--seeders-path ./seeders/$key/"
  )

  if [[ "$storageType" == "sql" ]]; then
    # Run seeders if needed
    if [ -d ./seeders/$key ]; then
      if ! $SEQUELIZE db:seed:all ${sequelize_params[@]}; then
        echo -e '\nERROR: Seeding the relational database(s) caused an error.\n'
        exit 1
      fi
    fi

  fi

done

# Start GraphQL-server
node server.js # acl
