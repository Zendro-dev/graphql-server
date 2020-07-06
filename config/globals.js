var cassandraConfig = {}

try {
  cassandraConfig = require('./cassandra.json');
} catch (e) {
  if (e.code === 'MODULE_NOT_FOUND') {
    console.warn('No config/cassandra.json file found, falling back to default settings.');
  } else {
    throw e; //some other error, better to not suppress it
  }
}

module.exports = {
  LIMIT_RECORDS : process.env.LIMIT_RECORDS || 10000,
  PORT : process.env.PORT || 3000,
  ALLOW_ORIGIN: process.env.ALLOW_ORIGIN || "http://localhost:8080",
  REQUIRE_SIGN_IN: process.env.REQUIRE_SIGN_IN || "true",
  MAX_TIME_OUT: process.env.MAX_TIME_OUT || 2000,
  POST_REQUEST_MAX_BODY_SIZE: process.env.POST_REQUEST_MAX_BODY_SIZE || '1mb',
  CASSANDRA_HOST: cassandraConfig.host || "127.0.0.1",
  CASSANDRA_PORT: cassandraConfig.port || "7000",
  CASSANDRA_KEYSPACE: cassandraConfig.keyspace || "sciencedb",
  CASSANDRA_USERNAME: cassandraConfig.username || "cassandra",
  CASSANDRA_PASSWORD: cassandraConfig.password || "cassandra",
  ERROR_LOG: process.env.ERROR_LOG || 'compact',
  MAIL_SERVICE: process.env.MAIL_SERVICE || "gmail",
  MAIL_HOST: process.env.MAIL_HOST || "smtp.gmail.com",
  MAIL_ACCOUNT: process.env.MAIL_ACCOUNT || "sci.db.service@gmail.com",
  MAIL_PASSWORD: process.env.MAIL_PASSWORD || "SciDbServiceQAZ",
  EXPORT_TIME_OUT: process.env.EXPORT_TIME_OUT || 3600
}
