import { MSG, STATUS, normalizeUrl } from "../shared/constants.js";
import { buildPrompt } from "../shared/prompt.js";
import { t, setLocale, resolveLocale } from "../shared/i18n.js";
import { getSettings, subscribeSettings } from "../shared/settings.js";
import { OverlayManager } from "./overlay/overlay.js";
import { Annotator } from "./annotator.js";
import { createBridge } from "./storage-bridge.js";

function hasRuntime() {
  return typeof chrome !== "undefined" && !!chrome.runtime && !!chrome.runtime.id;
}

class ContentApp {
  constructor() {
    this.bridge = createBridge();
    this.overlay = new OverlayManager();
    this.annotations = [];
    this.currentUrl = location.href;
    this.settings = { theme: "system", locale: "" };
  }

  async init() {
    this.overlay.mount();
    this.overlay.setActions({
      onUpdateNote: (a, note) => this._mutate(() => this.bridge.updateNote(this.url(), a.id, note)),
      onDelete: (a) => this._mutate(() => this.bridge.remove(this.url(), a.id)),
      onSetStatus: (a, status, note) =>
        this._mutate(() => this.bridge.setStatus(this.url(), a.id, status, note)),
      onExitMode: () => this.setMode(false),
      onCapture: () => this.captureAnnotated(),
    });
    this.annotator = new Annotator(this.overlay, {
      onCreate: (a) => this._mutate(() => this.bridge.upsert(a)),
      getUrl: () => this.url(),
      onExit: () => this.setMode(false),
    });
    await this._loadSettings();
    this._installMessageListener();
    this._installHotkey();
    this._watchUrl();
    this._watchSettings();
    this._exposeDebugApi();
    await this.reload();
  }

  url() {
    return location.href;
  }

  async reload() {
    const page = await this.bridge.getPage(this.url());
    this.annotations = page.annotations || [];
    this.overlay.setAnnotations(this.annotations);
  }

  async _mutate(fn) {
    try {
      await fn();
    } finally {
      await this.reload();
    }
  }

  stats() {
    const counts = { total: this.annotations.length };
    for (const s of Object.values(STATUS)) counts[s] = 0;
    for (const a of this.annotations) counts[a.status] = (counts[a.status] || 0) + 1;
    return counts;
  }

  async setMode(enabled) {
    if (enabled) {
      this.annotator.enable();
    } else if (this.annotator.isActive()) {
      try {
        await this.captureAnnotated();
      } catch {
        /* screenshot best-effort */
      }
      this.annotator.disable();
    }
    return this.annotator.isActive();
  }

  /** Draw arrows to every annotation and capture a fallback screenshot. */
  async captureAnnotated() {
    if (!this.annotations.length) return { ok: false, reason: "empty" };
    this.overlay.toolbarBusy(t("toast.shotMaking"));
    try {
      const had = await this.overlay.renderSnapshot();
      if (!had) return { ok: false, reason: "empty" };
      await new Promise((r) => setTimeout(r, 140));
      const res = await this._captureViaBg();
      return res;
    } finally {
      this.overlay.clearSnapshot();
      this.overlay.toolbarBusy(null);
    }
  }

  _captureViaBg() {
    if (!hasRuntime()) return Promise.resolve({ ok: false, reason: "no-bg" });
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: MSG.CAPTURE_TAB, title: document.title, url: this.url() },
        (res) => {
          if (chrome.runtime.lastError) return resolve({ ok: false });
          resolve((res && res.data) || { ok: false });
        },
      );
    });
  }

  // ---- settings (theme + locale) ----------------------------------------

  async _loadSettings() {
    this.settings = await getSettings();
    this._applySettings(this.settings);
    this._watchSystemTheme();
  }

  _applySettings(s) {
    this.settings = s;
    setLocale(resolveLocale(s.locale));
    this.overlay.applyTheme(s.theme);
    this.overlay.applyLocale();
  }

  _watchSettings() {
    subscribeSettings((s) => this._applySettings(s));
  }

  _watchSystemTheme() {
    try {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", () => {
        if (this.settings.theme === "system") this.overlay.applyTheme("system");
      });
    } catch {
      /* matchMedia unsupported */
    }
  }

  // ---- popup / background messaging --------------------------------------

  _installMessageListener() {
    if (!hasRuntime()) return;
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      this._handle(msg)
        .then((data) => sendResponse({ ok: true, data }))
        .catch((e) => sendResponse({ ok: false, error: String(e && e.message) }));
      return true;
    });
  }

  async _handle(msg) {
    switch (msg && msg.type) {
      case MSG.GET_MODE:
        return { enabled: this.annotator.isActive() };
      case MSG.SET_MODE: {
        const enabled = msg.toggle ? !this.annotator.isActive() : !!msg.enabled;
        return { enabled: await this.setMode(enabled) };
      }
      case MSG.LOCATE: {
        const a = this.annotations.find((x) => x.id === msg.id);
        if (a) this.overlay.locate(a);
        return { ok: !!a };
      }
      case MSG.REFRESH:
        await this.reload();
        return { ok: true };
      case MSG.VERIFY:
        return { result: this.overlay.verify() };
      case MSG.GET_STATS:
        return { stats: this.stats(), mode: this.annotator.isActive() };
      case MSG.CHANGED:
        if (normalizeUrl(msg.url) === normalizeUrl(this.url())) await this.reload();
        return { ok: true };
      default:
        return { ok: false };
    }
  }

  // ---- keyboard toggle (Cmd/Ctrl+M) -------------------------------------

  _installHotkey() {
    window.addEventListener(
      "keydown",
      (e) => {
        if (
          (e.metaKey || e.ctrlKey) &&
          !e.shiftKey &&
          !e.altKey &&
          (e.key === "m" || e.key === "M")
        ) {
          e.preventDefault();
          this.setMode(!this.annotator.isActive());
        }
      },
      true,
    );
  }

  // ---- SPA route changes -------------------------------------------------

  _watchUrl() {
    const onChange = () => {
      if (location.href === this.currentUrl) return;
      this.currentUrl = location.href;
      this.overlay.closePopover();
      this.reload();
    };
    window.addEventListener("hashchange", onChange);
    window.addEventListener("popstate", onChange);
    this._urlTimer = setInterval(onChange, 700);
  }

  // ---- debug api (for injection-based testing / power users) -------------

  _exposeDebugApi() {
    window.__UI2PROMPT__ = {
      enable: () => this.setMode(true),
      disable: () => this.setMode(false),
      toggle: () => this.setMode(!this.annotator.isActive()),
      reload: () => this.reload(),
      list: () => this.annotations,
      stats: () => this.stats(),
      verify: () => this.overlay.verify(),
      snapshot: () => this.captureAnnotated(),
      locateById: (id) => {
        const a = this.annotations.find((x) => x.id === id);
        if (a) this.overlay.locate(a);
        return !!a;
      },
      export: async () => {
        const page = await this.bridge.getPage(this.url());
        return buildPrompt(page);
      },
      clear: async () => {
        for (const a of [...this.annotations]) await this.bridge.remove(this.url(), a.id);
        await this.reload();
      },
      app: this,
    };
  }
}

function bootstrap() {
  if (window.__UI2PROMPT__) return;
  const app = new ContentApp();
  const start = () => app.init();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}

bootstrap();
