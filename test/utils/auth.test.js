// Router/middleware/session logic for utils/auth, in isolation - no
// GraphiQL SPA mounted here (that composed case is test/graphiql.test.js's
// job). Against a fake OpenID Provider; see test/extra/live-login.test.js
// for the same logic exercised against a real, running Keycloak.
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { authRouter, attachAuthFromSession } = require("../../utils/auth");
const { startFakeIdp } = require("../helpers/fakeIdp");

function baseAuthConfig(idp) {
  return {
    clientId: "zendro_graphiql",
    clientSecret: "test-secret",
    issuerUri: idp.issuer,
    redirectUri: "http://localhost:0/auth/callback",
    sessionSecret: "session-signing-secret",
    postLoginRedirectTo: "/graphiql",
  };
}

function startServer(authConfig) {
  const app = express();
  app.use("/auth", authRouter(authConfig));
  app.all("/graphql", attachAuthFromSession(authConfig), (req, res) =>
    res.json({ authHeader: req.headers.authorization || null })
  );
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

test("authRouter() throws when auth is enabled but misconfigured", () => {
  assert.throws(() => authRouter({ enabled: true }), /missing/);
});

test("attachAuthFromSession() is a no-op passthrough when auth is disabled", () => {
  const middleware = attachAuthFromSession();
  let nextCalled = false;
  middleware({ headers: {} }, {}, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});

test("mounted app: auth flow and /graphql auth injection", async (t) => {
  const idp = await startFakeIdp();
  t.after(() => idp.close());
  const authConfig = { enabled: true, ...baseAuthConfig(idp) };

  const server = await startServer(authConfig);
  const base = `http://localhost:${server.address().port}`;
  t.after(() => closeServer(server));

  await t.test("/auth/login redirects to the discovered authorization endpoint with PKCE + state, and sets a flow cookie", async () => {
    const res = await fetch(`${base}/auth/login`, { redirect: "manual" });
    assert.equal(res.status, 302);
    const location = new URL(res.headers.get("location"));
    assert.equal(location.origin + location.pathname, `${idp.issuer}/protocol/openid-connect/auth`);
    assert.equal(location.searchParams.get("client_id"), "zendro_graphiql");
    assert.equal(location.searchParams.get("code_challenge_method"), "S256");
    assert.ok(location.searchParams.get("state"));
    assert.ok(location.searchParams.get("code_challenge"));

    const flowCookie = res.headers.get("set-cookie");
    assert.match(flowCookie, /zendro_giql_oauth_flow=/);
    assert.match(flowCookie, /HttpOnly/);
  });

  await t.test("/auth/session reports unauthenticated with no cookie", async () => {
    const res = await fetch(`${base}/auth/session`);
    assert.deepEqual(await res.json(), { authenticated: false });
  });

  await t.test("/auth/callback rejects a tampered state before ever contacting the token endpoint", async () => {
    const loginRes = await fetch(`${base}/auth/login`, { redirect: "manual" });
    const flowCookie = loginRes.headers.get("set-cookie").split(";")[0];

    const res = await fetch(`${base}/auth/callback?code=abc&state=WRONG`, {
      headers: { cookie: flowCookie },
      redirect: "manual",
    });
    assert.equal(res.status, 400);
  });

  await t.test("/auth/callback rejects a missing/expired flow cookie", async () => {
    const res = await fetch(`${base}/auth/callback?code=abc&state=anything`, {
      redirect: "manual",
    });
    assert.equal(res.status, 400);
  });

  await t.test("/auth/callback surfaces a failed token exchange as a 400", async () => {
    idp.setTokenMode("error");
    try {
      const loginRes = await fetch(`${base}/auth/login`, { redirect: "manual" });
      const flowCookie = loginRes.headers.get("set-cookie").split(";")[0];
      const state = new URL(loginRes.headers.get("location")).searchParams.get("state");

      const res = await fetch(`${base}/auth/callback?code=abc&state=${state}`, {
        headers: { cookie: flowCookie },
        redirect: "manual",
      });
      assert.equal(res.status, 400);
    } finally {
      idp.setTokenMode("ok");
    }
  });

  await t.test("full login round trip: callback creates a session that authenticates /graphql", async () => {
    const loginRes = await fetch(`${base}/auth/login`, { redirect: "manual" });
    const flowCookie = loginRes.headers.get("set-cookie").split(";")[0];
    const state = new URL(loginRes.headers.get("location")).searchParams.get("state");

    const callbackRes = await fetch(`${base}/auth/callback?code=abc&state=${state}`, {
      headers: { cookie: flowCookie },
      redirect: "manual",
    });
    assert.equal(callbackRes.status, 302);
    assert.equal(callbackRes.headers.get("location"), "/graphiql");
    const sessionCookie = callbackRes.headers
      .get("set-cookie")
      .split(",")
      .find((c) => c.includes("zendro_giql_session"));
    assert.ok(sessionCookie);

    const sessionRes = await fetch(`${base}/auth/session`, { headers: { cookie: sessionCookie.split(";")[0] } });
    assert.deepEqual(await sessionRes.json(), { authenticated: true });

    const graphqlRes = await fetch(`${base}/graphql`, { headers: { cookie: sessionCookie.split(";")[0] } });
    assert.deepEqual(await graphqlRes.json(), { authHeader: "Bearer fake-access-token-for-authorization_code" });
  });

  await t.test("/auth/logout redirects to the discovered end_session_endpoint and clears the session cookie", async () => {
    const loginRes = await fetch(`${base}/auth/login`, { redirect: "manual" });
    const flowCookie = loginRes.headers.get("set-cookie").split(";")[0];
    const state = new URL(loginRes.headers.get("location")).searchParams.get("state");
    const callbackRes = await fetch(`${base}/auth/callback?code=abc&state=${state}`, {
      headers: { cookie: flowCookie },
      redirect: "manual",
    });
    const sessionCookie = callbackRes.headers
      .get("set-cookie")
      .split(",")
      .find((c) => c.includes("zendro_giql_session"))
      .split(";")[0];

    const logoutRes = await fetch(`${base}/auth/logout`, {
      headers: { cookie: sessionCookie },
      redirect: "manual",
    });
    assert.equal(logoutRes.status, 302);
    const location = new URL(logoutRes.headers.get("location"));
    assert.equal(location.origin + location.pathname, `${idp.issuer}/protocol/openid-connect/logout`);
    assert.ok(location.searchParams.get("id_token_hint"));

    const clearedCookie = logoutRes.headers.get("set-cookie");
    assert.match(clearedCookie, /zendro_giql_session=;/);
  });

  await t.test("/graphql has no injected auth header without a session or explicit header", async () => {
    const res = await fetch(`${base}/graphql`);
    assert.deepEqual(await res.json(), { authHeader: null });
  });

  await t.test("/graphql passes through an explicit Authorization header untouched", async () => {
    const res = await fetch(`${base}/graphql`, { headers: { Authorization: "Bearer manual-token" } });
    assert.deepEqual(await res.json(), { authHeader: "Bearer manual-token" });
  });
});

test("authRouter(): postLoginRedirectTo defaults to \"/\" when unset", async (t) => {
  const idp = await startFakeIdp();
  t.after(() => idp.close());
  const authConfig = {
    enabled: true,
    clientId: "zendro_graphiql",
    clientSecret: "test-secret",
    issuerUri: idp.issuer,
    redirectUri: "http://localhost:0/auth/callback",
    sessionSecret: "session-signing-secret",
  };

  const server = await startServer(authConfig);
  const base = `http://localhost:${server.address().port}`;
  t.after(() => closeServer(server));

  const loginRes = await fetch(`${base}/auth/login`, { redirect: "manual" });
  const flowCookie = loginRes.headers.get("set-cookie").split(";")[0];
  const state = new URL(loginRes.headers.get("location")).searchParams.get("state");

  const callbackRes = await fetch(`${base}/auth/callback?code=abc&state=${state}`, {
    headers: { cookie: flowCookie },
    redirect: "manual",
  });
  assert.equal(callbackRes.status, 302);
  assert.equal(callbackRes.headers.get("location"), "/");
});

test("authRouter(): an explicit postLoginRedirectTo drives the post-login redirect target", async (t) => {
  const idp = await startFakeIdp();
  t.after(() => idp.close());
  const authConfig = { enabled: true, ...baseAuthConfig(idp), postLoginRedirectTo: "/dashboard" };

  const server = await startServer(authConfig);
  const base = `http://localhost:${server.address().port}`;
  t.after(() => closeServer(server));

  const loginRes = await fetch(`${base}/auth/login`, { redirect: "manual" });
  const flowCookie = loginRes.headers.get("set-cookie").split(";")[0];
  const state = new URL(loginRes.headers.get("location")).searchParams.get("state");

  const callbackRes = await fetch(`${base}/auth/callback?code=abc&state=${state}`, {
    headers: { cookie: flowCookie },
    redirect: "manual",
  });
  assert.equal(callbackRes.status, 302);
  assert.equal(callbackRes.headers.get("location"), "/dashboard");
});

test("authConfig.required: rejects anonymous requests instead of just passing them through", async (t) => {
  const idp = await startFakeIdp();
  t.after(() => idp.close());
  const authConfig = { enabled: true, ...baseAuthConfig(idp), required: true };

  const server = await startServer(authConfig);
  const base = `http://localhost:${server.address().port}`;
  t.after(() => closeServer(server));

  await t.test("/graphql: no session, no header -> 401, not forwarded anonymously", async () => {
    const res = await fetch(`${base}/graphql`);
    assert.equal(res.status, 401);
  });

  await t.test("/graphql: an explicit Authorization header still passes through untouched", async () => {
    const res = await fetch(`${base}/graphql`, { headers: { Authorization: "Bearer manual-token" } });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { authHeader: "Bearer manual-token" });
  });

  await t.test("/graphql: a logged-in session is let through", async () => {
    const loginRes = await fetch(`${base}/auth/login`, { redirect: "manual" });
    const flowCookie = loginRes.headers.get("set-cookie").split(";")[0];
    const state = new URL(loginRes.headers.get("location")).searchParams.get("state");
    const callbackRes = await fetch(`${base}/auth/callback?code=abc&state=${state}`, {
      headers: { cookie: flowCookie },
      redirect: "manual",
    });
    const sessionCookie = callbackRes.headers
      .get("set-cookie")
      .split(",")
      .find((c) => c.includes("zendro_giql_session"))
      .split(";")[0];

    const res = await fetch(`${base}/graphql`, { headers: { cookie: sessionCookie } });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).authHeader, "Bearer fake-access-token-for-authorization_code");
  });
});

test("authConfig.issuerInternalUri: identity provider with a public-only issuer (e.g. Keycloak in Docker Compose)", async (t) => {
  // Simulates Keycloak's KC_HOSTNAME_BACKCHANNEL_DYNAMIC: issuer/authorization_endpoint
  // are a fixed "public" address unreachable from here; only the fake IdP's own
  // (internal) address actually answers requests. issuerUri must still be set to
  // the public value, since that's what the discovery document reports and what
  // the browser needs for the authorization redirect.
  const publicIssuer = "http://public-keycloak.invalid";
  const idp = await startFakeIdp({ publicIssuer });
  t.after(() => idp.close());
  const authConfig = { enabled: true, ...baseAuthConfig(idp), issuerUri: publicIssuer, issuerInternalUri: idp.issuer };

  const server = await startServer(authConfig);
  const base = `http://localhost:${server.address().port}`;
  t.after(() => closeServer(server));

  await t.test("/auth/login redirects to the public authorization endpoint, not the internal one", async () => {
    const res = await fetch(`${base}/auth/login`, { redirect: "manual" });
    assert.equal(res.status, 302);
    assert.match(res.headers.get("location"), /^http:\/\/public-keycloak\.invalid\/protocol\/openid-connect\/auth\?/);
  });

  await t.test("full login round trip still works via the internal token endpoint", async () => {
    const loginRes = await fetch(`${base}/auth/login`, { redirect: "manual" });
    const flowCookie = loginRes.headers.get("set-cookie").split(";")[0];
    const state = new URL(loginRes.headers.get("location")).searchParams.get("state");

    const callbackRes = await fetch(`${base}/auth/callback?code=abc&state=${state}`, {
      headers: { cookie: flowCookie },
      redirect: "manual",
    });
    assert.equal(callbackRes.status, 302, "expected the callback to succeed despite the public issuer being unreachable");
    assert.equal(callbackRes.headers.get("location"), "/graphiql");
  });
});

test("authConfig.allowedRedirectUris: running login/logout on behalf of another origin", async (t) => {
  const idp = await startFakeIdp();
  t.after(() => idp.close());
  const authConfig = { enabled: true, ...baseAuthConfig(idp), allowedRedirectUris: ["http://proxy.example/*"] };

  const server = await startServer(authConfig);
  const base = `http://localhost:${server.address().port}`;
  t.after(() => closeServer(server));

  await t.test("/auth/login uses the header's redirect_uri when it matches an allowed pattern", async () => {
    const res = await fetch(`${base}/auth/login`, {
      redirect: "manual",
      headers: { "x-zendro-auth-redirect-uri": "http://proxy.example/auth/callback" },
    });
    assert.equal(res.status, 302);
    const location = new URL(res.headers.get("location"));
    assert.equal(location.searchParams.get("redirect_uri"), "http://proxy.example/auth/callback");
  });

  await t.test("/auth/login ignores the header when it doesn't match any allowed pattern", async () => {
    const res = await fetch(`${base}/auth/login`, {
      redirect: "manual",
      headers: { "x-zendro-auth-redirect-uri": "http://not-allowed.example/auth/callback" },
    });
    assert.equal(res.status, 302);
    const location = new URL(res.headers.get("location"));
    assert.equal(location.searchParams.get("redirect_uri"), authConfig.redirectUri);
  });

  let sessionCookie;

  await t.test("full round trip: post-login redirect goes to the other origin's root, not this server's own landing page", async () => {
    const loginRes = await fetch(`${base}/auth/login`, {
      redirect: "manual",
      headers: { "x-zendro-auth-redirect-uri": "http://proxy.example/auth/callback" },
    });
    const flowCookie = loginRes.headers.get("set-cookie").split(";")[0];
    const state = new URL(loginRes.headers.get("location")).searchParams.get("state");

    const callbackRes = await fetch(`${base}/auth/callback?code=abc&state=${state}`, {
      headers: { cookie: flowCookie },
      redirect: "manual",
    });
    assert.equal(callbackRes.status, 302);
    assert.equal(callbackRes.headers.get("location"), "http://proxy.example/");
    sessionCookie = callbackRes.headers
      .get("set-cookie")
      .split(",")
      .find((c) => c.includes("zendro_giql_session"))
      .split(";")[0];

    // A real identity provider strictly validates this - unlike this fake
    // one - so a wrong value here wouldn't otherwise be caught until it
    // broke against the real thing.
    assert.equal(idp.tokenRequests.at(-1).redirect_uri, "http://proxy.example/auth/callback");
  });

  await t.test("/auth/logout also redirects post-logout to the other origin", async () => {
    const logoutRes = await fetch(`${base}/auth/logout`, {
      headers: { cookie: sessionCookie, "x-zendro-auth-redirect-uri": "http://proxy.example/auth/callback" },
      redirect: "manual",
    });
    assert.equal(logoutRes.status, 302);
    const location = new URL(logoutRes.headers.get("location"));
    assert.equal(location.searchParams.get("post_logout_redirect_uri"), "http://proxy.example/");
  });
});
