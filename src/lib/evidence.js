// Read REA's MCP results: Evidence records (structuredContent) or { error } payloads.

export function parseResult(result) {
  if (!result) return { kind: "empty" };
  const texts = (result.content ?? []).filter((c) => c.type === "text").map((c) => c.text);
  let parsedText = null;
  if (texts.length === 1) { try { parsedText = JSON.parse(texts[0]); } catch {} }
  const data = result.structuredContent ?? parsedText;
  if (data?.error) return { kind: "error", error: data.error, data, texts };
  if (result.isError) return { kind: "error", error: { code: "error", message: texts.join("\n") || "The tool reported an error." }, data, texts };
  if (data && (data.evidence_id || data.normalized_result !== undefined)) return { kind: "evidence", evidence: data, data, texts };
  if (data) return { kind: "data", data, texts };
  return { kind: "text", texts };
}

/** Find arrays that read as findings/issues inside a result (bounded depth). */
export function collectLists(value, names = ["findings", "issues", "unknowns", "integrity_contradictions", "warnings"], depth = 0, prefix = "", out = []) {
  if (!value || typeof value !== "object" || depth > 4) return out;
  if (Array.isArray(value)) return out;
  for (const [k, v] of Object.entries(value)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (names.includes(k) && Array.isArray(v) && v.length) out.push({ key: k, path: p, items: v });
    else if (v && typeof v === "object" && !Array.isArray(v)) collectLists(v, names, depth + 1, p, out);
  }
  return out;
}

/** Small scalar facts for a key/value grid (summary, statistics, coverage). */
export function scalarFacts(obj, limit = 24, skip = []) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
  const facts = [];
  const visit = (o, prefix) => {
    for (const [k, v] of Object.entries(o)) {
      if (facts.length >= limit) return;
      if (!prefix && skip.includes(k)) continue;
      const key = prefix ? `${prefix} › ${k}` : k;
      if (v === null || ["string", "number", "boolean"].includes(typeof v)) {
        if (typeof v === "string" && (!v.trim() || v.length > 64 || /^[0-9a-f]{32,}$/i.test(v) || v.startsWith("/"))) continue;
        facts.push([key.replace(/_/g, " "), v]);
      } else if (!Array.isArray(v) && prefix.split(" › ").length < 2) visit(v, key);
    }
  };
  visit(obj, "");
  return facts;
}

export function uniqueLimitations(evidence) {
  const all = [...(evidence?.limitations ?? []), ...(evidence?.normalized_result?.limitations ?? [])];
  return [...new Set(all.filter((x) => typeof x === "string"))];
}

export function formatBytes(n) {
  if (!Number.isFinite(n)) return "";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
}

export function itemText(item) {
  if (item == null) return "";
  if (typeof item !== "object") return String(item);
  return item.message ?? item.description ?? item.summary ?? item.reason ?? item.title ?? item.kind ?? item.code ?? JSON.stringify(item).slice(0, 240);
}
