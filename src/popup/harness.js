import { STATUS, STORAGE_KEYS, normalizeUrl } from "../shared/constants.js";
import { createAnnotation } from "../shared/annotation.js";
import { createStore } from "../shared/store.js";
import { createMessageRouter } from "../shared/router.js";

// Dev-only harness: renders the real popup UI against a real store + router with
// seeded data, by shimming the chrome.* APIs. NOT shipped in the extension.

const EDITOR_URL =
  "http://localhost:5173/#/orch/bigscreen/srv-4/edit?page=bs-page-sz8da";
const url = normalizeUrl(EDITOR_URL);
const now = Date.now();

const TITLE = "大屏编排 · srv-4";

const seed = [
  createAnnotation({
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
    },
    dom: { outerHTML: '<strong class="panel-title">组件库</strong>', innerText: "组件库" },
    status: STATUS.OPEN,
    timestamp: now - 4000,
  }),
  createAnnotation({
    url,
    title: TITLE,
    userNote: "这个图标按钮没有文字，无法稳定定位，仅作示例",
    selector: "section > div > aside > div:nth-of-type(3) > button:nth-of-type(5)",
    locatorQuality: "weak",
    label: ".icon-btn",
    framework: { type: "unknown", component: "", file: "" },
    dom: { outerHTML: '<button class="icon-btn"></button>', innerText: "" },
    status: STATUS.FIXED_PENDING,
    history: [
      { status: STATUS.OPEN, timestamp: now - 3000 },
      { status: STATUS.FIXED_PENDING, timestamp: now - 1000 },
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

window.chrome = {
  runtime: {
    lastError: undefined,
    sendMessage(message, cb) {
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
      const data = message.type === "GET_MODE" || message.type === "SET_MODE" ? { enabled: mode } : { ok: true };
      cb && cb({ ok: true, data });
    },
    create({ url: u }) {
      window.open(u, "_blank");
    },
  },
};
