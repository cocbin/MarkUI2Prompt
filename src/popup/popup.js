import { MSG, normalizeUrl } from "../shared/constants.js";
import { t, setLocale, resolveLocale, LOCALE_NAMES } from "../shared/i18n.js";
import {
  getSettings,
  setSettings,
  subscribeSettings,
  resolveTheme,
} from "../shared/settings.js";
import { buildThemeCss } from "../shared/theme.js";
import { icon } from "../shared/icons.js";
import { Api, getActiveTab } from "./api.js";
import { countByStatus, renderFilters, renderList, renderProjects } from "./render.js";

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
  filter: "all",
  editing: null,
  modeAvailable: false,
  settings: { theme: "system", locale: "" },
};

const dom = {
  tagline: document.getElementById("tagline"),
  langSel: document.getElementById("langSel"),
  themeBtn: document.getElementById("themeBtn"),
  modeBtn: document.getElementById("modeBtn"),
  filters: document.getElementById("filters"),
  list: document.getElementById("list"),
  projects: document.getElementById("projects"),
  exportPage: document.getElementById("exportPage"),
  downloadPage: document.getElementById("downloadPage"),
  exportAll: document.getElementById("exportAll"),
  clearPage: document.getElementById("clearPage"),
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

function download(text) {
  let host = "page";
  try {
    host = new URL(state.url).hostname || "page";
  } catch {
    /* keep default */
  }
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ui2prompt-${host}-${date}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const handlers = {
  onLocate: async (id) => {
    try {
      await Api.locate(state.tabId, id);
      toast(t("toast.located"));
    } catch {
      toast(t("toast.locateFail"));
    }
  },
  onStatus: async (id, status) => {
    await Api.setStatus(state.url, id, status);
    await refresh();
  },
  onDelete: async (id) => {
    await Api.remove(state.url, id);
    await refresh();
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

function render() {
  const counts = countByStatus(state.annotations);
  renderFilters(dom.filters, counts, state.filter, (key) => {
    state.filter = key;
    render();
  });
  renderList(dom.list, state.annotations, state.filter, handlers, state.editing);
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

function applyTheme() {
  const resolved = resolveTheme(state.settings.theme);
  document.documentElement.dataset.theme = resolved;
  dom.themeBtn.innerHTML = icon(resolved === "dark" ? "moon" : "sun", { size: 16 });
  dom.themeBtn.title = `${t("settings.theme")}: ${t(`theme.${resolved}`)}`;
}

function fillLangSelect() {
  dom.langSel.innerHTML = "";
  const auto = document.createElement("option");
  auto.value = "";
  auto.textContent = t("theme.system");
  dom.langSel.appendChild(auto);
  for (const [code, name] of Object.entries(LOCALE_NAMES)) {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = name;
    dom.langSel.appendChild(opt);
  }
  dom.langSel.value = state.settings.locale || "";
}

function applyStaticLabels() {
  dom.tagline.textContent = t("tagline");
  dom.langSel.title = t("settings.language");
  setModeButton(dom.modeBtn.classList.contains("active"));
  const setBtn = (node, iconName, key, cls) => {
    node.innerHTML = `${icon(iconName, { size: 14 })}<span></span>`;
    node.querySelector("span").textContent = t(key);
    if (cls) node.classList.add(...cls.split(" "));
  };
  setBtn(dom.exportPage, "copy", "footer.copyPage");
  setBtn(dom.downloadPage, "download", "footer.download");
  setBtn(dom.exportAll, "copy", "footer.copyAll");
  setBtn(dom.clearPage, "trash", "footer.clear");
}

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

  dom.themeBtn.onclick = async () => {
    const resolved = resolveTheme(state.settings.theme);
    state.settings = await setSettings({ theme: resolved === "dark" ? "light" : "dark" });
    applyTheme();
  };

  dom.langSel.onchange = async () => {
    state.settings = await setSettings({ locale: dom.langSel.value });
    setLocale(resolveLocale(state.settings.locale));
    applyStaticLabels();
    render();
    refresh();
  };

  dom.exportPage.onclick = async () => {
    const { prompt } = await Api.exportPage(state.url);
    toast((await copy(prompt)) ? t("toast.copied") : t("toast.copyFail"));
  };
  dom.downloadPage.onclick = async () => {
    if (!state.annotations.length) return toast(t("toast.noAnnotations"));
    const { prompt } = await Api.exportPage(state.url);
    download(prompt);
    toast(t("toast.downloaded"));
  };
  dom.exportAll.onclick = async () => {
    const { prompt } = await Api.exportAll();
    toast((await copy(prompt)) ? t("toast.copied") : t("toast.copyFail"));
  };
  dom.clearPage.onclick = async () => {
    if (!state.annotations.length) return toast(t("toast.noAnnotations"));
    if (!confirm(t("toast.confirmClear"))) return;
    await Api.clearPage(state.url);
    await refresh();
    toast(t("toast.cleared"));
  };
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === MSG.CHANGED && normalizeUrl(msg.url) === normalizeUrl(state.url)) {
    refresh();
  }
});

async function init() {
  state.settings = await getSettings();
  setLocale(resolveLocale(state.settings.locale));
  fillLangSelect();
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
    setLocale(resolveLocale(s.locale));
    fillLangSelect();
    applyTheme();
    applyStaticLabels();
    render();
  });

  const tab = await getActiveTab();
  if (!tab) return;
  state.tabId = tab.id;
  state.url = tab.url || "";
  wireEvents();
  await initMode();
  applyStaticLabels();
  await refresh();
}

init();
