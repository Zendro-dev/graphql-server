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

// Fetches the discovery document from issuerInternalUri (network-reachable)
// and builds a Configuration directly from it via the constructor, instead
// of using discovery()'s own HTTP layer against issuerUri (which would be
// unreachable). Used for identity providers whose *issuer* (and other
// browser-facing URLs) is a fixed public hostname that isn't reachable from
// here - e.g. Keycloak in Docker Compose, where OAUTH2_ISSUER_URI is the
// host's published port (matching what Keycloak's fixed KC_HOSTNAME always
// reports as its issuer, regardless of how it's reached) but this server
// must actually connect via the internal service hostname. Keycloak's
// "backchannel dynamic hostname" support means server-to-server endpoints
// (token_endpoint, jwks_uri) in the discovered metadata already come back
// pointing at whichever hostname was used to reach it here - so once
// fetched, no further connection redirection is needed.
async function discoverVia(client, authConfig) {
  const discoveryUrl = new URL(".well-known/openid-configuration", authConfig.issuerInternalUri.replace(/\/?$/, "/"));
  const res = await fetch(discoveryUrl);
  if (!res.ok) throw new Error(`discovery request to ${discoveryUrl} failed with ${res.status} ${res.statusText}`);
  const metadata = await res.json();
  if (metadata.issuer !== authConfig.issuerUri) {
    throw new Error(`discovered issuer "${metadata.issuer}" does not match the expected issuerUri "${authConfig.issuerUri}"`);
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
