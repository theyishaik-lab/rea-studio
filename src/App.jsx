import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api/index.js";
import ToolList from "./components/ToolList.jsx";
import TargetPanel from "./components/TargetPanel.jsx";
import ToolForm from "./components/ToolForm.jsx";
import ResultView from "./components/ResultView.jsx";
import History from "./components/History.jsx";

const REPO = "https://github.com/theyishaik-lab/rea-studio";
const UPSTREAM = "https://github.com/morluto/rea";

function usePref(key, initial) {
  const [v, setV] = useState(() => localStorage.getItem(key) ?? initial);
  useEffect(() => { localStorage.setItem(key, v); }, [key, v]);
  return [v, setV];
}

export default function App() {
  const [theme, setTheme] = usePref("rea-studio-theme", "system");
  const [dir, setDir] = usePref("rea-studio-dir", "ltr");
  const [status, setStatus] = useState(null);
  const [tools, setTools] = useState([]);
  const [toolsError, setToolsError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [initialArgs, setInitialArgs] = useState(null);
  const [target, setTarget] = useState(null);
  const [runs, setRuns] = useState([]);
  const [active, setActive] = useState(null); // { run, result }
  const [running, setRunning] = useState(null);
  const [side, setSide] = useState("tools");
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.dataset.theme = dark ? "dark" : "light";
  }, [theme]);
  useEffect(() => { document.documentElement.dir = dir; }, [dir]);

  const loadTools = useCallback(async () => {
    setToolsError(null);
    try {
      const st = await api.getStatus();
      setStatus(st);
      const { tools } = await api.getTools();
      setTools(tools);
      setStatus(await api.getStatus());
    } catch (e) {
      setToolsError(e.message);
      setStatus(e.data?.error?.status ?? (await api.getStatus().catch(() => null)));
    }
  }, []);

  const refreshRuns = useCallback(async () => setRuns(await api.listRuns().catch(() => [])), []);

  const openRun = useCallback(async (id) => {
    const r = await api.getRun(id);
    const { result, ...run } = r;
    setActive({ run, result });
    setSelected(run.tool);
    setInitialArgs(run.args);
    if (run.target) setTarget(run.target);
    setDrawer(false);
  }, []);

  useEffect(() => {
    loadTools();
    api.listRuns().then((list) => {
      setRuns(list);
      if (api.demo && list.length) openRun(list[0].id);
    }).catch(() => {});
  }, [loadTools, openRun]);

  const tool = useMemo(() => tools.find((t) => t.name === selected) ?? null, [tools, selected]);
  const recorded = useMemo(() => (api.demo ? new Set(runs.map((r) => r.tool)) : null), [runs]);

  const selectTool = (name) => {
    setSelected(name);
    setDrawer(false);
    if (api.demo) {
      const rec = runs.find((r) => r.tool === name && r.status !== "running");
      setInitialArgs(rec?.args ?? null);
      if (rec?.target) setTarget(rec.target);
    } else {
      setInitialArgs(null);
    }
  };

  const runTool = async (args) => {
    try {
      const run = await api.startRun(tool.name, args, target);
      setRunning(run);
      refreshRuns();
      const final = await api.watchRun(run.id, (r) => setRunning(r));
      const { result, ...meta } = final;
      setActive({ run: meta, result });
    } catch (e) {
      setActive({ run: { tool: tool.name, status: "failed", startedAt: new Date().toISOString() }, result: { isError: true, content: [{ type: "text", text: JSON.stringify({ error: { code: e.data?.error?.code ?? "request_failed", message: e.message } }) }] } });
    } finally {
      setRunning(null);
      refreshRuns();
    }
  };

  const p = running?.progress;
  const pct = p?.total ? Math.min(100, Math.round((p.progress / p.total) * 100)) : null;
  const st = status?.state ?? "connecting";

  return (
    <div className="app">
      {api.demo && (
        <div className="demo-banner" role="note">
          <span dir="auto"><strong>Live demo.</strong> Real REA {status?.server?.version ?? ""} answers, recorded on tiny sample files — nothing runs here.</span>
          <a href={REPO} target="_blank" rel="noreferrer">Run it on your own files →</a>
        </div>
      )}
      <header className="topbar">
        <button className="icon-btn only-mobile" aria-label="Browse tools and history" onClick={() => setDrawer(true)}>☰</button>
        <div className="brand">
          <span className="logo" aria-hidden="true">R</span>
          <div className="min0">
            <h1>REA Studio</h1>
            <span className="muted small hide-xs">a web UI for <a href={UPSTREAM} target="_blank" rel="noreferrer">REA</a></span>
          </div>
        </div>
        <div className="top-actions">
          <span className={`conn conn-${st}`} title={status?.launch?.command ?? ""}>
            <span className="led" aria-hidden="true" />
            <span className="conn-text">{st === "ready" ? `${status?.server?.name ?? "rea"} ${status?.server?.version ?? ""} · ${status?.toolCount ?? tools.length} tools` : st === "error" ? "REA not connected" : st}</span>
          </span>
          {!api.demo && st !== "ready" && <button className="btn small" onClick={async () => { await api.connect().catch(() => {}); loadTools(); }}>Reconnect</button>}
          <button className="icon-btn" aria-label={`Text direction: ${dir.toUpperCase()}`} title="Toggle text direction (LTR / RTL)" onClick={() => setDir(dir === "rtl" ? "ltr" : "rtl")}>{dir === "rtl" ? "RTL" : "LTR"}</button>
          <button className="icon-btn" aria-label={`Theme: ${theme}`} title={`Theme: ${theme}`} onClick={() => setTheme(theme === "system" ? "dark" : theme === "dark" ? "light" : "system")}>{theme === "dark" ? "☾" : theme === "light" ? "☀" : "◐"}</button>
          <a className="icon-btn" href={REPO} target="_blank" rel="noreferrer" aria-label="Source on GitHub" title="Source on GitHub">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>
          </a>
        </div>
      </header>

      <div className="layout">
        <aside className={`sidebar ${drawer ? "open" : ""}`} aria-label="Tools and history">
          <div className="row between only-mobile pad"><strong>REA Studio</strong><button className="icon-btn" aria-label="Close" onClick={() => setDrawer(false)}>✕</button></div>
          <div className="seg full" role="tablist">
            <button role="tab" aria-selected={side === "tools"} className={side === "tools" ? "on" : ""} onClick={() => setSide("tools")}>Tools <span className="count">{tools.length}</span></button>
            <button role="tab" aria-selected={side === "history"} className={side === "history" ? "on" : ""} onClick={() => setSide("history")}>History <span className="count">{runs.length}</span></button>
          </div>
          {side === "tools" ? (
            toolsError ? (
              <div className="pad">
                <p className="error-text">Could not load REA’s tools: {toolsError}</p>
                <p className="muted small">REA Studio starts REA with <code>{status?.launch?.command ?? "rea mcp"}</code>. Install REA (<code>npx rea-agents setup</code> or <code>npm i -g rea-agents</code>) or set <code>REA_BIN</code>, then press Reconnect.</p>
                {status?.stderrTail?.length > 0 && <details><summary>REA output</summary><pre className="raw">{status.stderrTail.join("\n")}</pre></details>}
              </div>
            ) : tools.length === 0 ? <div className="pad"><div className="bar indeterminate" /><p className="muted small">Starting REA and reading its tool catalog…</p></div>
              : <ToolList tools={tools} selected={selected} onSelect={selectTool} recorded={recorded} />
          ) : (
            <History runs={runs} activeId={active?.run?.id} onOpen={openRun} onClear={async () => { await api.clearRuns(); setActive(null); refreshRuns(); }} />
          )}
        </aside>
        {drawer && <div className="scrim only-mobile" onClick={() => setDrawer(false)} />}

        <main className="content" id="main">
          <TargetPanel api={api} target={target} onTarget={setTarget} />
          <button className="btn ghost only-mobile pick-tool" onClick={() => { setSide("tools"); setDrawer(true); }}>{tool ? `Tool: ${tool.name} — change` : "Choose a tool"}</button>
          <ToolForm tool={tool} target={target} initialArgs={initialArgs} running={Boolean(running)} onRun={runTool} onCancel={() => running && api.cancelRun(running.id)} />
          {running && (
            <section className="card running" aria-live="polite">
              <div className="row between"><strong>Running <code>{running.tool}</code>…</strong><span className="muted small">{p?.message ?? "waiting for REA"}</span></div>
              <div className={`bar ${pct == null ? "indeterminate" : ""}`}><span style={pct == null ? undefined : { width: `${pct}%` }} /></div>
            </section>
          )}
          {active && !running && <ResultView key={active.run.id ?? active.run.startedAt} run={active.run} result={active.result} />}
          <footer className="foot muted small">
            REA Studio is an independent, community UI — not an official REA project. <a href={UPSTREAM} target="_blank" rel="noreferrer">REA</a> is © morluto, MIT licensed; use it only on software you own or are authorized to examine.
          </footer>
        </main>
      </div>
    </div>
  );
}
