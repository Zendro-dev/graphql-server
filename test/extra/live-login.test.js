// Unlike test/graphiql.test.js (which fakes the identity provider), this
// talks to a REAL, already-running Keycloak - exercising the exact same
// server.js-shaped wiring (see test/helpers/graphiqlServer.js) but with a
// real Authorization Code + PKCE round trip. It exists to catch the class of
// bug the mocked suite can't: wrong ports/hostnames, a misregistered
// redirect URI, a realm/client that doesn't actually accept this config.
//
// Skips itself (rather than failing) whenever the configured Keycloak isn't
// reachable, so it never breaks CI or a machine without the Zendro dev
// stack running. Run explicitly with `npm run test:live`.
require("dotenv").config();
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const cors = require("cors");
const { GraphiQL, authRouter, attachAuthFromSession } = require("zendro-graphiql");
const { buildGraphiqlOptions, closeServer } = require("./../helpers/graphiqlServer");

const ISSUER_URI = process.env.OAUTH2_GRAPHIQL_ISSUER_URI;
// Only needed when ISSUER_URI isn't reachable from here directly (e.g. a
// dockerized Keycloak reachable only via its internal service hostname).
const ISSUER_INTERNAL_URI = process.env.OAUTH2_GRAPHIQL_ISSUER_INTERNAL_URI;
const CLIENT_ID = process.env.OAUTH2_GRAPHIQL_CLIENT_ID || "zendro_graphiql";
const CLIENT_SECRET = process.env.OAUTH2_GRAPHIQL_CLIENT_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET || "live-test-session-secret";
// A concrete callback URL - AUTH_REDIRECT_URI (config/globals.js) holds
// registration *patterns* (e.g. "http://localhost:7070/*"), not something
// that can be sent as the literal redirect_uri parameter.
const REDIRECT_URI = process.env.GRAPHIQL_LIVE_TEST_REDIRECT_URI || "http://localhost:7070/auth/callback";
// A user that already exists in the realm - see utils/setup-keycloak.js
// (createDefaultUser), overridable for other setups.
const TEST_USERNAME = process.env.TEST_USERNAME || "zendro-admin";
const TEST_PASSWORD = process.env.TEST_PASSWORD || "admin";

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function absorbSetCookie(jar, res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : res.headers.get("set-cookie") ? [res.headers.get("set-cookie")] : [];
  for (const c of raw) {
    const [pair] = c.split(";");
    const idx = pair.indexOf("=");
    jar[pair.slice(0, idx)] = pair.slice(idx + 1);
  }
}

async function isReachable(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

// Logs in through Keycloak's actual login form (not the API) - the same
// request sequence a browser would make - then hands back the URL Keycloak
// redirects to (our redirect_uri, with ?code=&state=).
async function performKeycloakLogin(authorizeUrl) {
  const kcJar = {};
  const authorizeRes = await fetch(authorizeUrl, { redirect: "manual" });
  absorbSetCookie(kcJar, authorizeRes);
  if (authorizeRes.status !== 200) {
    throw new Error(`unexpected status ${authorizeRes.status} from Keycloak's authorize endpoint`);
  }
  const html = await authorizeRes.text();
  const formActionMatch = html.match(/<form[^>]+id="kc-form-login"[^>]+action="([^"]+)"/);
  if (!formActionMatch) {
    throw new Error("could not find the Keycloak login form - realm/theme may have changed");
  }
  const formAction = formActionMatch[1].replace(/&amp;/g, "&");

  const loginRes = await fetch(formAction, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie: cookieHeader(kcJar) },
    body: new URLSearchParams({ username: TEST_USERNAME, password: TEST_PASSWORD }).toString(),
  });
  const location = loginRes.headers.get("location");
  if (loginRes.status !== 302 || !location) {
    throw new Error(
      `Keycloak login did not redirect as expected (status ${loginRes.status}) - check TEST_USERNAME/TEST_PASSWORD and that the account has no pending required actions (e.g. VERIFY_PROFILE)`
    );
  }
  return location;
}

test("live login against a real Keycloak", { skip: !ISSUER_URI || !CLIENT_SECRET }, async (t) => {
  if (!ISSUER_URI || !CLIENT_SECRET) return;

  const reachable = await isReachable(`${ISSUER_INTERNAL_URI || ISSUER_URI}/.well-known/openid-configuration`);
  if (!reachable) {
    t.skip(`Keycloak at ${ISSUER_INTERNAL_URI || ISSUER_URI} is not reachable - is the Zendro dev stack running?`);
    return;
  }

  // redirect_uri has a fixed port baked in (must match what's registered on
  // the Keycloak client) - so, unlike the mocked suite, this server can't
  // bind an ephemeral port; it must listen on that exact port.
  const graphiqlOptions = buildGraphiqlOptions({
    AUTH_ENABLED: true,
    OAUTH2_GRAPHIQL_CLIENT_ID: CLIENT_ID,
    OAUTH2_GRAPHIQL_CLIENT_SECRET: CLIENT_SECRET,
    OAUTH2_GRAPHIQL_ISSUER_URI: ISSUER_URI,
    OAUTH2_GRAPHIQL_ISSUER_INTERNAL_URI: ISSUER_INTERNAL_URI,
    AUTH_REDIRECT_URI: [REDIRECT_URI],
    SESSION_SECRET,
    GRAPHIQL_FILTER_ENABLED: false,
  });
  const app = express();
  app.use("/graphiql", GraphiQL(graphiqlOptions));
  app.use("/auth", authRouter(graphiqlOptions));
  const attachGraphiqlSession = attachAuthFromSession(graphiqlOptions);
  app.all("/graphql", cors(), attachGraphiqlSession, (req, res) => res.json({ authHeader: req.headers.authorization || null }));

  const port = Number(new URL(REDIRECT_URI).port) || 80;
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(port, () => resolve(s));
    s.on("error", reject);
  });
  t.after(() => closeServer(server));
  const base = `http://localhost:${port}`;

  await t.test("full round trip: /auth/login -> real Keycloak login -> /auth/callback -> session authenticates /graphql", async () => {
    const appJar = {};
    const loginRes = await fetch(`${base}/auth/login`, { redirect: "manual" });
    absorbSetCookie(appJar, loginRes);
    const authorizeUrl = loginRes.headers.get("location");
    assert.ok(authorizeUrl?.startsWith(ISSUER_URI), "expected /auth/login to redirect into the configured Keycloak realm");

    const redirectBack = await performKeycloakLogin(authorizeUrl);

    const callbackRes = await fetch(redirectBack, { redirect: "manual", headers: { cookie: cookieHeader(appJar) } });
    assert.equal(callbackRes.status, 302, "expected the callback to create a session and redirect to /graphiql");
    absorbSetCookie(appJar, callbackRes);
    assert.ok(appJar.zendro_giql_session, "expected a session cookie to be set");

    const graphqlRes = await fetch(`${base}/graphql`, { headers: { cookie: cookieHeader(appJar) } });
    const responseBody = await graphqlRes.text();
    const { authHeader } = JSON.parse(responseBody);
    assert.match(authHeader || "", /^Bearer /, "expected the real access token to be attached server-side");
    const token = authHeader.replace("Bearer ", "");
    assert.equal(token.split(".").length, 3, "expected a JWT access token");
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    assert.equal(payload.preferred_username, TEST_USERNAME);

    // The whole point of the BFF pattern: the token must never appear
    // anywhere the browser can see it, even on a real, live login.
    for (const cookieValue of Object.values(appJar)) {
      assert.doesNotMatch(decodeURIComponent(cookieValue), new RegExp(token.replace(/[.]/g, "\\.")));
    }
  });
});
