// /auth/permissions (utils/auth/router.js + utils/auth/permissions.js):
// resolves a logged-in session's roles into { [modelName]: AclPermission[] },
// using the same default role -> permission map single-page-app's own
// build-time ACL preval step already uses (see permissions.js). Against a
// fake OpenID Provider that can mint real, signed JWT access tokens
// carrying arbitrary resource_access roles - see test/helpers/fakeIdp.js's
// accessTokenRoles option.
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { authRouter } = require("../../utils/auth");
const { startFakeIdp } = require("../helpers/fakeIdp");

// The resource-server client's roles are what getRoles()/permissions.js
// actually reads (see utils/roles.js) - a separate, deliberately distinct
// Keycloak client from OAUTH2_GRAPHIQL_CLIENT_ID (see config/globals.js).
const RESOURCE_CLIENT_ID = "zendro_graphql-server";

// Mirrors models/index.js's real shape: storage-type buckets (always
// present) plus real model entries - only the latter should ever appear in
// a /auth/permissions response.
const FAKE_MODELS = {
  sql: {},
  mongodb: {},
  cassandra: {},
  amazonS3: {},
  trino: {},
  presto: {},
  neo4j: {},
  role: {},
  user: {},
};

function baseAuthConfig(idp) {
  return {
    enabled: true,
    clientId: "zendro_graphiql",
    clientSecret: "test-secret",
    issuerUri: idp.issuer,
    redirectUri: "http://localhost:0/auth/callback",
    sessionSecret: "session-signing-secret",
    postLoginRedirectTo: "/graphiql",
    oauth2PublicKey: idp.publicKeyPem,
    oauth2ClientId: RESOURCE_CLIENT_ID,
    models: FAKE_MODELS,
  };
}

function startServer(authConfig) {
  const app = express();
  app.use("/auth", authRouter(authConfig));
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

// Full login round trip -> session cookie, reusing the same flow the other
// utils/auth suites already exercise in detail (see test/utils/auth.test.js).
async function login(base) {
  const loginRes = await fetch(`${base}/auth/login`, { redirect: "manual" });
  const flowCookie = loginRes.headers.get("set-cookie").split(";")[0];
  const state = new URL(loginRes.headers.get("location")).searchParams.get("state");
  const callbackRes = await fetch(`${base}/auth/callback?code=abc&state=${state}`, {
    headers: { cookie: flowCookie },
    redirect: "manual",
  });
  return callbackRes.headers
    .get("set-cookie")
    .split(",")
    .find((c) => c.includes("zendro_giql_session"))
    .split(";")[0];
}

// Mints a token directly from the fake IdP's token endpoint, bypassing the
// full authorization-code round trip - for exercising the "explicit
// Authorization header" path, which needs no session at all.
async function mintAccessToken(idp, clientId) {
  const res = await fetch(`${idp.issuer}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId }).toString(),
  });
  return (await res.json()).access_token;
}

test("/auth/permissions: administrator session -> '*' on every known model", async (t) => {
  const idp = await startFakeIdp({ accessTokenRoles: { [RESOURCE_CLIENT_ID]: { roles: ["administrator"] } } });
  t.after(() => idp.close());
  const authConfig = baseAuthConfig(idp);
  const server = await startServer(authConfig);
  const base = `http://localhost:${server.address().port}`;
  t.after(() => closeServer(server));

  await t.test("no session, no header -> 401", async () => {
    const res = await fetch(`${base}/auth/permissions`);
    assert.equal(res.status, 401);
  });

  await t.test("logged-in session -> full permissions, storage-type buckets excluded", async () => {
    const sessionCookie = await login(base);
    const res = await fetch(`${base}/auth/permissions`, { headers: { cookie: sessionCookie } });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { role: ["*"], user: ["*"] });
  });

  await t.test("an explicit Authorization header is decoded directly, no session needed", async () => {
    const token = await mintAccessToken(idp, RESOURCE_CLIENT_ID);
    const res = await fetch(`${base}/auth/permissions`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { role: ["*"], user: ["*"] });
  });

  await t.test("a garbled explicit Authorization header -> 401, not a 500", async () => {
    const res = await fetch(`${base}/auth/permissions`, { headers: { Authorization: "Bearer not-a-jwt" } });
    assert.equal(res.status, 401);
  });
});

test("/auth/permissions: reader session -> read-only on every known model", async (t) => {
  const idp = await startFakeIdp({ accessTokenRoles: { [RESOURCE_CLIENT_ID]: { roles: ["reader"] } } });
  t.after(() => idp.close());
  const server = await startServer(baseAuthConfig(idp));
  const base = `http://localhost:${server.address().port}`;
  t.after(() => closeServer(server));

  const sessionCookie = await login(base);
  const res = await fetch(`${base}/auth/permissions`, { headers: { cookie: sessionCookie } });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { role: ["read"], user: ["read"] });
});

test("/auth/permissions: a role with no default mapping -> no permissions on any model", async (t) => {
  const idp = await startFakeIdp({ accessTokenRoles: { [RESOURCE_CLIENT_ID]: { roles: ["some-other-realm-role"] } } });
  t.after(() => idp.close());
  const server = await startServer(baseAuthConfig(idp));
  const base = `http://localhost:${server.address().port}`;
  t.after(() => closeServer(server));

  const sessionCookie = await login(base);
  const res = await fetch(`${base}/auth/permissions`, { headers: { cookie: sessionCookie } });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {});
});

test("/auth/permissions: editor session -> create/update/delete, not read", async (t) => {
  const idp = await startFakeIdp({ accessTokenRoles: { [RESOURCE_CLIENT_ID]: { roles: ["editor"] } } });
  t.after(() => idp.close());
  const server = await startServer(baseAuthConfig(idp));
  const base = `http://localhost:${server.address().port}`;
  t.after(() => closeServer(server));

  const sessionCookie = await login(base);
  const res = await fetch(`${base}/auth/permissions`, { headers: { cookie: sessionCookie } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(new Set(body.role), new Set(["create", "update", "delete"]));
  assert.deepEqual(new Set(body.user), new Set(["create", "update", "delete"]));
});
