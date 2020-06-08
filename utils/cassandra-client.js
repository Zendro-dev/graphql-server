const driver = require('cassandra-driver');
const globals = require('../config/globals');

const client = new driver.Client({
    contactPoints: [globals.CASSANDRA_HOST],
    localDataCenter: 'datacenter1',
    keyspace: 'sciencedb'
});

module.exports = client;