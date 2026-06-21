import { t } from "../../shared/i18n.js";
import { icon } from "../../shared/icons.js";

/**
 * Bottom-centre floating toolbar shown while annotation mode is active:
 * a drag grip, status + count, a select/normal sub-mode switch (requirements
 * item 6) and the screenshot / exit+shot / exit actions (requirements item 2/3).
 * The bar is draggable so it never blocks the element being annotated.
 */
export class Toolbar {
  constructor(layer) {
    this.node = document.createElement("div");
    this.node.className = "toolbar";
    layer.appendChild(this.node);
    this.handlers = {};
    this.count = 0;
    this.moved = false;
    this.mode = "select";
    this._onDrag = this._onDrag.bind(this);
    this._endDrag = this._endDrag.bind(this);
    this._render();
  }

  setHandlers(handlers) {
    this.handlers = handlers || {};
  }

  _render() {
    this.node.innerHTML = `
      <button class="tb-grip" type="button" title="${t("toolbar.drag")}" aria-label="${t("toolbar.drag")}">${icon("grip", { size: 16 })}</button>
      <div class="tb-status">
        <span class="tb-dot"></span>
        <span class="tb-title">${t("toolbar.title")}</span>
        <span class="tb-count"></span>
      </div>
      <span class="tb-hint"></span>
      <span class="tb-sep"></span>
      <div class="tb-modes" role="group">
        <button class="tb-mode" type="button" data-mode="select" title="${t("toolbar.modeSelectTip")}">${icon("crosshair", { size: 15 })}<span class="tb-mode-label">${t("toolbar.modeSelect")}</span><kbd>M</kbd></button>
        <button class="tb-mode" type="button" data-mode="normal" title="${t("toolbar.modeNormalTip")}">${icon("pointer", { size: 15 })}<span class="tb-mode-label">${t("toolbar.modeNormal")}</span><kbd>N</kbd></button>
      </div>
      <span class="tb-sep"></span>
      <button class="tb-copy" type="button" title="${t("toolbar.copyPageTip")}">${icon("copy", { size: 15 })}<span>${t("toolbar.copyPage")}</span></button>
      <button class="tb-loc" type="button" title="${t("toolbar.getLocationTip")}">${icon("locatePick", { size: 15 })}<span>${t("toolbar.getLocation")}</span></button>
      <span class="tb-sep"></span>
      <button class="tb-shot" type="button" title="${t("toolbar.shot")}">${icon("camera", { size: 15 })}</button>
      <button class="tb-exitshot" type="button">${icon("camera", { size: 15 })}<span>${t("toolbar.exitShot")}</span></button>
      <button class="tb-exit" type="button">${icon("logout", { size: 15 })}<span>${t("toolbar.exit")}</span></button>`;
    this.countEl = this.node.querySelector(".tb-count");
    this.node.querySelector(".tb-shot").onclick = () => this.handlers.onShot && this.handlers.onShot();
    this.node.querySelector(".tb-exitshot").onclick = () =>
      this.handlers.onExitShot && this.handlers.onExitShot();
    this.node.querySelector(".tb-exit").onclick = () => this.handlers.onExit && this.handlers.onExit();
    this.node.querySelector(".tb-copy").onclick = () =>
      this.handlers.onCopyPage && this.handlers.onCopyPage();
    this.node.querySelector(".tb-loc").onclick = () =>
      this.handlers.onGetLocation && this.handlers.onGetLocation();
    this.node.querySelector('[data-mode="select"]').onclick = () =>
      this.handlers.onSelectMode && this.handlers.onSelectMode();
    this.node.querySelector('[data-mode="normal"]').onclick = () =>
      this.handlers.onNormalMode && this.handlers.onNormalMode();
    const grip = this.node.querySelector(".tb-grip");
    grip.addEventListener("pointerdown", (e) => this._startDrag(e));
    this._refreshCount();
    this._refreshMode();
  }

  // ---- drag ---------------------------------------------------------------

  _startDrag(e) {
    e.preventDefault();
    e.stopPropagation();
    const rect = this.node.getBoundingClientRect();
    this._drag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    this.node.classList.add("dragging");
    document.addEventListener("pointermove", this._onDrag, true);
    document.addEventListener("pointerup", this._endDrag, true);
  }

  _onDrag(e) {
    if (!this._drag) return;
    const w = this.node.offsetWidth;
    const h = this.node.offsetHeight;
    let left = Math.max(6, Math.min(e.clientX - this._drag.dx, window.innerWidth - w - 6));
    let top = Math.max(6, Math.min(e.clientY - this._drag.dy, window.innerHeight - h - 6));
    this.node.style.left = `${left}px`;
    this.node.style.top = `${top}px`;
    this.node.style.bottom = "auto";
    this.node.style.transform = "none";
    this.moved = true;
  }

  _endDrag() {
    this._drag = null;
    this.node.classList.remove("dragging");
    document.removeEventListener("pointermove", this._onDrag, true);
    document.removeEventListener("pointerup", this._endDrag, true);
  }

  applyLocale() {
    this._render();
  }

  _refreshCount() {
    if (this.countEl) this.countEl.textContent = t("toolbar.count", { n: this.count });
  }

  setCount(n) {
    this.count = n || 0;
    this._refreshCount();
  }

  /** Reflect the active sub-mode (select / normal) on the buttons + hint. */
  setMode(mode) {
    this.mode = mode === "normal" ? "normal" : "select";
    this._refreshMode();
  }

  _refreshMode() {
    this.node.querySelectorAll(".tb-mode").forEach((b) => {
      b.classList.toggle("active", b.dataset.mode === this.mode);
    });
    const hint = this.node.querySelector(".tb-hint");
    if (hint && this._savedHint == null) {
      hint.textContent =
        this.mode === "normal" ? t("toolbar.hintNormal") : `${t("toolbar.hint")} · Esc`;
    }
  }

  /** Show a transient busy label (e.g. while a screenshot is generated). */
  setBusy(text) {
    const hint = this.node.querySelector(".tb-hint");
    if (!hint) return;
    if (text) {
      this._savedHint = this._savedHint ?? hint.textContent;
      hint.textContent = text;
    } else if (this._savedHint != null) {
      hint.textContent = this._savedHint;
      this._savedHint = null;
    }
  }

  show() {
    this.node.classList.add("visible");
  }

  hide() {
    this.node.classList.remove("visible");
  }
}
