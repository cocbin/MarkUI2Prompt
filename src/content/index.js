import { MSG, STATUS, normalizeUrl } from "../shared/constants.js";
import { buildPrompt } from "../shared/prompt.js";
import { t, setLocale, resolveLocale } from "../shared/i18n.js";
import { getSettings, subscribeSettings } from "../shared/settings.js";
import { OverlayManager } from "./overlay/overlay.js";
import { Annotator } from "./annotator.js";
import { createBridge } from "./storage-bridge.js";
import { createAnnotation } from "../shared/annotation.js";
import { captureElement } from "./capture.js";
import { probeFramework } from "./framework-bridge.js";

function hasRuntime() {
  return typeof chrome !== "undefined" && !!chrome.runtime && !!chrome.runtime.id;
}

/** Fire-and-forget background request that resolves to data or null. */
function bgSend(type, payload = {}) {
  return new Promise((resolve) => {
    if (!hasRuntime()) return resolve(null);
    chrome.runtime.sendMessage({ type, ...payload }, (res) => {
      if (chrome.runtime.lastError) return resolve(null);
      resolve(res && res.ok ? res.data : null);
    });
  });
}

const LOOP_PROGRESS = ["in_progress", "ai_fixed", "ai_reviewed"];

class ContentApp {
  constructor() {
    this.bridge = createBridge();
    this.overlay = new OverlayManager();
    this.annotations = [];
    this.currentUrl = location.href;
    this.settings = { theme: "system", locale: "", showResolved: false, lockHostKeys: true };
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
      onExitShot: () => this.exitWithShot(),
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
    this.overlay.setAnnotations(this._visibleAnnotations());
  }

  /**
   * Annotations shown on the page / included in screenshots. Resolved items
   * (fixed-pending, confirmed) are hidden unless `showResolved` is on
   * (requirements item 4).
   */
  _visibleAnnotations() {
    if (this.settings.showResolved) return this.annotations;
    return this.annotations.filter(
      (a) => a.status === STATUS.OPEN || a.status === STATUS.REJECTED,
    );
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
    // Exiting no longer auto-captures a screenshot (requirements item 2); use
    // the toolbar's "exit + shot" action for that.
    if (enabled) this.annotator.enable();
    else if (this.annotator.isActive()) this.annotator.disable();
    return this.annotator.isActive();
  }

  /** Take an annotated screenshot, then leave annotation mode. */
  async exitWithShot() {
    if (!this.annotator.isActive()) return this.captureAnnotated();
    try {
      await this.captureAnnotated();
    } catch {
      /* screenshot best-effort */
    }
    this.annotator.disable();
    return { ok: true };
  }

  /** Draw arrows to every visible annotation and capture a fallback screenshot. */
  async captureAnnotated() {
    if (!this._visibleAnnotations().length) return { ok: false, reason: "empty" };
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
    const prevResolved = this.settings.showResolved;
    this.settings = s;
    setLocale(resolveLocale(s.locale));
    this.overlay.applyTheme(s.theme);
    this.overlay.applyLocale();
    if (this.annotator) this.annotator.setLockHostKeys(s.lockHostKeys);
    // Re-filter visible markers when the show-resolved preference flips.
    if (prevResolved !== s.showResolved) this.overlay.setAnnotations(this._visibleAnnotations());
    this._syncLoopPoll(!!s.loopEnabled);
  }

  // ---- loop mode: reflect live agent progress on page markers ------------

  _syncLoopPoll(enabled) {
    if (enabled && !this._loopTimer) {
      this._loopTick();
      this._loopTimer = setInterval(() => this._loopTick(), 3000);
    } else if (!enabled && this._loopTimer) {
      clearInterval(this._loopTimer);
      this._loopTimer = 0;
      this.overlay.setLoopStates({});
    }
  }

  async _loopTick() {
    const snap = await bgSend(MSG.LOOP_STATE);
    if (!snap || !Array.isArray(snap.tasks)) return;
    const here = normalizeUrl(this.url());
    const map = {};
    for (const task of snap.tasks) {
      if (normalizeUrl(task.url) === here && LOOP_PROGRESS.includes(task.status)) {
        map[task.id] = task.status;
      }
    }
    this.overlay.setLoopStates(map);
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
        if (!a) return { ok: false };
        const res = await this.overlay.locate(a);
        return { ok: true, switched: (res && res.switched) || 0 };
      }
      case MSG.SNAPSHOT:
        return await this.captureAnnotated();
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
      // Dev/test helper: create an annotation for a selector or element through
      // the real capture pipeline (selector + xpath + bbox), then persist it.
      add: async (target, note) => {
        const el =
          typeof target === "string" ? document.querySelector(target) : target;
        if (!el) return null;
        const parts = captureElement(el);
        const framework = await probeFramework(el);
        const annotation = createAnnotation({
          ...parts,
          url: this.url(),
          userNote: note || "",
          framework,
        });
        await this.bridge.upsert(annotation);
        await this.reload();
        return annotation.id;
      },
      export: async () => {
        const page = await this.bridge.getPage(this.url());
        return buildPrompt(page, { locale: resolveLocale(this.settings.locale) });
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
