import crypto from "node:crypto";

/** Hostnames (with port) the UI may be reached under. Blocks DNS-rebinding. */
export function allowedHostSet(config) {
  const p = config.port;
  const hosts = new Set([`localhost:${p}`, `127.0.0.1:${p}`, `[::1]:${p}`]);
  if (config.dev) for (const h of ["localhost:5173", "127.0.0.1:5173"]) hosts.add(h);
  if (config.exposed) hosts.add(`${config.host}:${p}`.toLowerCase());
  for (const h of config.extraHosts) hosts.add(h.includes(":") ? h : `${h}:${p}`);
  return hosts;
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Express middleware:
 *  - Host header must be one we serve (DNS rebinding protection).
 *  - Cross-site requests are refused (Origin must match Host when present).
 *  - Mutating requests need the custom `x-rea-studio` header, which a foreign
 *    page cannot send without a CORS preflight we never answer.
 *  - When a token is configured (always, if bound beyond loopback) every API
 *    call must carry it.
 */
export function securityMiddleware(config) {
  const hosts = allowedHostSet(config);
  return (req, res, next) => {
    const host = String(req.headers.host ?? "").toLowerCase();
    if (!hosts.has(host)) {
      return res.status(421).json({ error: { code: "host_not_allowed", message: `Host ${host || "(none)"} is not allowed. Set REA_STUDIO_ALLOWED_HOSTS to add one.` } });
    }
    const origin = req.headers.origin;
    if (origin) {
      let originHost = "";
      try { originHost = new URL(origin).host.toLowerCase(); } catch {}
      if (!hosts.has(originHost)) {
        return res.status(403).json({ error: { code: "cross_origin", message: "Cross-origin requests are refused." } });
      }
    }
    if (!req.path.startsWith("/api/")) return next();
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.headers["x-rea-studio"] !== "1") {
      return res.status(403).json({ error: { code: "missing_header", message: "Missing x-rea-studio header." } });
    }
    if (config.token) {
      const auth = String(req.headers.authorization ?? "");
      const given = auth.startsWith("Bearer ") ? auth.slice(7) : String(req.query.token ?? "");
      if (!safeEqual(given, config.token)) {
        return res.status(401).json({ error: { code: "unauthorized", message: "A valid REA Studio token is required." } });
      }
    }
    res.setHeader("Cache-Control", "no-store");
    next();
  };
}

export function securityHeaders({ dev = false } = {}) {
  return (_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    // Vite's dev server injects inline scripts, so the strict policy applies to built assets only.
    if (!dev) {
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      );
    }
    next();
  };
}

/** Turn a client-supplied relative path into safe path segments (no traversal). */
export function safeRelativePath(rel) {
  const parts = String(rel ?? "")
    .replace(/\\/g, "/")
    .split("/")
    .filter((s) => s && s !== "." && s !== "..")
    .map((s) => s.replace(/[\x00-\x1f<>:"|?*]/g, "_").slice(0, 200));
  if (!parts.length) throw new Error("Empty file name");
  return parts;
}
