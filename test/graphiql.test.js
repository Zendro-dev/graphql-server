// Mirrors server.js's exact GraphiQL wiring (same require, same option
// shape, same middleware order on /graphql and /meta_query) against the
// real installed zendro-graphiql package. Deliberately doesn't boot the
// full server.js: this repo checkout has no generated resolvers/schemas
// (produced by a separate Zendro code-gen step), and that generated layer
// is orthogonal to what's being verified here - that server.js wires the
// GraphiQL router and session middleware together correctly.
//
// zendro-graphiql's own test suite (zendro-graphiql/test/) covers the
// router/middleware/session logic in isolation; this file only covers the
// integration seam that lives in server.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const cors = require("cors");
const GraphiQL = require("zendro-graphiql");

function buildGraphiqlOptions(globals) {
  return {
    features: {
      auth: {
        enabled: globals.GRAPHIQL_AUTH_ENABLED,
        clientId: globals.OAUTH2_GRAPHIQL_CLIENT_ID,
        clientSecret: globals.OAUTH2_GRAPHIQL_CLIENT_SECRET,
        authorizationUri: globals.OAUTH2_AUTHORIZATION_URI,
        tokenUri: globals.OAUTH2_TOKEN_URI,
        logoutUri: globals.OAUTH2_LOGOUT_URI,
        redirectUri: globals.GRAPHIQL_REDIRECT_URI[0],
        sessionSecret: globals.SESSION_SECRET,
      },
      filter: { enabled: globals.GRAPHIQL_FILTER_ENABLED },
    },
  };
}

function startServer(globals) {
  const graphiqlOptions = buildGraphiqlOptions(globals);
  const app = express();
  app.use("/graphiql", GraphiQL(graphiqlOptions));

  const attachGraphiqlSession = GraphiQL.attachAuthFromSession(graphiqlOptions);
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

test("server.js-shaped wiring: auth enabled", async (t) => {
  const server = await startServer({
    GRAPHIQL_AUTH_ENABLED: true,
    OAUTH2_GRAPHIQL_CLIENT_ID: "zendro_graphiql",
    OAUTH2_GRAPHIQL_CLIENT_SECRET: "test-secret",
    OAUTH2_AUTHORIZATION_URI: "http://keycloak.example/auth",
    OAUTH2_TOKEN_URI: "http://keycloak.example/token",
    OAUTH2_LOGOUT_URI: "http://keycloak.example/logout",
    GRAPHIQL_REDIRECT_URI: ["http://localhost:0/graphiql/auth/callback"],
    SESSION_SECRET: "session-secret",
    GRAPHIQL_FILTER_ENABLED: true,
  });
  const base = `http://localhost:${server.address().port}`;
  t.after(() => closeServer(server));

  await t.test("GraphiQL SPA is served at /graphiql", async () => {
    const res = await fetch(`${base}/graphiql`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /__ZENDRO_GRAPHIQL__/);
  });

  await t.test("/graphql: no session, no header -> untouched", async () => {
    const res = await fetch(`${base}/graphql`);
    assert.deepEqual(await res.json(), { authHeader: null });
  });

  await t.test("/graphql: explicit Authorization header always wins", async () => {
    const res = await fetch(`${base}/graphql`, { headers: { Authorization: "Bearer manual" } });
    assert.deepEqual(await res.json(), { authHeader: "Bearer manual" });
  });

  await t.test("/meta_query: same session middleware wired in", async () => {
    const res = await fetch(`${base}/meta_query`, { method: "POST" });
    assert.deepEqual(await res.json(), { authHeader: null });
  });

  await t.test("/graphiql/auth/login is reachable and redirects to the authorization endpoint", async () => {
    const res = await fetch(`${base}/graphiql/auth/login`, { redirect: "manual" });
    assert.equal(res.status, 302);
    assert.match(res.headers.get("location"), /^http:\/\/keycloak\.example\/auth\?/);
  });
});

test("server.js-shaped wiring: everything disabled (the .env.example default)", async (t) => {
  const server = await startServer({
    GRAPHIQL_AUTH_ENABLED: false,
    GRAPHIQL_FILTER_ENABLED: false,
    GRAPHIQL_REDIRECT_URI: ["http://localhost:0/graphiql/auth/callback"],
  });
  const base = `http://localhost:${server.address().port}`;
  t.after(() => closeServer(server));

  await t.test("GraphiQL SPA still served, with both feature flags off", async () => {
    const html = await (await fetch(`${base}/graphiql`)).text();
    assert.match(html, /"auth":\{"enabled":false\}/);
    assert.match(html, /"filter":\{"enabled":false\}/);
  });

  await t.test("/graphiql/auth/login 404s when auth is disabled", async () => {
    const res = await fetch(`${base}/graphiql/auth/login`, { redirect: "manual" });
    assert.equal(res.status, 404);
  });

  await t.test("/graphql is untouched by the (disabled) session middleware", async () => {
    const res = await fetch(`${base}/graphql`, { headers: { Authorization: "Bearer manual" } });
    assert.deepEqual(await res.json(), { authHeader: "Bearer manual" });
  });
});
