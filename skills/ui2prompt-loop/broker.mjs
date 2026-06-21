// Bundled by scripts/build-skill.mjs — do not edit; edit server/*.mjs instead.

// server/broker.mjs
import { createServer } from "node:http";
import { resolve } from "node:path";

// server/store.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
var TASK_STATUS = {
  OPEN: "open",
  IN_PROGRESS: "in_progress",
  AI_FIXED: "ai_fixed",
  AI_REVIEWED: "ai_reviewed",
  CONFIRMED: "confirmed",
  REJECTED: "rejected"
};
var ACTIVE_FOR_AGENT = /* @__PURE__ */ new Set([TASK_STATUS.IN_PROGRESS]);
var DEFAULT_LOCK_TTL = 10 * 60 * 1e3;
var counter = 0;
function genId(prefix) {
  counter = (counter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}
var TaskStore = class {
  constructor({ file, lockTtl = DEFAULT_LOCK_TTL } = {}) {
    this.file = file || null;
    this.lockTtl = lockTtl;
    this.tasks = /* @__PURE__ */ new Map();
    this.questions = /* @__PURE__ */ new Map();
    this.agents = /* @__PURE__ */ new Map();
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
      if (raw.control) this.control = { ...this.control, ...raw.control, stop: false };
    } catch {
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
              control: this.control
            },
            null,
            2
          )
        );
      } catch {
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
    return [...this.agents.values()].map((a) => ({ ...a, online: now - a.lastSeen < 90 * 1e3 }));
  }
  // ---- tasks (extension side) -------------------------------------------
  /** Upsert a task pushed by the extension when the human annotates a problem. */
  upsertTask(input) {
    if (!input || !input.id) throw new Error("task.id required");
    const existing = this.tasks.get(input.id);
    const now = Date.now();
    if (existing) {
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
        updatedAt: now
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
      feedback: "",
      // latest human rejection reason; cleared once re-fixed
      createdAt: now,
      updatedAt: now
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
    this.control = { ...this.control, ...patch || {}, updatedAt: Date.now() };
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
    const pick = ordered.find((t) => t.status === TASK_STATUS.OPEN && !t.lockedBy) || ordered.find((t) => t.status === TASK_STATUS.IN_PROGRESS && this._lockExpired(t));
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
    task.feedback = "";
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
      createdAt: Date.now()
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
      control: this.getControl()
    };
  }
};

// server/broker.mjs
var PORT = Number(process.env.UI2PROMPT_PORT || process.argv[2] || 8787);
var DATA_FILE = resolve(process.env.UI2PROMPT_DATA || ".ui2prompt-loop", "state.json");
var LOCK_TTL = Number(process.env.UI2PROMPT_LOCK_TTL_MS || 10 * 60 * 1e3);
var VERSION = "1.0.0";
var store = new TaskStore({ file: DATA_FILE, lockTtl: LOCK_TTL });
var CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400"
};
function send(res, status, body) {
  const payload = body == null ? "" : JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...CORS });
  res.end(payload);
}
function readBody(req) {
  return new Promise((resolve2, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 5e6) reject(new Error("payload too large"));
    });
    req.on("end", () => {
      if (!data) return resolve2({});
      try {
        resolve2(JSON.parse(data));
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}
var routes = [];
var on = (method, pattern, handler) => routes.push({ method, pattern, handler });
on("GET", /^\/api\/health$/, () => ({ ok: true, version: VERSION, tasks: store.tasks.size }));
on("GET", /^\/api\/state$/, () => store.snapshot());
on("POST", /^\/api\/tasks$/, async (m, req) => {
  const body = await readBody(req);
  return store.upsertTask(body.task || body);
});
on("DELETE", /^\/api\/tasks\/([^/]+)$/, (m) => ({ ok: store.removeTask(m[1]) }));
on("GET", /^\/api\/tasks\/([^/]+)\/details$/, (m) => {
  const task = store.getTask(m[1]);
  if (!task) throw httpError(404, "task not found");
  return { id: task.id, problem: task.problem, location: task.location, domDetails: task.domDetails, layers: task.layers };
});
on("POST", /^\/api\/tasks\/([^/]+)\/verdict$/, async (m, req) => {
  const body = await readBody(req);
  const task = store.setHumanVerdict(m[1], body.verdict, body.note);
  if (!task) throw httpError(404, "task not found");
  return task;
});
on("POST", /^\/api\/tasks\/([^/]+)\/feedback$/, async (m, req) => {
  const body = await readBody(req);
  const task = store.editFeedback(m[1], body.feedback);
  if (!task) throw httpError(404, "task not found");
  return task;
});
on("POST", /^\/api\/tasks\/claim$/, async (m, req) => {
  const body = await readBody(req);
  if (!body.agentId) throw httpError(400, "agentId required");
  const task = store.claim(body.agentId);
  return { task: task || null };
});
on("POST", /^\/api\/tasks\/([^/]+)\/complete$/, async (m, req) => {
  const body = await readBody(req);
  return store.complete(m[1], body.agentId, body.summary);
});
on("POST", /^\/api\/tasks\/([^/]+)\/review$/, async (m, req) => {
  const body = await readBody(req);
  return store.review(m[1], body.agentId, body.summary);
});
on("POST", /^\/api\/tasks\/([^/]+)\/release$/, async (m, req) => {
  const body = await readBody(req);
  return store.release(m[1], body.agentId);
});
on("POST", /^\/api\/tasks\/([^/]+)\/ask$/, async (m, req) => {
  const body = await readBody(req);
  const q = store.ask(m[1], body.agentId, body.question, body.options);
  return { questionId: q.id, question: q };
});
on("GET", /^\/api\/questions\/([^/]+)$/, (m) => {
  const status = store.answerStatus(m[1]);
  if (!status) throw httpError(404, "question not found");
  return status;
});
on("POST", /^\/api\/questions\/([^/]+)\/answer$/, async (m, req) => {
  const body = await readBody(req);
  const q = store.answerQuestion(m[1], body.answer);
  if (!q) throw httpError(404, "question not found");
  return q;
});
on("POST", /^\/api\/agents\/heartbeat$/, async (m, req) => {
  const body = await readBody(req);
  return store.heartbeat(body.agentId, body.name);
});
on("POST", /^\/api\/reset$/, () => {
  store.clear();
  return { ok: true };
});
on("GET", /^\/api\/control$/, () => store.getControl());
on("POST", /^\/api\/control$/, async (m, req) => {
  const body = await readBody(req);
  return store.setControl(body);
});
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}
var server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }
  const path = (req.url || "/").split("?")[0];
  for (const route of routes) {
    if (route.method !== req.method) continue;
    const match = route.pattern.exec(path);
    if (!match) continue;
    try {
      const result = await route.handler(match, req, res);
      if (!res.headersSent) send(res, 200, result);
    } catch (err) {
      const status = err && err.status ? err.status : 400;
      send(res, status, { error: String(err && err.message || err) });
    }
    return;
  }
  send(res, 404, { error: `no route for ${req.method} ${path}` });
});
server.listen(PORT, "127.0.0.1", () => {
  console.log(`[ui2prompt-broker] http://127.0.0.1:${PORT}  data=${DATA_FILE}`);
});
export {
  server,
  store
};
