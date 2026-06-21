#!/usr/bin/env node
/**
 * UI2Prompt loop daemon — the scheduler.
 *
 *   Daemon → pull task → launch an independent agent session → execute →
 *   print summary → exit → (repeat)
 *
 * Each task runs in a FRESH agent process (e.g. `claude -p …`), so no single
 * context ever accumulates every task — the daemon (and the human's main
 * session) only schedule. The daemon stays resident and loops until:
 *   - the human runs `node loop.mjs stop` (or clicks Stop in the Loop panel), or
 *   - it receives SIGINT/SIGTERM, or
 *   - the session/shell that started it ends (it is not detached).
 *
 * Run: node daemon.mjs            (or `node loop.mjs daemon`)
 * Env: UI2PROMPT_AGENT_CMD / UI2PROMPT_AGENT_BIN to pick the launcher (see agents.mjs)
 *      UI2PROMPT_IDLE_MS (default 60000) poll interval when the queue is empty
 *      UI2PROMPT_MAX_ATTEMPTS (default 2) retries before a task is sent to the human
 */
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { api, agent, ensureBroker, heartbeat, sleep, out, HERE, BROKER, PORT, DATA_DIR } from "./client.mjs";
import { resolveAgent } from "./agents.mjs";

const LOOP = resolve(HERE, "loop.mjs");
const IDLE_MS = Number(process.env.UI2PROMPT_IDLE_MS || 60000);
const MAX_ATTEMPTS = Number(process.env.UI2PROMPT_MAX_ATTEMPTS || 2);
const BUSY_MS = 1500; // brief pause between tasks

let stopping = false;
let child = null;

function log(event, extra = {}) {
  out({ daemon: event, agent: agent(), time: new Date().toISOString(), ...extra });
}

/** Per-task prompt handed to the fresh agent session. */
function taskPrompt(task) {
  const lines = [
    "You are fixing ONE UI bug for UI2Prompt loop mode, then exiting. Do NOT claim",
    "other tasks (never run `next`). Work only this task:",
    "",
    `Task id: ${task.id}`,
    `Problem: ${task.problem || "(none)"}`,
    `Location: ${task.location || "(none)"}`,
  ];
  if (task.feedback) {
    lines.push(
      `IMPORTANT — a previous fix was rejected by the human. Reason / what to do`,
      `differently: ${task.feedback}`,
    );
  }
  lines.push(
    "",
    `Use the ui2prompt-loop skill CLI: node "${LOOP}" <cmd>`,
    `  - node "${LOOP}" details ${task.id}   # full 4-layer DOM if you can't find the element`,
    "",
    "Steps:",
    "  1. Locate the real source from problem + location and implement the smallest",
    "     correct, root-cause fix in the actual source files.",
    `  2. node "${LOOP}" fixed ${task.id} "<file/line + what you changed>"`,
    `  3. Self-review the change, then node "${LOOP}" reviewed ${task.id} "<review note>"`,
    "",
    "Print a one-line summary of what you changed, then stop.",
  );
  return lines.join("\n");
}

/** Launch one fresh agent session for a task; resolve to { code, summary }. */
function runSession(launcher, task) {
  return new Promise((done) => {
    const prompt = taskPrompt(task);
    const env = {
      ...process.env,
      UI2PROMPT_AGENT: agent(),
      UI2PROMPT_BROKER: BROKER,
      UI2PROMPT_PORT: String(PORT),
      UI2PROMPT_DATA: DATA_DIR,
    };
    let cmd, args, opts;
    if (launcher.mode === "custom") {
      const shellCmd = launcher.template.split("{PROMPT}").join('"$UI2PROMPT_PROMPT"');
      cmd = "sh";
      args = ["-c", shellCmd];
      opts = { env: { ...env, UI2PROMPT_PROMPT: prompt }, stdio: ["ignore", "pipe", "inherit"] };
    } else {
      cmd = launcher.bin;
      args = launcher.build(prompt);
      opts = { env, stdio: ["ignore", "pipe", "inherit"] };
    }
    child = spawn(cmd, args, opts);
    let tail = "";
    child.stdout.on("data", (b) => {
      const text = b.toString();
      process.stdout.write(text); // surface the session's output live
      tail += text;
      if (tail.length > 8000) tail = tail.slice(-8000);
    });
    child.on("error", (err) => {
      child = null;
      done({ code: 1, summary: `launch failed: ${err.message}` });
    });
    child.on("close", (code) => {
      child = null;
      const summary =
        tail
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
          .pop() || "";
      done({ code: code ?? 0, summary: summary.slice(0, 240) });
    });
  });
}

async function controlStopped() {
  const c = await api("GET", "/api/control", undefined, { quiet: true });
  return !!(c && c.stop);
}

async function reclaimableOpen(skip) {
  const s = await api("GET", "/api/state", undefined, { quiet: true });
  const tasks = (s && s.tasks) || [];
  return tasks.some(
    (t) => (t.status === "open" || (t.status === "in_progress" && !t.lockedBy)) && !skip.has(t.id),
  );
}

async function processTask(launcher, task, attempts, skip) {
  log("session_start", { taskId: task.id, problem: task.problem, launcher: launcher.bin || "custom" });
  const { code, summary } = await runSession(launcher, task);
  if (stopping) return;

  const fresh = await api("GET", "/api/state", undefined, { quiet: true });
  const t = ((fresh && fresh.tasks) || []).find((x) => x.id === task.id);
  const done = t && (t.status === "ai_fixed" || t.status === "ai_reviewed" || t.status === "confirmed");

  if (code === 0 && done) {
    log("session_done", { taskId: task.id, status: t.status, summary });
    return;
  }
  if (code === 0 && t && t.status === "in_progress") {
    // The session edited code but forgot to mark the task — record it for the human.
    await api("POST", `/api/tasks/${encodeURIComponent(task.id)}/review`, {
      agentId: agent(),
      summary: summary || "fixed by agent session (auto-marked by daemon)",
    }).catch(() => {});
    log("session_automarked", { taskId: task.id, summary });
    return;
  }

  // Failure: retry a couple of times, then hand it to the human for guidance.
  const n = (attempts.get(task.id) || 0) + 1;
  attempts.set(task.id, n);
  if (n >= MAX_ATTEMPTS) {
    skip.add(task.id);
    await api("POST", `/api/tasks/${encodeURIComponent(task.id)}/review`, {
      agentId: agent(),
      summary: `[needs human] agent session failed after ${n} attempts. ${summary}`.trim(),
    }).catch(() => {});
    log("session_giveup", { taskId: task.id, attempts: n, summary });
  } else {
    await api("POST", `/api/tasks/${encodeURIComponent(task.id)}/release`, { agentId: agent() }).catch(() => {});
    log("session_retry", { taskId: task.id, attempts: n, code });
  }
}

export async function runDaemon() {
  const launcher = resolveAgent();
  if (launcher.mode === "none") {
    out({
      ok: false,
      error: "no agent CLI detected (claude / cursor-agent / codex).",
      hint: "Use in-session mode (claim a task, dispatch a subagent to fix it), or set UI2PROMPT_AGENT_CMD.",
    });
    process.exit(2);
  }

  await ensureBroker();
  await heartbeat();
  await api("POST", "/api/control", { stop: false }).catch(() => {});
  log("started", { launcher: launcher.bin || launcher.template, idleMs: IDLE_MS });

  const cleanup = async (signal) => {
    if (stopping) return;
    stopping = true;
    log("stopping", { signal });
    if (child) {
      try {
        child.kill("SIGTERM");
      } catch {
        /* already gone */
      }
    }
    await api("POST", "/api/control", { stop: false }).catch(() => {});
    log("stopped");
    process.exit(0);
  };
  process.on("SIGINT", () => cleanup("SIGINT"));
  process.on("SIGTERM", () => cleanup("SIGTERM"));
  process.on("SIGHUP", () => cleanup("SIGHUP"));

  const attempts = new Map();
  const skip = new Set();
  let processed = 0;

  while (!stopping) {
    await heartbeat();
    if (await controlStopped()) {
      await cleanup("control.stop");
      break;
    }
    if (!(await reclaimableOpen(skip))) {
      await sleep(IDLE_MS);
      continue;
    }
    const r = await api("POST", "/api/tasks/claim", { agentId: agent() }, { quiet: true });
    const task = r && r.task;
    if (!task) {
      await sleep(BUSY_MS);
      continue;
    }
    if (skip.has(task.id)) {
      await api("POST", `/api/tasks/${encodeURIComponent(task.id)}/release`, { agentId: agent() }).catch(() => {});
      await sleep(BUSY_MS);
      continue;
    }
    await processTask(launcher, task, attempts, skip);
    processed++;
    if (!stopping) await sleep(BUSY_MS);
  }
  log("exit", { processed });
}

// Allow both `node daemon.mjs` and `import { runDaemon }`.
const invokedDirectly =
  process.argv[1] && /daemon\.mjs$/.test(process.argv[1]);
if (invokedDirectly) {
  runDaemon().catch((err) => {
    process.stderr.write(`ui2prompt-daemon: ${err && err.message ? err.message : err}\n`);
    process.exit(1);
  });
}
