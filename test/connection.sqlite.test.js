// Verifies connection.js's sqlite branch actually works end-to-end with
// @vscode/sqlite3 (the byte-API-compatible fork this repo uses in place of
// the now-archived/deprecated sqlite3 package). No committed
// data_models_storage_config.json currently configures a sqlite entry, so
// this is the only place the sqlite code path gets exercised at all.
//
// Requires a compiled @vscode/sqlite3 native binding. If this fails with a
// module-load error, run `npm rebuild @vscode/sqlite3` first (its install
// script is blocked by allowScripts, same as sqlite3 was).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const rewire = require("rewire");

test("connection.js sqlite branch: connects, round-trips data, and surfaces sqlite errors via @vscode/sqlite3", async (t) => {
  // connection.js's sqlite branch resolves `storage` relative to its own
  // directory (`__dirname + "/" + storage`), so ":memory:" would literally
  // become a file named ":memory:" rather than an in-memory DB - use a
  // real scratch file under test/ instead, and clean it up afterward.
  const storageFile = "test/.connection-sqlite-test.db";
  const storagePath = path.join(__dirname, "..", storageFile);
  t.after(() => {
    for (const suffix of ["", "-journal", "-wal", "-shm"]) {
      fs.rmSync(storagePath + suffix, { force: true });
    }
  });

  const connection = rewire("../connection");
  const restoreStorageConfig = connection.__set__("storageConfig", {
    "default-sql": {
      storageType: "sql",
      dialect: "sqlite",
      storage: storageFile,
    },
  });
  t.after(() => restoreStorageConfig());

  const connectionInstances = await connection.getConnectionInstances();
  const { connection: sequelize } = connectionInstances.get("default-sql");
  t.after(() => sequelize.close());

  await sequelize.authenticate();

  const { DataTypes } = require("sequelize");
  const Widget = sequelize.define("Widget", {
    name: { type: DataTypes.STRING, unique: true },
  });
  await sequelize.sync();

  const created = await Widget.create({ name: "gadget" });
  assert.ok(created.id);

  const found = await Widget.findOne({ where: { name: "gadget" } });
  assert.equal(found.name, "gadget");

  await assert.rejects(
    () => Widget.create({ name: "gadget" }),
    (err) => {
      assert.equal(err.name, "SequelizeUniqueConstraintError");
      assert.equal(err.parent.code, "SQLITE_CONSTRAINT_UNIQUE");
      return true;
    }
  );
});
