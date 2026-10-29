import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/index.js";
import { loadConfig } from "../server/config.js";

// A stand-in for the REA MCP connection, so the API can be tested without REA installed.
const fakeRea = {
  tools: [{ name: "inspect_byte_entropy", title: "Inspect Byte Entropy", description: "d", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] }, annotations: {} }],
  status() { return { state: "ready", server: { name: "rea", version: "test" }, toolCount: 1, launch: { via: "test", command: "fake" } }; },
  async connect() {},
  catalog() { return this.tools; },
  tool(n) { return this.tools.find((t) => t.name === n) ?? null; },
  async call(name, args, { onProgress }) {
    onProgress?.({ progress: 1, total: 2 });
    const body = await readFile(args.path, "utf8");
    return { structuredContent: { evidence_id: "ev_test", subject: { name: path.basename(args.path) }, operation: name, normalized_result: { length: body.length, limitations: ["test"] }, confidence: "observed", limitations: ["test"] }, content: [] };
  },
};

let dir, server, base;
before(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "rea-studio-test-"));
  const config = { ...loadConfig([], {}), dataDir: dir, port: 0 };
  const { app } = await createApp(config, { rea: fakeRea });
  server = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
  config.port = server.address().port;
  base = `http://127.0.0.1:${config.port}`;
  // security middleware read the port at creation: rebuild with the real port
  server.close();
  const again = await createApp({ ...config }, { rea: fakeRea });
  server = await new Promise((r) => { const s = again.app.listen(config.port, "127.0.0.1", () => r(s)); });
});
after(async () => { server?.close(); await rm(dir, { recursive: true, force: true }); });

const H = { "x-rea-studio": "1" };

test("lists tools", async () => {
  const r = await fetch(`${base}/api/tools`).then((x) => x.json());
  assert.equal(r.tools[0].name, "inspect_byte_entropy");
});

test("refuses foreign hosts, foreign origins and header-less writes", async () => {
  const http = await import("node:http");
  const status = (opts) => new Promise((res) => http.request({ host: "127.0.0.1", port: new URL(base).port, ...opts }, (r) => { r.resume(); res(r.statusCode); }).end());
  assert.equal(await status({ path: "/api/status", headers: { host: "attacker.example:80" } }), 421);
  assert.equal(await status({ path: "/api/connect", method: "POST" }), 403);
  assert.equal(await status({ path: "/api/connect", method: "POST", headers: { ...H, origin: "https://attacker.example" } }), 403);
  assert.equal(await status({ path: "/api/connect", method: "POST", headers: H }), 200);
});

test("upload, run and read the result", async () => {
  const up = await fetch(`${base}/api/uploads?relpath=${encodeURIComponent("../../x/sample.txt")}`, { method: "PUT", headers: H, body: "hello world" }).then((r) => r.json());
  assert.ok(up.path.startsWith(path.join(dir, "uploads")), "upload stays inside the data folder");
  assert.equal(up.size, 11);
  const run = await fetch(`${base}/api/runs`, { method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ tool: "inspect_byte_entropy", args: { path: up.path } }) }).then((r) => r.json());
  let done;
  for (let i = 0; i < 50; i++) {
    done = await fetch(`${base}/api/runs/${run.id}`).then((r) => r.json());
    if (done.status !== "running") break;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.equal(done.status, "done");
  assert.equal(done.result.structuredContent.normalized_result.length, 11);
  const list = await fetch(`${base}/api/runs`).then((r) => r.json());
  assert.equal(list.runs.length, 1);
});

test("unknown tools are rejected", async () => {
  const r = await fetch(`${base}/api/runs`, { method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ tool: "nope", args: {} }) });
  assert.equal(r.status, 404);
});

test("a token is required when configured", async () => {
  const config = { ...loadConfig([], {}), dataDir: dir, port: 0, token: "s3cret" };
  const { app } = await createApp(config, { rea: fakeRea });
  const s = await new Promise((r) => { const x = app.listen(0, "127.0.0.1", () => r(x)); });
  const port = s.address().port;
  config.port = port; // allowed host set uses config.port at creation; use a fresh app
  s.close();
  const { app: app2 } = await createApp(config, { rea: fakeRea });
  const s2 = await new Promise((r) => { const x = app2.listen(port, "127.0.0.1", () => r(x)); });
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/status`)).status, 401);
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/status`, { headers: { authorization: "Bearer s3cret" } })).status, 200);
  s2.close();
});
