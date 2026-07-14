// Mirrors server.js's exact GraphiQL wiring (same require, same option
// shape, same middleware order on /graphql and /meta_query) against the
// real installed zendro-graphiql package, without booting the full
// server.js (this repo checkout has no generated resolvers/schemas).
const express = require("express");
const cors = require("cors");
const { GraphiQL, authRouter, attachAuthFromSession } = require("zendro-graphiql");

function buildGraphiqlOptions(globals) {
  return {
    features: {
      auth: {
        enabled: globals.AUTH_ENABLED,
        clientId: globals.OAUTH2_GRAPHIQL_CLIENT_ID,
        clientSecret: globals.OAUTH2_GRAPHIQL_CLIENT_SECRET,
        issuerUri: globals.OAUTH2_GRAPHIQL_ISSUER_URI,
        issuerInternalUri: globals.OAUTH2_GRAPHIQL_ISSUER_INTERNAL_URI,
        redirectUri: globals.AUTH_REDIRECT_URI[0],
        allowedRedirectUris: globals.AUTH_REDIRECT_URI,
        sessionSecret: globals.SESSION_SECRET,
        postLoginRedirectTo: "/graphiql",
      },
      filter: { enabled: globals.GRAPHIQL_FILTER_ENABLED },
    },
  };
}

function startServer(globals) {
  const graphiqlOptions = buildGraphiqlOptions(globals);
  const app = express();
  app.use("/graphiql", GraphiQL(graphiqlOptions));
  app.use("/auth", authRouter(graphiqlOptions));

  const attachGraphiqlSession = attachAuthFromSession(graphiqlOptions);
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

module.exports = { buildGraphiqlOptions, startServer, closeServer };
