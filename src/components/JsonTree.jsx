import React, { useState } from "react";

const PAGE = 100;

function isFlatObject(v) {
  return v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every((x) => x === null || typeof x !== "object" || (Array.isArray(x) && x.length === 0));
}

function Scalar({ value }) {
  if (value === null) return <span className="j-null">null</span>;
  if (typeof value === "string") return <span className="j-str" dir="auto">{value.length > 400 ? value.slice(0, 400) + "…" : value}</span>;
  if (typeof value === "number") return <span className="j-num">{value}</span>;
  if (typeof value === "boolean") return <span className="j-bool">{String(value)}</span>;
  return <span>{String(value)}</span>;
}

function cell(v) {
  if (v === null || v === undefined) return <span className="j-null">—</span>;
  if (Array.isArray(v)) return <span className="muted">[{v.length}]</span>;
  if (typeof v === "object") { const j = JSON.stringify(v); return <code className="muted" title={j.slice(0, 2000)}>{j.length > 60 ? j.slice(0, 60) + "…" : j}</code>; }
  if (typeof v === "string" && /^[0-9a-f]{40,}$/i.test(v)) return <code title={v}>{v.slice(0, 12)}…</code>;
  return <Scalar value={v} />;
}

/** An array of flat objects reads best as a table. */
export function ObjectTable({ rows }) {
  const [shown, setShown] = useState(PAGE);
  const cols = [...new Set(rows.slice(0, 200).flatMap((r) => Object.keys(r)))].slice(0, 10);
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{cols.map((c) => <th key={c}>{c.replace(/_/g, " ")}</th>)}</tr></thead>
        <tbody>
          {rows.slice(0, shown).map((r, i) => (
            <tr key={i}>{cols.map((c) => <td key={c}>{cell(r[c])}</td>)}</tr>
          ))}
        </tbody>
      </table>
      {rows.length > shown && <button className="link" onClick={() => setShown(shown + PAGE)}>Show {Math.min(PAGE, rows.length - shown)} more of {rows.length - shown}</button>}
    </div>
  );
}

export function JsonNode({ name, value, depth = 0, defaultOpen }) {
  const isObj = value && typeof value === "object";
  const [open, setOpen] = useState(defaultOpen ?? depth < 1);
  const [shown, setShown] = useState(PAGE);
  if (!isObj) {
    return (
      <div className="j-row">
        {name !== undefined && <span className="j-key">{name}</span>}
        <Scalar value={value} />
      </div>
    );
  }
  const entries = Array.isArray(value) ? value.map((v, i) => [i, v]) : Object.entries(value);
  const label = Array.isArray(value) ? `[${value.length}]` : `{${entries.length}}`;
  const asTable = Array.isArray(value) && value.length > 1 && value.every(isFlatObject);
  return (
    <div className="j-node">
      <button className="j-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="chev" aria-hidden="true">{open ? "▾" : "▸"}</span>
        {name !== undefined && <span className="j-key">{name}</span>}
        <span className="muted">{label}</span>
      </button>
      {open && (
        <div className="j-children">
          {entries.length === 0 && <div className="muted j-row">empty</div>}
          {asTable ? <ObjectTable rows={value} /> : (
            <>
              {entries.slice(0, shown).map(([k, v]) => <JsonNode key={k} name={k} value={v} depth={depth + 1} />)}
              {entries.length > shown && <button className="link" onClick={() => setShown(shown + PAGE)}>Show more ({entries.length - shown} left)</button>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
