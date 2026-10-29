import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { EventEmitter } from "node:events";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const require = createRequire(import.meta.url);

function onPath(cmd) {
  const exts = process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD").split(";") : [""];
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    for (const ext of exts) {
      const p = path.join(dir, cmd + ext.toLowerCase());
      if (dir && existsSync(p)) return p;
    }
  }
  return null;
}

/**
 * Decide how to launch REA's MCP server, in this order:
 *   1. REA_BIN (path to the `rea` executable or to rea-agents/scripts/rea.mjs)
 *   2. a rea-agents package installed next to REA Studio
 *   3. `rea` on PATH (npm install --global rea-agents)
 *   4. `npx -y rea-agents@latest mcp`
 */
export function resolveReaCommand(reaBin) {
  if (reaBin) {
    return /\.(m?js|cjs)$/.test(reaBin)
      ? { command: process.execPath, args: [reaBin, "mcp"], via: "REA_BIN" }
      : { command: reaBin, args: ["mcp"], via: "REA_BIN" };
  }
  try {
    const pkg = require.resolve("rea-agents/package.json", { paths: [process.cwd()] });
    return { command: process.execPath, args: [path.join(path.dirname(pkg), "scripts/rea.mjs"), "mcp"], via: "local rea-agents package" };
  } catch {}
  const global = onPath("rea");
  if (global) return { command: global, args: ["mcp"], via: "rea on PATH" };
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  return { command: npx, args: ["-y", "rea-agents@latest", "mcp"], via: "npx rea-agents@latest" };
}

/** Keeps one MCP stdio session with REA alive and exposes its tool catalog. */
export class ReaConnection extends EventEmitter {
  constructor({ reaBin, callTimeoutMs }) {
    super();
    this.launch = resolveReaCommand(reaBin);
    this.callTimeoutMs = callTimeoutMs;
    this.state = "idle";
    this.error = null;
    this.server = null;
    this.tools = [];
    this.stderrTail = [];
    this.client = null;
    this.connecting = null;
  }

  status() {
    return {
      state: this.state,
      error: this.error,
      server: this.server,
      toolCount: this.tools.length,
      launch: { via: this.launch.via, command: [this.launch.command, ...this.launch.args].join(" ") },
      stderrTail: this.stderrTail.slice(-20),
    };
  }

  async connect() {
    if (this.state === "ready") return;
    if (this.connecting) return this.connecting;
    this.connecting = this.#connect().finally(() => (this.connecting = null));
    return this.connecting;
  }

  async #connect() {
    this.state = "connecting";
    this.error = null;
    const transport = new StdioClientTransport({
      command: this.launch.command,
      args: this.launch.args,
      stderr: "pipe",
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    });
    transport.stderr?.on("data", (chunk) => {
      for (const line of String(chunk).split(/\r?\n/)) {
        if (line.trim()) this.stderrTail.push(line.slice(0, 500));
      }
      if (this.stderrTail.length > 200) this.stderrTail.splice(0, this.stderrTail.length - 200);
    });
    const client = new Client({ name: "rea-studio", version: "0.1.0" });
    client.onclose = () => {
      if (this.client === client) {
        this.client = null;
        this.state = "disconnected";
        this.emit("status");
      }
    };
    try {
      await client.connect(transport, { timeout: 120_000 });
      const tools = [];
      let cursor;
      do {
        const page = await client.listTools(cursor ? { cursor } : undefined);
        tools.push(...page.tools);
        cursor = page.nextCursor;
      } while (cursor);
      this.client = client;
      this.tools = tools;
      this.server = client.getServerVersion() ?? null;
      this.state = "ready";
    } catch (err) {
      this.state = "error";
      this.error = String(err?.message ?? err);
      try { await client.close(); } catch {}
      throw err;
    } finally {
      this.emit("status");
    }
  }

  catalog() {
    return this.tools.map(({ name, title, description, inputSchema, annotations }) => ({
      name, title, description, inputSchema, annotations,
    }));
  }

  tool(name) {
    return this.tools.find((t) => t.name === name) ?? null;
  }

  async call(name, args, { signal, onProgress } = {}) {
    await this.connect();
    return this.client.callTool(
      { name, arguments: args },
      {
        signal,
        timeout: this.callTimeoutMs,
        resetTimeoutOnProgress: true,
        onprogress: onProgress,
      },
    );
  }

  async close() {
    const c = this.client;
    this.client = null;
    this.state = "idle";
    if (c) await c.close().catch(() => {});
  }
}
