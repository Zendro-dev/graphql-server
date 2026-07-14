// Mirrors server.js's exact wiring (same requires, same option shapes, same
// middleware order on /graphql and /meta_query) against the real installed
// zendro-graphiql package and this repo's own utils/auth, without booting
// the full server.js (this repo checkout has no generated resolvers/schemas).
const express = require("express");
const cors = require("cors");
const GraphiQL = require("zendro-graphiql");
const { authRouter, attachAuthFromSession } = require("../../utils/auth");

function buildGraphiqlOptions(globals) {
  return {
    features: {
      auth: Boolean(globals.AUTH_ENABLED),
      filter: Boolean(globals.GRAPHIQL_FILTER_ENABLED),
    },
  };
}

function buildAuthConfig(globals) {
  return {
    enabled: Boolean(globals.AUTH_ENABLED),
    clientId: globals.OAUTH2_GRAPHIQL_CLIENT_ID,
    clientSecret: globals.OAUTH2_GRAPHIQL_CLIENT_SECRET,
    issuerUri: globals.OAUTH2_GRAPHIQL_ISSUER_URI,
    issuerInternalUri: globals.OAUTH2_GRAPHIQL_ISSUER_INTERNAL_URI,
    redirectUri: globals.AUTH_REDIRECT_URI?.[0],
    allowedRedirectUris: globals.AUTH_REDIRECT_URI,
    sessionSecret: globals.SESSION_SECRET,
    postLoginRedirectTo: "/graphiql",
  };
}

function startServer(globals) {
  const graphiqlOptions = buildGraphiqlOptions(globals);
  const authConfig = buildAuthConfig(globals);
  const app = express();
  app.use("/graphiql", GraphiQL(graphiqlOptions));
  app.use("/auth", authRouter(authConfig));

  const attachGraphiqlSession = attachAuthFromSession(authConfig);
  app.all("/graphql", cors(), attachGraphiqlSession, (req, res) =>
    res.json({ authHeader: req.headers.authorization || null })
  );
  app.post("/meta_query", cors(), attachGraphiqlSession, (req, res) =>
    res.json({ authHeader: req.headers.authorization || null })
  );

  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

module.exports = { buildGraphiqlOptions, buildAuthConfig, startServer, closeServer };
