import React, { useRef, useState } from "react";
import { formatBytes } from "../lib/evidence.js";

const FileIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>
);
const FolderIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
);

const TABS = [
  ["upload", "Upload"],
  ["path", "Local path"],
  ["url", "URL"],
];

export default function TargetPanel({ api, target, onTarget }) {
  const [tab, setTab] = useState("upload");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [pathText, setPathText] = useState("");
  const [urlText, setUrlText] = useState("");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef();
  const dirRef = useRef();
  const samples = api.samples();

  const run = async (fn) => {
    setBusy(true); setErr(null);
    try { onTarget(await fn()); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const onFiles = (files) => files?.length && run(() => api.upload(files));

  return (
    <section className="card target" aria-labelledby="target-h">
      <div className="card-head">
        <h2 id="target-h">1 · Target</h2>
        <div className="seg" role="tablist" aria-label="Target source">
          {TABS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
      </div>

      {tab === "upload" && (
        <div
          className={`drop ${drag ? "drag" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files); }}
        >
          <p><strong>Drop a file here</strong> or</p>
          <div className="row gap">
            <button className="btn" onClick={() => fileRef.current.click()} disabled={busy}>Choose file</button>
            <button className="btn ghost" onClick={() => dirRef.current.click()} disabled={busy}>Choose folder</button>
          </div>
          <input ref={fileRef} type="file" hidden onChange={(e) => onFiles(e.target.files)} />
          <input ref={dirRef} type="file" hidden webkitdirectory="" directory="" multiple onChange={(e) => onFiles(e.target.files)} />
          <p className="muted small" dir="auto">Files are copied into REA Studio’s local data folder on this machine — nothing leaves your computer.</p>
        </div>
      )}

      {tab === "path" && (
        <form className="row gap" onSubmit={(e) => { e.preventDefault(); run(() => api.checkPath(pathText.trim())); }}>
          <input className="grow mono" dir="ltr" placeholder="/absolute/path/to/app-or-binary" value={pathText} onChange={(e) => setPathText(e.target.value)} aria-label="Absolute path" />
          <button className="btn" disabled={busy || !pathText.trim()}>Use path</button>
        </form>
      )}

      {tab === "url" && (
        <form className="row gap" onSubmit={(e) => { e.preventDefault(); run(() => api.fetchUrl(urlText.trim())); }}>
          <input className="grow mono" dir="ltr" type="url" placeholder="https://example.com/build/app.js" value={urlText} onChange={(e) => setUrlText(e.target.value)} aria-label="URL to download" />
          <button className="btn" disabled={busy || !urlText.trim()}>Download</button>
        </form>
      )}

      {samples.length > 0 && (
        <div className="samples">
          <span className="muted small">Demo samples:</span>
          {samples.map((s) => (
            <button key={s.path} className={`chip ${target?.path === s.path ? "on" : ""}`} onClick={() => onTarget({ ...s, source: "sample" })}>{s.label}</button>
          ))}
        </div>
      )}

      {busy && <div className="bar indeterminate" aria-label="Working" />}
      {err && <p className="error-text" role="alert">{err}</p>}
      {target && (
        <div className="target-pill">
          <span className="kind" aria-hidden="true">{target.kind === "directory" ? <FolderIcon /> : <FileIcon />}</span>
          <div className="grow min0">
            <div className="ellipsis"><strong>{target.name}</strong> {target.size ? <span className="muted">· {formatBytes(target.size)}</span> : null}{target.files > 1 ? <span className="muted"> · {target.files} files</span> : null}</div>
            <code className="ellipsis block" dir="ltr" title={target.path}>{target.path}</code>
            {target.demoNote && <div className="muted small">{target.demoNote}</div>}
          </div>
          <button className="icon-btn" aria-label="Clear target" onClick={() => onTarget(null)}>✕</button>
        </div>
      )}
    </section>
  );
}
