const { initializeZendro } = require("./zendro.js");

const { readdir, writeFile, access } = require("fs/promises");

module.exports = {
  up: async () => {
    let state;
    let log;
    try {
      await access(__dirname + "/../zendro_migration_state.json");
      state = require(__dirname + "/../zendro_migration_state.json");
    } catch (error) {
      console.log(error);
      console.log("create a new object for migration state");
      state = { "last-executed-migration": null };
    }
    try {
      await access(__dirname + "/../zendro_migration_log.json");
      log = require(__dirname + "/../zendro_migration_log.json");
    } catch (error) {
      console.log(error);
      console.log("create a new object for zendro state");
      log = { migration_log: {} };
    }

    let migration_file;
    try {
      const zendro = await initializeZendro();
      const codeGeneratedTimestamp = state["last-executed-migration"]
        ? new Date(state["last-executed-migration"].file.split(">")[0].slice(1))
        : null;
      const allMigrations = await readdir(__dirname + "/../migrations/");
      const migrationsToRun = codeGeneratedTimestamp
        ? allMigrations.filter(
            (migration) =>
              new Date(migration.split(">")[0].slice(1)) >
              codeGeneratedTimestamp
          )
        : allMigrations;
      for (let migration of migrationsToRun) {
        console.log("perform migration: ", migration);
        migration_file = migration;
        const file = require(__dirname + "/../migrations/" + migration);
        await file.up(zendro);
        const timestamp = new Date().toISOString();
        state["last-executed-migration"] = {
          file: migration,
          timestamp: timestamp,
        };
        log["migration_log"][timestamp] = {
          file: migration,
          direction: "up",
          result: "ok",
        };
      }
      await writeFile(
        __dirname + `/../zendro_migration_state.json`,
        JSON.stringify(state)
      );
      await writeFile(
        __dirname + `/../zendro_migration_log.json`,
        JSON.stringify(log)
      );
      process.exit(0);
    } catch (err) {
      log["migration_log"][new Date().toISOString()] = {
        file: migration_file,
        direction: "up",
        result: "error",
      };
      await writeFile(
        __dirname + `/../zendro_migration_state.json`,
        JSON.stringify(state)
      );
      await writeFile(
        __dirname + `/../zendro_migration_log.json`,
        JSON.stringify(log)
      );
      throw Error(err);
    }
  },
  down: async () => {
    let state;
    let log;
    try {
      await access(__dirname + "/../zendro_migration_state.json");
      state = require(__dirname + "/../zendro_migration_state.json");
    } catch (error) {
      console.log(error);
      console.log("create a new object for migration state");
      state = { "last-executed-migration": null };
    }
    try {
      await access(__dirname + "/../zendro_migration_log.json");
      log = require(__dirname + "/../zendro_migration_log.json");
    } catch (error) {
      console.log(error);
      console.log("create a new object for zendro state");
      log = { migration_log: {} };
    }
    const migration = state["last-executed-migration"].file;
    try {
      if (!migration) {
        throw Error(`No executed migration! Please check!`);
      }
      const zendro = await initializeZendro();
      console.log("drop last executed migration: ", migration);
      const file = require(__dirname + "/../migrations/" + migration);
      await file.down(zendro);
      // filter, sort and update for last-executed-migration
      const lastExecutedTimestamp = new Date(
        state["last-executed-migration"].timestamp
      );
      let candidates = Object.keys(log["migration_log"]).filter(
        (key) =>
          log["migration_log"][key].file !== migration &&
          log["migration_log"][key].direction === "up" &&
          log["migration_log"][key].result === "ok" &&
          new Date(key) < lastExecutedTimestamp
      );
      const maxTimestamp = candidates.length
        ? candidates.reduce((a, b) => {
            return new Date(a) > new Date(b) ? a : b;
          })
        : null;
      state["last-executed-migration"] = maxTimestamp
        ? {
            file: log["migration_log"][maxTimestamp].file,
            timestamp: maxTimestamp,
          }
        : null;
      log["migration_log"][new Date().toISOString()] = {
        file: migration,
        direction: "down",
        result: "ok",
      };
      await writeFile(
        __dirname + `/../zendro_migration_state.json`,
        JSON.stringify(state)
      );
      await writeFile(
        __dirname + `/../zendro_migration_log.json`,
        JSON.stringify(log)
      );
      process.exit(0);
    } catch (err) {
      log["migration_log"][new Date().toISOString()] = {
        file: migration,
        direction: "down",
        result: "error",
      };

      await writeFile(
        __dirname + `/../zendro_migration_log.json`,
        JSON.stringify(log)
      );
      throw Error(err);
    }
  },
};
