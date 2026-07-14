const crypto = require("node:crypto");

// Minimal cookie parse/sign/serialize, implemented by hand so this doesn't
// depend on the app having cookie-parser (or any other cookie middleware)
// already mounted - attachAuthFromSession can be wired into routes this
// module doesn't own.

function sign(value, secret) {
  const mac = crypto.createHmac("sha256", secret).update(value).digest("base64url");
  return `${value}.${mac}`;
}

function unsign(signed, secret) {
  const lastDot = signed.lastIndexOf(".");
  if (lastDot === -1) return null;
  const value = signed.slice(0, lastDot);
  const mac = signed.slice(lastDot + 1);
  const expectedMac = crypto.createHmac("sha256", secret).update(value).digest("base64url");
  const macBuf = Buffer.from(mac);
  const expectedBuf = Buffer.from(expectedMac);
  if (macBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(macBuf, expectedBuf)) {
    return null;
  }
  return value;
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }
  return out;
}

function serializeCookie(name, value, opts = {}) {
  let str = `${name}=${encodeURIComponent(value)}`;
  if (opts.maxAge != null) str += `; Max-Age=${Math.floor(opts.maxAge)}`;
  str += `; Path=${opts.path || "/"}`;
  if (opts.httpOnly !== false) str += "; HttpOnly";
  str += `; SameSite=${opts.sameSite || "Lax"}`;
  if (opts.secure) str += "; Secure";
  return str;
}

module.exports = { sign, unsign, parseCookies, serializeCookie };
