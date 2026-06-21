import { STATUS, STORAGE_KEYS, MSG, normalizeUrl } from "../shared/constants.js";
import { createAnnotation } from "../shared/annotation.js";
import { createStore } from "../shared/store.js";
import { createMessageRouter } from "../shared/router.js";
import { buildLoopPrompt } from "../shared/loop.js";

// Dev-only harness: renders the real popup UI against a real store + router with
// seeded data, by shimming the chrome.* APIs. NOT shipped in the extension.
//
// It also runs a tiny *in-memory* loop broker (no network needed) seeded with
// tasks that map 1:1 to the annotations below, covering every AI/loop state so
// the loop badges, robot-working animation, agent summaries, editable rejection
// feedback, confirm/reject actions and agent questions can all be previewed.

// Seed preferences (loop mode on, Chinese UI) before the popup boots so the
// main list polls the loop mock below. getSettings() falls back to localStorage
// in the harness (no chrome.storage shim), merging over DEFAULT_SETTINGS.
try {
  localStorage.setItem(
    "ui2prompt:settings",
    JSON.stringify({ loopEnabled: true, locale: "zh-CN", theme: "dark" }),
  );
} catch {
  /* storage disabled */
}

const EDITOR_URL =
  "http://localhost:5173/#/orch/bigscreen/srv-4/edit?page=bs-page-sz8da";
const url = normalizeUrl(EDITOR_URL);
const now = Date.now();

const TITLE = "大屏编排 · srv-4";

const seed = [
  createAnnotation({
    id: "a-confirmed",
    url,
    title: TITLE,
    userNote: "标题字号偏小且对比度不足，需要加大字号并提高亮度",
    selector: ".bs-lib__label",
    locatorQuality: "medium",
    label: "大屏标题",
    framework: {
      type: "vue",
      component: "BigScreenLib",
      file: "src/components/bigscreen/BigScreenLib.vue",
      vuePath: "App / RouterView / BigScreenEditor / BigScreenLib",
      domStack: "<BigScreenEditor> > div.bs-editor__body > <BigScreenLib> > div.bs-lib__head > span.bs-lib__label",
    },
    dom: { outerHTML: '<span class="bs-lib__label">大屏标题</span>', innerText: "大屏标题" },
    status: STATUS.CONFIRMED,
    history: [
      { status: STATUS.OPEN, timestamp: now - 5000 },
      { status: STATUS.FIXED_PENDING, timestamp: now - 4000 },
      { status: STATUS.CONFIRMED, timestamp: now - 3000 },
    ],
    timestamp: now - 5000,
  }),
  createAnnotation({
    id: "a-progress",
    url,
    title: TITLE,
    userNote: "面板标题与下方间距过大，建议压缩到 12px",
    selector: "#panel-library .panel-title",
    locatorQuality: "strong",
    label: "组件库",
    framework: {
      type: "vue",
      component: "PanelHeader",
      file: "src/components/bigscreen/PanelHeader.vue",
      vuePath: "App / RouterView / BigScreenEditor / PanelHeader",
      domStack: "<BigScreenEditor> > aside.bs-editor__side > <PanelHeader>#panel-library > strong.panel-title",
    },
    dom: { outerHTML: '<strong class="panel-title">组件库</strong>', innerText: "组件库" },
    status: STATUS.OPEN,
    timestamp: now - 4200,
  }),
  createAnnotation({
    id: "a-reviewed",
    url,
    title: TITLE,
    userNote: "主按钮悬浮态没有反馈，需要加上 hover 高亮与轻微放大",
    selector: "#toolbar .primary-action",
    locatorQuality: "strong",
    label: "保存",
    framework: {
      type: "vue",
      component: "EditorToolbar",
      file: "src/components/bigscreen/EditorToolbar.vue",
      vuePath: "App / RouterView / BigScreenEditor / EditorToolbar",
      domStack: "<BigScreenEditor> > header.bs-editor__bar > <EditorToolbar> > button.primary-action",
    },
    dom: { outerHTML: '<button class="primary-action">保存</button>', innerText: "保存" },
    status: STATUS.OPEN,
    timestamp: now - 3600,
  }),
  createAnnotation({
    id: "a-reopened",
    url,
    title: TITLE,
    userNote: "这个图标按钮没有文字，无法稳定定位，仅作示例",
    selector: "section > div > aside > div:nth-of-type(3) > button:nth-of-type(5)",
    locatorQuality: "weak",
    label: ".icon-btn",
    framework: { type: "unknown", component: "", file: "" },
    dom: { outerHTML: '<button class="icon-btn"></button>', innerText: "" },
    status: STATUS.OPEN,
    history: [
      { status: STATUS.OPEN, timestamp: now - 3000 },
      { status: STATUS.FIXED_PENDING, timestamp: now - 1800 },
      { status: STATUS.OPEN, note: "上次仍然偏小，请放大到 32px 并加粗", timestamp: now - 1200 },
    ],
    timestamp: now - 3000,
  }),
];

const mem = new Map();
mem.set(STORAGE_KEYS.PAGES_INDEX, [url]);
mem.set(STORAGE_KEYS.pageKey(url), { url, updatedAt: now, annotations: seed });

const backend = {
  get: (key) => Promise.resolve(mem.get(key)),
  set: (key, value) => (mem.set(key, value), Promise.resolve()),
  del: (key) => (mem.delete(key), Promise.resolve()),
};

const store = createStore(backend);
const router = createMessageRouter(store);
let mode = false;

// ---- in-memory loop broker mock -------------------------------------------
// Seeded so each AI/loop state is visible in both the main list and the panel.
const loop = {
  agents: [{ id: "claude#1a2b", online: true, lastSeen: now }],
  control: { stop: false, updatedAt: 0 },
  tasks: [
    {
      id: "a-progress",
      url,
      title: TITLE,
      problem: "面板标题与下方间距过大，建议压缩到 12px",
      location: "组件库面板 · #panel-library .panel-title",
      status: "in_progress",
      lockedBy: "claude#1a2b",
      agentSummary: "",
      feedback: "",
      updatedAt: now - 300,
    },
    {
      id: "a-reviewed",
      url,
      title: TITLE,
      problem: "主按钮悬浮态没有反馈，需要加上 hover 高亮与轻微放大",
      location: "顶部工具栏 · #toolbar .primary-action",
      status: "ai_reviewed",
      lockedBy: "",
      agentSummary: "为 .primary-action 增加 hover 高亮与 scale(1.02) 过渡（EditorToolbar.vue:48）",
      feedback: "",
      updatedAt: now - 200,
    },
    {
      id: "a-reopened",
      url,
      title: TITLE,
      problem: "这个图标按钮没有文字，无法稳定定位，仅作示例",
      location: "左侧第三组 · .icon-btn",
      status: "open",
      lockedBy: "",
      agentSummary: "",
      feedback: "上次仍然偏小，请放大到 32px 并加粗",
      updatedAt: now - 100,
    },
  ],
  questions: [
    {
      id: "q-1",
      taskId: "a-progress",
      question: "压缩间距时，是否需要同时调小标题字号以保持比例？",
      options: ["只压缩间距", "间距 + 字号一起调"],
      answer: null,
      createdAt: now - 250,
    },
  ],
};

function loopState() {
  return {
    agents: loop.agents,
    tasks: loop.tasks,
    questions: loop.questions,
    control: loop.control,
  };
}

function handleLoop(message) {
  switch (message.type) {
    case MSG.LOOP_HEALTH:
      return Promise.resolve({ ok: true, version: "harness", tasks: loop.tasks.length });
    case MSG.LOOP_STATE:
      return Promise.resolve(loopState());
    case MSG.LOOP_PROMPT:
      return Promise.resolve({ prompt: buildLoopPrompt({ locale: "zh-CN" }), brokerUrl: "harness (in-memory)" });
    case MSG.LOOP_ANSWER: {
      const q = loop.questions.find((x) => x.id === message.questionId);
      if (q) q.answer = message.answer;
      return Promise.resolve({ ok: true });
    }
    case MSG.LOOP_FEEDBACK: {
      const tk = loop.tasks.find((x) => x.id === message.id);
      if (tk && tk.status === "open" && !tk.lockedBy) tk.feedback = message.feedback || "";
      return Promise.resolve({ ok: true, feedback: tk ? tk.feedback : "" });
    }
    case MSG.LOOP_STOP:
      loop.control = { stop: true, updatedAt: Date.now() };
      return Promise.resolve(loop.control);
    case MSG.LOOP_RESET:
      loop.tasks = [];
      loop.questions = [];
      return Promise.resolve({ ok: true });
    case MSG.LOOP_PUSH:
      return Promise.resolve({ pushed: 0 });
    default:
      return Promise.reject(new Error(`unknown loop ${message.type}`));
  }
}

const LOOP_TYPES = new Set([
  MSG.LOOP_HEALTH,
  MSG.LOOP_STATE,
  MSG.LOOP_PUSH,
  MSG.LOOP_ANSWER,
  MSG.LOOP_RESET,
  MSG.LOOP_PROMPT,
  MSG.LOOP_FEEDBACK,
  MSG.LOOP_STOP,
]);

// When the human confirms / rejects from the popup, mirror the verdict into the
// loop mock too so the board + list stay consistent (mirrors the real
// background's syncLoopSideEffects).
function mirrorVerdict(message) {
  if (message.type !== MSG.SET_STATUS) return;
  const tk = loop.tasks.find((x) => x.id === message.id);
  if (!tk) return;
  if (message.status === STATUS.CONFIRMED) {
    tk.status = "confirmed";
    tk.feedback = "";
    tk.lockedBy = "";
  } else if (message.status === STATUS.REJECTED) {
    tk.status = "open";
    tk.lockedBy = "";
    tk.agentSummary = "";
    if (message.note) tk.feedback = message.note;
  }
}

window.chrome = {
  runtime: {
    lastError: undefined,
    sendMessage(message, cb) {
      if (message && LOOP_TYPES.has(message.type)) {
        handleLoop(message)
          .then((data) => cb && cb({ ok: true, data }))
          .catch((e) => cb && cb({ ok: false, error: String(e && e.message) }));
        return;
      }
      mirrorVerdict(message);
      router
        .handle(message)
        .then((res) => cb && cb({ ok: true, data: res.data }))
        .catch((e) => cb && cb({ ok: false, error: String(e && e.message) }));
    },
    onMessage: { addListener() {} },
  },
  tabs: {
    query(_q, cb) {
      cb([{ id: 1, url: EDITOR_URL }]);
    },
    sendMessage(_tabId, message, cb) {
      if (message.type === "SET_MODE") mode = !!message.enabled;
      let data = { ok: true };
      if (message.type === "GET_MODE" || message.type === "SET_MODE") data = { enabled: mode };
      else if (message.type === "SNAPSHOT") data = { ok: true, reason: "harness" };
      cb && cb({ ok: true, data });
    },
    create({ url: u }) {
      window.open(u, "_blank");
    },
  },
};
