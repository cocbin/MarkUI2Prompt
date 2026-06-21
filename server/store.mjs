import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

/**
 * In-memory task + question store for the UI2Prompt loop broker, persisted to a
 * JSON file. The whole process is single-threaded, so every public method
 * mutates state synchronously *before* the (debounced) async persist — that is
 * what makes `claim` atomic across concurrent agents (requirement: multi-agent,
 * one task is locked to a single agent and never handed out twice).
 *
 * Task lifecycle:
 *   open ──claim──▶ in_progress ──complete──▶ ai_fixed ──review──▶ ai_reviewed
 *     ▲                  │                                              │
 *     └── reject/release ┘ (human reject re-opens; release unlocks)     │
 *   confirmed ◀───────────────────── human confirm ─────────────────────┘
 */
export const TASK_STATUS = {
  OPEN: "open",
  IN_PROGRESS: "in_progress",
  AI_FIXED: "ai_fixed",
  AI_REVIEWED: "ai_reviewed",
  CONFIRMED: "confirmed",
  REJECTED: "rejected",
};

const ACTIVE_FOR_AGENT = new Set([TASK_STATUS.IN_PROGRESS]);
const DEFAULT_LOCK_TTL = 10 * 60 * 1000; // a crashed agent's lock is reclaimable

let counter = 0;
function genId(prefix) {
  counter = (counter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

export class TaskStore {
  constructor({ file, lockTtl = DEFAULT_LOCK_TTL } = {}) {
    this.file = file || null;
    this.lockTtl = lockTtl;
    this.tasks = new Map();
    this.questions = new Map();
    this.agents = new Map();
    // Run control shared with the daemon/agents: when `stop` is set, a running
    // scheduler exits its loop after finishing the current task.
    this.control = { stop: false, updatedAt: 0 };
    this._saveTimer = null;
    this._load();
  }

  // ---- persistence -------------------------------------------------------

  _load() {
    if (!this.file || !existsSync(this.file)) return;
    try {
      const raw = JSON.parse(readFileSync(this.file, "utf8"));
      for (const t of raw.tasks || []) this.tasks.set(t.id, t);
      for (const q of raw.questions || []) this.questions.set(q.id, q);
      // `stop` is a transient run-control flag; never resurrect it on restart.
      if (raw.control) this.control = { ...this.control, ...raw.control, stop: false };
    } catch {
      /* corrupt state file → start fresh */
    }
  }

  _persist() {
    if (!this.file) return;
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      try {
        mkdirSync(dirname(this.file), { recursive: true });
        writeFileSync(
          this.file,
          JSON.stringify(
            {
              tasks: [...this.tasks.values()],
              questions: [...this.questions.values()],
              control: this.control,
            },
            null,
            2,
          ),
        );
      } catch {
        /* best-effort persistence */
      }
    }, 120);
  }

  // ---- agents ------------------------------------------------------------

  heartbeat(agentId, name) {
    if (!agentId) return null;
    const prev = this.agents.get(agentId) || { id: agentId, firstSeen: Date.now() };
    const agent = { ...prev, id: agentId, name: name || prev.name || agentId, lastSeen: Date.now() };
    this.agents.set(agentId, agent);
    return agent;
  }

  listAgents() {
    const now = Date.now();
    return [...this.agents.values()].map((a) => ({ ...a, online: now - a.lastSeen < 90 * 1000 }));
  }

  // ---- tasks (extension side) -------------------------------------------

  /** Upsert a task pushed by the extension when the human annotates a problem. */
  upsertTask(input) {
    if (!input || !input.id) throw new Error("task.id required");
    const existing = this.tasks.get(input.id);
    const now = Date.now();
    if (existing) {
      // Preserve agent-owned lifecycle fields; only refresh human-authored data.
      const merged = {
        ...existing,
        problem: input.problem ?? existing.problem,
        location: input.location ?? existing.location,
        selector: input.selector ?? existing.selector,
        label: input.label ?? existing.label,
        title: input.title ?? existing.title,
        url: input.url ?? existing.url,
        uiContext: input.uiContext ?? existing.uiContext,
        domDetails: input.domDetails ?? existing.domDetails,
        layers: input.layers ?? existing.layers,
        updatedAt: now,
      };
      this.tasks.set(merged.id, merged);
      this._persist();
      return merged;
    }
    const task = {
      id: input.id,
      url: input.url || "",
      title: input.title || "",
      problem: input.problem || "",
      location: input.location || "",
      selector: input.selector || "",
      label: input.label || "",
      uiContext: input.uiContext || [],
      domDetails: input.domDetails || "",
      layers: input.layers || null,
      status: TASK_STATUS.OPEN,
      lockedBy: null,
      lockedAt: 0,
      agentSummary: "",
      feedback: "", // latest human rejection reason; cleared once re-fixed
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(task.id, task);
    this._persist();
    return task;
  }

  removeTask(id) {
    const ok = this.tasks.delete(id);
    for (const [qid, q] of this.questions) if (q.taskId === id) this.questions.delete(qid);
    if (ok) this._persist();
    return ok;
  }

  clear() {
    this.tasks.clear();
    this.questions.clear();
    this._persist();
  }

  getTask(id) {
    return this.tasks.get(id) || null;
  }

  listTasks() {
    return [...this.tasks.values()].sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * Human verdict from the extension: confirm or reject (re-opens the task).
   * A reject stores the human's reason as `feedback` (NOT overwriting the
   * original `problem`) so a re-claiming agent fixes it differently.
   */
  setHumanVerdict(id, verdict, note) {
    const task = this.tasks.get(id);
    if (!task) return null;
    if (verdict === "confirm") {
      task.status = TASK_STATUS.CONFIRMED;
    } else if (verdict === "reject") {
      task.status = TASK_STATUS.OPEN;
      task.lockedBy = null;
      task.lockedAt = 0;
      if (note != null) task.feedback = String(note || "");
    }
    task.updatedAt = Date.now();
    this._persist();
    return task;
  }

  /**
   * Edit a rejected task's feedback. Only allowed while the task is still in
   * the queue and unclaimed — once an agent has claimed it (in_progress) the
   * reason is frozen until the next iteration (requirements item 4).
   */
  editFeedback(id, note) {
    const task = this.tasks.get(id);
    if (!task) return null;
    const claimed = task.lockedBy && !this._lockExpired(task);
    if (task.status !== TASK_STATUS.OPEN || claimed) {
      const err = new Error("feedback locked: task already claimed by an agent");
      err.status = 409;
      throw err;
    }
    task.feedback = String(note == null ? "" : note);
    task.updatedAt = Date.now();
    this._persist();
    return task;
  }

  // ---- run control (daemon / agents) ------------------------------------

  getControl() {
    return { ...this.control };
  }

  setControl(patch) {
    this.control = { ...this.control, ...(patch || {}), updatedAt: Date.now() };
    this._persist();
    return this.getControl();
  }

  // ---- tasks (agent side) -----------------------------------------------

  _lockExpired(task) {
    return task.lockedAt && Date.now() - task.lockedAt > this.lockTtl;
  }

  /**
   * Atomically claim the next workable task for an agent. Returns the task or
   * null. Open tasks first; an in_progress task whose lock has expired (crashed
   * agent) is reclaimable. The mutation is synchronous → no two agents collide.
   */
  claim(agentId) {
    if (!agentId) throw new Error("agentId required");
    const ordered = this.listTasks();
    const pick = ordered.find((t) => t.status === TASK_STATUS.OPEN && !t.lockedBy) ||
      ordered.find((t) => t.status === TASK_STATUS.IN_PROGRESS && this._lockExpired(t));
    if (!pick) return null;
    pick.status = TASK_STATUS.IN_PROGRESS;
    pick.lockedBy = agentId;
    pick.lockedAt = Date.now();
    pick.updatedAt = pick.lockedAt;
    this.heartbeat(agentId);
    this._persist();
    return pick;
  }

  _ownedTask(id, agentId) {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`task ${id} not found`);
    if (task.lockedBy && task.lockedBy !== agentId && !this._lockExpired(task)) {
      throw new Error(`task ${id} is locked by another agent (${task.lockedBy})`);
    }
    return task;
  }

  complete(id, agentId, summary) {
    const task = this._ownedTask(id, agentId);
    task.status = TASK_STATUS.AI_FIXED;
    task.lockedBy = agentId;
    task.agentSummary = summary || task.agentSummary;
    task.feedback = ""; // the rejection reason has now been addressed
    task.updatedAt = Date.now();
    this.heartbeat(agentId);
    this._persist();
    return task;
  }

  review(id, agentId, summary) {
    const task = this._ownedTask(id, agentId);
    task.status = TASK_STATUS.AI_REVIEWED;
    task.lockedBy = agentId;
    if (summary) task.agentSummary = summary;
    task.updatedAt = Date.now();
    this.heartbeat(agentId);
    this._persist();
    return task;
  }

  release(id, agentId) {
    const task = this._ownedTask(id, agentId);
    if (ACTIVE_FOR_AGENT.has(task.status)) task.status = TASK_STATUS.OPEN;
    task.lockedBy = null;
    task.lockedAt = 0;
    task.updatedAt = Date.now();
    this._persist();
    return task;
  }

  // ---- questions ---------------------------------------------------------

  ask(taskId, agentId, question, options) {
    if (!this.tasks.has(taskId)) throw new Error(`task ${taskId} not found`);
    const q = {
      id: genId("q"),
      taskId,
      agentId: agentId || "",
      question: String(question || "").trim(),
      options: Array.isArray(options) ? options.map((o) => String(o)).filter(Boolean) : [],
      answer: null,
      answeredAt: 0,
      createdAt: Date.now(),
    };
    this.questions.set(q.id, q);
    this._persist();
    return q;
  }

  getQuestion(id) {
    return this.questions.get(id) || null;
  }

  /** Agent poll: is this question answered yet? Never blocks. */
  answerStatus(id) {
    const q = this.questions.get(id);
    if (!q) return null;
    return { id: q.id, taskId: q.taskId, answered: q.answer != null, answer: q.answer, question: q.question };
  }

  /** Human supplies the answer from the extension UI. */
  answerQuestion(id, answer) {
    const q = this.questions.get(id);
    if (!q) return null;
    q.answer = String(answer == null ? "" : answer);
    q.answeredAt = Date.now();
    this.questions.set(id, q);
    this._persist();
    return q;
  }

  listQuestions() {
    return [...this.questions.values()].sort((a, b) => a.createdAt - b.createdAt);
  }

  // ---- snapshots ---------------------------------------------------------

  snapshot() {
    return {
      serverTime: Date.now(),
      tasks: this.listTasks(),
      questions: this.listQuestions(),
      agents: this.listAgents(),
      control: this.getControl(),
    };
  }
}
