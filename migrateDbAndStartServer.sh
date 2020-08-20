#!/usr/bin/env bash

# Wait until the relational database-server up and running
waited=0
until node ./utils/testDatabaseConnectionsAvailable.js 1>/dev/null
do
  if [ $waited == 240 ]; then
    echo -e '\nERROR: Time out reached while waiting for relational database server to be available.\n'
    exit 1
  fi
  sleep 2
  waited=$(expr $waited + 2)
done


# Run the migrations
CONFIG="./config/data_models_storage_config.json"
SEQUELIZE="./node_modules/.bin/sequelize"

jq -r 'keys[] as $k | "\($k):\(.[$k] | .storageType)"' < $CONFIG |
while read object; do

  params=(${object//:/ })
  key=${params[0]}
  store=${params[1]}

  if [[ "$store" == "sql" ]]; then

    if ! $SEQUELIZE db:migrate --config "$CONFIG" --env $key; then
      echo -e '\nERROR: Migrating the relational database(s) caused an error.\n'
      exit 1
    fi

  fi

done


# Run seeders if needed
if [ -d ./seeders ]; then
  if ! $SEQUELIZE db:seed:all --config "$CONFIG" --env "sql"; then
    echo -e '\nERROR: Seeding the relational database(s) caused an error.\n'
    exit 1
  fi
fi


# Start GraphQL-server
npm start # acl
