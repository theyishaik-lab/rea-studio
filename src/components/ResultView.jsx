import React, { useMemo, useState } from "react";
import { collectLists, itemText, parseResult, scalarFacts, uniqueLimitations, formatBytes } from "../lib/evidence.js";
import { JsonNode, ObjectTable } from "./JsonTree.jsx";

const RAW_LIMIT = 300_000;

function Facts({ facts }) {
  if (!facts.length) return null;
  return (
    <dl className="facts">
      {facts.map(([k, v]) => (
        <div key={k}><dt>{k}</dt><dd dir="auto">{v === null ? "—" : typeof v === "boolean" ? (v ? "yes" : "no") : String(v)}</dd></div>
      ))}
    </dl>
  );
}

function Copy({ text, label = "Copy" }) {
  const [done, setDone] = useState(false);
  return (
    <button className="btn ghost small" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1200); } catch {} }}>
      {done ? "Copied" : label}
    </button>
  );
}

function primaryTables(nr) {
  if (!nr || typeof nr !== "object") return [];
  const skip = new Set(["limitations", "unknowns", "issues", "findings", "integrity_contradictions"]);
  const isRows = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => x && typeof x === "object" && !Array.isArray(x));
  const out = [];
  for (const [k, v] of Object.entries(nr)) {
    if (skip.has(k)) continue;
    if (isRows(v)) out.push([k, v]);
    else if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v)) if (!skip.has(k2) && isRows(v2)) out.push([`${k} › ${k2}`, v2]);
    }
  }
  return out.slice(0, 3);
}

function textBlocks(nr) {
  if (!nr || typeof nr !== "object") return [];
  return Object.entries(nr).filter(([, v]) => typeof v === "string" && v.trim() && v.includes("\n"));
}

function EvidenceOverview({ ev }) {
  const nr = ev.normalized_result ?? {};
  const limitations = uniqueLimitations(ev);
  const lists = collectLists(nr);
  const unknowns = Array.isArray(nr.unknowns) ? nr.unknowns : [];
  let glance = [
    ...scalarFacts(nr.statistics, 12),
    ...scalarFacts(nr.summary, 16, ["artifact"]),
    ...(nr.summary || nr.statistics ? [] : scalarFacts(nr, 12, ["artifact", "coverage", "format", "architecture", "limitations"])),
  ];
  // With many facts, empty ones (0 / no / —) are noise; they stay available in Explore.
  if (glance.length > 8) glance = glance.filter(([, v]) => v !== 0 && v !== false && v !== null).slice(0, 16);
  const coverage = nr.coverage && typeof nr.coverage === "object" ? scalarFacts(nr.coverage, 8) : [];
  const sha = ev.subject?.digest?.sha256 ?? nr.artifact?.sha256;
  const tables = primaryTables(nr);
  return (
    <div className="overview">
      <div className="subject">
        <div className="min0">
          <div className="eyebrow">Subject</div>
          <div className="subject-name" dir="auto">{ev.subject?.name ?? nr.artifact?.path?.split("/").at(-1) ?? "—"}</div>
          {sha && <code className="small muted ellipsis block" title={sha}>sha256 {sha}</code>}
        </div>
        <div className="chips">
          {(ev.subject?.format || nr.format) && <span className="chip static">{ev.subject?.format ?? nr.format}</span>}
          {nr.architecture && <span className="chip static">{nr.architecture}</span>}
          {nr.artifact?.bytes != null && <span className="chip static">{formatBytes(nr.artifact.bytes)}</span>}
          {ev.confidence && <span className={`chip static conf-${ev.confidence}`} title="REA's confidence class">confidence: {ev.confidence}</span>}
          {ev.authority && <span className="chip static" title="What the evidence speaks for">{ev.authority}</span>}
        </div>
      </div>
      {ev.provider && <p className="muted small">Provider: {ev.provider.name ?? ev.provider.id}{ev.provider.version ? ` v${ev.provider.version}` : ""} · operation <code>{ev.operation}</code></p>}

      {coverage.length > 0 && (<><h3>Coverage</h3><Facts facts={coverage} /></>)}
      {glance.length > 0 && (<><h3>At a glance</h3><Facts facts={glance} /></>)}

      {lists.filter((l) => l.key !== "unknowns").map((l) => (
        <div key={l.path}>
          <h3><span className="cap">{l.key.replace(/_/g, " ")}</span> <span className="count">{l.items.length}</span> <code className="muted small">{l.path}</code></h3>
          <ul className="findings">
            {l.items.slice(0, 50).map((it, i) => (
              <li key={i}>
                {typeof it === "object" && it?.severity && <span className={`badge sev-${it.severity}`}>{it.severity}</span>}
                <span dir="auto">{itemText(it)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {textBlocks(nr).map(([k, text]) => (
        <div key={k}>
          <h3><span className="cap">{k.replace(/_/g, " ")}</span> <span className="count">{text.split("\n").length} lines</span></h3>
          <pre className="raw" dir="ltr">{text.length > 60000 ? text.slice(0, 60000) + "\n…" : text}</pre>
        </div>
      ))}

      {tables.map(([k, rows]) => (
        <div key={k}>
          <h3><span className="cap">{k.replace(/_/g, " ")}</span> <span className="count">{rows.length}</span></h3>
          <ObjectTable rows={rows} initial={8} />
        </div>
      ))}

      <h3>Limitations <span className="count">{limitations.length}</span></h3>
      {limitations.length ? (
        <ul className="limits">{limitations.map((l) => <li key={l} dir="auto">{l}</li>)}</ul>
      ) : <p className="muted">REA reported no limitations for this result.</p>}

      {unknowns.length > 0 && (<><h3>Unknowns <span className="count">{unknowns.length}</span></h3><ul className="limits">{unknowns.slice(0, 50).map((u, i) => <li key={i}>{itemText(u)}</li>)}</ul></>)}

      <p className="muted small evid">Evidence <code title={ev.evidence_id}>{ev.evidence_id}</code>{ev.evidence_links?.length ? ` · links ${ev.evidence_links.length}` : ""}</p>
    </div>
  );
}

function ErrorOverview({ error }) {
  return (
    <div className="err-box" role="alert">
      <div className="row gap wrap">
        <span className="badge warn">{error.code ?? "error"}</span>
        {error.category && <span className="badge">{error.category}</span>}
        {error.retryable != null && <span className="badge">{error.retryable ? "retryable" : "not retryable"}</span>}
      </div>
      <p className="err-msg" dir="auto">{error.message}</p>
      {error.remediation?.action && error.remediation.action !== error.message && (
        <div className="remedy"><strong>What to do</strong><p dir="auto">{error.remediation.action}</p></div>
      )}
      {error.details && <details><summary>Details</summary><JsonNode value={error.details} defaultOpen /></details>}
    </div>
  );
}

export default function ResultView({ run, result }) {
  const [tab, setTab] = useState("overview");
  const parsed = useMemo(() => parseResult(result), [result]);
  const raw = useMemo(() => JSON.stringify(result, null, 2), [result]);
  const duration = run?.endedAt && run?.startedAt ? (Date.parse(run.endedAt) - Date.parse(run.startedAt)) / 1000 : null;

  const download = () => {
    const blob = new Blob([raw], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${run?.tool ?? "rea"}-${(run?.startedAt ?? "").replace(/[:.]/g, "-")}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <section className="card result" aria-labelledby="result-h">
      <div className="card-head">
        <div className="min0">
          <h2 id="result-h">3 · Result</h2>
          <div className="muted small">
            <code dir="ltr">{run?.tool}</code>
            {duration != null && ` · ${duration < 1 ? `${Math.round(duration * 1000)} ms` : `${duration.toFixed(1)} s`}`}
            {run?.startedAt && ` · ${new Date(run.startedAt).toLocaleString()}`}
          </div>
        </div>
        <span className={`status ${parsed.kind === "error" ? "bad" : "good"}`}>{parsed.kind === "error" ? (run?.status === "cancelled" ? "Cancelled" : "Error") : "Evidence"}</span>
      </div>
      <div className="seg" role="tablist" aria-label="Result view">
        {[["overview", "Overview"], ["explore", "Explore"], ["raw", "Raw JSON"]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <div className="tab-body">
        {tab === "overview" && (
          parsed.kind === "evidence" ? <EvidenceOverview ev={parsed.evidence} />
            : parsed.kind === "error" ? <ErrorOverview error={parsed.error} />
            : parsed.kind === "data" ? <JsonNode value={parsed.data} defaultOpen />
            : <pre className="raw" dir="auto">{(parsed.texts ?? []).join("\n\n") || "No content."}</pre>
        )}
        {tab === "explore" && <div className="tree" dir="ltr"><JsonNode name={parsed.kind === "evidence" ? "normalized_result" : "result"} value={parsed.kind === "evidence" ? parsed.evidence.normalized_result : parsed.data ?? result} defaultOpen /></div>}
        {tab === "raw" && (
          <div>
            <div className="row gap"><Copy text={raw} label="Copy JSON" /><button className="btn ghost small" onClick={download}>Download .json</button><span className="muted small">{formatBytes(raw.length)}</span></div>
            <pre className="raw" dir="ltr">{raw.length > RAW_LIMIT ? raw.slice(0, RAW_LIMIT) + "\n… (truncated in view — download for the full result)" : raw}</pre>
          </div>
        )}
      </div>
    </section>
  );
}
