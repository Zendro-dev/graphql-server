// openid-client is ESM-only; loaded via dynamic import from this CJS module.
let clientPromise;
function loadClient() {
  if (!clientPromise) clientPromise = import("openid-client");
  return clientPromise;
}

// Discovery is an extra round trip to the identity provider, so the
// resulting Configuration (server metadata + JWKS) is cached per issuer -
// every login/callback/refresh/logout reuses it instead of re-discovering.
const configCache = new Map();

// Endpoints this server calls itself (token exchange, ID-token signature
// verification) - these need to be reachable from here, so they're rewritten
// to the internal origin below. Endpoints the *browser* is redirected to
// (authorization_endpoint, end_session_endpoint, ...) are deliberately left
// untouched - the browser can't resolve the internal hostname either.
const SERVER_TO_SERVER_ENDPOINTS = [
  "token_endpoint",
  "jwks_uri",
  "userinfo_endpoint",
  "introspection_endpoint",
  "revocation_endpoint",
  "device_authorization_endpoint",
  "pushed_authorization_request_endpoint",
];

// Fetches the discovery document from issuerInternalUri (network-reachable)
// and builds a Configuration directly from it via the constructor, instead
// of using discovery()'s own HTTP layer against issuerUri (which would be
// unreachable). Used for identity providers whose *issuer* (and other
// browser-facing URLs) is a fixed public hostname that isn't reachable from
// here - e.g. Keycloak in Docker Compose, where OAUTH2_ISSUER_URI is the
// host's published port. That hostname is fixed (KC_HOSTNAME set explicitly)
// precisely so the issuer claim always matches it regardless of how Keycloak
// was reached - which also means Keycloak's "dynamic hostname" backchannel
// resolution (reporting whichever host was used to reach it) never kicks in,
// and every endpoint in the discovered metadata still points at the public
// origin even when fetched via the internal one. Reachable-from-here
// endpoints are rewritten to the internal origin explicitly below.
async function discoverVia(client, authConfig) {
  const discoveryUrl = new URL(".well-known/openid-configuration", authConfig.issuerInternalUri.replace(/\/?$/, "/"));
  const res = await fetch(discoveryUrl);
  if (!res.ok) throw new Error(`discovery request to ${discoveryUrl} failed with ${res.status} ${res.statusText}`);
  const metadata = await res.json();
  if (metadata.issuer !== authConfig.issuerUri) {
    throw new Error(`discovered issuer "${metadata.issuer}" does not match the expected issuerUri "${authConfig.issuerUri}"`);
  }
  const publicOrigin = new URL(authConfig.issuerUri).origin;
  const internalOrigin = new URL(authConfig.issuerInternalUri).origin;
  for (const key of SERVER_TO_SERVER_ENDPOINTS) {
    if (typeof metadata[key] === "string" && metadata[key].startsWith(publicOrigin)) {
      metadata[key] = internalOrigin + metadata[key].slice(publicOrigin.length);
    }
  }
  const config = new client.Configuration(metadata, authConfig.clientId, authConfig.clientSecret);
  if (new URL(authConfig.issuerInternalUri).protocol === "http:") client.allowInsecureRequests(config);
  return config;
}

async function getConfiguration(authConfig) {
  const cacheKey = `${authConfig.issuerUri}::${authConfig.clientId}`;
  if (!configCache.has(cacheKey)) {
    configCache.set(
      cacheKey,
      (async () => {
        const client = await loadClient();
        if (authConfig.issuerInternalUri) return discoverVia(client, authConfig);
        const issuer = new URL(authConfig.issuerUri);
        // http:// issuers (local/dev Keycloak) are otherwise rejected outright.
        const options = issuer.protocol === "http:" ? { execute: [client.allowInsecureRequests] } : undefined;
        return client.discovery(issuer, authConfig.clientId, authConfig.clientSecret, undefined, options);
      })()
    );
  }
  try {
    return await configCache.get(cacheKey);
  } catch (err) {
    // Don't let a transient discovery failure (e.g. IdP briefly unreachable)
    // permanently poison the cache - let the next call retry.
    configCache.delete(cacheKey);
    throw err;
  }
}

module.exports = { loadClient, getConfiguration };
