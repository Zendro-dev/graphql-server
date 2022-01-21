#!/usr/bin/env bash

prod=false
if [[ $1 = "prod" ]]; then
  prod=true
fi
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

# Run migrations
node -e 'require("./utils/migration").up()'

# Start GraphQL-server
if [ $prod = true ]; then
  npm start # acl
else
  npm dev # acl
fi
