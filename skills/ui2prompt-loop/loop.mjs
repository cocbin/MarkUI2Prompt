#!/usr/bin/env node
/**
 * UI2Prompt loop CLI — the single entry point a coding agent uses to run loop
 * mode. It hides every moving part the agent shouldn't have to think about:
 *
 *   - Auto-starts the local broker if it isn't already running (detached).
 *   - Keeps a stable, per-working-directory agent id (claim/fixed/reviewed all
 *     refer to the same agent across separate shell invocations).
 *   - Sends a heartbeat on every call so the extension shows the agent online.
 *
 * Two ways to run the loop (pick with `detect`):
 *   - Daemon  : `daemon` schedules a FRESH agent session per task (low context).
 *   - In-session: claim a task and dispatch a subagent to fix it, then repeat.
 *
 * Commands:
 *   up                         ensure the broker is running; print health
 *   detect                     which agent CLI is available + recommended mode
 *   daemon                     run the scheduler (fresh session per task)
 *   stop                       ask a running daemon/agents to stop
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
 * Env: UI2PROMPT_BROKER, UI2PROMPT_PORT, UI2PROMPT_DATA, UI2PROMPT_AGENT,
 *      UI2PROMPT_AGENT_CMD, UI2PROMPT_AGENT_BIN (see client.mjs / agents.mjs)
 */
import { api, agent, ensureBroker, heartbeat, out, die, BROKER, DATA_DIR } from "./client.mjs";
import { detectReport } from "./agents.mjs";
import { runDaemon } from "./daemon.mjs";

// ---- commands --------------------------------------------------------------

const commands = {
  async up() {
    await ensureBroker();
    await heartbeat();
    const h = await api("GET", "/api/health");
    out({ ok: true, broker: BROKER, agent: agent(), ...h });
  },

  detect() {
    out(detectReport());
  },

  async daemon() {
    await runDaemon();
  },

  async stop() {
    await ensureBroker();
    out(await api("POST", "/api/control", { stop: true }));
  },

  async next() {
    await ensureBroker();
    await heartbeat();
    const r = await api("POST", "/api/tasks/claim", { agentId: agent() });
    const task = r.task || null;
    const result = { task };
    if (task && task.feedback) {
      result.note = "This task was rejected before. Address `feedback` — do it differently.";
    }
    out(result);
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
      stop: !!(s.control && s.control.stop),
      tasks: (s.tasks || []).map((t) => ({
        id: t.id,
        status: t.status,
        problem: t.problem,
        feedback: t.feedback || "",
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
  detect                      which agent CLI is available + recommended mode
  daemon                      run the scheduler (fresh agent session per task)
  stop                        ask a running daemon/agents to stop
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
A rejected task carries human \`feedback\` — address it on the next attempt.
`;

const [cmd, ...args] = process.argv.slice(2);
const run = commands[cmd];
if (!run) {
  if (cmd && cmd !== "help") process.stderr.write(`unknown command: ${cmd}\n\n`);
  process.stdout.write(HELP);
  process.exit(cmd && cmd !== "help" ? 1 : 0);
}
Promise.resolve(run(...args)).catch((err) => die(err && err.message ? err.message : String(err)));
