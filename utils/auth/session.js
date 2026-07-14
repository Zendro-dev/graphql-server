const crypto = require("node:crypto");
const { parseCookies, sign, unsign, serializeCookie } = require("./cookies");
const { loadClient, getConfiguration } = require("./oidc");

const SESSION_COOKIE = "zendro_giql_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days - bounds how long a session can idle before the browser drops the cookie

// Tokens live only in server memory, keyed by an opaque session id - the
// cookie itself carries no token material, just a signed reference to this
// map, so nothing token-shaped is ever visible to browser JS or the cookie
// header itself.
const sessions = new Map();

// Sessions past expiry with no refresh token can never become valid again;
// sweep them so a long-running process doesn't accumulate dead entries.
setInterval(
  () => {
    const now = Date.now();
    for (const [id, session] of sessions) {
      if (!session.refreshToken && session.expiresAt < now) {
        sessions.delete(id);
      }
    }
  },
  10 * 60 * 1000
).unref();

// `tokens` is the raw (snake_case) response from openid-client's token grant
// calls - normalized here into what the rest of this module works with.
function toSessionRecord(tokens) {
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    idToken: tokens.id_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  };
}

function createSession(tokens) {
  const id = crypto.randomUUID();
  sessions.set(id, toSessionRecord(tokens));
  return id;
}

function getSession(id) {
  return id ? sessions.get(id) : undefined;
}

function destroySession(id) {
  if (id) sessions.delete(id);
}

function readSessionId(req, sessionSecret) {
  const cookies = parseCookies(req.headers.cookie);
  const raw = cookies[SESSION_COOKIE];
  return raw ? unsign(raw, sessionSecret) : null;
}

function sessionCookieHeader(id, sessionSecret, { secure } = {}) {
  return serializeCookie(SESSION_COOKIE, sign(id, sessionSecret), {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure,
    maxAge: SESSION_MAX_AGE,
  });
}

function clearSessionCookieHeader({ secure } = {}) {
  return serializeCookie(SESSION_COOKIE, "", {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure,
    maxAge: 0,
  });
}

// Mountable on routes this module doesn't own (e.g. this server's own
// /graphql, /meta_query) so a logged-in browser session transparently
// authenticates those requests too. An explicit Authorization header from
// the client always takes precedence - this only fills in a gap, it never
// overrides what the caller already sent.
//
// By default this only *attaches* a token when one is available - it never
// blocks an anonymous request, since enforcing "must be logged in" is
// usually the downstream API's job (e.g. this server's own ACL). Set
// authConfig.required = true to have this middleware itself reject requests
// that end up with no Authorization header at all (neither an explicit one
// from the caller, nor one derived from a session) - appropriate for a
// GraphiQL deployment that should only ever be usable while logged in.
function attachAuthFromSession(authConfig) {
  return async function (req, res, next) {
    if (!authConfig?.enabled || req.headers.authorization) {
      return next();
    }

    const deny = () => {
      if (!authConfig.required) return next();
      res.status(401).json({ errors: [{ message: "Authentication required." }] });
    };

    const sessionId = readSessionId(req, authConfig.sessionSecret);
    const session = getSession(sessionId);
    if (!session) return deny();

    try {
      if (Date.now() > session.expiresAt - 60_000) {
        if (!session.refreshToken) {
          destroySession(sessionId);
          return deny();
        }
        const client = await loadClient();
        const config = await getConfiguration(authConfig);
        const refreshed = await client.refreshTokenGrant(config, session.refreshToken).catch(() => null);
        if (!refreshed) {
          destroySession(sessionId);
          return deny();
        }
        session.accessToken = refreshed.access_token;
        session.refreshToken = refreshed.refresh_token || session.refreshToken;
        session.idToken = refreshed.id_token || session.idToken;
        session.expiresAt = Date.now() + refreshed.expires_in * 1000;
      }
      req.headers.authorization = `Bearer ${session.accessToken}`;
      next();
    } catch {
      deny();
    }
  };
}

module.exports = {
  SESSION_COOKIE,
  createSession,
  getSession,
  destroySession,
  readSessionId,
  sessionCookieHeader,
  clearSessionCookieHeader,
  attachAuthFromSession,
};
