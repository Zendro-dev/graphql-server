const { cassandraDriver } = require('../models/index');
const migrations_cassandra = require('../migrations-cassandra/index');

async function createTableMigrated() {
    const tableQuery = "SELECT table_name FROM system_schema.tables WHERE keyspace_name='sciencedb';"
    let result = await cassandraDriver.execute(tableQuery);
    console.log('Check for tables in keyspace "sciencedb" executed');
    let tablePresent = false;
    let migrateToDo = true;
    for (let i = 0; i < result.rowLength; i++) {
        if (result.rows[i].table_name === 'db_migrated') {
            tablePresent = true;
            console.log('Migration table found.');
        }
    }
    if (tablePresent) {
        let queryMigration = "SELECT migrated_at FROM db_migrated;"
        result = await cassandraDriver.execute(queryMigration);
        if (result.rowLength >= 1) {
            migrateToDo = false;
            console.log('Migration table filled, no more migration to do.');
            return process.exit(0);
        }
    }
    if (migrateToDo) {
      await Promise.allSettled(Object.values(migrations_cassandra).map(async cassandraHandler => await cassandraHandler.up()));
      const createTable = "CREATE TABLE IF NOT EXISTS db_migrated ( migrated_at timeuuid PRIMARY KEY )";
      await cassandraDriver.execute(createTable);
      console.log('Migration table created');
      const rowInsert = "INSERT INTO db_migrated (migrated_at) VALUES (now())";
      await cassandraDriver.execute(rowInsert);
      console.log('Migration table filled.');
      return process.exit(0);
    }
}

createTableMigrated();
