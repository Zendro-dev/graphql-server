const express = require("express");
const { parseCookies, sign, unsign, serializeCookie } = require("./cookies");
const {
  createSession,
  getSession,
  destroySession,
  readSessionId,
  sessionCookieHeader,
  clearSessionCookieHeader,
} = require("./session");
const { loadClient, getConfiguration } = require("./oidc");

// One-time cookie that carries the OAuth `state` and PKCE `code_verifier`
// across the redirect to the identity provider and back. Short-lived: it
// only needs to survive the login round trip, never the session itself.
const FLOW_COOKIE = "zendro_giql_oauth_flow";
const FLOW_MAX_AGE = 600; // 10 minutes to complete login

// A trusted reverse proxy fronting this router (e.g. graphiql-auth, a
// standalone GraphiQL deployment with no Keycloak credentials of its own)
// sends this to say "run this login/logout for my origin, not yours". Only
// honored when it matches authConfig.allowedRedirectUris - otherwise this
// server would be an open redirect_uri echo. Keycloak's own exact-match
// enforcement on redirect_uri at the token endpoint is still the real
// cryptographic backstop; this allowlist only gates which origins get a
// redirect_uri echoed back to them at all.
const REDIRECT_URI_HEADER = "x-zendro-auth-redirect-uri";

function matchesAllowedRedirectUri(uri, allowedPatterns) {
  if (!uri || !Array.isArray(allowedPatterns)) return false;
  try {
    new URL(uri); // must be a well-formed absolute URL
  } catch {
    return false;
  }
  return allowedPatterns.some((pattern) =>
    pattern.endsWith("*") ? uri.startsWith(pattern.slice(0, -1)) : uri === pattern
  );
}

// Resolves the redirect_uri for this specific request - the header value if
// it's present and allowed, else this server's own static default.
function resolveRedirectUri(req, authConfig) {
  const requested = req.headers[REDIRECT_URI_HEADER];
  if (requested && matchesAllowedRedirectUri(requested, authConfig.allowedRedirectUris)) {
    return requested;
  }
  return authConfig.redirectUri;
}

// Where to send the browser after login/logout completes, for this
// request's resolved redirectUri. authConfig.postLoginRedirectTo is *this*
// server's own configured landing page (default "/") - correct as a plain
// relative path when redirectUri is this server's own static default (a
// relative Location header resolves against whatever origin the browser is
// actually talking to), but meaningless for a proxied request on a
// different origin, where a standalone deployment is assumed to be mounted
// at its own root instead.
function redirectTargetFor(redirectUri, authConfig) {
  if (redirectUri === authConfig.redirectUri) return authConfig.postLoginRedirectTo || "/";
  try {
    return `${new URL(redirectUri).origin}/`;
  } catch {
    return authConfig.postLoginRedirectTo || "/";
  }
}

// Like redirectTargetFor, but always absolute - post_logout_redirect_uri is
// sent to the identity provider, which then redirects the browser there
// directly (not via this server), so a relative path won't do.
function derivePostLogoutRedirectUri(authConfig, redirectUri) {
  if (authConfig.postLogoutRedirectUri) return authConfig.postLogoutRedirectUri;
  const target = redirectTargetFor(redirectUri, authConfig);
  return target.startsWith("/") ? `${new URL(redirectUri).origin}${target}` : target;
}

// openid-client's authorizationCodeGrant() always derives the redirect_uri
// it sends to the token endpoint from this URL's own origin+pathname
// (stripped of query/hash) - there is no supported way to pass a different
// one alongside it. A reverse-proxied request arrives with this server's
// own host, not the original caller's, so when redirectUri is an override,
// its origin+pathname are substituted in here - keeping this request's
// actual query string (code, state) untouched.
function currentUrlFor(req, redirectUri) {
  const url = new URL(req.originalUrl, `${req.protocol}://${req.get("host")}`);
  if (redirectUri) {
    const override = new URL(redirectUri);
    url.protocol = override.protocol;
    // .hostname/.port, not .host - the latter's setter doesn't clear an
    // existing port when the new value doesn't specify one.
    url.hostname = override.hostname;
    url.port = override.port;
    url.pathname = override.pathname;
  }
  return url;
}

function createAuthRouter(authConfig) {
  const router = express.Router();
  const cookieOpts = (req) => ({ secure: req.protocol === "https" });

  router.get("/login", async (req, res, next) => {
    try {
      const client = await loadClient();
      const config = await getConfiguration(authConfig);
      const redirectUri = resolveRedirectUri(req, authConfig);

      const state = client.randomState();
      const codeVerifier = client.randomPKCECodeVerifier();
      const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);

      const flowPayload = JSON.stringify({ state, codeVerifier, redirectUri });
      res.setHeader(
        "Set-Cookie",
        serializeCookie(FLOW_COOKIE, sign(flowPayload, authConfig.sessionSecret), {
          ...cookieOpts(req),
          maxAge: FLOW_MAX_AGE,
        })
      );

      const authUrl = client.buildAuthorizationUrl(config, {
        redirect_uri: redirectUri,
        scope: "openid",
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      });
      res.redirect(authUrl.toString());
    } catch (err) {
      next(err);
    }
  });

  router.get("/callback", async (req, res) => {
    const clearFlowCookie = serializeCookie(FLOW_COOKIE, "", { ...cookieOpts(req), maxAge: 0 });

    const rawFlow = parseCookies(req.headers.cookie)[FLOW_COOKIE];
    const flowPayload = rawFlow && unsign(rawFlow, authConfig.sessionSecret);
    if (!flowPayload) {
      res.setHeader("Set-Cookie", clearFlowCookie);
      return res.status(400).send("Login session expired or invalid. Please try logging in again.");
    }
    // redirectUri is the one actually used to build the authorization URL
    // (stored at /login time) - reused here rather than re-resolved from
    // this request, so a proxied deployment doesn't need to resend the
    // header on the callback leg too, and so the value can't drift between
    // the two legs of the same flow.
    const { state, codeVerifier, redirectUri } = JSON.parse(flowPayload);

    try {
      const client = await loadClient();
      const config = await getConfiguration(authConfig);
      // Validates the `state` and exchanges the code for tokens in one call;
      // throws on state mismatch, an `error` response param, or a failed
      // token exchange (also verifies the ID token's signature/claims).
      // The redirect_uri sent to the token endpoint is derived from
      // currentUrlFor()'s own origin+pathname (see there) - it isn't
      // otherwise possible to pass a different one alongside it.
      const tokens = await client.authorizationCodeGrant(config, currentUrlFor(req, redirectUri), {
        expectedState: state,
        pkceCodeVerifier: codeVerifier,
      });

      const sessionId = createSession(tokens);
      res.setHeader("Set-Cookie", [clearFlowCookie, sessionCookieHeader(sessionId, authConfig.sessionSecret, cookieOpts(req))]);
      res.redirect(redirectTargetFor(redirectUri, authConfig));
    } catch (err) {
      res.setHeader("Set-Cookie", clearFlowCookie);
      return res.status(400).send(`Login failed: ${err.message}`);
    }
  });

  router.get("/session", (req, res) => {
    const sessionId = readSessionId(req, authConfig.sessionSecret);
    res.json({ authenticated: Boolean(getSession(sessionId)) });
  });

  router.get("/logout", async (req, res, next) => {
    const sessionId = readSessionId(req, authConfig.sessionSecret);
    const session = getSession(sessionId);
    destroySession(sessionId);
    res.setHeader("Set-Cookie", clearSessionCookieHeader(cookieOpts(req)));

    const redirectUri = resolveRedirectUri(req, authConfig);

    try {
      const client = await loadClient();
      const config = await getConfiguration(authConfig);
      const endSessionEndpoint = config.serverMetadata().end_session_endpoint;
      if (!endSessionEndpoint) {
        return res.redirect(redirectTargetFor(redirectUri, authConfig));
      }
      const endSessionUrl = client.buildEndSessionUrl(config, {
        post_logout_redirect_uri: derivePostLogoutRedirectUri(authConfig, redirectUri),
        ...(session?.idToken ? { id_token_hint: session.idToken } : {}),
      });
      res.redirect(endSessionUrl.toString());
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = createAuthRouter;
