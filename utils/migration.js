const { initializeZendro } = require("./zendro.js");

const { readdir, writeFile, access } = require("fs/promises");
const path = require("path");

module.exports = {
  up: async () => {
    let state;
    let log;
    try {
      await access(__dirname + "/../zendro_migration_state.json");
      state = require(__dirname + "/../zendro_migration_state.json");
    } catch (error) {
      console.log("create a new object for migration state");
      state = { "last-executed-migration": null };
    }
    try {
      await access(__dirname + "/../zendro_migration_log.json");
      log = require(__dirname + "/../zendro_migration_log.json");
    } catch (error) {
      console.log("create a new object for migration log");
      log = { migration_log: {} };
    }

    let migration_file;
    let model_name;
    try {
      const zendro = await initializeZendro();
      const codeGeneratedTimestamp = state["last-executed-migration"]
        ? new Date(
            state["last-executed-migration"].file
              .split("#")[0]
              .replace(/_/g, ":")
          )
        : null;
      const allMigrations = (
        await readdir(__dirname + "/../migrations/")
      ).filter((file) => path.extname(file) === ".js");
      const migrationsToRun = codeGeneratedTimestamp
        ? allMigrations.filter(
            (migration) =>
              new Date(migration.split("#")[0].replace(/_/g, ":")) >=
                codeGeneratedTimestamp &&
              migration !== state["last-executed-migration"].file
          )
        : allMigrations;
      for (let migration of migrationsToRun) {
        console.log("perform migration: ", migration);
        migration_file = migration;
        model_name = migration.split("#")[1];
        model_name = model_name.slice(0, model_name.length - 3);
        const file = require(__dirname + "/../migrations/" + migration);
        await file.up(zendro);
        const timestamp = new Date().toISOString();
        state["last-executed-migration"] = {
          file: migration,
          timestamp: timestamp,
        };

        log["migration_log"][timestamp + "&" + model_name] = {
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
      log["migration_log"][new Date().toISOString() + "&" + model_name] = {
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
    const migration = state["last-executed-migration"]
      ? state["last-executed-migration"].file
      : null;
    if (!migration) {
      throw Error(`No executed migration! Please check!`);
    }
    let model_name = migration.split("#")[1];
    model_name = model_name.slice(0, model_name.length - 3);
    try {
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
          new Date(key.split("&")[0]) < lastExecutedTimestamp
      );
      const maxTimestampKey = candidates.length
        ? candidates.reduce((a, b) => {
            return new Date(a.split("&")[0]) > new Date(b.split("&")[0])
              ? a
              : b;
          })
        : null;
      state["last-executed-migration"] = maxTimestampKey
        ? {
            file: log["migration_log"][maxTimestampKey].file,
            timestamp: maxTimestampKey.split("&")[0],
          }
        : null;
      log["migration_log"][new Date().toISOString() + "&" + model_name] = {
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
      log["migration_log"][new Date().toISOString() + "&" + model_name] = {
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
