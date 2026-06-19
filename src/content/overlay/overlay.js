import { OVERLAY_CSS } from "../styles.js";
import { applyThemeAttr } from "../../shared/theme.js";
import { Marker } from "./marker.js";
import { EditorPopover } from "./editor.js";
import { Toolbar } from "./toolbar.js";
import { SnapshotLayer } from "./snapshot.js";

export const HOST_ID = "ui2prompt-overlay-host";

/** Owns the shadow-DOM overlay: markers, highlight, popover, toolbar, snapshot. */
export class OverlayManager {
  constructor(actions = {}) {
    this.actions = actions;
    this.markers = new Map();
    this.order = [];
    this.selectedId = null;
    this.running = false;
    this.raf = 0;
    this.theme = "system";
    this.annotationActive = false;
    this.modeHandlers = {};
    this.tick = this.tick.bind(this);
  }

  mount() {
    if (this.host) return;
    const host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText = "all: initial; position: static;";
    applyThemeAttr(host, this.theme);
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = OVERLAY_CSS;
    const layer = document.createElement("div");
    layer.className = "layer";

    const highlight = document.createElement("div");
    highlight.className = "highlight";
    highlight.innerHTML = '<span class="tag"></span>';

    const markersLayer = document.createElement("div");
    markersLayer.className = "markers";

    layer.appendChild(highlight);
    layer.appendChild(markersLayer);
    shadow.append(style, layer);
    (document.documentElement || document.body).appendChild(host);

    this.host = host;
    this.layer = layer;
    this.highlight = highlight;
    this.markersLayer = markersLayer;
    this.editor = new EditorPopover(layer);
    this.editor.onRequestClose = () => this.closePopover();
    this.toolbar = new Toolbar(layer);
    this.snapshot = new SnapshotLayer(layer);
    this.toolbar.setHandlers({
      onExit: () => this.actions.onExitMode && this.actions.onExitMode(),
      onShot: () => this.actions.onCapture && this.actions.onCapture(),
      onExitShot: () => this.actions.onExitShot && this.actions.onExitShot(),
      onSelectMode: () => this.modeHandlers.onSelectMode && this.modeHandlers.onSelectMode(),
      onNormalMode: () => this.modeHandlers.onNormalMode && this.modeHandlers.onNormalMode(),
    });

    this._installGlobalClose();
    this._installMutationObserver();
    window.addEventListener("resize", () => this._kick(), { passive: true });
  }

  destroy() {
    this.clear();
    this._stop();
    this.observer && this.observer.disconnect();
    this.host && this.host.remove();
    this.host = null;
  }

  setActions(actions) {
    this.actions = { ...this.actions, ...actions };
  }

  applyTheme(theme) {
    this.theme = theme;
    if (this.host) applyThemeAttr(this.host, theme);
  }

  applyLocale() {
    if (this.toolbar) this.toolbar.applyLocale();
    for (const marker of this.markers.values()) marker.update(marker.annotation, marker.index);
  }

  // ---- toolbar -----------------------------------------------------------

  showToolbar() {
    this.toolbar && this.toolbar.show();
    if (this.toolbar) this.toolbar.setCount(this.markers.size);
  }

  hideToolbar() {
    this.toolbar && this.toolbar.hide();
  }

  toolbarBusy(text) {
    this.toolbar && this.toolbar.setBusy(text);
  }

  /** Register the select/normal sub-mode switch callbacks (from the annotator). */
  setModeHandlers(handlers) {
    this.modeHandlers = handlers || {};
  }

  /** Reflect the active sub-mode in the toolbar. */
  setToolbarMode(mode) {
    this.toolbar && this.toolbar.setMode(mode);
  }

  /** While annotation mode is on, the annotator owns keyboard control. */
  setAnnotationActive(value) {
    this.annotationActive = !!value;
  }

  // ---- markers -----------------------------------------------------------

  setAnnotations(list) {
    const incoming = new Map(list.map((a) => [a.id, a]));
    for (const id of [...this.markers.keys()]) {
      if (!incoming.has(id)) {
        this.markers.get(id).destroy();
        this.markers.delete(id);
      }
    }
    this.order = [...list].sort((a, b) => a.timestamp - b.timestamp).map((a) => a.id);

    this.order.forEach((id, i) => {
      const annotation = incoming.get(id);
      let marker = this.markers.get(id);
      if (!marker) {
        marker = new Marker(annotation, i + 1);
        marker.onSelect = (ann, rect) => this._onMarkerSelect(ann, rect);
        this.markers.set(id, marker);
        this.markersLayer.appendChild(marker.node);
      } else {
        marker.resolve();
        marker.update(annotation, i + 1);
      }
    });

    if (this.selectedId) {
      const m = this.markers.get(this.selectedId);
      if (m) m.setSelected(true);
    }
    if (this.toolbar) this.toolbar.setCount(this.markers.size);
    if (this.markers.size > 0) this._start();
    else this._stop();
    this._renderFrame();
  }

  clear() {
    for (const marker of this.markers.values()) marker.destroy();
    this.markers.clear();
    this.order = [];
    this.selectedId = null;
    this._stop();
  }

  getById(id) {
    return this.markers.get(id);
  }

  /** Force re-binding of every marker to the live DOM (fix-verification). */
  verify() {
    let located = 0;
    let degraded = 0;
    for (const marker of this.markers.values()) {
      marker.resolve();
      if (marker.el && marker.el.isConnected) located++;
      else degraded++;
    }
    this._renderFrame();
    return { located, degraded, total: this.markers.size };
  }

  // ---- snapshot ----------------------------------------------------------

  /** Render the numbered legend + arrows; resolves once painted. */
  async renderSnapshot() {
    if (!this.snapshot) return false;
    this.clearHighlight();
    const hadToolbar = this.toolbar && this.toolbar.node.classList.contains("visible");
    if (hadToolbar) this.toolbar.hide();
    const items = this.order.map((id, i) => {
      const m = this.markers.get(id);
      if (m) m.resolve();
      return {
        index: i + 1,
        note: m ? m.annotation.userNote : "",
        el: m ? m.el : null,
      };
    });
    await this.snapshot.render(items);
    this._snapHadToolbar = hadToolbar;
    return items.length > 0;
  }

  clearSnapshot() {
    this.snapshot && this.snapshot.clear();
    if (this._snapHadToolbar) {
      this.toolbar.show();
      this._snapHadToolbar = false;
    }
  }

  // ---- highlight ---------------------------------------------------------

  setHighlight(rect, label) {
    if (!this.highlight) return;
    this.highlight.style.left = `${rect.left}px`;
    this.highlight.style.top = `${rect.top}px`;
    this.highlight.style.width = `${rect.width}px`;
    this.highlight.style.height = `${rect.height}px`;
    this.highlight.querySelector(".tag").textContent = label || "";
    this.highlight.classList.add("visible");
  }

  clearHighlight() {
    this.highlight && this.highlight.classList.remove("visible");
  }

  flashHighlight(rect, label, duration = 1200) {
    this.setHighlight(rect, label);
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => this.clearHighlight(), duration);
  }

  // ---- popover -----------------------------------------------------------

  openCreate(anchorRect, callbacks) {
    this.editor.openCreate(anchorRect, callbacks);
  }

  isPopoverOpen() {
    return this.editor && this.editor.isOpen();
  }

  /** While a reference element is being picked, keep the create popover open. */
  setPicking(value) {
    this.picking = !!value;
  }

  closePopover() {
    this.editor && this.editor.close();
    this._select(null);
    if (this.onPopoverClose) this.onPopoverClose();
  }

  _onMarkerSelect(annotation, rect) {
    this._select(annotation.id);
    this.editor.openDetail(annotation, rect, {
      onUpdateNote: (a, note) => this._wrap(() => this.actions.onUpdateNote?.(a, note)),
      onDelete: (a) => this._wrap(() => this.actions.onDelete?.(a)),
      onSetStatus: (a, status, note) =>
        this._wrap(() => this.actions.onSetStatus?.(a, status, note)),
      onLocate: (a) => this.locate(a),
    });
  }

  _wrap(fn) {
    Promise.resolve(fn()).finally(() => this.closePopover());
  }

  _select(id) {
    if (this.selectedId && this.markers.has(this.selectedId)) {
      this.markers.get(this.selectedId).setSelected(false);
    }
    this.selectedId = id;
    if (id && this.markers.has(id)) this.markers.get(id).setSelected(true);
  }

  // ---- locate ------------------------------------------------------------

  locate(annotation) {
    const marker = this.markers.get(annotation.id);
    if (marker) marker.resolve();
    const el = marker && marker.el;
    if (el && el.isConnected) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => {
        const rect = el.getBoundingClientRect();
        this.flashHighlight(rect, annotation.userNote);
      }, 300);
    } else {
      const fb = annotation.fallbackPosition || { x: 0, y: 0 };
      window.scrollTo({ top: Math.max(0, fb.y - window.innerHeight / 2), behavior: "smooth" });
    }
    this._select(annotation.id);
    this.closePopoverSoon();
  }

  closePopoverSoon() {
    setTimeout(() => this.editor && this.editor.close(), 50);
  }

  // ---- RAF loop ----------------------------------------------------------

  _start() {
    if (this.running) return;
    this.running = true;
    this.raf = requestAnimationFrame(this.tick);
  }

  _stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  _kick() {
    this._renderFrame();
  }

  _renderFrame() {
    for (const marker of this.markers.values()) marker.applyPosition();
  }

  tick() {
    if (!this.running) return;
    if (!document.hidden) this._renderFrame();
    this.raf = requestAnimationFrame(this.tick);
  }

  // ---- DOM change handling ----------------------------------------------

  _installMutationObserver() {
    this.observer = new MutationObserver(() => {
      clearTimeout(this._mutationTimer);
      this._mutationTimer = setTimeout(() => {
        for (const marker of this.markers.values()) {
          if (!marker.el || !marker.el.isConnected) marker.resolve();
        }
        this._renderFrame();
      }, 250);
    });
    const target = document.body || document.documentElement;
    if (target) this.observer.observe(target, { childList: true, subtree: true });
  }

  _installGlobalClose() {
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (this.picking || !this.isPopoverOpen()) return;
        const path = e.composedPath ? e.composedPath() : [];
        if (!path.includes(this.editor.node)) this.closePopover();
      },
      true,
    );
    // Popover keyboard control when annotation mode is OFF (e.g. viewing a
    // marker's detail by clicking its dot). While annotation mode is ON, the
    // annotator's window-level guard owns the keyboard, so we defer to it.
    document.addEventListener(
      "keydown",
      (e) => {
        if (this.annotationActive || this.picking || !this.isPopoverOpen()) return;
        if (this.editor.handleKey(e)) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      },
      true,
    );
  }
}
