#!/usr/bin/env node

const client = require('./cassandra-client');

async function checkCassandraConnection() {
  try {
    await client.connect();
    if (client.connected) {
      console.log('****** Cassandra host is up! ******');
      return process.exit(0);
    } else {
      console.log('=== Waiting for Cassandra ===');
    }
  } catch (e) {
    return process.exit(1);
  }
}

checkCassandraConnection()