import { createServer } from "node:http";
import { resolve } from "node:path";
import { TaskStore } from "./store.mjs";

/**
 * UI2Prompt loop broker: a tiny local HTTP service that is the shared source of
 * truth between the browser extension (human side, via fetch) and one or more
 * coding agents (via the stdio MCP server in mcp.mjs). Zero dependencies.
 *
 * Run: node server/broker.mjs            (port 8787, data ./.ui2prompt-loop)
 * Env: UI2PROMPT_PORT, UI2PROMPT_DATA, UI2PROMPT_LOCK_TTL_MS
 */
const PORT = Number(process.env.UI2PROMPT_PORT || process.argv[2] || 8787);
const DATA_FILE = resolve(process.env.UI2PROMPT_DATA || ".ui2prompt-loop", "state.json");
const LOCK_TTL = Number(process.env.UI2PROMPT_LOCK_TTL_MS || 10 * 60 * 1000);
const VERSION = "1.0.0";

const store = new TaskStore({ file: DATA_FILE, lockTtl: LOCK_TTL });

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

function send(res, status, body) {
  const payload = body == null ? "" : JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...CORS });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 5e6) reject(new Error("payload too large"));
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

/** Route table: [method, /regex/ with named-ish groups, handler]. */
const routes = [];
const on = (method, pattern, handler) => routes.push({ method, pattern, handler });

// ---- health + state -------------------------------------------------------
on("GET", /^\/api\/health$/, () => ({ ok: true, version: VERSION, tasks: store.tasks.size }));
on("GET", /^\/api\/state$/, () => store.snapshot());

// ---- tasks (extension/human side) -----------------------------------------
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

// ---- tasks (agent side) ---------------------------------------------------
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

// ---- questions ------------------------------------------------------------
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

// ---- agents + admin -------------------------------------------------------
on("POST", /^\/api\/agents\/heartbeat$/, async (m, req) => {
  const body = await readBody(req);
  return store.heartbeat(body.agentId, body.name);
});
on("POST", /^\/api\/reset$/, () => {
  store.clear();
  return { ok: true };
});

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

const server = createServer(async (req, res) => {
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
      send(res, status, { error: String((err && err.message) || err) });
    }
    return;
  }
  send(res, 404, { error: `no route for ${req.method} ${path}` });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[ui2prompt-broker] http://127.0.0.1:${PORT}  data=${DATA_FILE}`);
});

export { store, server };
