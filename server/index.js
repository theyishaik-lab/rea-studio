#!/usr/bin/env node
import express from "express";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { ReaConnection } from "./rea.js";
import { RunStore } from "./runs.js";
import { safeRelativePath, securityHeaders, securityMiddleware } from "./security.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function createApp(config, { rea, runs } = {}) {
  rea ??= new ReaConnection({ reaBin: config.reaBin, callTimeoutMs: config.callTimeoutMs });
  runs ??= new RunStore({ dataDir: config.dataDir, limit: config.historyLimit });
  await runs.init();
  const uploadsDir = path.join(config.dataDir, "uploads");
  await mkdir(uploadsDir, { recursive: true });

  const app = express();
  app.disable("x-powered-by");
  app.use(securityHeaders({ dev: config.dev }));
  app.use(securityMiddleware(config));
  app.use("/api", express.json({ limit: "5mb" }));

  const api = express.Router();

  api.get("/status", (_req, res) => {
    res.json({ ...rea.status(), mode: "local", exposed: config.exposed, dataDir: config.dataDir });
  });

  api.post("/connect", async (_req, res) => {
    try { await rea.connect(); } catch {}
    res.json(rea.status());
  });

  api.get("/tools", async (_req, res) => {
    try {
      await rea.connect();
      res.json({ server: rea.server, tools: rea.catalog() });
    } catch (err) {
      res.status(503).json({ error: { code: "rea_unavailable", message: String(err?.message ?? err), status: rea.status() } });
    }
  });

  api.get("/tools/:name", (req, res) => {
    const tool = rea.tool(req.params.name);
    if (!tool) return res.status(404).json({ error: { code: "unknown_tool", message: "No such tool." } });
    res.json(tool);
  });

  // Upload one file (raw body). Files of one folder share ?batch= and carry ?relpath=.
  api.put("/uploads", async (req, res) => {
    try {
      const batch = /^[0-9a-f-]{36}$/.test(String(req.query.batch ?? "")) ? String(req.query.batch) : randomUUID();
      const parts = safeRelativePath(req.query.relpath ?? req.query.filename ?? "upload.bin");
      const batchDir = path.join(uploadsDir, batch);
      const dest = path.join(batchDir, ...parts);
      if (!dest.startsWith(batchDir + path.sep)) throw new Error("Bad path");
      await mkdir(path.dirname(dest), { recursive: true });
      const hash = createHash("sha256");
      let size = 0;
      const meter = new Transform({
        transform(chunk, _enc, cb) {
          size += chunk.length;
          if (size > config.maxUploadBytes) return cb(new Error(`Upload exceeds ${config.maxUploadBytes} bytes (REA_STUDIO_MAX_UPLOAD_MB)`));
          hash.update(chunk);
          cb(null, chunk);
        },
      });
      await pipeline(req, meter, createWriteStream(dest, { mode: 0o600 }));
      res.json({ batch, path: dest, root: path.join(batchDir, parts[0]), batchDir, name: parts.at(-1), size, sha256: hash.digest("hex") });
    } catch (err) {
      res.status(400).json({ error: { code: "upload_failed", message: String(err?.message ?? err) } });
    }
  });

  // Download a URL into the uploads folder so file-based tools can read it.
  api.post("/fetch-url", async (req, res) => {
    try {
      const url = new URL(String(req.body?.url ?? ""));
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only http(s) URLs are supported.");
      const resp = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(120_000) });
      if (!resp.ok || !resp.body) throw new Error(`Download failed: HTTP ${resp.status}`);
      const declared = Number(resp.headers.get("content-length") ?? 0);
      if (declared > config.maxUploadBytes) throw new Error("File is larger than REA_STUDIO_MAX_UPLOAD_MB.");
      const name = safeRelativePath(decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? "") || "download.bin").at(-1);
      const batch = randomUUID();
      const dest = path.join(uploadsDir, batch, name);
      await mkdir(path.dirname(dest), { recursive: true });
      const hash = createHash("sha256");
      let size = 0;
      const meter = new Transform({
        transform(chunk, _enc, cb) {
          size += chunk.length;
          if (size > config.maxUploadBytes) return cb(new Error("File is larger than REA_STUDIO_MAX_UPLOAD_MB."));
          hash.update(chunk);
          cb(null, chunk);
        },
      });
      const { Readable } = await import("node:stream");
      await pipeline(Readable.fromWeb(resp.body), meter, createWriteStream(dest, { mode: 0o600 }));
      res.json({ batch, path: dest, root: dest, name, size, sha256: hash.digest("hex"), url: url.href });
    } catch (err) {
      res.status(400).json({ error: { code: "fetch_failed", message: String(err?.message ?? err) } });
    }
  });

  api.post("/check-path", async (req, res) => {
    const p = String(req.body?.path ?? "");
    if (!path.isAbsolute(p)) return res.json({ exists: false, message: "Use an absolute path." });
    try {
      const s = await stat(p);
      res.json({ exists: true, path: p, kind: s.isDirectory() ? "directory" : "file", size: s.size });
    } catch {
      res.json({ exists: false, path: p, message: "Not found on this machine." });
    }
  });

  api.delete("/uploads/:batch", async (req, res) => {
    if (!/^[0-9a-f-]{36}$/.test(req.params.batch)) return res.status(400).end();
    await rm(path.join(uploadsDir, req.params.batch), { recursive: true, force: true });
    res.json({ ok: true });
  });

  api.get("/runs", (_req, res) => res.json({ runs: runs.list() }));

  api.post("/runs", async (req, res) => {
    const { tool, args, target } = req.body ?? {};
    if (typeof tool !== "string" || !tool) return res.status(400).json({ error: { code: "bad_request", message: "tool is required" } });
    if (args != null && (typeof args !== "object" || Array.isArray(args))) return res.status(400).json({ error: { code: "bad_request", message: "args must be an object" } });
    try { await rea.connect(); } catch (err) {
      return res.status(503).json({ error: { code: "rea_unavailable", message: String(err?.message ?? err) } });
    }
    if (!rea.tool(tool)) return res.status(404).json({ error: { code: "unknown_tool", message: `REA has no tool named ${tool}.` } });
    const run = runs.start(tool, args ?? {}, target, (opts) => rea.call(tool, args ?? {}, opts));
    res.status(202).json(run);
  });

  api.get("/runs/:id", async (req, res) => {
    const run = runs.get(req.params.id);
    if (!run) return res.status(404).json({ error: { code: "unknown_run", message: "No such run." } });
    res.json({ ...run, result: run.status === "running" ? null : await runs.result(run.id) });
  });

  // Server-sent events: progress, then the finished run.
  api.get("/runs/:id/events", (req, res) => {
    const run = runs.get(req.params.id);
    if (!run) return res.status(404).end();
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
    const send = (r) => {
      res.write(`event: ${r.status === "running" ? "progress" : "end"}\ndata: ${JSON.stringify(r)}\n\n`);
      if (r.status !== "running") res.end();
    };
    send(run);
    if (run.status !== "running") return;
    const listener = (r) => send(r);
    runs.on(`run:${run.id}`, listener);
    const ping = setInterval(() => res.write(": ping\n\n"), 15_000);
    req.on("close", () => { clearInterval(ping); runs.off(`run:${run.id}`, listener); });
  });

  api.post("/runs/:id/cancel", (req, res) => res.json({ cancelled: runs.cancel(req.params.id) }));
  api.delete("/runs", async (_req, res) => { await runs.clear(); res.json({ ok: true }); });

  app.use("/api", api);
  app.use("/api", (_req, res) => res.status(404).json({ error: { code: "not_found", message: "Unknown endpoint." } }));

  if (config.dev) {
    const { createServer } = await import("vite");
    const vite = await createServer({ root, server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const dist = path.join(root, "dist");
    if (!existsSync(path.join(dist, "index.html"))) {
      app.get("/", (_req, res) => res.type("text").send("The web UI is not built yet. Run `npm run build` (or `npm start`)."));
    }
    app.use(express.static(dist, { index: "index.html", maxAge: "1h" }));
    app.get(/^\/(?!api\/).*/, (_req, res, next) => {
      const index = path.join(dist, "index.html");
      existsSync(index) ? res.sendFile(index) : next();
    });
  }
  return { app, rea, runs };
}

async function main() {
  const config = loadConfig();
  if (config.exposed && !config.token) {
    config.token = randomBytes(24).toString("base64url");
    console.warn("\n⚠  REA Studio is listening beyond localhost. Anyone who can reach this port and holds the token can run REA's analysis tools on files on this machine.");
    console.warn("   A one-time access token was generated. Set REA_STUDIO_TOKEN to choose your own.\n");
  }
  const { app, rea } = await createApp(config);
  const server = app.listen(config.port, config.host, () => {
    const shownHost = config.host.includes(":") ? `[${config.host}]` : config.host;
    const url = `http://${shownHost}:${config.port}/${config.token ? `?token=${config.token}` : ""}`;
    console.log(`REA Studio ${config.dev ? "(dev) " : ""}is running at ${url}`);
    console.log(`REA launch: ${rea.status().launch.command}  (${rea.status().launch.via})`);
    console.log(`Data folder (history, uploads): ${config.dataDir}`);
  });
  rea.connect().then(
    () => console.log(`Connected to ${rea.server?.name ?? "REA"} ${rea.server?.version ?? ""} — ${rea.tools.length} tools.`),
    (err) => console.error(`Could not start REA yet: ${err?.message ?? err}\nREA Studio keeps running; fix the launch (see README) and press Reconnect.`),
  );
  const shutdown = async () => { server.close(); await rea.close(); process.exit(0); };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
