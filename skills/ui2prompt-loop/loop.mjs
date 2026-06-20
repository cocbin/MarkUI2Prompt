#!/usr/bin/env node
/**
 * UI2Prompt loop CLI — the single entry point a coding agent uses to run loop
 * mode. It hides every moving part the agent shouldn't have to think about:
 *
 *   - Auto-starts the local broker if it isn't already running (detached).
 *   - Keeps a stable, per-working-directory agent id so claim/complete/review
 *     all refer to the same agent across separate shell invocations.
 *   - Sends a heartbeat on every call so the extension shows the agent online.
 *
 * The agent only ever runs `node loop.mjs <command>` and reads the JSON it
 * prints — no MCP, no manual broker startup, no curl bookkeeping.
 *
 * Commands:
 *   up                         ensure the broker is running; print health
 *   next                       claim the next task -> {task} or {task:null}
 *   details <id>               full 4-layer DOM for a task
 *   fixed <id> <summary>       mark AI-fixed (after editing code)
 *   reviewed <id> <summary>    mark AI-reviewed (after self-check)
 *   ask <id> <question> [opt…] ask a non-blocking multiple-choice question
 *   answer <questionId>        poll whether the human answered -> {answered,…}
 *   release <id>               return a task to the queue
 *   list                       overview of tasks + pending questions
 *   whoami                     print this agent's id
 *   help                       this message
 *
 * Env:
 *   UI2PROMPT_BROKER     full broker url (default http://127.0.0.1:<port>)
 *   UI2PROMPT_PORT       broker port (default 8787)
 *   UI2PROMPT_DATA       broker data dir (default ~/.ui2prompt/loop)
 *   UI2PROMPT_AGENT      force a fixed agent id (use for >1 agent per dir)
 *   UI2PROMPT_AGENT_KEY  identity key instead of cwd (advanced)
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { hostname, homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOME = homedir();
const STATE_DIR = process.env.UI2PROMPT_STATE || join(HOME, ".ui2prompt");
const DATA_DIR = process.env.UI2PROMPT_DATA || join(STATE_DIR, "loop");
const PORT = Number(process.env.UI2PROMPT_PORT || 8787);
const BROKER = (process.env.UI2PROMPT_BROKER || `http://127.0.0.1:${PORT}`).replace(/\/$/, "");
const LOG_FILE = join(STATE_DIR, "broker.log");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function die(msg) {
  process.stderr.write(`ui2prompt-loop: ${msg}\n`);
  process.exit(1);
}

function out(obj) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}

// ---- agent identity (stable per working dir, override via env) -------------
// Computed lazily so read-only commands (help) never touch disk.

let _agent = null;
function agent() {
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

async function api(method, path, body, { quiet = false } = {}) {
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

async function isUp() {
  const h = await api("GET", "/api/health", undefined, { quiet: true });
  return !!(h && h.ok);
}

/** Start the bundled broker detached and wait until it answers /api/health. */
async function ensureBroker() {
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

async function heartbeat() {
  await api("POST", "/api/agents/heartbeat", { agentId: agent(), name: agent() }, { quiet: true });
}

// ---- commands --------------------------------------------------------------

const commands = {
  async up() {
    await ensureBroker();
    await heartbeat();
    const h = await api("GET", "/api/health");
    out({ ok: true, broker: BROKER, agent: agent(), ...h });
  },

  async next() {
    await ensureBroker();
    await heartbeat();
    const r = await api("POST", "/api/tasks/claim", { agentId: agent() });
    out({ task: r.task || null });
  },

  async details(id) {
    if (!id) die("usage: details <taskId>");
    await ensureBroker();
    out(await api("GET", `/api/tasks/${encodeURIComponent(id)}/details`));
  },

  async fixed(id, ...rest) {
    if (!id) die("usage: fixed <taskId> <summary>");
    await ensureBroker();
    await heartbeat();
    out(await api("POST", `/api/tasks/${encodeURIComponent(id)}/complete`, {
      agentId: agent(),
      summary: rest.join(" "),
    }));
  },

  async reviewed(id, ...rest) {
    if (!id) die("usage: reviewed <taskId> <summary>");
    await ensureBroker();
    await heartbeat();
    out(await api("POST", `/api/tasks/${encodeURIComponent(id)}/review`, {
      agentId: agent(),
      summary: rest.join(" "),
    }));
  },

  async ask(id, question, ...options) {
    if (!id || !question) die('usage: ask <taskId> "question" "option 1" "option 2"');
    await ensureBroker();
    await heartbeat();
    const r = await api("POST", `/api/tasks/${encodeURIComponent(id)}/ask`, {
      agentId: agent(),
      question,
      options,
    });
    out({ questionId: r.questionId, note: "Do not wait. Keep working other tasks; poll with `answer <questionId>`." });
  },

  async answer(questionId) {
    if (!questionId) die("usage: answer <questionId>");
    await ensureBroker();
    const s = await api("GET", `/api/questions/${encodeURIComponent(questionId)}`);
    out({ answered: !!s.answered, answer: s.answer ?? null, question: s.question });
  },

  async release(id) {
    if (!id) die("usage: release <taskId>");
    await ensureBroker();
    await heartbeat();
    out(await api("POST", `/api/tasks/${encodeURIComponent(id)}/release`, { agentId: agent() }));
  },

  async list() {
    await ensureBroker();
    const s = await api("GET", "/api/state");
    out({
      tasks: (s.tasks || []).map((t) => ({
        id: t.id,
        status: t.status,
        problem: t.problem,
        lockedBy: t.lockedBy || null,
      })),
      pendingQuestions: (s.questions || [])
        .filter((q) => q.answer == null)
        .map((q) => ({ id: q.id, taskId: q.taskId, question: q.question })),
    });
  },

  whoami() {
    out({ agent: agent(), broker: BROKER, dataDir: DATA_DIR });
  },

  help() {
    process.stdout.write(HELP);
  },
};

const HELP = `UI2Prompt loop CLI — run: node loop.mjs <command>

  up                          ensure the broker is running; print health
  next                        claim the next task -> {task} or {task:null}
  details <id>                full 4-layer DOM for a task
  fixed <id> <summary>        mark AI-fixed (after editing code)
  reviewed <id> <summary>     mark AI-reviewed (after self-check)
  ask <id> "q" "opt" "opt"    ask a non-blocking multiple-choice question
  answer <questionId>         poll the human's answer -> {answered, answer}
  release <id>                return a task to the queue
  list                        overview of tasks + pending questions
  whoami                      print this agent's id

The broker auto-starts on first use. Agent id is stable per working directory;
set UI2PROMPT_AGENT to run more than one agent in the same directory.
`;

const [cmd, ...args] = process.argv.slice(2);
const run = commands[cmd];
if (!run) {
  if (cmd && cmd !== "help") process.stderr.write(`unknown command: ${cmd}\n\n`);
  process.stdout.write(HELP);
  process.exit(cmd && cmd !== "help" ? 1 : 0);
}
Promise.resolve(run(...args)).catch((err) => die(err && err.message ? err.message : String(err)));
