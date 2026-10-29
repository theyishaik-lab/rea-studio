import React from "react";

const ICON = { done: "✓", error: "!", failed: "!", cancelled: "■", interrupted: "■", running: "…" };

export default function History({ runs, activeId, onOpen, onClear }) {
  return (
    <div className="history">
      <div className="row between pad">
        <strong>Run history</strong>
        {runs.length > 0 && <button className="link" onClick={onClear}>Clear</button>}
      </div>
      {runs.length === 0 && <p className="muted pad">No runs yet.</p>}
      <ul>
        {runs.map((r) => (
          <li key={r.id}>
            <button className={`hist-item ${activeId === r.id ? "active" : ""}`} onClick={() => onOpen(r.id)}>
              <span className={`st st-${r.status}`} aria-label={r.status}>{ICON[r.status] ?? "?"}</span>
              <span className="min0 grow">
                <span className="ellipsis block"><code dir="ltr">{r.tool}</code></span>
                <span className="ellipsis block muted small" dir="auto">
                  {r.target?.name ?? r.summary?.subject ?? "no target"}
                  {r.summary?.error ? ` · ${r.summary.error}` : r.summary?.confidence ? ` · ${r.summary.confidence}` : ""}
                </span>
              </span>
              <time className="muted small" dateTime={r.startedAt}>{new Date(r.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
