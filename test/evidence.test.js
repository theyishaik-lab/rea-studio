import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collectLists, parseResult, uniqueLimitations } from "../src/lib/evidence.js";

const rec = JSON.parse(readFileSync(new URL("../src/demo/recordings.json", import.meta.url)));

test("recorded REA results parse as evidence or errors", () => {
  assert.ok(rec.runs.length >= 5);
  for (const { run, result } of rec.runs) {
    const p = parseResult(result);
    if (run.isError) assert.equal(p.kind, "error", run.tool);
    else assert.ok(["evidence", "data"].includes(p.kind), run.tool);
    if (p.kind === "evidence") assert.ok(uniqueLimitations(p.evidence).length > 0, `${run.tool} has limitations`);
    if (p.kind === "error") assert.ok(p.error.message.length > 0);
  }
});

test("collectLists finds nested findings", () => {
  const lists = collectLists({ a: { findings: [{ message: "x" }] }, issues: [] });
  assert.deepEqual(lists.map((l) => l.path), ["a.findings"]);
});

test("demo data carries no local home paths", () => {
  const text = readFileSync(new URL("../src/demo/recordings.json", import.meta.url), "utf8");
  assert.ok(!/\/home\/(?!demo\b)[a-z0-9_-]+\//i.test(text));
});
