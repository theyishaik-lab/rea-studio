import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rm, readdir } from "node:fs/promises";
import path from "node:path";
import { EventEmitter } from "node:events";

/** Run history. Metadata in memory + index.json, each result in its own file. */
export class RunStore extends EventEmitter {
  constructor({ dataDir, limit }) {
    super();
    this.dir = path.join(dataDir, "runs");
    this.limit = limit;
    this.runs = new Map();
    this.controllers = new Map();
  }

  async init() {
    await mkdir(this.dir, { recursive: true });
    try {
      const list = JSON.parse(await readFile(path.join(this.dir, "index.json"), "utf8"));
      for (const r of list) {
        if (r.status === "running") r.status = "interrupted";
        this.runs.set(r.id, r);
      }
    } catch {}
  }

  list() {
    return [...this.runs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  get(id) {
    return this.runs.get(id) ?? null;
  }

  async result(id) {
    try { return JSON.parse(await readFile(path.join(this.dir, `${id}.json`), "utf8")); } catch { return null; }
  }

  async #persist() {
    const list = this.list();
    for (const old of list.slice(this.limit)) {
      this.runs.delete(old.id);
      await rm(path.join(this.dir, `${old.id}.json`), { force: true });
    }
    await writeFile(path.join(this.dir, "index.json"), JSON.stringify(this.list()));
  }

  start(tool, args, target, execute) {
    const id = randomUUID();
    const run = { id, tool, args, target: target ?? null, status: "running", startedAt: new Date().toISOString(), endedAt: null, progress: null, isError: false, summary: null };
    this.runs.set(id, run);
    const controller = new AbortController();
    this.controllers.set(id, controller);
    this.#persist();
    const emit = () => this.emit(`run:${id}`, run);
    execute({
      signal: controller.signal,
      onProgress: (p) => { run.progress = p; emit(); },
    })
      .then(async (result) => {
        run.isError = Boolean(result?.isError);
        run.status = run.isError ? "error" : "done";
        run.summary = summarize(result);
        await writeFile(path.join(this.dir, `${id}.json`), JSON.stringify(result));
      })
      .catch(async (err) => {
        run.status = controller.signal.aborted ? "cancelled" : "failed";
        run.isError = true;
        const result = { isError: true, content: [{ type: "text", text: JSON.stringify({ error: { code: run.status, message: String(err?.message ?? err) } }) }] };
        run.summary = summarize(result);
        await writeFile(path.join(this.dir, `${id}.json`), JSON.stringify(result));
      })
      .finally(async () => {
        run.endedAt = new Date().toISOString();
        this.controllers.delete(id);
        await this.#persist();
        emit();
      });
    return run;
  }

  cancel(id) {
    const c = this.controllers.get(id);
    if (!c) return false;
    c.abort(new Error("Cancelled by user"));
    return true;
  }

  async clear() {
    for (const id of this.controllers.keys()) this.cancel(id);
    this.runs.clear();
    for (const f of await readdir(this.dir)) await rm(path.join(this.dir, f), { force: true });
    await this.#persist();
  }
}

/** One-line description of a result for the history list. */
export function summarize(result) {
  const sc = result?.structuredContent;
  if (sc?.subject || sc?.operation) {
    return { subject: sc.subject?.name ?? null, format: sc.subject?.format ?? null, confidence: sc.confidence ?? null, limitations: sc.limitations?.length ?? 0 };
  }
  const text = result?.content?.find?.((c) => c.type === "text")?.text;
  if (text) {
    try {
      const parsed = JSON.parse(text);
      if (parsed?.error) return { error: parsed.error.code ?? "error", message: String(parsed.error.message ?? "").slice(0, 200) };
    } catch {
      return { message: text.slice(0, 200) };
    }
  }
  return null;
}
