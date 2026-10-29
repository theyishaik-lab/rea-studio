import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTarget, buildArgs, fieldsFor, isPathField } from "../src/lib/schema.js";

const schema = {
  type: "object",
  properties: {
    detail: { anyOf: [{ type: "string", const: "complete" }, { type: "string", const: "summary" }] },
    path: { type: "string", description: "Absolute filesystem path to the selected binary" },
    block_size: { type: "integer", minimum: 256 },
    columns: { type: "array", items: { type: "string" } },
    view: { type: "object" },
    follow: { type: "boolean" },
  },
  required: ["path"],
};

test("fields: required/path first, anyOf consts become an enum", () => {
  const f = fieldsFor(schema);
  assert.equal(f[0].name, "path");
  assert.equal(f[0].path, true);
  const detail = f.find((x) => x.name === "detail");
  assert.equal(detail.kind, "enum");
  assert.deepEqual(detail.choices, ["complete", "summary"]);
  assert.equal(f.find((x) => x.name === "columns").kind, "string-list");
  assert.equal(f.find((x) => x.name === "view").kind, "json");
});

test("buildArgs types values and enforces required fields", () => {
  const f = fieldsFor(schema);
  assert.throws(() => buildArgs(f, {}), /required/);
  const args = buildArgs(f, { path: "/tmp/a", block_size: "4096", columns: "a\nb\n", view: '{"kind":"summary"}', follow: "true", detail: "" });
  assert.deepEqual(args, { path: "/tmp/a", block_size: 4096, columns: ["a", "b"], view: { kind: "summary" }, follow: true });
  assert.throws(() => buildArgs(f, { path: "/x", block_size: "1.5" }), /whole number/);
  assert.throws(() => buildArgs(f, { path: "/x", view: "{" }), /JSON/);
});

test("target fills path fields and follows target changes", () => {
  const f = fieldsFor(schema);
  let v = applyTarget(f, {}, "/a");
  assert.equal(v.path, "/a");
  v = applyTarget(f, v, "/b", "/a");
  assert.equal(v.path, "/b");
  v = applyTarget(f, { path: "/custom" }, "/c", "/b");
  assert.equal(v.path, "/custom");
  assert.equal(isPathField("input_path", { type: "string" }), true);
  assert.equal(isPathField("output_directory", { type: "string", description: "Directory to write outputs" }), false);
});
