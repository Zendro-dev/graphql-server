"use strict";
const { DOWN_MIGRATION } = require("../config/globals");

const { setupKeyCloak, cleanupKeyCloak } = require("../utils/setup-keycloak");
/**
 * @module - Migrations to create or to drop a table correpondant to a sequelize model.
 */
module.exports = {
  /**
   * up - configure the keycloak instance with zendro defaults
   *
   * @param  {object} zendro initialized zendro object
   */
  up: async (zendro) => {
    // setup default keycloak instance
    try {
      const {
        KEYCLOAK_BASEURL,
        KEYCLOAK_PUBLIC_KEY,
        KEYCLOAK_GIQL_CLIENT,
        KEYCLOAK_SPA_CLIENT,
        KEYCLOAK_GIQL_CLIENT_SECRET,
        KEYCLOAK_SPA_CLIENT_SECRET,
      } = await setupKeyCloak();
      console.log(`Successfully created default keycloak zendro realm, client, roles.
          A default user "zendro-admin" with password "admin" was created to login to the
          zendro services. Please delete that user before publically deploying zendro.
          To login to the keycloak admin console use credentials user: "admin"
          pw: "admin" at "${KEYCLOAK_BASEURL}/auth". Change that user / password to your liking.
          `);

      // write ENV variables
      // graphql-server
      fs.appendFileSync(
        "../.env",
        `\nOAUTH2_PUBLIC_KEY=${KEYCLOAK_PUBLIC_KEY}`
      );

      // graphiql-auth
      fs.appendFileSync(
        "../../graphiql-auth/.env.development",
        `\nOAUTH2_CLIENT_SECRET=${KEYCLOAK_GIQL_CLIENT_SECRET}
         \nOAUTH2_CLIENT_ID=${KEYCLOAK_GIQL_CLIENT}`
      );
      fs.appendFileSync(
        "../../graphiql-auth/.env.production",
        `\nOAUTH2_CLIENT_SECRET=${KEYCLOAK_GIQL_CLIENT_SECRET}
         \nOAUTH2_CLIENT_ID=${KEYCLOAK_GIQL_CLIENT}`
      );

      // single-page-app
      fs.appendFileSync(
        "../../single-page-app/.env.development",
        `\nOAUTH2_CLIENT_SECRET=${KEYCLOAK_SPA_CLIENT_SECRET}
         \nOAUTH2_CLIENT_ID=${KEYCLOAK_SPA_CLIENT}`
      );
      fs.appendFileSync(
        "../../single-page-app/.env.production",
        `\nOAUTH2_CLIENT_SECRET=${KEYCLOAK_SPA_CLIENT_SECRET}
         \nOAUTH2_CLIENT_ID=${KEYCLOAK_SPA_CLIENT}`
      );

      console.log(
        "Successfully added OAuth2 keycloak PUBLIC_KEY, CLIENT_ID and CLIENT_SECRET environment variables."
      );
    } catch (error) {
      throw new Error(error);
    }
  },

  /**
   * down - Drop a table.
   *
   * @param  {object} zendro initialized zendro object
   */
  down: async (zendro) => {
    try {
      await cleanupKeyCloak();
    } catch (error) {
      throw new Error(error);
    }
  },
};
