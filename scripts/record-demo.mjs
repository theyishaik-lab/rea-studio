#!/usr/bin/env node
// Record real REA answers against the samples, for the static demo build.
// Usage: REA_BIN=/path/to/rea npm run record-demo
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ReaConnection } from "../server/rea.js";
import { summarize } from "../server/runs.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const samples = path.join(root, "samples");
const build = path.join(samples, "build");
mkdirSync(build, { recursive: true });
execFileSync("cc", ["-O1", "-o", path.join(build, "hello"), path.join(samples, "hello.c")]);
execFileSync("python3", ["-c", `import py_compile; py_compile.compile(${JSON.stringify(path.join(samples, "greet.py"))}, cfile=${JSON.stringify(path.join(build, "greet.pyc"))})`]);

const S = {
  hello: path.join(build, "hello"),
  pyc: path.join(build, "greet.pyc"),
  js: path.join(samples, "hello-js"),
};
const DEMO_ROOT = "/home/demo/rea-studio";
const sanitize = (s) =>
  s.split(samples).join(`${DEMO_ROOT}/samples`).split(root).join(DEMO_ROOT).split(os.homedir()).join("/home/demo");

const plan = [
  ["analyze_javascript_application", { input_path: S.js }, S.js],
  ["inspect_native_exports", { path: S.hello, detail: "complete" }, S.hello],
  ["inspect_with_objdump", { path: S.hello, operation: "symbols", detail: "complete" }, S.hello],
  ["inspect_with_objdump", { path: S.hello, operation: "section_headers", detail: "complete" }, S.hello],
  ["inspect_elf_notes", { path: S.hello }, S.hello],
  ["inspect_byte_entropy", { path: S.hello, detail: "complete" }, S.hello],
  ["inspect_python_pyc", { path: S.pyc }, S.pyc],
  ["inspect_analysis_settings", {}, null],
  ["inspect_binary_layout", { path: S.hello, detail: "summary" }, S.hello],
];

const rea = new ReaConnection({ reaBin: process.env.REA_BIN, callTimeoutMs: 300_000 });
await rea.connect();
console.log(`Connected to ${rea.server?.name} ${rea.server?.version}, ${rea.tools.length} tools`);

const target = (p) => p && ({ source: "sample", kind: statSync(p).isDirectory() ? "directory" : "file", path: p, name: path.basename(p), size: statSync(p).isDirectory() ? null : statSync(p).size });
const runs = [];
let t = Date.parse("2026-10-29T09:00:00Z");
for (const [tool, args, p] of plan) {
  const started = Date.now();
  const result = await rea.call(tool, args);
  const ms = Date.now() - started;
  console.log(`${tool}: ${result.isError ? "error" : "ok"} in ${ms} ms`);
  delete result._meta;
  const run = { tool, args, target: target(p), status: result.isError ? "error" : "done", isError: Boolean(result.isError), startedAt: new Date(t).toISOString(), endedAt: new Date(t + ms).toISOString(), summary: summarize(result) };
  t -= 5 * 60_000;
  runs.push({ run, result });
}
const sampleList = [
  { label: "hello — small ELF program (C)", ...target(S.hello) },
  { label: "hello-js — tiny Node.js app", ...target(S.js) },
  { label: "greet.pyc — Python bytecode", ...target(S.pyc) },
];
const out = path.join(root, "src/demo");
mkdirSync(out, { recursive: true });
const recordings = JSON.parse(sanitize(JSON.stringify({ recordedWith: rea.server, recordedAt: new Date().toISOString(), samples: sampleList, runs })));
writeFileSync(path.join(out, "recordings.json"), JSON.stringify(recordings));
writeFileSync(path.join(out, "catalog.json"), JSON.stringify({ server: rea.server, note: "Tool names, descriptions and schemas are REA's own (MIT, github.com/morluto/rea).", tools: JSON.parse(sanitize(JSON.stringify(rea.catalog()))) }));
await rea.close();
const leaked = JSON.stringify(recordings).includes(os.homedir());
console.log(`Wrote src/demo (${runs.length} runs). Home path leaked: ${leaked}`);
if (leaked) process.exit(1);
