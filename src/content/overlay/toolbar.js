import { t } from "../../shared/i18n.js";
import { icon } from "../../shared/icons.js";

/**
 * Bottom-centre floating toolbar shown while annotation mode is active:
 * status + count, a screenshot button and an exit button. Requirements item 3.
 */
export class Toolbar {
  constructor(layer) {
    this.node = document.createElement("div");
    this.node.className = "toolbar";
    layer.appendChild(this.node);
    this.handlers = {};
    this.count = 0;
    this.busy = false;
    this._render();
  }

  setHandlers(handlers) {
    this.handlers = handlers || {};
  }

  _render() {
    this.node.innerHTML = `
      <div class="tb-status">
        <span class="tb-dot"></span>
        <span class="tb-title">${t("toolbar.title")}</span>
        <span class="tb-count"></span>
      </div>
      <span class="tb-hint">${t("toolbar.hint")} · Esc</span>
      <span class="tb-sep"></span>
      <button class="tb-shot" type="button">${icon("camera", { size: 15 })}<span>${t("toolbar.shot")}</span></button>
      <button class="tb-exit" type="button">${icon("x", { size: 15 })}<span>${t("toolbar.exit")}</span></button>`;
    this.countEl = this.node.querySelector(".tb-count");
    this.node.querySelector(".tb-shot").onclick = () => this.handlers.onShot && this.handlers.onShot();
    this.node.querySelector(".tb-exit").onclick = () => this.handlers.onExit && this.handlers.onExit();
    this._refreshCount();
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
