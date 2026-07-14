const crypto = require("node:crypto");
const http = require("node:http");

// A minimal OpenID Provider for tests: serves discovery metadata, a JWKS,
// and a token endpoint that issues a real RS256-signed ID token (so
// openid-client's signature verification actually exercises something real,
// not just a stub it happens to trust) plus opaque access/refresh tokens.
// publicIssuer: simulates an identity provider (like Keycloak with
// KC_HOSTNAME_BACKCHANNEL_DYNAMIC) whose issuer/authorization_endpoint are a
// fixed public hostname unreachable from the caller, while token_endpoint/
// jwks_uri dynamically reflect whatever address actually reached it - the
// discovery document is only ever served correctly to whoever fetches it
// from this fake server's own (internal) address.
async function startFakeIdp({ publicIssuer } = {}) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const kid = "test-key-1";
  const jwk = publicKey.export({ format: "jwk" });
  jwk.kid = kid;
  jwk.alg = "RS256";
  jwk.use = "sig";

  let issuer;
  let tokenMode = "ok"; // "ok" | "error"
  const tokenRequests = [];

  function signIdToken(clientId) {
    const header = { alg: "RS256", typ: "JWT", kid };
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: publicIssuer || issuer,
      aud: clientId,
      sub: "test-user-id",
      preferred_username: "test-user",
      iat: now,
      exp: now + 300,
    };
    const encHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
    const encPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = crypto.sign("RSA-SHA256", Buffer.from(`${encHeader}.${encPayload}`), privateKey);
    return `${encHeader}.${encPayload}.${signature.toString("base64url")}`;
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, issuer);

    if (url.pathname === "/.well-known/openid-configuration") {
      const frontchannel = publicIssuer || issuer;
      res.setHeader("Content-Type", "application/json");
      return res.end(
        JSON.stringify({
          issuer: frontchannel,
          authorization_endpoint: `${frontchannel}/protocol/openid-connect/auth`,
          token_endpoint: `${issuer}/protocol/openid-connect/token`,
          end_session_endpoint: `${frontchannel}/protocol/openid-connect/logout`,
          jwks_uri: `${issuer}/protocol/openid-connect/certs`,
          response_types_supported: ["code"],
          subject_types_supported: ["public"],
          id_token_signing_alg_values_supported: ["RS256"],
          token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
        })
      );
    }

    if (url.pathname === "/protocol/openid-connect/certs") {
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ keys: [jwk] }));
    }

    if (url.pathname === "/protocol/openid-connect/token" && req.method === "POST") {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const params = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
        // Real identity providers strictly validate that redirect_uri here
        // matches what was sent at authorization time - this fake one
        // doesn't (it has no notion of "what was sent then" to check
        // against), so it only records it for tests to assert on directly,
        // rather than silently accepting whatever the client happens to send.
        tokenRequests.push(Object.fromEntries(params));
        res.setHeader("Content-Type", "application/json");
        if (tokenMode === "error") {
          res.statusCode = 400;
          return res.end(JSON.stringify({ error: "invalid_grant", error_description: "fake token failure" }));
        }
        res.end(
          JSON.stringify({
            access_token: `fake-access-token-for-${params.get("grant_type")}`,
            refresh_token: "fake-refresh-token",
            id_token: signIdToken(params.get("client_id")),
            token_type: "Bearer",
            expires_in: 3600,
          })
        );
      });
      return;
    }

    res.statusCode = 404;
    res.end("not found");
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  issuer = `http://localhost:${port}`;

  return {
    server,
    issuer,
    tokenRequests,
    setTokenMode: (mode) => {
      tokenMode = mode;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

module.exports = { startFakeIdp };
