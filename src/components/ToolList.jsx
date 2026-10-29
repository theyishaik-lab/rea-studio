import React, { useMemo, useState } from "react";
import { CATEGORY_ORDER, categoryOf } from "../lib/categories.js";

export default function ToolList({ tools, selected, onSelect, recorded }) {
  const [q, setQ] = useState("");
  const [openCats, setOpenCats] = useState(() => new Set(["Archives & files", "JavaScript & web"]));
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const map = new Map();
    const rank = (t) => {
      if (!needle) return 0;
      if (t.name.toLowerCase().includes(needle)) return 3;
      if ((t.title ?? "").toLowerCase().includes(needle)) return 2;
      return (t.description ?? "").toLowerCase().includes(needle) ? 1 : -1;
    };
    const ranked = tools.map((t) => [rank(t), t]).filter(([r]) => r >= 0).sort((a, b) => b[0] - a[0]);
    for (const [, t] of ranked) {
      const c = categoryOf(t.name);
      if (!map.has(c)) map.set(c, []);
      map.get(c).push(t);
    }
    return [...map.entries()].sort((a, b) => CATEGORY_ORDER.indexOf(a[0]) - CATEGORY_ORDER.indexOf(b[0]));
  }, [tools, q]);
  const searching = q.trim().length > 0;
  const toggle = (c) => setOpenCats((s) => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); return n; });

  return (
    <nav className="tool-list" aria-label="REA tools">
      <div className="search">
        <input type="search" placeholder={`Search ${tools.length} tools…`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tools" />
      </div>
      {groups.length === 0 && <p className="muted pad">No tool matches “{q}”.</p>}
      {groups.map(([cat, list]) => {
        const open = searching || openCats.has(cat) || list.some((t) => t.name === selected);
        return (
          <section key={cat} className="cat">
            <button className="cat-head" aria-expanded={open} onClick={() => toggle(cat)}>
              <span className="chev" aria-hidden="true">{open ? "▾" : "▸"}</span>
              <span>{cat}</span>
              <span className="count">{list.length}</span>
            </button>
            {open && (
              <ul>
                {list.map((t) => (
                  <li key={t.name}>
                    <button className={`tool-item ${selected === t.name ? "active" : ""}`} onClick={() => onSelect(t.name)} title={t.description}>
                      <span className="tool-title">{t.title || t.name}</span>
                      <span className="tool-name"><code dir="ltr">{t.name}</code>{recorded?.has(t.name) && <span className="dot" title="Recorded run available in the demo" />}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </nav>
  );
}
