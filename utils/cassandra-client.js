const driver = require('cassandra-driver');

const client = new driver.Client({
    contactPoints: ['cassandra:9042'],
    localDataCenter: 'datacenter1',
    keyspace: 'sciencedb'
});

module.exports = client;