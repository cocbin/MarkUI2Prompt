import { t, setLocale, resolveLocale } from "../shared/i18n.js";
import { getSettings, setSettings, subscribeSettings, resolveTheme } from "../shared/settings.js";
import { buildThemeCss } from "../shared/theme.js";
import { icon } from "../shared/icons.js";
import { Api } from "./api.js";
import { createLoopBoard } from "./loop-board.js";

/**
 * Standalone loop page (requirements item 2): a full-window view of the loop
 * board — task statuses, agent questions and replies, rejection feedback — for
 * when the popup is too small. Reuses the shared `loop-board` and popup.css.
 */

(function injectTokens() {
  const style = document.createElement("style");
  style.textContent = buildThemeCss(":root", ':root[data-theme="dark"]');
  document.head.appendChild(style);
})();

const state = { settings: { theme: "system", locale: "" } };
const dom = {};
let board = null;
let promptText = "";
let toastTimer = 0;

function $(id) {
  return document.getElementById(id);
}

function toast(message) {
  if (!dom.toast) return;
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

function currentLocale() {
  return resolveLocale(state.settings.locale);
}

function applyTheme() {
  const resolved = resolveTheme(state.settings.theme);
  document.documentElement.dataset.theme = resolved;
  dom.themeBtn.innerHTML = icon(resolved === "dark" ? "moon" : "sun", { size: 16 });
  dom.themeBtn.title = `${t("settings.theme")}: ${t(`theme.${resolved}`)}`;
}

function applyLabels() {
  document.title = `UI2Prompt · ${t("loop.title")}`;
  $("lpgTagline").textContent = t("loop.title");
  $("lpgEnableLabel").textContent = t("loop.enable");
  $("lpgEnableHint").textContent = t("loop.enableHint");
  $("lpgPromptTitle").textContent = t("loop.agentPrompt");
  $("lpgHowto").textContent = t("loop.howto");
  dom.copyBtn.innerHTML = `${icon("copy", { size: 13 })}<span>${t("loop.copyPrompt")}</span>`;
  dom.refreshBtn.innerHTML = icon("reopen", { size: 16 });
  dom.refreshBtn.title = t("loop.tasks");
  applyTheme();
}

async function loadPrompt() {
  try {
    const res = await Api.loopPrompt();
    promptText = res.prompt || "";
    $("lpgPrompt").textContent = promptText;
  } catch {
    $("lpgPrompt").textContent = "";
  }
}

function wire() {
  dom.themeBtn.onclick = async () => {
    const resolved = resolveTheme(state.settings.theme);
    state.settings = await setSettings({ theme: resolved === "dark" ? "light" : "dark" });
    applyTheme();
  };
  dom.refreshBtn.onclick = () => board && board.refresh();
  dom.copyBtn.onclick = async () => {
    if (promptText) toast((await copy(promptText)) ? t("toast.copied") : t("toast.copyFail"));
  };
  dom.toggle.onchange = async (e) => {
    state.settings = await setSettings({ loopEnabled: e.target.checked });
    if (e.target.checked) {
      try {
        await Api.loopPush();
      } catch {
        /* broker offline — resyncs once it's up */
      }
    }
    board && board.refresh();
  };
}

async function init() {
  dom.themeBtn = $("lpgThemeBtn");
  dom.refreshBtn = $("lpgRefresh");
  dom.copyBtn = $("lpgCopy");
  dom.toggle = $("lpgToggle");
  dom.toast = $("lpgToast");

  state.settings = await getSettings();
  setLocale(currentLocale());
  applyLabels();
  dom.toggle.checked = !!state.settings.loopEnabled;

  wire();
  await loadPrompt();

  board = createLoopBoard($("lpgBoard"), { toast, onChanged: () => {} });

  subscribeSettings((s) => {
    state.settings = s;
    setLocale(currentLocale());
    applyLabels();
    dom.toggle.checked = !!s.loopEnabled;
  });

  try {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", () => {
      if (state.settings.theme === "system") applyTheme();
    });
  } catch {
    /* matchMedia unsupported */
  }
}

init();
