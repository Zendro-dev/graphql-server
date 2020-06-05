const client = require('./cassandra-client');

async function createTableMigrated() {
    const tableQuery = "SELECT table_name FROM system_schema.tables WHERE keyspace_name='sciencedb';"
    let result = await client.execute(tableQuery);
    let tablePresent = false;
    let migrateToDo = true;
    for (let i = 0; i < result.rowLength; i++) {
        if (result.rows[i].table_name === 'db_migrated') {
            tablePresent = true;
        }
    }
    if (tablePresent) {
        let queryMigration = "SELECT migrated_at FROM db_migrated;"
        result = await client.execute(queryMigration);
        if (result.rowLength >= 1) {
            migrateToDo = false;
        }
    }
    if (migrateToDo) {
      const createTable = "CREATE TABLE IF NOT EXISTS db_migrated ( migrated_at timeuuid PRIMARY KEY )";
      await client.execute(createTable);
      const rowInsert = "INSERT INTO db_migrated (migrated_at) VALUES (now())";
      await client.execute(rowInsert);
    }
}

createTableMigrated();