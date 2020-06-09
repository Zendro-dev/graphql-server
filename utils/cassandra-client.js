const driver = require('cassandra-driver');
const globals = require('../config/globals');

const client = new driver.Client({
    contactPoints: [globals.CASSANDRA_HOST + ':' + globals.CASSANDRA_PORT],
    localDataCenter: 'datacenter1',
    keyspace: 'sciencedb',
    protocolOptions: {
        port: globals.CASSANDRA_PORT
    }
});

module.exports = client;