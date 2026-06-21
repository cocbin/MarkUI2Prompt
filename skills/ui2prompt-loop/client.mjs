/**
 * Shared plumbing for the UI2Prompt loop skill: broker URL resolution, a stable
 * per-working-directory agent id, auto-starting the bundled broker, the HTTP
 * helper, and tiny stdout helpers. Imported by both loop.mjs (the CLI) and
 * daemon.mjs (the scheduler) so the moving parts live in exactly one place.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { hostname, homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = dirname(fileURLToPath(import.meta.url));
const HOME = homedir();
export const STATE_DIR = process.env.UI2PROMPT_STATE || join(HOME, ".ui2prompt");
export const DATA_DIR = process.env.UI2PROMPT_DATA || join(STATE_DIR, "loop");
export const PORT = Number(process.env.UI2PROMPT_PORT || 8787);
export const BROKER = (process.env.UI2PROMPT_BROKER || `http://127.0.0.1:${PORT}`).replace(/\/$/, "");
const LOG_FILE = join(STATE_DIR, "broker.log");

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function die(msg) {
  process.stderr.write(`ui2prompt-loop: ${msg}\n`);
  process.exit(1);
}

export function out(obj) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}

// ---- agent identity (stable per working dir, override via env) -------------
// Computed lazily so read-only commands (help/detect) never touch disk.

let _agent = null;
export function agent() {
  if (_agent) return _agent;
  if (process.env.UI2PROMPT_AGENT) return (_agent = process.env.UI2PROMPT_AGENT);
  const keyBase = process.env.UI2PROMPT_AGENT_KEY || process.cwd();
  const key = createHash("sha1").update(keyBase).digest("hex").slice(0, 8);
  const file = join(STATE_DIR, `agent-${key}`);
  try {
    const saved = readFileSync(file, "utf8").trim();
    if (saved) return (_agent = saved);
  } catch {
    /* not created yet */
  }
  _agent = `agent_${hostname().split(".")[0]}_${key}`;
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(file, _agent);
  } catch {
    /* best-effort */
  }
  return _agent;
}

// ---- broker HTTP -----------------------------------------------------------

export async function api(method, path, body, { quiet = false } = {}) {
  let res;
  try {
    res = await fetch(`${BROKER}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body == null ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if (quiet) return null;
    throw new Error(`broker unreachable at ${BROKER} (${err.message})`);
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data && data.error ? data.error : `broker ${res.status}`);
  return data;
}

export async function isUp() {
  const h = await api("GET", "/api/health", undefined, { quiet: true });
  return !!(h && h.ok);
}

/** Start the bundled broker detached and wait until it answers /api/health. */
export async function ensureBroker() {
  if (await isUp()) return;
  const brokerPath = resolve(HERE, "broker.mjs");
  if (!existsSync(brokerPath)) die(`bundled broker not found at ${brokerPath}`);
  mkdirSync(STATE_DIR, { recursive: true });
  const log = openSync(LOG_FILE, "a");
  const child = spawn(process.execPath, [brokerPath], {
    detached: true,
    stdio: ["ignore", log, log],
    env: { ...process.env, UI2PROMPT_PORT: String(PORT), UI2PROMPT_DATA: DATA_DIR },
  });
  child.unref();
  for (let i = 0; i < 40; i++) {
    if (await isUp()) return;
    await sleep(150);
  }
  die(`broker did not become ready on ${BROKER}; see ${LOG_FILE}`);
}

export async function heartbeat() {
  await api("POST", "/api/agents/heartbeat", { agentId: agent(), name: agent() }, { quiet: true });
}
