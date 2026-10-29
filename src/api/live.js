const TOKEN_KEY = "rea-studio-token";

function token() {
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get("token");
  if (fromUrl) {
    sessionStorage.setItem(TOKEN_KEY, fromUrl);
    url.searchParams.delete("token");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
  return sessionStorage.getItem(TOKEN_KEY);
}

async function req(path, { method = "GET", body, raw, headers = {} } = {}) {
  const t = token();
  const res = await fetch(path, {
    method,
    headers: {
      "x-rea-studio": "1",
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...(body !== undefined && !raw ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error?.message ?? `HTTP ${res.status}`), { data, status: res.status });
  return data;
}

export const liveApi = {
  demo: false,
  getStatus: () => req("/api/status"),
  connect: () => req("/api/connect", { method: "POST" }),
  getTools: () => req("/api/tools"),
  async upload(files, onProgress) {
    const list = Array.from(files);
    let batch;
    let first;
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      const rel = f.webkitRelativePath || f.name;
      const q = new URLSearchParams({ relpath: rel, ...(batch ? { batch } : {}) });
      const r = await req(`/api/uploads?${q}`, { method: "PUT", raw: f, headers: { "Content-Type": "application/octet-stream" } });
      batch = r.batch;
      first ??= r;
      onProgress?.((i + 1) / list.length);
    }
    const isFolder = list.length > 1 || Boolean(list[0]?.webkitRelativePath);
    return {
      source: "upload",
      kind: isFolder ? "directory" : "file",
      path: isFolder ? first.root : first.path,
      name: isFolder ? (list[0].webkitRelativePath?.split("/")[0] || "folder") : first.name,
      size: list.reduce((s, f) => s + f.size, 0),
      sha256: isFolder ? null : first.sha256,
      files: list.length,
      batch,
    };
  },
  async fetchUrl(url) {
    const r = await req("/api/fetch-url", { method: "POST", body: { url } });
    return { source: "url", kind: "file", path: r.path, name: r.name, size: r.size, sha256: r.sha256, url: r.url, batch: r.batch };
  },
  async checkPath(p) {
    const r = await req("/api/check-path", { method: "POST", body: { path: p } });
    if (!r.exists) throw new Error(r.message ?? "Not found");
    return { source: "path", kind: r.kind, path: r.path, name: r.path.split(/[\\/]/).filter(Boolean).at(-1), size: r.kind === "file" ? r.size : null };
  },
  startRun: (tool, args, target) => req("/api/runs", { method: "POST", body: { tool, args, target } }),
  watchRun(id, onUpdate) {
    return new Promise((resolve) => {
      const t = token();
      const es = new EventSource(`/api/runs/${id}/events${t ? `?token=${encodeURIComponent(t)}` : ""}`);
      es.addEventListener("progress", (e) => onUpdate?.(JSON.parse(e.data)));
      es.addEventListener("end", async () => {
        es.close();
        resolve(await req(`/api/runs/${id}`));
      });
      es.onerror = async () => {
        es.close();
        // Fall back to polling if the stream drops.
        for (;;) {
          const r = await req(`/api/runs/${id}`).catch(() => null);
          if (r && r.status !== "running") return resolve(r);
          if (r) onUpdate?.(r);
          await new Promise((s) => setTimeout(s, 1000));
        }
      };
    });
  },
  cancelRun: (id) => req(`/api/runs/${id}/cancel`, { method: "POST" }),
  listRuns: () => req("/api/runs").then((r) => r.runs),
  getRun: (id) => req(`/api/runs/${id}`),
  clearRuns: () => req("/api/runs", { method: "DELETE" }),
  samples: () => [],
};
