import { hostname } from "node:os";

/**
 * UI2Prompt loop — stdio MCP server for coding agents (Claude Code, etc.).
 *
 * It speaks newline-delimited JSON-RPC 2.0 on stdin/stdout and proxies every
 * tool call to the shared broker over HTTP. Each running instance is ONE agent
 * (its own agentId), so launching the same MCP server from several Claude Code
 * sessions gives true multi-agent concurrency against one task queue — and the
 * broker guarantees a claimed task is locked to a single agent.
 *
 * IMPORTANT: only JSON-RPC frames may go to stdout; all logs go to stderr.
 *
 * Env: UI2PROMPT_BROKER (default http://127.0.0.1:8787), UI2PROMPT_AGENT,
 *      UI2PROMPT_AGENT_NAME.
 */
const BROKER = (process.env.UI2PROMPT_BROKER || "http://127.0.0.1:8787").replace(/\/$/, "");
const AGENT_ID = process.env.UI2PROMPT_AGENT || `agent_${hostname()}_${process.pid}`;
const AGENT_NAME = process.env.UI2PROMPT_AGENT_NAME || AGENT_ID;
const SERVER_INFO = { name: "ui2prompt-loop", version: "1.0.0" };

const log = (...a) => process.stderr.write(`[ui2prompt-mcp] ${a.join(" ")}\n`);

async function broker(method, path, body) {
  const res = await fetch(`${BROKER}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) throw new Error(data && data.error ? data.error : `broker ${res.status}`);
  return data;
}

// ---- tool definitions -----------------------------------------------------

const TOOLS = [
  {
    name: "get_task",
    description:
      "Claim the next available UI task from the queue (atomically locked to you). Returns the problem, its UI location, page url and a stable selector. Returns {task:null} when the queue is empty — then wait ~60s and call again. Always work the task you claimed before claiming another.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async () => {
      const { task } = await broker("POST", "/api/tasks/claim", { agentId: AGENT_ID });
      if (!task) return { empty: true, message: "No tasks available. Wait ~60 seconds, then call get_task again. Keep looping until the human stops you." };
      return { task: publicTask(task) };
    },
  },
  {
    name: "complete_task",
    description:
      "Mark a task you claimed as AI-fixed (你已修复). Provide a short summary of the code change. This moves it to 'awaiting human verification'.",
    inputSchema: {
      type: "object",
      properties: { taskId: { type: "string" }, summary: { type: "string", description: "What you changed and where (file/line)." } },
      required: ["taskId"],
      additionalProperties: false,
    },
    run: async (a) => ({ task: publicTask(await broker("POST", `/api/tasks/${enc(a.taskId)}/complete`, { agentId: AGENT_ID, summary: a.summary })) }),
  },
  {
    name: "review_task",
    description:
      "Mark a task as AI-reviewed (你已自查/Review). Call this after complete_task once you have double-checked your own fix. Provide the review conclusion as summary.",
    inputSchema: {
      type: "object",
      properties: { taskId: { type: "string" }, summary: { type: "string" } },
      required: ["taskId"],
      additionalProperties: false,
    },
    run: async (a) => ({ task: publicTask(await broker("POST", `/api/tasks/${enc(a.taskId)}/review`, { agentId: AGENT_ID, summary: a.summary })) }),
  },
  {
    name: "ask_user",
    description:
      "Ask the human a multiple-choice question when a task has several valid solutions (NON-BLOCKING). Returns a questionId immediately — do NOT wait. Continue claiming/working other tasks, then later call get_answer with this id. Only act once an answer arrives.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        question: { type: "string" },
        options: { type: "array", items: { type: "string" }, description: "2+ concrete options for the human to pick from." },
      },
      required: ["taskId", "question", "options"],
      additionalProperties: false,
    },
    run: async (a) => {
      const r = await broker("POST", `/api/tasks/${enc(a.taskId)}/ask`, { agentId: AGENT_ID, question: a.question, options: a.options });
      return { questionId: r.questionId, note: "Do not block. Keep working other tasks, then poll get_answer later." };
    },
  },
  {
    name: "get_answer",
    description:
      "Poll whether the human has answered a question raised by ask_user. Returns {answered:false} (keep working other tasks) or {answered:true, answer:'…'}.",
    inputSchema: {
      type: "object",
      properties: { questionId: { type: "string" } },
      required: ["questionId"],
      additionalProperties: false,
    },
    run: async (a) => {
      const s = await broker("GET", `/api/questions/${enc(a.questionId)}`);
      return { answered: !!s.answered, answer: s.answer ?? null, question: s.question };
    },
  },
  {
    name: "get_task_details",
    description:
      "Fetch the full 4-layer DOM model (Raw DOM / Semantic DOM / Accessibility Tree / Visual Layout) for a task when the selector/location alone is not enough to find the element in the source.",
    inputSchema: {
      type: "object",
      properties: { taskId: { type: "string" } },
      required: ["taskId"],
      additionalProperties: false,
    },
    run: async (a) => broker("GET", `/api/tasks/${enc(a.taskId)}/details`),
  },
  {
    name: "release_task",
    description: "Give up a task you claimed but cannot complete; it returns to the queue for another agent.",
    inputSchema: {
      type: "object",
      properties: { taskId: { type: "string" } },
      required: ["taskId"],
      additionalProperties: false,
    },
    run: async (a) => ({ task: publicTask(await broker("POST", `/api/tasks/${enc(a.taskId)}/release`, { agentId: AGENT_ID })) }),
  },
  {
    name: "list_tasks",
    description: "List all tasks and their statuses (overview / debugging). Does not claim anything.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async () => {
      const s = await broker("GET", "/api/state");
      return { tasks: (s.tasks || []).map(publicTask), pendingQuestions: (s.questions || []).filter((q) => q.answer == null).map((q) => ({ id: q.id, taskId: q.taskId, question: q.question })) };
    },
  },
];

const enc = (s) => encodeURIComponent(String(s));

function publicTask(t) {
  if (!t) return null;
  return {
    id: t.id,
    status: t.status,
    problem: t.problem,
    location: t.location,
    url: t.url,
    title: t.title,
    selector: t.selector,
    label: t.label,
    uiContext: t.uiContext,
    lockedBy: t.lockedBy,
    agentSummary: t.agentSummary,
  };
}

const TOOL_MAP = new Map(TOOLS.map((tool) => [tool.name, tool]));

// ---- JSON-RPC plumbing ----------------------------------------------------

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function ok(id, result) {
  write({ jsonrpc: "2.0", id, result });
}

function fail(id, code, message) {
  write({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handle(msg) {
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;

  if (method === "initialize") {
    return ok(id, {
      protocolVersion: (params && params.protocolVersion) || "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
    });
  }
  if (method === "notifications/initialized" || method === "initialized") {
    broker("POST", "/api/agents/heartbeat", { agentId: AGENT_ID, name: AGENT_NAME }).catch(() => {});
    return; // notification: no response
  }
  if (method === "ping") return ok(id, {});
  if (method === "tools/list") {
    return ok(id, { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
  }
  if (method === "tools/call") {
    const tool = TOOL_MAP.get(params && params.name);
    if (!tool) return fail(id, -32602, `unknown tool: ${params && params.name}`);
    try {
      const result = await tool.run((params && params.arguments) || {});
      return ok(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
    } catch (err) {
      return ok(id, { content: [{ type: "text", text: `Error: ${String((err && err.message) || err)}` }], isError: true });
    }
  }
  if (isNotification) return; // ignore unknown notifications
  return fail(id, -32601, `method not found: ${method}`);
}

// ---- stdin reader (newline-delimited JSON) --------------------------------

let buffer = "";
let pending = 0;
let ended = false;
const maybeExit = () => {
  if (ended && pending === 0) process.exit(0);
};

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      fail(null, -32700, "parse error");
      continue;
    }
    pending += 1;
    Promise.resolve(handle(msg))
      .catch((err) => log("handler error:", String(err && err.message)))
      .finally(() => {
        pending -= 1;
        maybeExit();
      });
  }
});
// When the client disconnects, finish any in-flight request before exiting.
process.stdin.on("end", () => {
  ended = true;
  maybeExit();
});

log(`ready · agent=${AGENT_ID} · broker=${BROKER}`);
