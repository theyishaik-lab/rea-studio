// Demo mode: no backend. REA's real tool catalog plus runs recorded against tiny sample files.
// The recorded data is loaded lazily, and only in the demo build (__DEMO__ is a build-time constant).
let catalog = { server: null, tools: [] };
let recordings = { samples: [], runs: [] };
let SAMPLES = [];
let runs = [];
const ready = __DEMO__
  ? Promise.all([import("../demo/catalog.json"), import("../demo/recordings.json")]).then(([c, r]) => {
      catalog = c.default;
      recordings = r.default;
      SAMPLES = recordings.samples;
      runs = recordings.runs.map((rec, i) => ({ ...rec.run, id: `demo-${i}`, _rec: rec }));
    })
  : Promise.resolve();
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

function findRecording(tool, args) {
  const candidates = recordings.runs.filter((r) => r.run.tool === tool);
  return candidates.find((r) => JSON.stringify(r.run.args) === JSON.stringify(args))
    ?? candidates.find((r) => Object.values(args).some((v) => Object.values(r.run.args).includes(v)))
    ?? candidates[0]
    ?? null;
}

const notRecorded = (tool) => ({
  isError: true,
  content: [{ type: "text", text: JSON.stringify({ error: { code: "demo_not_recorded", category: "demo", message: `This is the static demo, so only recorded runs can be replayed. “${tool}” is real, but it has no recording here.`, remediation: { action: "Install REA Studio locally (npx rea-agents setup, then npm i && npm start) to run every REA tool on your own files." } } }) }],
});

export const demoApi = {
  demo: true,
  async getStatus() {
    await ready;
    return { state: "ready", server: catalog.server, toolCount: catalog.tools.length, mode: "demo", launch: { via: "demo", command: "recorded responses" } };
  },
  async connect() { return this.getStatus(); },
  async getTools() { await ready; await sleep(150); return { server: catalog.server, tools: catalog.tools }; },
  async upload(files) {
    const f = Array.from(files)[0];
    return { source: "upload", kind: "file", path: `/home/demo/uploads/${f?.name ?? "file"}`, name: f?.name ?? "file", size: f?.size ?? 0, sha256: null, demoNote: "Demo mode: the file stays in your browser and is not analyzed." };
  },
  async fetchUrl(url) {
    const name = new URL(url).pathname.split("/").filter(Boolean).at(-1) || "download.bin";
    return { source: "url", kind: "file", path: `/home/demo/uploads/${name}`, name, size: null, url, demoNote: "Demo mode: nothing was downloaded." };
  },
  async checkPath(p) {
    const s = SAMPLES.find((x) => x.path === p);
    if (s) return { ...s, source: "sample" };
    return { source: "path", kind: "file", path: p, name: p.split("/").filter(Boolean).at(-1), demoNote: "Demo mode: paths are not checked." };
  },
  async startRun(tool, args, target) {
    const run = { id: `demo-${Date.now()}`, tool, args, target, status: "running", startedAt: new Date().toISOString(), endedAt: null, progress: null };
    const rec = findRecording(tool, args);
    run._rec = rec;
    runs = [run, ...runs];
    return run;
  },
  async watchRun(id, onUpdate) {
    const run = runs.find((r) => r.id === id);
    for (let i = 1; i <= 4; i++) {
      await sleep(260);
      run.progress = { progress: i, total: 4, message: ["Starting REA", "Reading the artifact", "Building evidence", "Done"][i - 1] };
      onUpdate?.({ ...run });
    }
    const result = run._rec?.result ?? notRecorded(run.tool);
    run.status = result.isError ? "error" : "done";
    run.isError = Boolean(result.isError);
    run.endedAt = new Date().toISOString();
    run.summary = run._rec?.run.summary ?? { error: "demo_not_recorded" };
    return { ...run, result };
  },
  async cancelRun() { return { cancelled: false }; },
  async listRuns() { await ready; return runs.map(({ _rec, ...r }) => r); },
  async getRun(id) {
    const r = runs.find((x) => x.id === id);
    return { ...r, result: r?._rec?.result ?? (r?.status === "running" ? null : notRecorded(r?.tool)) };
  },
  async clearRuns() { runs = []; return { ok: true }; },
  samples: () => SAMPLES,
};
