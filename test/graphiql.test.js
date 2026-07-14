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
// integration seam that lives in server.js, against a fake OpenID Provider.
// See test/extra/live-login.test.js for the same seam exercised against a
// real, running Keycloak.
const test = require("node:test");
const assert = require("node:assert/strict");
const { startFakeIdp } = require("./helpers/fakeIdp");
const { startServer, closeServer } = require("./helpers/graphiqlServer");

test("server.js-shaped wiring: auth enabled", async (t) => {
  const idp = await startFakeIdp();
  t.after(() => idp.close());

  const server = await startServer({
    GRAPHIQL_AUTH_ENABLED: true,
    OAUTH2_GRAPHIQL_CLIENT_ID: "zendro_graphiql",
    OAUTH2_GRAPHIQL_CLIENT_SECRET: "test-secret",
    OAUTH2_GRAPHIQL_ISSUER_URI: idp.issuer,
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

  await t.test("/graphiql/auth/login is reachable and redirects to the discovered authorization endpoint", async () => {
    const res = await fetch(`${base}/graphiql/auth/login`, { redirect: "manual" });
    assert.equal(res.status, 302);
    assert.match(res.headers.get("location"), new RegExp(`^${idp.issuer.replace(/[.]/g, "\\.")}/protocol/openid-connect/auth\\?`));
  });

  await t.test("/graphiql/auth/callback surfaces a failed token exchange as a 400", async () => {
    idp.setTokenMode("error");
    try {
      const loginRes = await fetch(`${base}/graphiql/auth/login`, { redirect: "manual" });
      const flowCookie = loginRes.headers.get("set-cookie").split(";")[0];
      const state = new URL(loginRes.headers.get("location")).searchParams.get("state");

      const res = await fetch(`${base}/graphiql/auth/callback?code=abc&state=${state}`, {
        headers: { cookie: flowCookie },
        redirect: "manual",
      });
      assert.equal(res.status, 400);
    } finally {
      idp.setTokenMode("ok");
    }
  });

  await t.test("full login round trip: /auth/session and /graphql reflect the session, /auth/logout tears it down", async () => {
    const loginRes = await fetch(`${base}/graphiql/auth/login`, { redirect: "manual" });
    const flowCookie = loginRes.headers.get("set-cookie").split(";")[0];
    const state = new URL(loginRes.headers.get("location")).searchParams.get("state");

    const callbackRes = await fetch(`${base}/graphiql/auth/callback?code=abc&state=${state}`, {
      headers: { cookie: flowCookie },
      redirect: "manual",
    });
    assert.equal(callbackRes.status, 302);
    assert.equal(callbackRes.headers.get("location"), "/graphiql");
    const sessionCookie = callbackRes.headers
      .get("set-cookie")
      .split(",")
      .find((c) => c.includes("zendro_giql_session"))
      .split(";")[0];

    const sessionRes = await fetch(`${base}/graphiql/auth/session`, { headers: { cookie: sessionCookie } });
    assert.deepEqual(await sessionRes.json(), { authenticated: true });

    const graphqlRes = await fetch(`${base}/graphql`, { headers: { cookie: sessionCookie } });
    assert.equal((await graphqlRes.json()).authHeader, "Bearer fake-access-token-for-authorization_code");

    const logoutRes = await fetch(`${base}/graphiql/auth/logout`, { headers: { cookie: sessionCookie }, redirect: "manual" });
    assert.equal(logoutRes.status, 302);
    const logoutLocation = new URL(logoutRes.headers.get("location"));
    assert.equal(logoutLocation.origin + logoutLocation.pathname, `${idp.issuer}/protocol/openid-connect/logout`);
    assert.match(logoutRes.headers.get("set-cookie"), /zendro_giql_session=;/);

    const afterLogoutRes = await fetch(`${base}/graphiql/auth/session`, { headers: { cookie: sessionCookie } });
    assert.deepEqual(await afterLogoutRes.json(), { authenticated: false });
  });
});

test("server.js-shaped wiring: acting as an auth backend for a proxied graphiql-auth deployment", async (t) => {
  const idp = await startFakeIdp();
  t.after(() => idp.close());

  const server = await startServer({
    GRAPHIQL_AUTH_ENABLED: true,
    OAUTH2_GRAPHIQL_CLIENT_ID: "zendro_graphiql",
    OAUTH2_GRAPHIQL_CLIENT_SECRET: "test-secret",
    OAUTH2_GRAPHIQL_ISSUER_URI: idp.issuer,
    // GRAPHIQL_REDIRECT_URI doubles as the allowlist of origins this
    // instance will run login/logout on behalf of - see server.js.
    GRAPHIQL_REDIRECT_URI: ["http://localhost:0/graphiql/auth/callback", "http://giql.example/*"],
    SESSION_SECRET: "session-secret",
  });
  const base = `http://localhost:${server.address().port}`;
  t.after(() => closeServer(server));

  await t.test("/graphiql/auth/login honors the header for an allowlisted origin", async () => {
    const res = await fetch(`${base}/graphiql/auth/login`, {
      redirect: "manual",
      headers: { "x-zendro-auth-redirect-uri": "http://giql.example/auth/callback" },
    });
    assert.equal(res.status, 302);
    const location = new URL(res.headers.get("location"));
    assert.equal(location.searchParams.get("redirect_uri"), "http://giql.example/auth/callback");
  });

  await t.test("full round trip on behalf of the proxied origin redirects back there, not to /graphiql", async () => {
    const loginRes = await fetch(`${base}/graphiql/auth/login`, {
      redirect: "manual",
      headers: { "x-zendro-auth-redirect-uri": "http://giql.example/auth/callback" },
    });
    const flowCookie = loginRes.headers.get("set-cookie").split(";")[0];
    const state = new URL(loginRes.headers.get("location")).searchParams.get("state");

    const callbackRes = await fetch(`${base}/graphiql/auth/callback?code=abc&state=${state}`, {
      headers: { cookie: flowCookie },
      redirect: "manual",
    });
    assert.equal(callbackRes.status, 302);
    assert.equal(callbackRes.headers.get("location"), "http://giql.example/");
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
