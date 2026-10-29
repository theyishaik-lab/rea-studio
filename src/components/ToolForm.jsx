import React, { useEffect, useMemo, useRef, useState } from "react";
import { applyTarget, buildArgs, fieldsFor } from "../lib/schema.js";
import { hintBadges } from "../lib/categories.js";

function Field({ f, value, onChange, target, invalid }) {
  const id = `f-${f.name}`;
  const common = { id, "aria-invalid": invalid || undefined, "aria-describedby": f.description ? `${id}-d` : undefined };
  let input;
  switch (f.kind) {
    case "enum":
      input = (
        <select {...common} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">{f.required ? "Choose…" : "Default"}</option>
          {f.choices.map((c) => <option key={String(c)} value={String(c)}>{String(c)}</option>)}
        </select>
      );
      break;
    case "boolean":
      input = (
        <select {...common} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">Default</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      );
      break;
    case "integer":
    case "number":
      input = <input {...common} type="number" inputMode="numeric" dir="ltr" min={f.schema.minimum} max={f.schema.maximum} step={f.kind === "integer" ? 1 : "any"} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "string-list":
    case "number-list":
      input = <textarea {...common} rows={3} dir="ltr" className="mono" placeholder={f.kind === "string-list" ? "One value per line" : "1, 2, 3"} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "json":
      input = <textarea {...common} rows={3} dir="ltr" className="mono" placeholder={f.hint ? `JSON, e.g. ${f.hint}` : "JSON value"} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
      break;
    default:
      input = (
        <div className="row gap">
          <input {...common} className={`grow ${f.path ? "mono" : ""}`} dir={f.path ? "ltr" : "auto"} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
          {f.path && target && value !== target.path && <button type="button" className="btn ghost small" onClick={() => onChange(target.path)}>Use target</button>}
        </div>
      );
  }
  return (
    <div className={`field ${invalid ? "invalid" : ""} ${f.path || f.kind === "json" || f.kind.endsWith("list") ? "wide" : ""}`}>
      <label htmlFor={id}>
        <span>{f.label}</span>
        {f.required && <span className="req" title="required">required</span>}
        <code className="type">{f.kind === "json" ? "json" : f.kind}</code>
      </label>
      {input}
      {f.description && <p id={`${id}-d`} className="help">{f.description}</p>}
    </div>
  );
}

export default function ToolForm({ tool, target, initialArgs, onRun, running, onCancel }) {
  const fields = useMemo(() => fieldsFor(tool?.inputSchema), [tool]);
  const [values, setValues] = useState({});
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [descOpen, setDescOpen] = useState(false);

  useEffect(() => {
    const init = {};
    for (const f of fields) {
      const v = initialArgs?.[f.name];
      if (v === undefined) continue;
      init[f.name] = f.kind === "json" ? JSON.stringify(v) : Array.isArray(v) ? v.join("\n") : String(v);
    }
    setValues(applyTarget(fields, init, target?.path));
    setError(null);
    setShowAll(false);
  }, [tool, initialArgs]); // eslint-disable-line react-hooks/exhaustive-deps

  const prevTarget = useRef(target?.path);
  useEffect(() => {
    const prev = prevTarget.current;
    prevTarget.current = target?.path;
    setValues((v) => applyTarget(fields, v, target?.path, prev));
  }, [target?.path]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!tool) {
    return (
      <section className="card empty-state">
        <h2>2 · Tool</h2>
        <p className="muted">Pick one of REA’s tools from the list. Its form is generated from the tool’s own input schema.</p>
      </section>
    );
  }
  const main = fields.filter((f) => f.required || f.path);
  const rest = fields.filter((f) => !(f.required || f.path));
  const visible = showAll ? fields : main.length ? main : rest.slice(0, 4);
  const hidden = fields.length - visible.length;

  const submit = (e) => {
    e.preventDefault();
    try {
      setError(null);
      onRun(buildArgs(fields, values));
    } catch (err) {
      setError(err);
    }
  };

  return (
    <section className="card tool-form" aria-labelledby="tool-h">
      <div className="card-head">
        <div className="min0">
          <h2 id="tool-h">2 · {tool.title || tool.name}</h2>
          <code className="muted small" dir="ltr">{tool.name}</code>
        </div>
        <div className="badges">
          {hintBadges(tool.annotations).map((b) => <span key={b.key} className={`badge ${b.tone}`}>{b.label}</span>)}
        </div>
      </div>
      {tool.description && (
        <p className={`desc ${descOpen ? "open" : ""}`} dir="auto">
          {tool.description}
          {tool.description.length > 220 && <button className="link" onClick={() => setDescOpen(!descOpen)}>{descOpen ? " less" : " more"}</button>}
        </p>
      )}
      <form onSubmit={submit} noValidate>
        {fields.length === 0 && <p className="muted">This tool takes no arguments.</p>}
        <div className="fields">
          {visible.map((f) => (
            <Field key={f.name} f={f} target={target} value={values[f.name]} invalid={error?.field === f.name} onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))} />
          ))}
        </div>
        {hidden > 0 && <button type="button" className="link" onClick={() => setShowAll(true)}>+ {hidden} optional setting{hidden > 1 ? "s" : ""}</button>}
        {showAll && main.length > 0 && rest.length > 0 && <button type="button" className="link" onClick={() => setShowAll(false)}>Hide optional settings</button>}
        {error && <p className="error-text" role="alert">{error.message}</p>}
        <div className="row gap actions">
          {running ? (
            <button type="button" className="btn danger" onClick={onCancel}>Cancel run</button>
          ) : (
            <button className="btn primary">Run {tool.name}</button>
          )}
        </div>
      </form>
    </section>
  );
}
