import { MSG, STATUS, normalizeUrl } from "../shared/constants.js";
import { t, setLocale, resolveLocale, LOCALE_NAMES } from "../shared/i18n.js";
import { getSettings, setSettings, subscribeSettings, resolveTheme } from "../shared/settings.js";
import { buildThemeCss } from "../shared/theme.js";
import { icon } from "../shared/icons.js";
import { Api, getActiveTab } from "./api.js";
import { countByStatus, renderFilters, renderList, renderProjects } from "./render.js";
import { openMenu, closeMenu } from "./menus.js";
import { openSettings, openGuide } from "./dialogs.js";
import { openLoopPanel } from "./loop-panel.js";

// Inject design tokens once (single source of truth shared with the overlay).
(function injectTokens() {
  const style = document.createElement("style");
  style.textContent = buildThemeCss(":root", ':root[data-theme="dark"]');
  document.head.appendChild(style);
})();

const state = {
  tabId: null,
  url: "",
  annotations: [],
  filter: STATUS.OPEN, // default to the "Open" tab (requirements item 4)
  editing: null,
  modeAvailable: false,
  settings: { theme: "system", locale: "", showResolved: false, lockHostKeys: true },
  // Live agent progress merged into the main list (requirements items 1 & 2).
  loop: { byId: new Map(), questionsByTask: new Map() },
  loopEditing: false, // pause loop re-render while the user types a reply/reason
  loopTimer: 0,
};

const dom = {
  app: document.getElementById("app"),
  tagline: document.getElementById("tagline"),
  langBtn: document.getElementById("langBtn"),
  themeBtn: document.getElementById("themeBtn"),
  loopBtn: document.getElementById("loopBtn"),
  settingsBtn: document.getElementById("settingsBtn"),
  helpBtn: document.getElementById("helpBtn"),
  modeBtn: document.getElementById("modeBtn"),
  filters: document.getElementById("filters"),
  list: document.getElementById("list"),
  projects: document.getElementById("projects"),
  copyPage: document.getElementById("copyPage"),
  copyAll: document.getElementById("copyAll"),
  downloadPage: document.getElementById("downloadPage"),
  downloadAll: document.getElementById("downloadAll"),
  downloadFull: document.getElementById("downloadFull"),
  screenshot: document.getElementById("screenshot"),
  clearPage: document.getElementById("clearPage"),
  menu: document.getElementById("menu"),
  settingsDialog: document.getElementById("settingsDialog"),
  guideDialog: document.getElementById("guideDialog"),
  loopDialog: document.getElementById("loopDialog"),
  toast: document.getElementById("toast"),
};

let toastTimer = 0;
function toast(message) {
  dom.toast.textContent = message;
  dom.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dom.toast.classList.remove("show"), 2000);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

function slugFromUrl(url) {
  try {
    const u = new URL(url);
    const path = `${u.hostname}${u.pathname}${u.hash}`
      .replace(/[^\w\u4e00-\u9fa5]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return path.slice(0, 60) || "page";
  } catch {
    return "page";
  }
}

function downloadText(text, name) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function currentLocale() {
  return resolveLocale(state.settings.locale);
}

// ---- mode button --------------------------------------------------------

function setModeButton(enabled) {
  dom.modeBtn.classList.toggle("active", enabled);
  if (!state.modeAvailable) {
    dom.modeBtn.innerHTML = `<span></span>`;
    dom.modeBtn.querySelector("span").textContent = t("mode.unavailable");
    return;
  }
  const ic = enabled ? icon("square", { size: 15 }) : icon("pointer", { size: 15 });
  dom.modeBtn.innerHTML = `${ic}<span></span>`;
  dom.modeBtn.querySelector("span").textContent = enabled ? t("mode.stop") : t("mode.start");
}

// ---- theme / locale -----------------------------------------------------

function applyTheme() {
  const resolved = resolveTheme(state.settings.theme);
  document.documentElement.dataset.theme = resolved;
  dom.themeBtn.innerHTML = icon(resolved === "dark" ? "moon" : "sun", { size: 16 });
  dom.themeBtn.title = `${t("settings.theme")}: ${t(`theme.${resolved}`)}`;
}

function applyStaticLabels() {
  dom.tagline.textContent = t("tagline");
  dom.langBtn.innerHTML = icon("languages", { size: 16 });
  dom.langBtn.title = t("settings.language");
  dom.loopBtn.innerHTML = icon("loop", { size: 16 });
  dom.loopBtn.title = t("loop.title");
  dom.loopBtn.classList.toggle("active", !!state.settings.loopEnabled);
  dom.settingsBtn.innerHTML = icon("gear", { size: 16 });
  dom.settingsBtn.title = t("settings.title");
  dom.helpBtn.innerHTML = icon("help", { size: 16 });
  dom.helpBtn.title = t("guide.open");
  setModeButton(dom.modeBtn.classList.contains("active"));

  const setBtn = (node, iconName, key, trailingCaret) => {
    const caret = trailingCaret ? icon("chevronDown", { size: 13, cls: "caret" }) : "";
    node.innerHTML = `${icon(iconName, { size: 14 })}<span></span>${caret}`;
    node.querySelector("span").textContent = t(key);
  };
  setBtn(dom.copyPage, "copy", "footer.copyPage");
  setBtn(dom.copyAll, "copy", "footer.copyAll");
  setBtn(dom.downloadPage, "download", "footer.downloadPage");
  setBtn(dom.downloadAll, "download", "footer.downloadAll", true);
  setBtn(dom.screenshot, "camera", "footer.screenshot");
  setBtn(dom.clearPage, "trash", "footer.clear");
  setBtn(dom.downloadFull, "layers", "footer.downloadFull", true);
}

// ---- rendering ----------------------------------------------------------

function render() {
  const counts = countByStatus(state.annotations);
  renderFilters(dom.filters, counts, state.filter, (key) => {
    state.filter = key;
    render();
  });
  renderList(dom.list, state.annotations, state.filter, handlers, state.editing, state.loop);
}

// ---- loop mode: merge live agent progress into the main list --------------

function syncLoopPoll(enabled) {
  if (enabled && !state.loopTimer) {
    loopTick();
    state.loopTimer = setInterval(loopTick, 2500);
  } else if (!enabled && state.loopTimer) {
    clearInterval(state.loopTimer);
    state.loopTimer = 0;
    state.loop = { byId: new Map(), questionsByTask: new Map() };
    render();
  }
}

async function loopTick() {
  let snap = null;
  try {
    snap = await Api.loopState();
  } catch {
    return; // broker offline — main list stays purely human-side
  }
  const byId = new Map();
  for (const task of snap.tasks || []) byId.set(task.id, task);
  const questionsByTask = new Map();
  for (const q of snap.questions || []) {
    if (q.answer != null) continue;
    if (!questionsByTask.has(q.taskId)) questionsByTask.set(q.taskId, []);
    questionsByTask.get(q.taskId).push(q);
  }
  state.loop = { byId, questionsByTask };
  // Don't yank the DOM out from under a half-typed reply/rejection.
  if (!state.loopEditing) render();
}

async function refresh() {
  const page = await Api.getPage(state.url);
  state.annotations = page.annotations || [];
  render();
  try {
    const pages = await Api.listPages();
    renderProjects(dom.projects, pages, normalizeUrl(state.url), (url) =>
      chrome.tabs.create({ url }),
    );
  } catch {
    /* ignore */
  }
}

const handlers = {
  onLocate: async (id) => {
    try {
      const res = await Api.locate(state.tabId, id);
      toast(res && res.switched ? t("toast.tabSwitched") : t("toast.located"));
    } catch {
      toast(t("toast.locateFail"));
    }
  },
  onStatus: async (id, status, note) => {
    await Api.setStatus(state.url, id, status, note);
    await refresh();
    if (state.loopTimer) loopTick();
  },
  onLoopAnswer: async (questionId, answer) => {
    try {
      await Api.loopAnswer(questionId, answer);
      toast(t("toast.replySent"));
    } catch {
      toast(t("loop.answerFail"));
    }
    if (state.loopTimer) loopTick();
  },
  onDelete: async (id) => {
    if (!confirm(t("confirm.deleteHint"))) return;
    await Api.remove(state.url, id);
    await refresh();
    toast(t("toast.deleted"));
  },
  onEdit: (id) => {
    state.editing = id;
    render();
  },
  onEditCancel: () => {
    state.editing = null;
    render();
  },
  onEditSave: async (id, note) => {
    await Api.updateNote(state.url, id, note);
    state.editing = null;
    await refresh();
  },
};

// ---- mode init ----------------------------------------------------------

async function initMode() {
  try {
    const res = await Api.getMode(state.tabId);
    state.modeAvailable = true;
    setModeButton(!!(res && res.enabled));
  } catch {
    state.modeAvailable = false;
    dom.modeBtn.disabled = true;
    setModeButton(false);
  }
}

// ---- language menu ------------------------------------------------------

function openLangMenu() {
  const items = [
    {
      icon: "globe",
      label: t("theme.system"),
      active: !state.settings.locale,
      onClick: () => changeLocale(""),
    },
    ...Object.entries(LOCALE_NAMES).map(([code, name]) => ({
      label: name,
      active: state.settings.locale === code,
      onClick: () => changeLocale(code),
    })),
  ];
  openMenu(dom.menu, dom.langBtn, items, { title: t("settings.language") });
}

async function changeLocale(code) {
  state.settings = await setSettings({ locale: code });
  setLocale(currentLocale());
  applyStaticLabels();
  applyTheme();
  render();
  refresh();
}

// ---- download all menu --------------------------------------------------

function openDownloadAllMenu() {
  const items = [
    { icon: "copy", label: t("download.merge"), onClick: () => downloadAll(false) },
    { icon: "download", label: t("download.split"), onClick: () => downloadAll(true) },
  ];
  openMenu(dom.menu, dom.downloadAll, items, { title: t("download.allTitle") });
}

async function downloadAll(split) {
  const date = new Date().toISOString().slice(0, 10);
  const res = await Api.exportAll(currentLocale());
  const pages = (res && res.pages) || [];
  if (!pages.length) return toast(t("toast.noAnnotations"));
  if (!split) {
    downloadText(res.prompt, `ui2prompt-all-${date}.md`);
    toast(t("toast.downloaded"));
    return;
  }
  pages.forEach((p, i) => {
    setTimeout(() => downloadText(p.prompt, `ui2prompt-${slugFromUrl(p.url)}-${date}.md`), i * 250);
  });
  toast(t("toast.downloaded"));
}

// ---- download full (prompt + companion 4-layer DOM file) ----------------

function openDownloadFullMenu() {
  const items = [
    { icon: "download", label: t("download.fullCurrent"), onClick: () => downloadFull(false) },
    { icon: "layers", label: t("download.fullAll"), onClick: () => downloadFull(true) },
  ];
  openMenu(dom.menu, dom.downloadFull, items, { title: t("download.fullTitle") });
}

async function downloadFull(all) {
  const date = new Date().toISOString().slice(0, 10);
  const base = all ? `ui2prompt-all-${date}` : `ui2prompt-${slugFromUrl(state.url)}-${date}`;
  const domFile = `${base}.dom.md`;
  const res = all
    ? await Api.exportAllFull(currentLocale(), domFile)
    : await Api.exportPageFull(state.url, currentLocale(), domFile);
  const pages = res && res.pages;
  const hasData = all ? pages && pages.length : res && res.page && (res.page.annotations || []).length;
  if (!hasData) return toast(t("toast.noAnnotations"));
  downloadText(res.prompt, `${base}.md`);
  setTimeout(() => downloadText(res.dom, domFile), 250);
  toast(t("toast.fullDownloaded"));
}

// ---- settings / guide dialogs ------------------------------------------

function showSettings() {
  closeMenu();
  openSettings(dom.settingsDialog, {
    theme: state.settings.theme,
    showResolved: !!state.settings.showResolved,
    lockHostKeys: state.settings.lockHostKeys !== false,
    onSetTheme: async (v) => {
      state.settings = await setSettings({ theme: v });
      applyTheme();
    },
    onToggleResolved: async (v) => {
      state.settings = await setSettings({ showResolved: v });
    },
    onToggleLockKeys: async (v) => {
      state.settings = await setSettings({ lockHostKeys: v });
    },
    onClose: () => {},
  });
}

function showGuide() {
  closeMenu();
  document.body.classList.add("wide");
  openGuide(dom.guideDialog, {
    onClose: () => document.body.classList.remove("wide"),
  });
}

function showLoopPanel() {
  closeMenu();
  document.body.classList.add("wide");
  openLoopPanel(dom.loopDialog, {
    loopEnabled: !!state.settings.loopEnabled,
    onToggleLoop: async (enabled) => {
      state.settings = await setSettings({ loopEnabled: enabled });
      applyStaticLabels();
      syncLoopPoll(enabled);
      if (enabled) {
        try {
          await Api.loopPush();
        } catch {
          /* broker offline — tasks resync once it's up */
        }
      }
    },
    copy: async (text) => toast((await copy(text)) ? t("toast.copied") : t("toast.copyFail")),
    toast,
    onChanged: refresh,
    onExpand: () => {
      try {
        chrome.tabs.create({ url: chrome.runtime.getURL("loop-page.html") });
        window.close();
      } catch {
        /* opening the page failed — stay in the popup */
      }
    },
    onClose: () => document.body.classList.remove("wide"),
  });
}

// ---- events -------------------------------------------------------------

function wireEvents() {
  dom.modeBtn.onclick = async () => {
    if (!state.modeAvailable) return;
    const enabled = !dom.modeBtn.classList.contains("active");
    try {
      const res = await Api.setMode(state.tabId, enabled);
      setModeButton(!!(res && res.enabled));
      if (res && res.enabled) window.close();
    } catch {
      toast(t("toast.switchFail"));
    }
  };

  dom.langBtn.onclick = openLangMenu;

  dom.themeBtn.onclick = async () => {
    const resolved = resolveTheme(state.settings.theme);
    state.settings = await setSettings({ theme: resolved === "dark" ? "light" : "dark" });
    applyTheme();
  };

  dom.loopBtn.onclick = showLoopPanel;
  dom.settingsBtn.onclick = showSettings;
  dom.helpBtn.onclick = showGuide;

  dom.copyPage.onclick = async () => {
    if (!state.annotations.length) return toast(t("toast.noAnnotations"));
    const { prompt } = await Api.exportPage(state.url, currentLocale());
    toast((await copy(prompt)) ? t("toast.copied") : t("toast.copyFail"));
  };
  dom.copyAll.onclick = async () => {
    const { prompt, pages } = await Api.exportAll(currentLocale());
    if (!pages || !pages.length) return toast(t("toast.noAnnotations"));
    toast((await copy(prompt)) ? t("toast.copied") : t("toast.copyFail"));
  };
  dom.downloadPage.onclick = async () => {
    if (!state.annotations.length) return toast(t("toast.noAnnotations"));
    const { prompt } = await Api.exportPage(state.url, currentLocale());
    const date = new Date().toISOString().slice(0, 10);
    downloadText(prompt, `ui2prompt-${slugFromUrl(state.url)}-${date}.md`);
    toast(t("toast.downloaded"));
  };
  dom.downloadAll.onclick = openDownloadAllMenu;
  dom.downloadFull.onclick = openDownloadFullMenu;

  dom.screenshot.onclick = async () => {
    if (!state.annotations.length) return toast(t("toast.noAnnotations"));
    try {
      const res = await Api.snapshot(state.tabId);
      toast(res && res.ok ? t("toast.shotDone") : t("toast.shotFail"));
    } catch {
      toast(t("toast.shotFail"));
    }
  };

  dom.clearPage.onclick = async () => {
    if (!state.annotations.length) return toast(t("toast.noAnnotations"));
    if (!confirm(t("toast.confirmClear"))) return;
    await Api.clearPage(state.url);
    await refresh();
    toast(t("toast.cleared"));
  };

  // Pause loop-driven re-renders while the user is typing a reply / reject
  // reason inside a list item, so their text isn't wiped by the 2.5s poll.
  dom.list.addEventListener("focusin", (e) => {
    if (e.target.matches("input, textarea")) state.loopEditing = true;
  });
  dom.list.addEventListener("focusout", (e) => {
    if (e.target.matches("input, textarea")) state.loopEditing = false;
  });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === MSG.CHANGED && normalizeUrl(msg.url) === normalizeUrl(state.url)) {
    refresh();
  }
});

async function init() {
  state.settings = await getSettings();
  setLocale(currentLocale());
  applyTheme();
  applyStaticLabels();

  try {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", () => {
      if (state.settings.theme === "system") applyTheme();
    });
  } catch {
    /* matchMedia unsupported */
  }
  subscribeSettings((s) => {
    state.settings = s;
    setLocale(currentLocale());
    applyTheme();
    applyStaticLabels();
    render();
    syncLoopPoll(!!s.loopEnabled);
  });

  const tab = await getActiveTab();
  if (!tab) return;
  state.tabId = tab.id;
  state.url = tab.url || "";
  wireEvents();
  await initMode();
  applyStaticLabels();
  await refresh();
  syncLoopPoll(!!state.settings.loopEnabled);
}

init();
