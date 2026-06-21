/**
 * Detect which coding-agent CLI is available so the daemon can launch a fresh,
 * independent agent session per task. This is what lets loop mode scale: the
 * main session only schedules, and each fix runs in its own short-lived process
 * so no single context accumulates every task.
 *
 * Some agents have no CLI (e.g. zcode) — then nothing is detected and the caller
 * falls back to in-session subagent dispatch.
 *
 * Override detection entirely with:
 *   UI2PROMPT_AGENT_CMD   a shell template, must contain {PROMPT}
 *                         e.g. 'claude -p {PROMPT} --permission-mode acceptEdits'
 *   UI2PROMPT_AGENT_BIN   force one of the known bins (claude|cursor-agent|codex)
 */
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";

/**
 * Known headless invocations. `build(prompt)` returns argv (spawned WITHOUT a
 * shell, so the prompt is a single safe argument). Flags chosen for autonomous,
 * non-interactive runs that may edit files and run the loop CLI.
 */
export const KNOWN_AGENTS = [
  {
    bin: "claude",
    label: "Claude Code",
    build: (p) => [
      "-p",
      p,
      "--permission-mode",
      "acceptEdits",
      "--allowedTools",
      "Bash,Edit,Write,Read,Glob,Grep",
    ],
  },
  {
    bin: "cursor-agent",
    label: "Cursor Agent",
    build: (p) => ["-p", "--force", "--output-format", "text", p],
  },
  {
    bin: "codex",
    label: "Codex",
    build: (p) => ["exec", "--dangerously-bypass-approvals-and-sandbox", p],
  },
];

/** True when `bin` is an executable found on PATH. */
function onPath(bin) {
  const dirs = (process.env.PATH || "").split(delimiter).filter(Boolean);
  const exts = process.platform === "win32" ? ["", ".cmd", ".exe", ".bat"] : [""];
  for (const dir of dirs) {
    for (const ext of exts) {
      try {
        accessSync(join(dir, bin + ext), constants.X_OK);
        return true;
      } catch {
        /* keep looking */
      }
    }
  }
  return false;
}

/**
 * Resolve the agent the daemon should launch.
 * @returns {{mode:"custom"|"known"|"none", bin?:string, label?:string,
 *            build?:(p:string)=>string[], template?:string, available:string[]}}
 */
export function resolveAgent() {
  const available = KNOWN_AGENTS.filter((a) => onPath(a.bin)).map((a) => a.bin);

  if (process.env.UI2PROMPT_AGENT_CMD) {
    return { mode: "custom", template: process.env.UI2PROMPT_AGENT_CMD, available };
  }
  const forced = process.env.UI2PROMPT_AGENT_BIN;
  const known = KNOWN_AGENTS.find((a) => (forced ? a.bin === forced : available.includes(a.bin)));
  if (known && (forced || available.includes(known.bin))) {
    return { mode: "known", bin: known.bin, label: known.label, build: known.build, available };
  }
  return { mode: "none", available };
}

/** A compact summary for `loop.mjs detect`. */
export function detectReport() {
  const r = resolveAgent();
  const daemonCapable = r.mode !== "none";
  return {
    agents: r.available,
    daemonCapable,
    recommended: daemonCapable ? "daemon" : "in-session",
    launcher: r.mode === "custom" ? r.template : r.mode === "known" ? r.bin : null,
    hint: daemonCapable
      ? `Run \`node loop.mjs daemon\` — it launches a fresh ${r.label || "agent"} session per task.`
      : "No agent CLI detected. Loop in-session and dispatch a subagent per task to keep context small.",
  };
}
