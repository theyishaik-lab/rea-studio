import os from "node:os";
import path from "node:path";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);

export function isLoopback(host) {
  return LOOPBACK.has(String(host).replace(/^\[|\]$/g, ""));
}

export function loadConfig(argv = process.argv.slice(2), env = process.env) {
  const flag = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const host = flag("host") ?? env.REA_STUDIO_HOST ?? "127.0.0.1";
  const port = Number(flag("port") ?? env.REA_STUDIO_PORT ?? 4317);
  const dataDir = path.resolve(
    flag("data-dir") ?? env.REA_STUDIO_DATA_DIR ?? path.join(os.homedir(), ".rea-studio"),
  );
  const extraHosts = (env.REA_STUDIO_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return {
    host,
    port,
    dataDir,
    dev: argv.includes("--dev"),
    exposed: !isLoopback(host),
    // A token is mandatory whenever the server listens beyond loopback.
    token: env.REA_STUDIO_TOKEN || null,
    extraHosts,
    maxUploadBytes: Number(env.REA_STUDIO_MAX_UPLOAD_MB ?? 512) * 1024 * 1024,
    callTimeoutMs: Number(env.REA_STUDIO_CALL_TIMEOUT_MS ?? 30 * 60 * 1000),
    historyLimit: Number(env.REA_STUDIO_HISTORY_LIMIT ?? 200),
    reaBin: env.REA_BIN || null,
  };
}
