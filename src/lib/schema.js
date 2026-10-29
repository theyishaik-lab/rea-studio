// Turn a JSON Schema (as REA advertises it over MCP) into simple form fields.

const PATH_KEYS = /^(path|input_path|artifact_path|file|file_path|binary_path|target_path|apk_path|archive_path|bundle_path|application_path|app_path|database_path|capture_path|source_path)$/;

export function isPathField(name, schema = {}) {
  if (PATH_KEYS.test(name)) return true;
  const d = String(schema.description ?? "").toLowerCase();
  return schema.type === "string" && /(absolute|filesystem|local) (file |filesystem )?path/.test(d) && !/director(y|ies) (to|for) (write|output)/.test(d);
}

/** Collapse anyOf/oneOf of string enums/consts into one enum. */
function flattenChoices(schema) {
  const alts = schema.anyOf ?? schema.oneOf;
  if (!Array.isArray(alts)) return null;
  const values = [];
  for (const a of alts) {
    if (a.const !== undefined && typeof a.const !== "object") values.push(a.const);
    else if (Array.isArray(a.enum)) values.push(...a.enum.filter((v) => typeof v !== "object"));
    else return null;
  }
  return values.length ? values : null;
}

export function fieldKind(schema = {}) {
  const choices = Array.isArray(schema.enum) ? schema.enum : flattenChoices(schema);
  if (choices) return { kind: "enum", choices };
  if (schema.const !== undefined) return { kind: "enum", choices: [schema.const] };
  const t = Array.isArray(schema.type) ? schema.type.filter((x) => x !== "null") : [schema.type];
  if (t.length === 1) {
    switch (t[0]) {
      case "string": return { kind: "string" };
      case "integer": return { kind: "integer" };
      case "number": return { kind: "number" };
      case "boolean": return { kind: "boolean" };
      case "array": {
        const it = schema.items ?? {};
        if (it.type === "string" && !it.enum) return { kind: "string-list" };
        if (it.type === "integer" || it.type === "number") return { kind: "number-list" };
        return { kind: "json", hint: "[]" };
      }
      case "object": return { kind: "json", hint: "{}" };
    }
  }
  return { kind: "json", hint: "" };
}

export function fieldsFor(inputSchema = {}) {
  const props = inputSchema.properties ?? {};
  const required = new Set(inputSchema.required ?? []);
  const fields = Object.entries(props).map(([name, schema]) => ({
    name,
    schema,
    required: required.has(name),
    path: isPathField(name, schema),
    label: name.replace(/_/g, " "),
    description: schema.description ?? "",
    ...fieldKind(schema),
  }));
  // Required first, then path-like, then the rest in schema order.
  return fields.sort((a, b) => (b.required - a.required) || (b.path - a.path));
}

/** Convert raw form strings into typed arguments. Throws with a field name on bad input. */
export function buildArgs(fields, values) {
  const args = {};
  for (const f of fields) {
    const raw = values[f.name];
    if (raw === undefined || raw === "" || raw === null) {
      if (f.required) throw Object.assign(new Error(`“${f.label}” is required`), { field: f.name });
      continue;
    }
    switch (f.kind) {
      case "integer":
      case "number": {
        const n = Number(raw);
        if (!Number.isFinite(n) || (f.kind === "integer" && !Number.isInteger(n))) throw Object.assign(new Error(`“${f.label}” must be ${f.kind === "integer" ? "a whole number" : "a number"}`), { field: f.name });
        args[f.name] = n;
        break;
      }
      case "boolean": args[f.name] = raw === true || raw === "true"; break;
      case "enum": {
        const match = f.choices.find((c) => String(c) === String(raw));
        args[f.name] = match ?? raw;
        break;
      }
      case "string-list":
        args[f.name] = String(raw).split(/\n/).map((s) => s.trim()).filter(Boolean);
        break;
      case "number-list":
        args[f.name] = String(raw).split(/[\s,]+/).filter(Boolean).map(Number);
        break;
      case "json":
        try { args[f.name] = JSON.parse(raw); } catch { throw Object.assign(new Error(`“${f.label}” must be valid JSON`), { field: f.name }); }
        break;
      default: args[f.name] = String(raw);
    }
  }
  return args;
}

/** Fill every empty path-like field with the selected target. */
export function applyTarget(fields, values, targetPath, previousPath) {
  const next = { ...values };
  for (const f of fields) {
    if (!f.path || f.kind !== "string") continue;
    const followsTarget = !next[f.name] || (previousPath && next[f.name] === previousPath);
    if (followsTarget) next[f.name] = targetPath ?? "";
  }
  return next;
}
